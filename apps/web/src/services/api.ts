import axios, { isAxiosError } from 'axios';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 15000,
  withCredentials: true,
});

export interface ApiFailure {
  code: string;
  message: string;
  status?: number;
  data?: Record<string, unknown>;
}

export function apiFailure(error: unknown): ApiFailure {
  if (isAxiosError(error)) {
    const data = error.response?.data;
    const message =
      typeof data === 'object' && data !== null && typeof data.message === 'string'
        ? data.message
        : undefined;
    return {
      code:
        typeof data === 'object' && data !== null && typeof data.code === 'string'
          ? data.code
          : error.code === 'ECONNABORTED'
            ? 'TIMEOUT'
            : error.response
              ? 'HTTP_ERROR'
              : 'NETWORK_ERROR',
      message: message ?? (error.response ? '请求失败。' : '无法连接服务。'),
      status: error.response?.status,
      data:
        typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : undefined,
    };
  }
  return {
    code: 'UNKNOWN',
    message: error instanceof Error ? error.message : '请求失败。',
  };
}

export function apiMessage(error: unknown) {
  return apiFailure(error).message;
}

export function isUnauthorized(error: unknown) {
  const failure = apiFailure(error);
  return failure.status === 401 || failure.code === 'UNAUTHENTICATED';
}
