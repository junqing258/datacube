import { api } from './api';

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: string;
}

export interface SessionSpace {
  id: string;
  slug: string;
  name: string;
  role: string;
}

export interface SessionPayload {
  user: SessionUser;
  space: SessionSpace | null;
  spaces: SessionSpace[];
  expiresAt: string;
  idleExpiresAt: string;
}

export function login(email: string, password: string) {
  return api
    .post<SessionPayload>('/auth/login', { email, password })
    .then((response) => response.data);
}

export function getDemoLogin() {
  return api
    .get<{ credentials: { email: string; password: string } | null }>('/auth/demo-login')
    .then(({ data }) => data.credentials);
}

export function getSession() {
  return api.get<SessionPayload>('/auth/session').then((response) => response.data);
}

export function refreshSession() {
  return api.post<SessionPayload>('/auth/refresh').then((response) => response.data);
}

export function logout() {
  return api.post<{ ok: boolean }>('/auth/logout').then((response) => response.data);
}

export function switchSpace(spaceId: string) {
  return api.post<SessionPayload>('/auth/space', { spaceId }).then((response) => response.data);
}

export const roleLabels: Record<string, string> = {
  admin: '业务管理员',
  developer: '开发者',
  member: '成员',
};
