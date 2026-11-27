import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { demoEmail } from './demo-login';
import { createSessionToken, digestToken, hashPassword, verifyPassword } from './password';
import { type SessionSpace } from './session.types';
import { PrismaService } from '../../prisma/prisma.service';

export interface SessionPayload {
  user: { id: string; email: string; name: string; role: string };
  space: SessionSpace | null;
  spaces: SessionSpace[];
  expiresAt: string;
  idleExpiresAt: string;
}

const defaultIdleMinutes = 8 * 60;
const defaultMaxDays = 7;

function positiveNumber(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

@Injectable()
export class AuthService {
  private readonly idleMs: number;
  private readonly maxAgeMs: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.idleMs = positiveNumber(config.get('SESSION_IDLE_MINUTES'), defaultIdleMinutes) * 60_000;
    this.maxAgeMs =
      positiveNumber(config.get('SESSION_MAX_DAYS'), defaultMaxDays) * 24 * 60 * 60_000;
  }

  get cookieMaxAge() {
    return Math.floor(this.maxAgeMs / 1000);
  }

  get cookieSecure() {
    return this.config.get<string>('SESSION_COOKIE_SECURE') === 'true';
  }

  private async memberships(userId: string): Promise<SessionSpace[]> {
    const members = await this.prisma.spaceMember.findMany({
      where: { userId, disabledAt: null },
      include: { space: true },
      orderBy: { createdAt: 'asc' },
    });
    return members.map(({ space, role }) => ({
      id: space.id,
      slug: space.slug,
      name: space.name,
      role,
    }));
  }

  private async payload(
    userId: string,
    spaceId: string | null,
    expiresAt: Date,
    lastSeenAt: Date,
  ): Promise<SessionPayload> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('会话用户不存在。');
    const spaces = await this.memberships(userId);
    const space = spaces.find((item) => item.id === spaceId) ?? null;
    const idleExpiresAt = new Date(
      Math.min(expiresAt.getTime(), lastSeenAt.getTime() + this.idleMs),
    );
    return {
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      space,
      spaces,
      expiresAt: expiresAt.toISOString(),
      idleExpiresAt: idleExpiresAt.toISOString(),
    };
  }

  async login(email: string, password: string) {
    const normalized = email.trim().toLowerCase();
    if (normalized === demoEmail && this.config.get('DEMO_LOGIN_ENABLED') !== 'true') {
      throw new UnauthorizedException('演示登录未启用。');
    }
    const user = await this.prisma.user.findUnique({ where: { email: normalized } });
    if (!user || !(await verifyPassword(password, user.password))) {
      throw new UnauthorizedException('邮箱或密码不正确。');
    }
    const spaces = await this.memberships(user.id);
    if (!spaces.length) throw new UnauthorizedException('该账号尚未加入任何空间。');
    const spaceId = spaces.length === 1 ? spaces[0].id : null;
    const token = createSessionToken();
    const expiresAt = new Date(Date.now() + this.maxAgeMs);
    const session = await this.prisma.session.create({
      data: {
        userId: user.id,
        spaceId,
        digest: digestToken(token),
        expiresAt,
      },
    });
    return {
      token,
      payload: await this.payload(user.id, spaceId, session.expiresAt, session.lastSeenAt),
    };
  }

  async describe(sessionId: string) {
    const session = await this.prisma.session.findUnique({ where: { id: sessionId } });
    if (!session || session.revokedAt) throw new UnauthorizedException('会话已失效。');
    return this.payload(session.userId, session.spaceId, session.expiresAt, session.lastSeenAt);
  }

  /** Validates a raw bearer token for cookie rotation on a public route. */
  async rotateByToken(token: string) {
    const session = await this.prisma.session.findUnique({
      where: { digest: digestToken(token) },
    });
    if (!session || session.revokedAt) throw new UnauthorizedException('会话已失效，请重新登录。');
    const now = Date.now();
    if (session.expiresAt.getTime() <= now) {
      throw new UnauthorizedException('会话已达最长有效期，请重新登录。');
    }
    if (session.lastSeenAt.getTime() + this.idleMs <= now) {
      throw new UnauthorizedException('会话闲置过久已失效，请重新登录。');
    }
    if (session.spaceId) {
      const member = await this.prisma.spaceMember.findFirst({
        where: { spaceId: session.spaceId, userId: session.userId, disabledAt: null },
      });
      if (!member) throw new UnauthorizedException('已失去该空间的访问权限，请重新登录。');
    }
    return this.rotate(session.id);
  }

  /** Extends idle time and rotates the bearer token; the absolute expiry stays fixed. */
  async rotate(sessionId: string) {
    const token = createSessionToken();
    const now = new Date();
    const session = await this.prisma.session.update({
      where: { id: sessionId },
      data: { digest: digestToken(token), lastSeenAt: now },
    });
    return {
      token,
      payload: await this.payload(
        session.userId,
        session.spaceId,
        session.expiresAt,
        session.lastSeenAt,
      ),
    };
  }

  async logout(sessionId: string) {
    await this.prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { ok: true };
  }

  async switchSpace(sessionId: string, spaceId: string) {
    const session = await this.prisma.session.findUnique({ where: { id: sessionId } });
    if (!session || session.revokedAt) throw new UnauthorizedException('会话已失效。');
    const member = await this.prisma.spaceMember.findFirst({
      where: { spaceId, userId: session.userId, disabledAt: null },
    });
    if (!member) throw new NotFoundException('空间不存在或无权访问。');
    await this.prisma.session.update({ where: { id: sessionId }, data: { spaceId } });
    return this.payload(session.userId, spaceId, session.expiresAt, session.lastSeenAt);
  }

  async changePassword(userId: string, current: string, next: string) {
    if (next.length < 8 || next.length > 128) {
      throw new BadRequestException('新密码须为 8 至 128 个字符。');
    }
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !(await verifyPassword(current, user.password))) {
      throw new BadRequestException('当前密码不正确。');
    }
    if (user.email === demoEmail) {
      throw new BadRequestException('演示账号的密码由部署配置管理。');
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { password: await hashPassword(next) },
    });
    // Sign out every other session after a password change.
    await this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { ok: true };
  }
}
