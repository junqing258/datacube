import { isAxiosError } from 'axios';
import { api } from './api';

type Cell = string | number | boolean | null;
type Filters = { field: string; values: Exclude<Cell, null>[] }[];
type ReadRequest = {
  dataset: string;
  fields?: string[];
} & (
  | { mode: 'dataset'; window?: { startDay: string; endDay: string }; filters: Filters }
  | { mode: 'sql'; query: string; params?: Record<string, Cell> }
);

export type ChartDataSource = {
  id: string;
  name: string;
  kind: 'sqlite' | 'mysql' | 'postgresql';
  table: string;
  fields: string[];
  timeField?: string;
};

const tokenKey = 'datacube.chart-data-token';

function headers(token = sessionStorage.getItem(tokenKey) ?? '') {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function apiError(error: unknown): never {
  if (isAxiosError(error)) {
    const message = error.response?.data?.message;
    if (typeof message === 'string') throw new Error(message);
    if (!error.response && error.code !== 'ERR_CANCELED') throw new Error('无法连接图表数据服务。');
  }
  throw error;
}

export async function listChartDataSources(token?: string, signal?: AbortSignal) {
  try {
    const response = await api.get<ChartDataSource[]>('/chart-data/sources', {
      headers: headers(token),
      signal,
    });
    return response.data;
  } catch (error) {
    apiError(error);
  }
}

export async function connectChartData(token: string) {
  const sources = await listChartDataSources(token);
  sessionStorage.setItem(tokenKey, token);
  return sources;
}

export async function readChartData(request: ReadRequest, signal?: AbortSignal) {
  try {
    const response = await api.post<{ columns: string[]; rows: Record<string, Cell>[] }>(
      '/chart-data/read',
      request,
      { headers: headers(), signal },
    );
    return response.data;
  } catch (error) {
    apiError(error);
  }
}
