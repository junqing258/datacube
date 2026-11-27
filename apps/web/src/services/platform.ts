import { api } from './api';

export type Cell = string | number | boolean | null;
export type ChartKind =
  'line' | 'bar' | 'pie' | 'scatter' | 'map' | 'radar' | 'funnel' | 'gauge' | 'table';

export interface DatasetRecord {
  id: string;
  key: string;
  name: string;
  description?: string;
  kind: string;
  connection: { id: string; name: string; kind: string };
  table: string;
  fields: string[];
  timeField?: string;
}

export interface DatasetDetail extends Omit<DatasetRecord, 'fields'> {
  fields: {
    key: string;
    name: string;
    dataType: string;
    unit?: string;
    description?: string;
  }[];
}

export interface ChartSpec {
  source: 'sql' | 'js';
  datasetId: string;
  sql?: string;
  definition?: string;
  scripts?: { extract: string; js: string; sql?: string };
  refresh?: {
    previewWindow?: { startDay: string; endDay: string };
    refreshWindow?: { startDay: string; endDay: string };
    intervalMinutes?: number;
  };
  parameters?: Record<string, { type: string; default?: Cell }>;
  window?: { days: number };
  mapping?: Record<string, string>;
}

export interface ChartSummary {
  id: string;
  name: string;
  kind: ChartKind;
  dataset: string;
  source: 'sql' | 'js';
  archived: boolean;
}

export interface ChartRecord {
  id: string;
  name: string;
  createdById: string;
  kind: ChartKind;
  dataset: string;
  display: { kind: ChartKind; dataset: string };
  source: 'sql' | 'js';
  queryVersionId: string;
  archived: boolean;
  referencedBy: number;
  createdAt: string;
  updatedAt: string;
  knowledge?: { topic: string; version: number }[];
  spec?: ChartSpec | null;
  latest: {
    executionId: string;
    status: string;
    rowCount: number | null;
    truncated: boolean;
    errorCode: string | null;
    parameters: Record<string, Cell> | null;
    completedAt: string | null;
    updatedAt: string;
  } | null;
}

export interface DashboardCardRecord {
  id: string;
  chartId: string;
  title: string;
  position: number;
  layout: Record<string, unknown>;
  filterMapping: Record<string, unknown> | null;
  chart: ChartSummary;
}

export interface DashboardRecord {
  id: string;
  name: string;
  description: string;
  kind: string;
  origin: string;
  visibility: string;
  version: number;
  archived: boolean;
  published: boolean;
  favorite: boolean;
  filters: unknown;
  canEdit: boolean;
  createdAt: string;
  updatedAt: string;
  cards: DashboardCardRecord[];
}

export interface ExecutionRecord {
  id: string;
  chartId: string | null;
  chartName: string | null;
  queryVersionId: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'timed_out' | 'cancelled' | 'denied';
  errorCode: string | null;
  rowCount: number | null;
  truncated: boolean;
  parameters: Record<string, Cell> | null;
  resultRef: string | null;
  resultExpiresAt: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface ExecutionResult {
  executionId: string;
  columns: string[];
  rows: Record<string, Cell>[];
  rowCount: number;
  truncated: boolean;
  expiresAt: string;
  executedAt: string;
  dataAsOf: string | null;
}

export interface ChartInput {
  name: string;
  display: { kind: ChartKind; dataset: string };
  spec: ChartSpec;
  bindings?: { alias: string; datasetId: string }[];
}

const failureMessage: Record<string, string> = {
  QUERY_TIMEOUT: '查询超时，请缩小日期范围后重试。',
  RESULT_TOO_LARGE: '查询结果超过 10,000 行或 10 MiB。',
  QUERY_KIND_UNSUPPORTED: '该图表暂由浏览器执行取数。',
  CHART_ARCHIVED: '图表已归档，不能刷新。',
  RESULT_EXPIRED: '查询结果已过期，请刷新图表。',
  INVALID_RESULT: '查询结果不符合图表要求。',
  INVALID_QUERY: '查询语句无效。',
  DATASET_NOT_FOUND: '数据集不存在或已停用。',
  DATASET_UNAVAILABLE: '数据源连接不可用，请检查服务端配置。',
  PERMISSION_DENIED: '没有读取该结果的权限。',
};

export async function listDashboards() {
  const response = await api.get<DashboardRecord[]>('/dashboards');
  return response.data;
}

export async function createDashboard(input: {
  name: string;
  description?: string;
  kind?: string;
}) {
  const response = await api.post<DashboardRecord>('/dashboards', {
    name: input.name,
    description: input.description,
    kind: input.kind ?? 'custom',
  });
  return response.data;
}

export async function updateDashboard(
  id: string,
  changes: Record<string, unknown> & { expectedVersion: number },
) {
  const response = await api.patch<DashboardRecord>(`/dashboards/${id}`, changes);
  return response.data;
}

export async function copyDashboard(id: string, name?: string) {
  const response = await api.post<DashboardRecord>(`/dashboards/${id}/copies`, { name });
  return response.data;
}

export async function addDashboardCard(id: string, chartId: string, expectedVersion: number) {
  const response = await api.post<DashboardRecord>(`/dashboards/${id}/cards`, {
    chartId,
    expectedVersion,
  });
  return response.data;
}

export async function removeDashboardCard(id: string, cardId: string, expectedVersion: number) {
  const response = await api.delete<DashboardRecord>(`/dashboards/${id}/cards/${cardId}`, {
    data: { expectedVersion },
  });
  return response.data;
}

export async function setDashboardFavorite(id: string, favorite: boolean) {
  const response = favorite
    ? await api.put<{ favorite: boolean }>(`/dashboards/${id}/favorite`)
    : await api.delete<{ favorite: boolean }>(`/dashboards/${id}/favorite`);
  return response.data;
}

export async function listCharts(archived = false) {
  const response = await api.get<ChartRecord[]>('/charts', {
    params: archived ? { archived: '1' } : undefined,
  });
  return response.data;
}

export async function getChart(id: string) {
  const response = await api.get<ChartRecord>(`/charts/${id}`);
  return response.data;
}

export async function createChart(input: ChartInput) {
  const response = await api.post<ChartRecord>('/charts', input);
  return response.data;
}

export async function updateChart(
  id: string,
  changes: Partial<ChartInput> & { archived?: boolean },
) {
  const response = await api.patch<ChartRecord>(`/charts/${id}`, changes);
  return response.data;
}

export async function listDatasets() {
  const response = await api.get<DatasetRecord[]>('/datasets');
  return response.data;
}

export async function executeChart(chartId: string, parameters?: Record<string, Cell>) {
  const response = await api.post<{ id: string; status: string }>(
    `/charts/${chartId}/executions`,
    parameters ? { parameters } : {},
  );
  return response.data;
}

export async function getExecution(id: string) {
  const response = await api.get<ExecutionRecord>(`/query-executions/${id}`);
  return response.data;
}

export async function getExecutionResult(id: string) {
  const response = await api.get<ExecutionResult>(`/query-executions/${id}/result`);
  return response.data;
}

export function executionDownloadUrl(id: string) {
  const base = api.defaults.baseURL ?? '/api';
  return `${base}/query-executions/${id}/result/download`;
}

function messageFor(code: string | null) {
  return (code && failureMessage[code]) || `查询失败${code ? `（${code}）` : ''}。`;
}

function delay(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}

/** Submits an execution and polls until a terminal state, then returns the stored result. */
export async function runChartExecution(
  chartId: string,
  options: {
    parameters?: Record<string, Cell>;
    executionId?: string;
    signal?: AbortSignal;
  } = {},
) {
  const execution = options.executionId
    ? { id: options.executionId }
    : await executeChart(chartId, options.parameters);
  const deadline = Date.now() + 35_000;
  for (;;) {
    options.signal?.throwIfAborted();
    const state = await getExecution(execution.id);
    if (state.status === 'succeeded') {
      return {
        ...(await getExecutionResult(execution.id)),
        executionId: state.id,
      };
    }
    if (state.status === 'failed' || state.status === 'timed_out' || state.status === 'denied') {
      throw new Error(messageFor(state.errorCode));
    }
    if (Date.now() > deadline) throw new Error('查询超时，请稍后重试。');
    await delay(800, options.signal);
  }
}
