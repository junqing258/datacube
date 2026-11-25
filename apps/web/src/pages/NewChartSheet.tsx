import { lazy, Suspense, useCallback, useState, type FormEvent } from 'react';
import { DataTable } from '../components/PageParts';
import { Sheet } from '../components/Sheet';
import { chartCodeExamples, previewApi, previewSql } from '../data/chartCode';
import {
  chartInput,
  chartKinds,
  validateChartPoints,
  type CustomChart,
} from '../data/customCharts';

const CodeEditor = lazy(() => import('../components/CodeEditor'));

type CodeSource = keyof typeof chartCodeExamples;
type Source = 'manual' | CodeSource;

export function NewChartSheet({
  boardName,
  onClose,
  onCreate,
}: {
  boardName: string;
  onClose: () => void;
  onCreate: (chart: CustomChart) => void;
}) {
  const [kind, setKind] = useState<CustomChart['kind']>('line');
  const input = kind === 'scatter' || kind === 'map' ? chartInput[kind] : undefined;
  const [error, setError] = useState('');
  const [source, setSource] = useState<Source>('manual');
  const [codes, setCodes] = useState({
    sql: chartCodeExamples.sql.code,
    api: chartCodeExamples.api.code,
  });
  const [preview, setPreview] = useState<{
    source: CodeSource;
    code: string;
    points: CustomChart['points'];
  }>();
  const [loading, setLoading] = useState(false);
  const example = source === 'manual' ? undefined : chartCodeExamples[source];
  const currentPreview =
    source !== 'manual' && preview?.source === source && preview.code === codes[source]
      ? preview
      : undefined;

  const updateCode = useCallback(
    (code: string) => {
      if (source !== 'manual') setCodes((current) => ({ ...current, [source]: code }));
      setPreview(undefined);
      setError('');
    },
    [source],
  );

  async function runPreview() {
    if (source === 'manual' || loading) return;

    const code = codes[source];
    setError('');
    setPreview(undefined);
    setLoading(true);
    try {
      const points = source === 'sql' ? await previewSql(code) : previewApi(code);
      setPreview({ source, code, points });
    } catch (error) {
      setError(
        error instanceof SyntaxError
          ? 'API 请求配置必须是有效的 JSON。'
          : error instanceof Error
            ? error.message
            : '预览失败。',
      );
    } finally {
      setLoading(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const name = String(fields.get('name')).trim();
    if (!name) {
      setError('请输入图表名称。');
      return;
    }

    let points: CustomChart['points'];
    if (example) {
      if (!currentPreview) {
        setError('请先预览当前代码。');
        return;
      }
      points = currentPreview.points;
    } else {
      points = [];
      const columns = input?.columns ?? [];
      const rows = String(fields.get('points')).split(/\r?\n/);
      for (const [index, row] of rows.entries()) {
        if (!row.trim()) continue;
        const [label, ...cells] = row.split(/[,，]/).map((cell) => cell.trim());
        const numbers = cells.map(Number);
        if (
          !label ||
          cells.length !== columns.length + 1 ||
          cells.some((cell) => !cell) ||
          numbers.some((number) => !Number.isFinite(number))
        ) {
          setError(`第 ${index + 1} 行格式有误，请输入${input?.labels ?? '标签、数值'}。`);
          return;
        }
        const point: CustomChart['points'][number] = { label, value: numbers[columns.length] };
        columns.forEach((column, index) => {
          point[column] = numbers[index];
        });
        points.push(point);
      }
    }

    const validationError = validateChartPoints(kind, points);
    if (validationError) {
      setError(validationError);
      return;
    }

    onCreate({
      id: `chart-${crypto.randomUUID()}`,
      name,
      kind,
      dataset: example?.dataset ?? (String(fields.get('dataset')).trim() || '手动录入'),
      points,
    });
  }

  return (
    <Sheet title="新建图表" onClose={onClose}>
      <p className="mt-1 text-sm text-muted">{`添加到「${boardName}」`}</p>
      <form onSubmit={submit}>
        <section className="grid gap-4 sm:grid-cols-2" aria-label="图表设置">
          <label className="dc-field">
            图表名称
            <input className="dc-control" name="name" required maxLength={80} />
          </label>
          <label className="dc-field">
            图表类型
            <select
              className="dc-control"
              name="kind"
              value={kind}
              onChange={(event) => {
                setKind(event.target.value as CustomChart['kind']);
                setError('');
              }}
            >
              {Object.entries(chartKinds).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="dc-field sm:col-span-2">
            数据来源
            <select
              className="dc-control"
              name="source"
              value={source}
              disabled={loading}
              onChange={(event) => {
                setSource(event.target.value as Source);
                setError('');
              }}
            >
              <option value="manual">手动录入</option>
              <option value="sql">SQL 查询（演示）</option>
              <option value="api">API 请求（演示）</option>
            </select>
          </label>
        </section>
        <section className="min-w-0 border-t border-hairline-soft pt-4" aria-label="图表数据">
          <div className="space-y-4" hidden={!!example}>
            <label className="dc-field">
              数据来源名称（选填）
              <input className="dc-control" name="dataset" maxLength={120} />
            </label>
            <label className="dc-field">
              图表数据
              <textarea
                className="dc-control"
                name="points"
                rows={5}
                required={!example}
                aria-describedby="chart-data-help"
              />
              <span id="chart-data-help" className="text-muted">
                {input
                  ? `每行按「${input.labels}」输入，用逗号分隔，例如「${input.example}」。`
                  : kind === 'gauge'
                    ? '输入一行「标签, 百分比」，范围为 0 到 100，例如「达成率, 85」。'
                    : '每行输入「标签, 数值」，例如「周一, 120」。'}
                {kind === 'radar' && '至少需要三个非负指标。'}
                {(kind === 'pie' || kind === 'funnel') && '数值须为非负数，且至少一项大于 0。'}
              </span>
            </label>
          </div>
          {source !== 'manual' && (
            <div className="grid min-w-0 gap-2">
              <h2 className="text-sm font-medium">
                {source === 'sql' ? 'SQL 查询' : 'API 请求配置（JSON）'}
              </h2>
              <Suspense fallback={<p role="status">正在加载编辑器…</p>}>
                <CodeEditor
                  key={source}
                  language={source === 'sql' ? 'sql' : 'json'}
                  initialCode={codes[source]}
                  onChange={updateCode}
                />
              </Suspense>
              <p id="chart-code-help" className="text-sm text-muted">
                {source === 'sql'
                  ? `查询内置 SQLite 表 daily_orders（day、order_count），返回 label 和 value 两列。${input ? `此图表还需要 ${input.columns.join('、')}。` : ''}`
                  : '使用模拟库存接口。warehouse 留空时返回全部仓库，也可填写「华东仓」进行筛选。'}
                {source === 'api' && kind === 'scatter' && 'X 为缺货 SKU 数，Y 为演示库存量。'}
                {kind === 'gauge' && '仪表盘需要一行 0 到 100 的百分比。'}
              </p>
              <button
                type="button"
                className="dc-btn justify-self-start"
                disabled={loading}
                onClick={runPreview}
              >
                {loading ? '预览中…' : '运行预览'}
              </button>
              {currentPreview && (
                <DataTable
                  headers={['标签（label）', ...(input?.columns ?? []), '数值（value）']}
                  rows={currentPreview.points.map((point) => [
                    point.label,
                    ...(input?.columns.map((column) => point[column] ?? '—') ?? []),
                    point.value,
                  ])}
                />
              )}
            </div>
          )}
        </section>
        {error && (
          <p className="text-down" role="alert">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2 border-t border-hairline-soft pt-4">
          <button className="dc-btn" type="button" onClick={onClose}>
            取消
          </button>
          <button
            type="submit"
            className="dc-btn dc-btn-primary"
            disabled={!!example && (loading || !currentPreview?.points.length)}
          >
            创建并添加
          </button>
        </div>
      </form>
    </Sheet>
  );
}
