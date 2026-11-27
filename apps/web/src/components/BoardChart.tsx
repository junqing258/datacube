import { useQuery } from '@tanstack/react-query';
import { Download, RefreshCw } from 'lucide-react';
import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { DataTable } from '../components/PageParts';
import { parseChartDefinition, parseExtractScript } from '../data/chartDefinition';
import { runChartScript, type ScriptDraft } from '../data/chartScript';
import { type ChartPoint, type CustomChart } from '../data/customCharts';
import {
  executionDownloadUrl,
  getChart,
  runChartExecution,
  type Cell,
  type ChartSpec,
  type ChartSummary,
  type ExecutionResult,
} from '../services/platform';

const SalesChart = lazy(() => import('../components/SalesChart'));

const format = new Intl.NumberFormat('zh-CN').format;

function timeOf(value?: string | null) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'short',
    timeStyle: 'medium',
    timeZone: 'Asia/Shanghai',
  }).format(new Date(value));
}

function addDays(day: string, offset: number) {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function defaultParameters(spec?: ChartSpec | null) {
  const parameters: Record<string, Cell> = {};
  if (!spec) return parameters;
  for (const [name, definition] of Object.entries(spec.parameters ?? {})) {
    if (definition.default !== undefined) parameters[name] = definition.default;
  }
  if (spec.window) {
    const endDay = addDays(
      new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Shanghai',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date()),
      1,
    );
    parameters.startDay = addDays(endDay, -spec.window.days);
    parameters.endDay = endDay;
  }
  return parameters;
}

function sameParameters(left: Record<string, Cell> | null, right: Record<string, Cell>) {
  if (!left) return false;
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every((key, index) => key === rightKeys[index] && left[key] === right[key]);
}

function toPoints(rows: Record<string, Cell>[]): ChartPoint[] {
  return rows.map((row) => {
    const point: ChartPoint = {
      label: String(row.label ?? ''),
      value: typeof row.value === 'number' ? row.value : null,
    };
    for (const [column, key] of [
      ['x', 'x'],
      ['longitude', 'longitude'],
      ['latitude', 'latitude'],
    ] as const) {
      if (typeof row[key] === 'number') point[column] = row[key];
    }
    if (typeof row.warehouse === 'string') point.warehouse = row.warehouse;
    return point;
  });
}

function sqlDraft(chart: CustomChart, detail: Awaited<ReturnType<typeof getChart>>) {
  const spec = detail.spec;
  if (!spec || spec.source !== 'js' || !spec.definition || !spec.scripts) return undefined;
  try {
    const definition = parseChartDefinition(spec.definition);
    if (definition.source !== 'js') return undefined;
    const extract = parseExtractScript(spec.scripts.extract);
    const draft: ScriptDraft = {
      code: spec.scripts.js,
      etl: {
        code: spec.scripts.extract,
        config: { extract, load: definition.load, mapping: definition.mapping },
      },
      previewWindow: spec.refresh?.previewWindow ?? definition.refresh.previewWindow,
      refreshWindow: spec.refresh?.refreshWindow ?? definition.refresh.refreshWindow,
      intervalMinutes: spec.refresh?.intervalMinutes ?? definition.refresh.intervalMinutes,
    };
    chart.definition = spec.definition;
    chart.script = { draft, status: 'waiting', version: 1 };
    return chart;
  } catch {
    return undefined;
  }
}

export function BoardChart({
  chart,
  title,
  presenting = false,
  onRemove,
  refreshKey = 0,
}: {
  chart: ChartSummary;
  title?: string;
  presenting?: boolean;
  onRemove?: () => void;
  refreshKey?: number;
}) {
  const [result, setResult] = useState<ExecutionResult>();
  const [scriptPoints, setScriptPoints] = useState<ChartPoint[]>();
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'failed'>('idle');
  const [error, setError] = useState('');
  const [nonce, setNonce] = useState(0);
  const active = useRef<AbortController>();
  const isSql = chart.source === 'sql';
  const detail = useQuery({
    queryKey: ['chart', chart.id],
    queryFn: () => getChart(chart.id),
    enabled: !chart.archived,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!isSql || chart.archived || !detail.data) return;
    const controller = new AbortController();
    active.current = controller;
    setStatus('loading');
    setError('');
    setScriptPoints(undefined);
    const defaults = defaultParameters(detail.data.spec);
    const latest =
      refreshKey === 0 &&
      nonce === 0 &&
      detail.data.latest?.status === 'succeeded' &&
      sameParameters(detail.data.latest.parameters, defaults)
        ? detail.data.latest
        : undefined;
    // Reuse the chart's latest successful result unless a refresh was requested.
    const load = async () => {
      if (!latest) return runChartExecution(chart.id, { signal: controller.signal });
      try {
        return await runChartExecution(chart.id, {
          executionId: latest.executionId,
          signal: controller.signal,
        });
      } catch (failure) {
        if (controller.signal.aborted) throw failure;
        // The stored result expired or the pointer went stale; run a fresh query.
        return runChartExecution(chart.id, { signal: controller.signal });
      }
    };
    load()
      .then((value) => {
        if (controller.signal.aborted) return;
        setResult(value);
        setStatus('success');
      })
      .catch((failure: unknown) => {
        if (controller.signal.aborted) return;
        setError(failure instanceof Error ? failure.message : '查询失败。');
        setStatus('failed');
      });
    return () => controller.abort();
  }, [chart.id, chart.archived, detail.data, isSql, nonce, refreshKey]);

  useEffect(() => {
    if (isSql || chart.archived) return;
    const controller = new AbortController();
    active.current = controller;
    const source = detail.data;
    if (!source) return;
    const base: CustomChart = {
      id: chart.id,
      name: chart.name,
      kind: chart.kind,
      dataset: chart.dataset,
      points: [],
    };
    const prepared = sqlDraft(base, source);
    if (!prepared?.script) {
      setError('JS 图表缺少脚本配置。');
      setStatus('failed');
      return;
    }
    const draft = prepared.script.draft;
    setStatus('loading');
    setError('');
    void runChartScript(draft, chart.kind, 'refresh', undefined, controller.signal)
      .then((value) => {
        if (controller.signal.aborted) return;
        setScriptPoints(value.points);
        setStatus('success');
      })
      .catch((failure: unknown) => {
        if (controller.signal.aborted) return;
        setError(failure instanceof Error ? failure.message : '刷新失败。');
        setStatus('failed');
      });
    return () => controller.abort();
  }, [
    chart.id,
    chart.archived,
    chart.kind,
    chart.name,
    chart.dataset,
    detail.data,
    isSql,
    nonce,
    refreshKey,
  ]);

  const points = isSql ? (result ? toPoints(result.rows) : []) : (scriptPoints ?? []);
  const customChart: CustomChart = {
    id: chart.id,
    name: chart.name,
    kind: chart.kind,
    dataset: chart.dataset,
    points,
  };
  const hasData = points.length > 0;
  const canRender = chart.kind !== 'table' && points.length > 0;
  const lastUpdate = isSql
    ? timeOf(result?.executedAt ?? detail.data?.latest?.completedAt)
    : scriptPoints
      ? '刚刚'
      : '—';

  function refresh() {
    active.current?.abort();
    // Keep the previous successful result until a new one succeeds.
    setNonce((value) => value + 1);
  }

  return (
    <section className="dc-page-card flex min-w-0 flex-col">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3>
          {title ?? chart.name}
          {chart.archived && <span className="dc-tag ml-2 bg-canvas text-muted">已归档</span>}
        </h3>
        {onRemove && (
          <button className="dc-btn" onClick={onRemove}>
            移除
          </button>
        )}
      </div>

      {chart.archived && (
        <p className="my-3 text-sm text-muted">
          图表已归档，不再刷新。请从图表管理恢复或更换卡片。
        </p>
      )}

      {!chart.archived && status === 'loading' && !hasData && (
        <p className="my-6 text-sm text-muted" role="status">
          正在读取数据…
        </p>
      )}

      {!chart.archived && status === 'loading' && hasData && (
        <p className="text-sm text-muted" role="status">
          刷新中…
        </p>
      )}

      {!chart.archived && status === 'failed' && (
        <div className="my-4 grid gap-2">
          <p role="alert" className="text-sm text-down">
            {error}
            {hasData && ' 已保留上一次成功结果。'}
          </p>
          <button type="button" className="dc-btn justify-self-start" onClick={refresh}>
            重试
          </button>
        </div>
      )}

      {!chart.archived && status === 'success' && !hasData && (
        <p className="my-6 text-sm text-muted">暂无数据。</p>
      )}

      {!chart.archived && canRender && (
        <Suspense
          fallback={
            <div className="my-2 h-56 sm:h-60" role="status">
              图表加载中…
            </div>
          }
        >
          <SalesChart
            kind={chart.kind as Exclude<CustomChart['kind'], 'table'>}
            title={chart.name}
            customChart={customChart}
          />
        </Suspense>
      )}

      {!chart.archived && !isSql && hasData && chart.kind === 'table' && (
        <DataTable
          headers={['标签', '数值']}
          rows={points.map(({ label, value }) => [label, value ?? '—'])}
        />
      )}

      {!chart.archived && isSql && hasData && chart.kind === 'table' && (
        <DataTable
          headers={result?.columns ?? []}
          rows={(result?.rows ?? []).map((row) =>
            (result?.columns ?? []).map((column) => {
              const value = row[column];
              return value === null
                ? '—'
                : typeof value === 'number'
                  ? format(value)
                  : String(value);
            }),
          )}
        />
      )}

      <footer className="mt-auto grid gap-1.5 pt-4 text-xs text-muted">
        <p>
          来源 · {chart.dataset} · {isSql ? '保存查询' : '浏览器脚本'}
        </p>
        <p>
          数据时点 · {lastUpdate}
          {isSql && result?.truncated && ' · 结果已截断'}
        </p>
        {isSql && status === 'success' && result && (
          <p>
            结果共 {format(result.rowCount)} 行 · 有效至 {timeOf(result.expiresAt)}
          </p>
        )}
        {!presenting && !chart.archived && (
          <div className="mt-1 flex flex-wrap gap-2">
            <button
              type="button"
              className="dc-btn"
              disabled={status === 'loading'}
              onClick={refresh}
            >
              <RefreshCw size={14} aria-hidden="true" /> 刷新
            </button>
            {isSql && result && (
              <a className="dc-btn" href={executionDownloadUrl(result.executionId)} download>
                <Download size={14} aria-hidden="true" /> CSV
              </a>
            )}
            {detail.data?.knowledge?.[0] && (
              <Link
                className="dc-btn-text self-center"
                to={`/knowledge/${detail.data.knowledge[0].topic}/${detail.data.knowledge[0].version}`}
              >
                查看口径 · v{detail.data.knowledge[0].version} →
              </Link>
            )}
          </div>
        )}
      </footer>
    </section>
  );
}
