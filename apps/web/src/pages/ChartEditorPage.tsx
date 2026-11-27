import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Tabs } from 'radix-ui';
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { DataTable, PageHeading } from '../components/PageParts';
import { previewSql } from '../data/chartCode';
import {
  initialChartFiles,
  parseChartDefinition,
  parseExtractScript,
  validateTransform,
} from '../data/chartDefinition';
import { runChartScript, type ScriptDraft } from '../data/chartScript';
import { chartInput, validateChartPoints, type CustomChart } from '../data/customCharts';
import { apiMessage } from '../services/api';
import { listChartDataSources, type ChartDataSource } from '../services/chartData';
import {
  createChart,
  getChart,
  updateChart,
  type ChartInput,
  type ChartRecord,
  type ChartSpec,
} from '../services/platform';

const CodeEditor = lazy(() => import('../components/CodeEditor'));
const fileTabClass =
  'border-b-2 border-transparent px-3 py-2 font-mono text-sm text-muted ' +
  'hover:text-ink data-[state=active]:border-primary data-[state=active]:font-semibold data-[state=active]:text-primary';

function toEditorChart(record: ChartRecord): CustomChart {
  const base: CustomChart = {
    id: record.id,
    name: record.name,
    kind: record.kind,
    dataset: record.dataset,
    points: [],
  };
  const spec = record.spec;
  if (!spec) return base;
  if (spec.source === 'sql' && spec.sql) {
    base.definition = JSON.stringify(
      {
        schemaVersion: 1,
        name: record.name,
        kind: record.kind,
        source: 'sql',
        dataset: record.dataset,
        dataSource: spec.datasetId,
      },
      null,
      2,
    );
    base.codeSource = { source: 'sql', code: spec.sql };
    return base;
  }
  if (spec.source === 'js' && spec.definition && spec.scripts?.extract && spec.scripts.js) {
    try {
      const definition = parseChartDefinition(spec.definition);
      if (definition.source === 'js') {
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
        base.definition = spec.definition;
        base.script = { draft, status: 'waiting', version: 1 };
      }
    } catch {
      base.definition = spec.definition;
    }
  }
  return base;
}

function toChartInput(chart: CustomChart): ChartInput {
  if (!chart.definition) throw new Error('缺少图表定义。');
  const definition = parseChartDefinition(chart.definition);
  if (definition.source === 'sql') {
    const sql = chart.codeSource?.code ?? '';
    if (!sql.trim()) throw new Error('请填写查询语句。');
    const window = /:\s*startDay/.test(sql) && /:\s*endDay/.test(sql) ? { days: 30 } : undefined;
    const spec: ChartSpec = {
      source: 'sql',
      datasetId: definition.dataSource,
      sql,
      ...(window ? { window } : {}),
    };
    return {
      name: definition.name,
      display: { kind: definition.kind, dataset: definition.dataset },
      spec,
      bindings: [{ alias: 'result', datasetId: definition.dataSource }],
    };
  }
  const draft = chart.script?.draft;
  if (!draft?.etl) throw new Error('JS 图表须使用当前的 extract / transform 脚本配置。');
  const datasetId = draft.etl.config.extract.bindings[0]?.dataset;
  if (!datasetId) throw new Error('JS 图表至少需要一个数据绑定。');
  const spec: ChartSpec = {
    source: 'js',
    datasetId,
    definition: chart.definition,
    scripts: { extract: draft.etl.code, js: draft.code },
    refresh: {
      previewWindow: draft.previewWindow,
      refreshWindow: draft.refreshWindow,
      intervalMinutes: draft.intervalMinutes,
    },
  };
  const bindings = draft.etl.config.extract.bindings.map(({ alias, dataset }) => ({
    alias,
    datasetId: dataset,
  }));
  return {
    name: definition.name,
    display: { kind: definition.kind, dataset: definition.dataset },
    spec,
    bindings,
  };
}

export default function ChartEditorPage() {
  const { chartId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState('');
  const title = chartId ? '编辑图表' : '新建图表';
  const detail = useQuery({
    queryKey: ['chart', chartId],
    queryFn: () => getChart(chartId!),
    enabled: Boolean(chartId),
  });

  const save = useMutation({
    mutationFn: (input: ChartInput) =>
      chartId
        ? updateChart(chartId, {
            name: input.name,
            display: input.display,
            spec: input.spec,
            bindings: input.bindings,
          })
        : createChart(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['charts'] });
      void queryClient.invalidateQueries({ queryKey: ['chart'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboards'] });
      navigate('/charts', {
        replace: true,
        state: { message: chartId ? '图表已保存' : '图表已创建' },
      });
    },
    onError: (failure) => setError(apiMessage(failure)),
  });

  const editingChart = detail.data ? toEditorChart(detail.data) : undefined;

  return (
    <div className="dc-chart-editor grid gap-4">
      <PageHeading title={title}>
        <Link to="/charts" className="dc-btn">
          返回图表管理
        </Link>
      </PageHeading>
      <section className="dc-page-card p-4 sm:p-5" aria-label={title}>
        {chartId && detail.isLoading ? (
          <p className="text-muted">正在加载图表…</p>
        ) : chartId && detail.isError ? (
          <p className="text-muted">{apiMessage(detail.error)}</p>
        ) : (
          <>
            {error && (
              <p role="alert" className="mb-3 text-sm text-down">
                {error}
              </p>
            )}
            <ChartEditor
              key={chartId ?? 'new'}
              editingChart={editingChart}
              busy={save.isPending}
              onSave={(updated) => {
                setError('');
                try {
                  save.mutate(toChartInput(updated));
                } catch (failure) {
                  setError(failure instanceof Error ? failure.message : '保存失败。');
                }
              }}
            />
          </>
        )}
      </section>
    </div>
  );
}

function ChartEditor({
  editingChart,
  onSave,
  busy: saving,
}: {
  editingChart?: CustomChart;
  onSave: (chart: CustomChart) => void;
  busy?: boolean;
}) {
  const [files, setFiles] = useState(() => initialChartFiles(editingChart));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sources, setSources] = useState<ChartDataSource[]>([]);
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<{
    chart: CustomChart;
    rows: Record<string, unknown>[];
  }>();
  const request = useRef<AbortController>();
  const submitted = useRef(false);

  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    const controller = new AbortController();
    listChartDataSources(controller.signal)
      .then(setSources)
      .catch(() => {});
    return () => controller.abort();
  }, []);

  const invalidate = useCallback(() => {
    request.current?.abort();
    request.current = undefined;
    setBusy(false);
    setError('');
    setPreview(undefined);
    setInputs({});
  }, []);

  const updateDefinition = useCallback(
    (definition: string) => {
      invalidate();
      let source: unknown;
      try {
        source = JSON.parse(definition)?.source;
      } catch {
        // Keep the script editor visible while the JSON is incomplete.
      }
      setFiles((current) => ({
        ...current,
        definition,
        source: source === 'js' || source === 'sql' ? source : current.source,
      }));
    },
    [invalidate],
  );

  const updateScript = useCallback(
    (file: 'extract' | 'js' | 'sql', code: string) => {
      invalidate();
      setFiles((current) => ({
        ...current,
        scripts: { ...current.scripts, [file]: code },
      }));
    },
    [invalidate],
  );

  const updateExtract = useCallback(
    (code: string) => updateScript('extract', code),
    [updateScript],
  );
  const updateTransform = useCallback((code: string) => updateScript('js', code), [updateScript]);
  const updateSql = useCallback((code: string) => updateScript('sql', code), [updateScript]);

  async function runPreview() {
    invalidate();
    const active = new AbortController();
    request.current = active;
    setBusy(true);
    try {
      const definition = parseChartDefinition(files.definition);
      const { name, kind, dataset } = definition;
      const chart: CustomChart = {
        id: editingChart?.id ?? `chart-${crypto.randomUUID()}`,
        name,
        kind,
        dataset,
        definition: files.definition,
        points: [],
      };

      let rows: Record<string, unknown>[];
      if (definition.source === 'js') {
        const { refresh, load, mapping } = definition;
        const extract = parseExtractScript(files.scripts.extract);
        validateTransform(files.scripts.js);
        const draft = {
          ...refresh,
          code: files.scripts.js,
          etl: {
            code: files.scripts.extract,
            config: { extract, load, mapping },
          },
        };
        const result = await runChartScript(
          draft,
          kind,
          'preview',
          (alias, status) => {
            if (request.current === active && !active.signal.aborted) {
              setInputs((current) => ({ ...current, [alias]: status }));
            }
          },
          active.signal,
        );
        rows = result.rows;
        chart.script = {
          draft,
          status: 'waiting',
          version: (editingChart?.script?.version ?? 0) + 1,
        };
      } else {
        const code = files.scripts.sql;
        const points = await previewSql(definition.dataSource, code, active.signal);
        const validationError = validateChartPoints(kind, points);
        if (validationError) throw new Error(validationError);
        chart.points = points;
        chart.codeSource = { source: 'sql', code };
        rows = points.map((point) => ({ ...point }));
      }
      if (request.current === active && !active.signal.aborted) setPreview({ chart, rows });
    } catch (error) {
      if (request.current === active && !active.signal.aborted)
        setError(error instanceof Error ? error.message : '预览失败。');
    } finally {
      if (request.current === active && !active.signal.aborted) setBusy(false);
    }
  }

  const previewRows = preview?.rows.slice(0, 20) ?? [];
  const previewFields = [...new Set(previewRows.flatMap(Object.keys))];
  const columns = Object.values(chartInput)
    .map(({ columns }) => columns.join('、'))
    .join(' 或 ');

  return (
    <form
      className="grid min-w-0 gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (busy || !preview || submitted.current) return;
        submitted.current = true;
        onSave(preview.chart);
      }}
    >
      {files.migration && (
        <p className="text-sm text-muted" role="status">
          {files.migration}
        </p>
      )}
      <Tabs.Root defaultValue="definition" className="grid min-w-0 gap-4">
        <Tabs.List
          aria-label="图表文件"
          className="flex flex-wrap gap-1 border-b border-hairline-soft"
        >
          <Tabs.Trigger value="definition" className={fileTabClass}>
            definition.json
          </Tabs.Trigger>
          {files.source === 'js' ? (
            <>
              <Tabs.Trigger value="extract" className={fileTabClass}>
                extract.js
              </Tabs.Trigger>
              <Tabs.Trigger value="transform" className={fileTabClass}>
                transform.js
              </Tabs.Trigger>
            </>
          ) : (
            <Tabs.Trigger value="sql" className={fileTabClass}>
              query.sql
            </Tabs.Trigger>
          )}
        </Tabs.List>
        <Tabs.Content
          value="definition"
          className="grid min-w-0 gap-2 data-[state=inactive]:hidden"
        >
          <p className="text-sm text-muted">
            <code>source</code> 选择 <code>js</code> 或 <code>sql</code>。使用 JS 时，在{' '}
            <code>load</code> 中声明输出字段和行键，用 <code>mapping</code> 映射图表字段。 使用 SQL
            时，在 <code>dataSource</code> 中填写数据源标识。
          </p>
          <Suspense fallback={<p role="status">正在加载编辑器…</p>}>
            <CodeEditor
              language="json"
              label="definition.json"
              initialCode={files.definition}
              onChange={updateDefinition}
            />
          </Suspense>
        </Tabs.Content>
        {files.source === 'js' ? (
          <>
            <Tabs.Content
              value="extract"
              className="grid min-w-0 gap-2 data-[state=inactive]:hidden"
            >
              <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between lg:gap-4">
                <p className="text-sm text-muted">
                  在 <code>extractConfig</code> 中声明数据绑定和输出。由{' '}
                  <code>extract({'{ read, params }'})</code> 异步读取并返回数据。
                </p>
                <details className="shrink-0 text-sm text-muted lg:max-w-[45%]">
                  <summary className="cursor-pointer">已登记数据源</summary>
                  <ul className="mt-2 grid gap-1">
                    {sources.map(({ id, name, fields }) => (
                      <li key={id}>
                        <code>{id}</code> · {name} · {fields.join('、')}
                      </li>
                    ))}
                    <li>
                      <Link to="/data-sources" className="dc-btn-text">
                        查看数据接入
                      </Link>
                    </li>
                  </ul>
                </details>
              </div>
              <Suspense fallback={<p role="status">正在加载编辑器…</p>}>
                <CodeEditor
                  language="javascript-sql"
                  label="extract.js"
                  initialCode={files.scripts.extract}
                  onChange={updateExtract}
                />
              </Suspense>
            </Tabs.Content>
            <Tabs.Content
              value="transform"
              className="grid min-w-0 gap-2 data-[state=inactive]:hidden"
            >
              <p className="text-sm text-muted">
                <code>transform({'{ inputs, params }'})</code> 接收提取结果并同步返回符合{' '}
                <code>definition.json</code> 中 <code>load</code> 配置的行。
              </p>
              <Suspense fallback={<p role="status">正在加载编辑器…</p>}>
                <CodeEditor
                  language="javascript"
                  label="transform.js"
                  initialCode={files.scripts.js}
                  onChange={updateTransform}
                />
              </Suspense>
            </Tabs.Content>
          </>
        ) : (
          <Tabs.Content value="sql" className="grid min-w-0 gap-2 data-[state=inactive]:hidden">
            <p className="text-sm text-muted">
              执行一条只读查询，返回 <code>label</code> 和 <code>value</code>。日期筛选使用{' '}
              <code>:startDay</code> 和 <code>:endDay</code> 命名参数；保存后服务端按 30
              天窗口执行。 散点图或地图还需要 {columns}。{' '}
              <Link to="/data-sources" className="dc-btn-text">
                查看数据源 ID
              </Link>
            </p>
            <Suspense fallback={<p role="status">正在加载编辑器…</p>}>
              <CodeEditor
                language="sql"
                label="query.sql"
                initialCode={files.scripts.sql}
                onChange={updateSql}
              />
            </Suspense>
          </Tabs.Content>
        )}
      </Tabs.Root>
      <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 border-t border-hairline-soft bg-canvas py-3">
        <button
          type="button"
          className="dc-btn max-[400px]:px-2"
          disabled={busy}
          onClick={runPreview}
        >
          {busy ? '预览中…' : '运行预览'}
        </button>
        <div className="ml-auto flex gap-2">
          <Link className="dc-btn max-[400px]:px-2" to="/charts">
            取消
          </Link>
          <button
            type="submit"
            className="dc-btn dc-btn-primary max-[400px]:px-2"
            disabled={busy || saving || !preview}
          >
            {saving ? '保存中…' : editingChart ? '保存修改' : '创建图表'}
          </button>
        </div>
      </div>
      {(error || preview || Object.keys(inputs).length > 0) && (
        <section className="grid min-w-0 gap-2" aria-label="运行结果">
          {Object.entries(inputs).length > 0 && (
            <ul className="text-sm text-muted" aria-live="polite">
              {Object.entries(inputs).map(([alias, status]) => (
                <li key={alias}>
                  {alias} · {status}
                </li>
              ))}
            </ul>
          )}
          {error && (
            <p className="text-down" role="alert">
              {error}
            </p>
          )}
          {preview && (
            <>
              <p role="status" className="text-sm">
                输出共 {preview.rows.length} 行{preview.rows.length > 20 && ' · 显示前 20 行'}
              </p>
              {previewRows.length > 0 && (
                <DataTable
                  headers={previewFields}
                  rows={previewRows.map((row) =>
                    previewFields.map((field) => {
                      const value = Object.hasOwn(row, field) ? row[field] : null;
                      if (value === null) return '—';
                      return typeof value === 'object' ? JSON.stringify(value) : String(value);
                    }),
                  )}
                />
              )}
            </>
          )}
        </section>
      )}
    </form>
  );
}
