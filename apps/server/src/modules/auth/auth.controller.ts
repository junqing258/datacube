import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { demoLoginConfig } from './demo-login';
import { CurrentSession, Public, SESSION_COOKIE, type RequestSession } from './session.types';

function text(value: unknown, field: string, max = 200) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) {
    throw new BadRequestException(`${field} 无效。`);
  }
  return value.trim();
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  private setCookie(res: Response, token: string) {
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.auth.cookieSecure,
      maxAge: this.auth.cookieMaxAge,
      path: '/',
    });
  }

  @Public()
  @Get('demo-login')
  @Header('Cache-Control', 'no-store')
  demoLogin() {
    return { credentials: demoLoginConfig() };
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(@Body() body: unknown, @Res({ passthrough: true }) res: Response) {
    if (typeof body !== 'object' || body === null) {
      throw new BadRequestException('请输入邮箱和密码。');
    }
    const record = body as Record<string, unknown>;
    const email = text(record.email, '邮箱', 200);
    const password = typeof record.password === 'string' ? record.password : '';
    if (!password || password.length > 200) throw new BadRequestException('请输入密码。');
    const { token, payload } = await this.auth.login(email, password);
    this.setCookie(res, token);
    return payload;
  }

  @Get('session')
  session(@CurrentSession() session: RequestSession) {
    return this.auth.describe(session.sessionId);
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = req.cookies?.[SESSION_COOKIE];
    if (typeof token !== 'string' || !token) {
      throw new BadRequestException('没有可续期的会话。');
    }
    const { token: next, payload } = await this.auth.rotateByToken(token);
    this.setCookie(res, next);
    return payload;
  }

  @Post('logout')
  @HttpCode(200)
  async logout(
    @CurrentSession() session: RequestSession,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.auth.logout(session.sessionId);
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  }

  @Post('space')
  @HttpCode(200)
  async switchSpace(@Body() body: unknown, @CurrentSession() session: RequestSession) {
    if (typeof body !== 'object' || body === null) {
      throw new BadRequestException('请选择空间。');
    }
    const spaceId = text((body as Record<string, unknown>).spaceId, '空间', 120);
    return this.auth.switchSpace(session.sessionId, spaceId);
  }

  @Post('password')
  @HttpCode(200)
  changePassword(@Body() body: unknown, @CurrentSession() session: RequestSession) {
    if (typeof body !== 'object' || body === null) {
      throw new BadRequestException('请输入当前密码和新密码。');
    }
    const record = body as Record<string, unknown>;
    return this.auth.changePassword(
      session.userId,
      typeof record.currentPassword === 'string' ? record.currentPassword : '',
      typeof record.newPassword === 'string' ? record.newPassword : '',
    );
  }
}
