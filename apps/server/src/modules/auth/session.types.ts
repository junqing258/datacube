import {
  BadRequestException,
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
} from '@nestjs/common';

export const SESSION_COOKIE = 'datacube_session';
export const IS_PUBLIC_KEY = 'datacube:public';
export const IS_ADMIN_KEY = 'datacube:admin';

/** Marks a route that does not require a browser session (login, refresh, health). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
/** Marks a route that requires a space administrator or platform administrator. */
export const AdminOnly = () => SetMetadata(IS_ADMIN_KEY, true);

export interface RequestSession {
  sessionId: string;
  userId: string;
  /** Active space; null when the user has not selected one yet. */
  spaceId: string | null;
  /** Role in the active space. */
  role: string | null;
  user: { id: string; email: string; name: string; role: string };
}

export interface AuthenticatedRequest {
  session?: RequestSession;
  cookies?: Record<string, string | undefined>;
}

export interface SessionSpace {
  id: string;
  slug: string;
  name: string;
  role: string;
}

export function currentSession(context: ExecutionContext): RequestSession | undefined {
  return context.switchToHttp().getRequest<AuthenticatedRequest>().session;
}

export const CurrentSession = createParamDecorator((_data: unknown, context: ExecutionContext) =>
  currentSession(context),
);

export const CurrentSpace = createParamDecorator((_data: unknown, context: ExecutionContext) => {
  const session = currentSession(context);
  if (!session?.spaceId) {
    throw new BadRequestException({
      code: 'SPACE_REQUIRED',
      message: '请选择空间后再访问业务数据。',
    });
  }
  return session.spaceId;
});

export function isSpaceAdmin(role: string | null | undefined) {
  return role === 'admin';
}
