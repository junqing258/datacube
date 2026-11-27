import { api, apiMessage } from './api';

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
  key: string;
  name: string;
  kind: 'sqlite' | 'mysql' | 'postgresql';
  table: string;
  fields: string[];
  timeField?: string;
};

function apiError(error: unknown): never {
  throw new Error(apiMessage(error));
}

export async function listChartDataSources(signal?: AbortSignal) {
  try {
    const response = await api.get<
      {
        id: string;
        key: string;
        name: string;
        connection: { kind: string };
        table: string;
        fields: string[];
        timeField?: string;
      }[]
    >('/datasets', { signal });
    return response.data.map(
      ({ id, key, name, connection, table, fields, timeField }): ChartDataSource => ({
        id,
        key,
        name,
        kind: connection.kind as ChartDataSource['kind'],
        table,
        fields,
        timeField,
      }),
    );
  } catch (error) {
    apiError(error);
  }
}

export async function readChartData(request: ReadRequest, signal?: AbortSignal) {
  try {
    const response = await api.post<{ columns: string[]; rows: Record<string, Cell>[] }>(
      '/chart-data/read',
      request,
      { signal },
    );
    return response.data;
  } catch (error) {
    apiError(error);
  }
}
