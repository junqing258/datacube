import { BadRequestException } from '@nestjs/common';

export const chartKinds = [
  'line',
  'bar',
  'pie',
  'scatter',
  'map',
  'radar',
  'funnel',
  'gauge',
  'table',
] as const;

export type ChartKind = (typeof chartKinds)[number];
export type ParameterType = 'string' | 'number' | 'boolean' | 'date';
export type MappingColumn = 'label' | 'value' | 'x' | 'longitude' | 'latitude';

export interface ParameterDefinition {
  type: ParameterType;
  default?: string | number | boolean | null;
  description?: string;
}

export interface SqlChartSpec {
  source: 'sql';
  datasetId: string;
  sql: string;
  parameters?: Record<string, ParameterDefinition>;
  window?: { days: number };
  mapping?: Partial<Record<MappingColumn, string>>;
}

export interface JsChartSpec {
  source: 'js';
  datasetId: string;
  definition: string;
  scripts: { extract: string; js: string; sql?: string };
  refresh?: {
    previewWindow?: { startDay: string; endDay: string };
    refreshWindow?: { startDay: string; endDay: string };
    intervalMinutes?: number;
  };
}

export type ChartSpec = SqlChartSpec | JsChartSpec;

const identifier = /^[A-Za-z_][A-Za-z0-9_]*$/;
const datePattern = /^(\d{4}-\d{2}-\d{2})$/;
const parameterTypes = new Set<string>(['string', 'number', 'boolean', 'date']);

export function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function validDay(value: unknown): value is string {
  if (typeof value !== 'string' || !datePattern.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function text(value: unknown, field: string, max: number) {
  if (typeof value !== 'string' || !value.trim())
    throw new BadRequestException(`${field} 不能为空。`);
  if (value.length > max) throw new BadRequestException(`${field} 过长。`);
  return value;
}

function optionalText(value: unknown, field: string, max: number) {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.length > max)
    throw new BadRequestException(`${field} 无效。`);
  return value;
}

function readParameters(value: unknown) {
  if (value === undefined) return undefined;
  if (!record(value)) throw new BadRequestException('查询参数定义无效。');
  const result: Record<string, ParameterDefinition> = {};
  for (const [name, definition] of Object.entries(value)) {
    if (!identifier.test(name) || !record(definition)) {
      throw new BadRequestException(`查询参数 ${name} 定义无效。`);
    }
    const { type } = definition;
    if (typeof type !== 'string' || !parameterTypes.has(type)) {
      throw new BadRequestException(`查询参数 ${name} 的类型无效。`);
    }
    const fallback = definition.default;
    if (fallback !== undefined && fallback !== null) {
      const valid =
        type === 'date'
          ? validDay(fallback)
          : type === 'string'
            ? typeof fallback === 'string'
            : type === 'number'
              ? typeof fallback === 'number' && Number.isFinite(fallback)
              : typeof fallback === 'boolean';
      if (!valid) throw new BadRequestException(`查询参数 ${name} 的默认值无效。`);
    }
    result[name] = {
      type: type as ParameterType,
      default: fallback === undefined ? undefined : (fallback as string | number | boolean | null),
    };
  }
  return result;
}

function readMapping(value: unknown) {
  if (value === undefined) return undefined;
  if (!record(value)) throw new BadRequestException('图表字段映射无效。');
  const mapping: Partial<Record<MappingColumn, string>> = {};
  for (const [column, field] of Object.entries(value)) {
    if (!['label', 'value', 'x', 'longitude', 'latitude'].includes(column)) {
      throw new BadRequestException(`未知的图表映射字段 ${column}。`);
    }
    if (typeof field !== 'string' || !identifier.test(field)) {
      throw new BadRequestException(`图表映射 ${column} 须为字段名。`);
    }
    mapping[column as MappingColumn] = field;
  }
  return mapping;
}

function readWindow(value: unknown, field: string) {
  if (value === undefined) return undefined;
  if (!record(value) || !validDay(value.startDay) || !validDay(value.endDay)) {
    throw new BadRequestException(`${field} 须为有效日期范围。`);
  }
  if (value.startDay >= value.endDay)
    throw new BadRequestException(`${field} 起始日须早于截止日。`);
  return { startDay: value.startDay, endDay: value.endDay };
}

export function readChartSpec(value: unknown): ChartSpec {
  if (!record(value)) throw new BadRequestException('查询定义须为对象。');
  if (value.source === 'sql') {
    const datasetId = text(value.datasetId, '数据集', 120);
    const sql = text(value.sql, '查询语句', 30_000);
    const parameters = readParameters(value.parameters);
    const range = value.window;
    if (
      range !== undefined &&
      (!record(range) ||
        typeof range.days !== 'number' ||
        !Number.isInteger(range.days) ||
        range.days < 1 ||
        range.days > 3660)
    ) {
      throw new BadRequestException('窗口天数须为 1 至 3660 的整数。');
    }
    const mapping = readMapping(value.mapping);
    return {
      source: 'sql',
      datasetId,
      sql,
      ...(parameters ? { parameters } : {}),
      ...(range ? { window: { days: (range as { days: number }).days } } : {}),
      ...(mapping ? { mapping } : {}),
    };
  }
  if (value.source === 'js') {
    const scripts = value.scripts;
    if (
      !record(scripts) ||
      typeof scripts.js !== 'string' ||
      typeof scripts.extract !== 'string' ||
      scripts.js.length > 200_000 ||
      scripts.extract.length > 200_000
    ) {
      throw new BadRequestException('JS 脚本无效。');
    }
    const definition = text(value.definition, '图表定义', 200_000);
    const refresh = record(value.refresh) ? value.refresh : undefined;
    const preview = readWindow(refresh?.previewWindow, '预览日期范围');
    const scheduled = readWindow(refresh?.refreshWindow, '刷新日期范围');
    const intervalMinutes = refresh?.intervalMinutes;
    if (
      intervalMinutes !== undefined &&
      (typeof intervalMinutes !== 'number' ||
        !Number.isInteger(intervalMinutes) ||
        intervalMinutes < 0 ||
        intervalMinutes > 525_600)
    ) {
      throw new BadRequestException('刷新间隔须为 0 至 525600 的整数分钟。');
    }
    return {
      source: 'js',
      datasetId: text(value.datasetId, '数据集', 120),
      definition,
      scripts: {
        js: scripts.js,
        extract: scripts.extract,
        sql: optionalText(scripts.sql, 'SQL 脚本', 200_000),
      },
      refresh: {
        ...(preview ? { previewWindow: preview } : {}),
        ...(scheduled ? { refreshWindow: scheduled } : {}),
        ...(intervalMinutes !== undefined ? { intervalMinutes } : {}),
      },
    };
  }
  throw new BadRequestException('查询定义 source 须为 sql 或 js。');
}

export function parseStoredSpec(value: string): ChartSpec {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new BadRequestException('查询定义已损坏。');
  }
  return readChartSpec(parsed);
}

export function readDisplay(value: unknown, fallbackName: string) {
  if (value === undefined) {
    return { kind: 'line' as ChartKind, dataset: '未命名数据集' };
  }
  if (!record(value)) throw new BadRequestException('展示配置无效。');
  const kind = typeof value.kind === 'string' ? value.kind : 'line';
  if (!(chartKinds as readonly string[]).includes(kind)) {
    throw new BadRequestException(`图表类型须为 ${chartKinds.join('、')} 之一。`);
  }
  const dataset = optionalText(value.dataset, '数据集名称', 120);
  return { kind: kind as ChartKind, dataset: dataset ?? fallbackName };
}

export function canonicalParameters(parameters: Record<string, unknown>) {
  return Object.fromEntries(
    Object.keys(parameters)
      .sort()
      .map((key) => [key, parameters[key] ?? null]),
  );
}

export function todayInShanghai() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export function addDays(day: string, offset: number) {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

export function effectiveParameters(
  spec: SqlChartSpec,
  provided: unknown,
): Record<string, string | number | boolean | null> {
  if (provided !== undefined && (!record(provided) || Array.isArray(provided))) {
    throw new BadRequestException('查询参数须为对象。');
  }
  const declarations = spec.parameters ?? {};
  const values: Record<string, string | number | boolean | null> = {};
  if (spec.window && record(provided)) {
    for (const name of ['startDay', 'endDay'] as const) {
      if (!Object.hasOwn(provided, name)) continue;
      if (!validDay(provided[name])) {
        throw new BadRequestException(`日期参数 ${name} 无效。`);
      }
      values[name] = provided[name] as string;
    }
  }
  for (const [name, definition] of Object.entries(declarations)) {
    const value =
      record(provided) && Object.hasOwn(provided, name) ? provided[name] : definition.default;
    if (value === undefined) continue;
    if (value !== null) {
      const valid =
        definition.type === 'date'
          ? validDay(value)
          : definition.type === 'string'
            ? typeof value === 'string'
            : definition.type === 'number'
              ? typeof value === 'number' && Number.isFinite(value)
              : typeof value === 'boolean';
      if (!valid) throw new BadRequestException(`查询参数 ${name} 须为 ${definition.type}。`);
    }
    values[name] = value as string | number | boolean | null;
  }
  const declaredNames = new Set(Object.keys(declarations));
  if (spec.window) {
    declaredNames.add('startDay');
    declaredNames.add('endDay');
  }
  for (const name of Object.keys(record(provided) ? provided : {})) {
    if (!declaredNames.has(name)) {
      throw new BadRequestException(`未声明的查询参数 ${name}。`);
    }
  }
  if (spec.window) {
    const endDay = values.endDay === undefined ? addDays(todayInShanghai(), 1) : values.endDay;
    const startDay =
      values.startDay === undefined ? addDays(String(endDay), -spec.window.days) : values.startDay;
    if (!validDay(startDay) || !validDay(endDay) || startDay >= endDay) {
      throw new BadRequestException('日期窗口无效。');
    }
    values.startDay = startDay;
    values.endDay = endDay;
  }
  return values;
}
