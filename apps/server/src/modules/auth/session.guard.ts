import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { digestToken } from './password';
import {
  AuthenticatedRequest,
  IS_ADMIN_KEY,
  IS_PUBLIC_KEY,
  SESSION_COOKIE,
  isSpaceAdmin,
} from './session.types';
import { PrismaService } from '../../prisma/prisma.service';

const defaultIdleMinutes = 8 * 60;
const touchIntervalMs = 5 * 60_000;

function idleMs(config: ConfigService) {
  const parsed = Number(config.get('SESSION_IDLE_MINUTES'));
  const minutes = Number.isFinite(parsed) && parsed > 0 ? parsed : defaultIdleMinutes;
  return minutes * 60_000;
}

function reject(code: string, message: string): never {
  throw new UnauthorizedException({ code, message });
}

@Injectable()
export class SessionGuard implements CanActivate {
  private readonly idle: number;
  private readonly allowedOrigins: string[];

  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
    config: ConfigService,
  ) {
    this.idle = idleMs(config);
    this.allowedOrigins = (config.get<string>('CORS_ORIGIN') ?? 'http://localhost:5173')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    const request = context.switchToHttp().getRequest<AuthenticatedRequest & { method: string }>();
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      const headers = (request as unknown as { headers: Record<string, string | undefined> })
        .headers;
      const origin = headers.origin;
      if (origin) {
        // Reject cross-site writes that would not be covered by SameSite=Lax.
        const host = headers.host ?? '';
        const sameOrigin = host ? [`http://${host}`, `https://${host}`] : [];
        if (!this.allowedOrigins.includes(origin) && !sameOrigin.includes(origin)) {
          throw new ForbiddenException({ code: 'INVALID_ORIGIN', message: '请求来源无效。' });
        }
      }
    }
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) return true;

    const token = request.cookies?.[SESSION_COOKIE];
    if (!token) reject('UNAUTHENTICATED', '请先登录。');

    const now = Date.now();
    const session = await this.prisma.session.findUnique({
      where: { digest: digestToken(token) },
      include: { user: true },
    });
    if (!session || session.revokedAt) reject('SESSION_INVALID', '会话已失效，请重新登录。');
    if (session.expiresAt.getTime() <= now) {
      await this.prisma.session.update({
        where: { id: session.id },
        data: { revokedAt: new Date() },
      });
      reject('SESSION_EXPIRED', '会话已达最长有效期，请重新登录。');
    }
    if (session.lastSeenAt.getTime() + this.idle <= now) {
      await this.prisma.session.update({
        where: { id: session.id },
        data: { revokedAt: new Date() },
      });
      reject('SESSION_IDLE', '会话闲置过久已失效，请重新登录。');
    }

    let role: string | null = null;
    if (session.spaceId) {
      const member = await this.prisma.spaceMember.findFirst({
        where: { spaceId: session.spaceId, userId: session.userId, disabledAt: null },
      });
      if (!member) {
        await this.prisma.session.update({
          where: { id: session.id },
          data: { revokedAt: new Date() },
        });
        reject('SPACE_MEMBERSHIP_REVOKED', '已失去该空间的访问权限，请重新登录。');
      }
      role = member.role;
    }

    request.session = {
      sessionId: session.id,
      userId: session.userId,
      spaceId: session.spaceId,
      role,
      user: {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
        role: session.user.role,
      },
    };

    if (now - session.lastSeenAt.getTime() >= touchIntervalMs) {
      await this.prisma.session.update({
        where: { id: session.id },
        data: { lastSeenAt: new Date(now) },
      });
    }

    if (this.reflector.getAllAndOverride<boolean>(IS_ADMIN_KEY, targets)) {
      if (!isSpaceAdmin(role) && request.session.user.role !== 'admin') {
        reject('FORBIDDEN', '需要空间管理员权限。');
      }
    }
    return true;
  }
}
