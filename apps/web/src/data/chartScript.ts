import { readChartData } from '../services/chartData';
import { chartInput, validateChartPoints, type CustomChart } from './customCharts';
import { executeExtract, executeScript } from './chartScriptSandbox';

export type Cell = string | number | boolean | null;
export type ScriptRow = Record<string, Cell>;
export type Window = { startDay: string; endDay: string };

export type ScriptBinding = {
  alias: string;
  dataset: string;
  mode: 'dataset' | 'sql';
  fields: string[];
  query: string;
  useWindow: boolean;
  startParameter: string;
  endParameter: string;
  filterFields?: string[];
  parameters?: Record<string, FieldType>;
};
const coordinates = ['x', 'longitude', 'latitude'] as const;
export type MappingColumn = 'label' | 'value' | (typeof coordinates)[number];
export type Mapping = Partial<Record<MappingColumn, string>>;
type ScriptConfig = { bindings: ScriptBinding[]; mapping: Mapping };

export type FieldType = 'string' | 'number' | 'boolean' | 'date';
export type EtlConfig = {
  extract: { bindings: ScriptBinding[]; outputs: Record<string, string[]> };
  load: { fields: Record<string, { type: FieldType; nullable: boolean }>; rowKey: string[] };
  mapping: Mapping & { warehouse?: string };
};
export type ScriptDraft = {
  code: string;
  etl?: { code: string; config: EtlConfig };
  previewWindow: Window;
  refreshWindow: Window;
  intervalMinutes: number;
};

export type ScriptSource = {
  draft: ScriptDraft;
  version: number;
  status: 'waiting' | 'running' | 'success' | 'failed';
  lastSuccess?: number;
  coverage?: string;
  error?: string;
  nextRefresh?: number;
};

function withScriptConfig(code: string, config: ScriptConfig) {
  return `const chartConfig = ${JSON.stringify(config, null, 2)};\n\n${code}`;
}

export function normalizeScriptDraft(draft: ScriptDraft & Partial<ScriptConfig>): ScriptDraft {
  const { bindings, mapping, ...current } = draft;
  if (!bindings || !mapping) return draft;

  return { ...current, code: withScriptConfig(current.code, { bindings, mapping }) };
}

export const identifier = /^[A-Za-z_$][\w$]*$/;
export const sqlIdentifier = /^[A-Za-z_][\w]*$/;
export function validDay(value: unknown): value is string {
  if (typeof value !== 'string' || !/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function matchesFieldType(type: FieldType, value: unknown): value is Exclude<Cell, null> {
  if (type === 'date') return validDay(value);
  return typeof value === type && (type !== 'number' || Number.isFinite(value));
}

export function mappingColumns(kind: CustomChart['kind']): MappingColumn[] {
  const extra = kind === 'scatter' || kind === 'map' ? chartInput[kind].columns : [];
  return ['label', 'value', ...extra];
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function readBinding(value: unknown): ScriptBinding {
  if (!isRecord(value)) throw new Error('每个输入须为对象。');
  const {
    alias,
    dataset,
    mode = 'dataset',
    fields,
    query = '',
    useWindow = true,
    startParameter = 'startDay',
    endParameter = 'endDay',
  } = value;
  if (
    typeof alias !== 'string' ||
    typeof dataset !== 'string' ||
    !sqlIdentifier.test(dataset) ||
    (mode !== 'dataset' && mode !== 'sql') ||
    !Array.isArray(fields) ||
    fields.some((field) => typeof field !== 'string') ||
    typeof query !== 'string' ||
    typeof useWindow !== 'boolean' ||
    typeof startParameter !== 'string' ||
    typeof endParameter !== 'string'
  ) {
    throw new Error('输入配置无效，请检查 alias、dataset、mode、fields 和日期参数。');
  }
  return {
    alias,
    dataset,
    mode,
    fields,
    query,
    useWindow,
    startParameter,
    endParameter,
  };
}

function isCell(value: unknown): value is Cell {
  return (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  );
}

type Filter = { field: string; values: Exclude<Cell, null>[] };

function readOptions(binding: ScriptBinding, options: unknown) {
  const filters: Filter[] = [];
  const queryParams: Record<string, Exclude<Cell, null>> = Object.create(null);
  if (options !== undefined && !isRecord(options)) throw new Error('read 参数须为对象。');
  const settings = options ?? {};
  const allowed = binding.mode === 'sql' ? 'params' : 'filters';
  if (Object.keys(settings).some((key) => key !== allowed)) {
    throw new Error(`此绑定仅接受 ${allowed}。`);
  }
  if (binding.mode === 'sql') {
    const declarations = Object.entries(binding.parameters ?? {});
    const values = settings.params === undefined ? {} : settings.params;
    if (!isRecord(values) || Object.keys(values).length !== declarations.length) {
      throw new Error('SQL 参数须匹配 extractConfig 中的声明。');
    }
    for (const [name, type] of declarations) {
      const value = Object.hasOwn(values, name) ? values[name] : undefined;
      if (!matchesFieldType(type, value)) throw new Error(`SQL 参数 ${name} 须为 ${type}。`);
      queryParams[name] = value;
    }
  } else if (settings.filters !== undefined) {
    if (!Array.isArray(settings.filters)) throw new Error('filters 须为数组。');
    for (const filter of settings.filters) {
      if (
        !isRecord(filter) ||
        Object.keys(filter).some((key) => !['field', 'op', 'value'].includes(key)) ||
        typeof filter.field !== 'string' ||
        !binding.filterFields?.includes(filter.field)
      ) {
        throw new Error('读取筛选须使用已声明的字段。');
      }
      const { field, op, value } = filter;
      const values = op === 'eq' ? [value] : value;
      if (
        (op !== 'eq' && op !== 'in') ||
        !Array.isArray(values) ||
        !values.length ||
        values.length > 100 ||
        !values.every((item): item is Exclude<Cell, null> => isCell(item) && item !== null)
      ) {
        throw new Error(`筛选 ${field} 须提供符合类型的 eq 值或 1 至 100 个 in 值。`);
      }
      filters.push({ field, values });
    }
  }
  return { filters, queryParams };
}

async function readRows(
  binding: ScriptBinding,
  range: Window,
  options?: unknown,
  signal?: AbortSignal,
) {
  const { filters, queryParams } = readOptions(binding, options);
  const { dataset, fields, mode } = binding;
  if (mode === 'sql') {
    if (binding.useWindow) {
      queryParams[binding.startParameter] = range.startDay;
      queryParams[binding.endParameter] = range.endDay;
    }
    const { rows } = await readChartData(
      { dataset, fields, mode, query: binding.query, params: queryParams },
      signal,
    );
    return rows;
  }
  const { rows } = await readChartData(
    { dataset, fields, mode, filters, window: binding.useWindow ? range : undefined },
    signal,
  );
  return rows;
}

async function runExtract(
  etl: NonNullable<ScriptDraft['etl']>,
  params: Window & { timeZone: string },
  signal: AbortSignal,
  onInput?: (alias: string, status: string) => void,
) {
  const { bindings, outputs } = etl.config.extract;
  const byAlias = new Map(bindings.map((binding) => [binding.alias, binding]));
  const totals = new Map<string, number>();
  let reads = 0;
  let bytes = 0;
  const result = await executeExtract(etl.code, params, signal, async (alias, options) => {
    const binding = byAlias.get(alias);
    if (!binding) throw new Error(`未声明读取绑定 ${alias}。`);
    if (++reads > 50) throw new Error('每轮最多读取 50 次。');
    onInput?.(alias, '读取中…');
    try {
      const rows = await readRows(binding, params, options, signal);
      const count = (totals.get(alias) ?? 0) + rows.length;
      bytes += new Blob([JSON.stringify(rows)]).size;
      if (count > 10000 || bytes > 10 * 1024 * 1024) {
        throw new Error('累计读取超过 10,000 行/来源或 10 MiB。');
      }
      totals.set(alias, count);
      onInput?.(alias, `读取成功 · 累计 ${count} 行`);
      return rows;
    } catch (error) {
      const message = error instanceof Error ? error.message : '读取失败。';
      onInput?.(alias, message);
      throw new Error(`${alias} · ${message}`);
    }
  });
  if (!isRecord(result) || Object.keys(result).length !== Object.keys(outputs).length) {
    throw new Error('extract.js 须返回 extractConfig.outputs 声明的对象。');
  }
  const inputs: Record<string, ScriptRow[]> = Object.create(null);
  for (const [alias, fields] of Object.entries(outputs)) {
    const rows = Object.hasOwn(result, alias) ? result[alias] : undefined;
    if (
      !Array.isArray(rows) ||
      rows.length > 10000 ||
      rows.some(
        (row) =>
          !isRecord(row) ||
          Object.keys(row).length !== fields.length ||
          fields.some((field) => !Object.hasOwn(row, field) || !isCell(row[field])),
      )
    ) {
      throw new Error(`extract.js 输出 ${alias} 须匹配 extractConfig.outputs。`);
    }
    inputs[alias] = rows;
  }
  return inputs;
}

function validateLoad(rows: Record<string, unknown>[], load: EtlConfig['load']) {
  const keys = new Set<string>();
  const fields = Object.entries(load.fields);
  for (const [index, row] of rows.entries()) {
    const prefix = `Load · 第 ${index + 1} 行`;
    if (Object.keys(row).some((field) => !Object.hasOwn(load.fields, field))) {
      throw new Error(`${prefix}含未声明的字段。`);
    }
    for (const [field, { type, nullable }] of fields) {
      if (
        !Object.hasOwn(row, field) ||
        !(row[field] === null ? nullable : matchesFieldType(type, row[field]))
      ) {
        throw new Error(`${prefix}的 ${field} 缺失或类型无效。`);
      }
    }
    const key = JSON.stringify(load.rowKey.map((field) => row[field]));
    if (keys.has(key)) throw new Error(`${prefix}的行键重复。`);
    keys.add(key);
  }
}

export async function runChartScript(
  draft: ScriptDraft,
  kind: CustomChart['kind'],
  phase: 'preview' | 'refresh',
  onInput?: (alias: string, status: string) => void,
  signal?: AbortSignal,
) {
  const range = phase === 'preview' ? draft.previewWindow : draft.refreshWindow;
  for (const [label, { startDay, endDay }] of [
    ['预览', draft.previewWindow],
    ['刷新', draft.refreshWindow],
  ] as const) {
    if (!validDay(startDay) || !validDay(endDay) || startDay >= endDay) {
      throw new Error(`${label}日期范围无效，起始日须早于截止日。`);
    }
  }
  const params = { ...range, timeZone: 'Asia/Shanghai' };
  const controller = new AbortController();
  const timeout = window.setTimeout(
    () => controller.abort(new Error('ETL 运行超时（30 秒）。')),
    30000,
  );
  try {
    const deadline = signal ? AbortSignal.any([controller.signal, signal]) : controller.signal;
    return await runScriptDraft(draft, kind, params, deadline, onInput);
  } finally {
    window.clearTimeout(timeout);
    controller.abort();
  }
}

async function runScriptDraft(
  draft: ScriptDraft,
  kind: CustomChart['kind'],
  params: Window & { timeZone: string },
  signal: AbortSignal,
  onInput?: (alias: string, status: string) => void,
) {
  let config: { mapping: EtlConfig['mapping'] };
  let inputs: Record<string, ScriptRow[]>;
  if (draft.etl) {
    config = draft.etl.config;
    inputs = await runExtract(draft.etl, params, signal, onInput);
  } else {
    const legacy = await readLegacyInputs(draft, params, signal, onInput);
    config = legacy.config;
    inputs = legacy.inputs;
  }
  const mappedColumns = mappingColumns(kind);
  const mapping = new Map<MappingColumn, string>();
  for (const column of mappedColumns) {
    const field = config.mapping[column];
    if (typeof field !== 'string' || !field.trim()) {
      throw new Error(`请在映射中为 ${column} 填写输出字段名。`);
    }
    mapping.set(column, field);
  }
  if (new Blob([JSON.stringify(inputs)]).size > 10 * 1024 * 1024)
    throw new Error('输入合计超过 10 MiB，请缩小日期范围。');
  const output = await executeScript(
    draft.code,
    inputs,
    params,
    draft.etl ? 'etlTransform' : 'transform',
    signal,
  );
  const rows = output.map((row, index) => {
    if (!isRecord(row)) {
      throw new Error(`第 ${index + 1} 行必须是对象。`);
    }
    return row;
  });
  if (draft.etl) validateLoad(rows, draft.etl.config.load);
  const warehouseField = draft.etl ? config.mapping.warehouse : 'warehouse';
  const points = rows.map((row, index) => {
    function readField(column: MappingColumn) {
      const field = mapping.get(column);
      if (field === undefined || !Object.hasOwn(row, field))
        throw new Error(`第 ${index + 1} 行缺少映射字段 ${field}。`);
      return row[field];
    }

    const label = readField('label');
    if ((typeof label !== 'string' && typeof label !== 'number') || !String(label).trim()) {
      throw new Error(`第 ${index + 1} 行的标签须为非空文本或数字。`);
    }
    const value = readField('value');
    if (value !== null && (typeof value !== 'number' || !Number.isFinite(value))) {
      throw new Error(`第 ${index + 1} 行的数值须为有限数字或 null。`);
    }
    const point: CustomChart['points'][number] = { label: String(label), value };
    if (warehouseField && typeof row[warehouseField] === 'string')
      point.warehouse = row[warehouseField];
    for (const column of coordinates) {
      if (!mappedColumns.includes(column)) continue;
      const cell = readField(column);
      if (typeof cell !== 'number' || !Number.isFinite(cell)) {
        throw new Error(`第 ${index + 1} 行的 ${mapping.get(column)} 须为有限数字。`);
      }
      point[column] = cell;
    }
    return point;
  });
  const error = points.length && validateChartPoints(kind, points);
  if (error) throw new Error(error);
  return { points, rows };
}

async function readLegacyInputs(
  draft: ScriptDraft,
  params: Window & { timeZone: string },
  signal: AbortSignal,
  onInput?: (alias: string, status: string) => void,
) {
  const [config] = await executeScript(draft.code, {}, params, 'config', signal);
  if (!isRecord(config) || !Array.isArray(config.bindings) || !isRecord(config.mapping)) {
    throw new Error('请在 chartConfig 中配置 bindings 数组和 mapping 对象。');
  }
  const bindings = config.bindings.map(readBinding);
  const aliases = bindings.map(({ alias }) => alias);
  if (
    aliases.length > 5 ||
    aliases.some((alias) => !identifier.test(alias)) ||
    new Set(aliases).size !== aliases.length
  ) {
    throw new Error('最多可配置 5 个输入，别名须为唯一的 JavaScript 标识符。');
  }
  const reads = await Promise.allSettled(
    bindings.map(async (binding) => {
      const { alias, fields } = binding;
      onInput?.(alias, '读取中…');
      try {
        if (
          !fields.length ||
          fields.some((field) => !identifier.test(field)) ||
          new Set(fields).size !== fields.length
        ) {
          throw new Error('请选择或填写唯一的输入字段。');
        }
        if (
          binding.mode === 'sql' &&
          binding.useWindow &&
          (!sqlIdentifier.test(binding.startParameter) ||
            !sqlIdentifier.test(binding.endParameter) ||
            binding.startParameter === binding.endParameter)
        ) {
          throw new Error('请为日期范围配置两个不同的 SQL 命名参数。');
        }
        const projection = await readRows(binding, params, undefined, signal);
        onInput?.(alias, `读取成功 · ${projection.length} 行`);
        return [alias, projection] as const;
      } catch (error) {
        const message = error instanceof Error ? error.message : '读取失败。';
        onInput?.(alias, message);
        throw new Error(`${alias} · ${message}`);
      }
    }),
  );
  const inputs = Object.fromEntries(
    reads.map((read) => {
      if (read.status === 'rejected') throw read.reason;
      return read.value;
    }),
  );
  return { config: { mapping: config.mapping as Mapping }, inputs };
}
