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
import { runChartScript, scriptDatasets } from '../data/chartScript';
import { chartInput, validateChartPoints, type CustomChart } from '../data/customCharts';

const CodeEditor = lazy(() => import('../components/CodeEditor'));
const fileTabClass =
  'border-b-2 border-transparent px-3 py-2 font-mono text-sm text-muted ' +
  'hover:text-ink data-[state=active]:border-primary data-[state=active]:font-semibold data-[state=active]:text-primary';

export default function ChartEditorPage({
  charts,
  onSave,
}: {
  charts: CustomChart[];
  onSave: (chart: CustomChart) => void;
}) {
  const { chartId } = useParams();
  const navigate = useNavigate();
  const chart = charts.find(({ id }) => id === chartId);
  const title = chartId ? '编辑图表' : '新建图表';

  return (
    <div className="dc-chart-editor grid gap-4">
      <PageHeading title={title}>
        <Link to="/charts" className="dc-btn">
          返回图表管理
        </Link>
      </PageHeading>
      <section className="dc-page-card p-4 sm:p-5" aria-label={title}>
        {chartId && !chart ? (
          <p className="text-muted">找不到该图表，可能已被删除。</p>
        ) : (
          <ChartEditor
            key={chartId ?? 'new'}
            editingChart={chart}
            onSave={(updated) => {
              onSave(updated);
              navigate('/charts', {
                replace: true,
                state: { message: chart ? '图表已保存' : '图表已创建' },
              });
            }}
          />
        )}
      </section>
    </div>
  );
}

function ChartEditor({
  editingChart,
  onSave,
}: {
  editingChart?: CustomChart;
  onSave: (chart: CustomChart) => void;
}) {
  const [files, setFiles] = useState(() => initialChartFiles(editingChart));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<{
    chart: CustomChart;
    rows: Record<string, unknown>[];
  }>();
  const request = useRef<AbortController>();
  const submitted = useRef(false);

  useEffect(() => () => request.current?.abort(), []);

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
        const points = await previewSql(code);
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
            <code>load</code> 中声明输出字段和行键，用 <code>mapping</code> 映射图表字段。
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
                  <summary className="cursor-pointer">可用演示数据集</summary>
                  <ul className="mt-2 grid gap-1">
                    {Object.entries(scriptDatasets).map(([id, dataset]) => (
                      <li key={id}>
                        <code>{id}</code> · {dataset.name} · {dataset.fields.join('、')}
                      </li>
                    ))}
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
              查询演示表 <code>daily_orders</code>（<code>day</code>、<code>order_count</code>），
              返回 <code>label</code> 和 <code>value</code>。散点图或地图还需要 {columns}。
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
            disabled={busy || !preview}
          >
            {editingChart ? '保存修改' : '创建图表'}
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
