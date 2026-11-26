import { Link } from 'react-router-dom';
import { DataTable, Dialog } from '../components/PageParts';
import { chartLibrary, liveSamples, processingSamples, warehouseSamples } from '../data/demo';
import { type CustomChart } from '../data/customCharts';
import { lazy, Suspense, useState } from 'react';

const SalesChart = lazy(() => import('../components/SalesChart'));

const format = new Intl.NumberFormat('zh-CN').format;
const lossRate = (row: (typeof processingSamples)[number]) =>
  ((row.waste / row.input) * 100).toFixed(1);

export function BoardChart({
  id,
  customChart,
  boardId,
  warehouse,
  onRemove,
  onRefreshScript,
  presenting = false,
}: {
  id: string;
  customChart?: CustomChart;
  boardId?: string;
  warehouse?: string;
  onRemove?: () => void;
  onRefreshScript?: (chart: CustomChart) => void;
  presenting?: boolean;
}) {
  const [batch, setBatch] = useState<(typeof processingSamples)[number]>();
  const chart = customChart ?? chartLibrary.find((item) => item.id === id);
  if (!chart) return null;
  const chartKind =
    customChart?.kind ?? (chart.kind === 'line' || chart.kind === 'bar' ? chart.kind : undefined);

  const script = customChart?.script;
  const showChart = !script || script.lastSuccess !== undefined;
  const visibleChart =
    script && warehouse && customChart?.points.some((point) => point.warehouse !== undefined)
      ? {
          ...customChart,
          points: customChart.points.filter((point) => point.warehouse === warehouse),
        }
      : customChart;
  const hasData = !visibleChart || visibleChart.points.length > 0;
  const time = (timestamp: number) =>
    new Intl.DateTimeFormat('zh-CN', {
      dateStyle: 'short',
      timeStyle: 'medium',
      timeZone: 'Asia/Shanghai',
    }).format(timestamp);

  const knowledge =
    'topic' in chart
      ? `/knowledge/${chart.topic}/${chart.knowledgeVersion}?${new URLSearchParams({ view: 'metrics', ...(boardId ? { board: boardId } : {}) })}`
      : undefined;

  return (
    <section className="dc-page-card flex flex-col">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3>{chart.name}</h3>
        {onRemove && (
          <button className="dc-btn" onClick={onRemove}>
            移除
          </button>
        )}
      </div>
      {showChart && hasData && chartKind && chartKind !== 'table' && (
        <Suspense
          fallback={
            <div className="my-2 h-56 sm:h-60" role="status">
              图表加载中…
            </div>
          }
        >
          <SalesChart kind={chartKind} title={chart.name} customChart={visibleChart} />
        </Suspense>
      )}
      {showChart && hasData && visibleChart?.kind === 'table' && (
        <DataTable
          headers={['标签', '数值']}
          rows={visibleChart.points.map(({ label, value }) => [label, value ?? '—'])}
        />
      )}
      {script && showChart && !hasData && <p className="my-4 text-muted">暂无数据</p>}
      {script && !showChart && script.status !== 'failed' && (
        <p className="my-4 text-muted">等待首次刷新</p>
      )}
      {chart.kind === 'inventory' && (
        <>
          <p className="text-muted">库存快照 · 11 月 25 日 10:20 · 临期指未来 3 天到期</p>
          <DataTable
            headers={['仓库', '可用库存（件）', '临期可用库存（件）', '缺货 SKU']}
            rows={warehouseSamples
              .filter((row) => !warehouse || row.warehouse === warehouse)
              .map((row) => [row.warehouse, format(row.available), row.nearExpiry, row.shortages])}
          />
        </>
      )}
      {chart.kind === 'processing' && (
        <>
          <p className="text-muted">11 月 25 日已完工批次 · 重量单位为 kg · 复核线为 6%（示例）</p>
          <DataTable
            headers={['批次', '仓库', '投料', '合格产出', '报损', '损耗率', 'WMS 已入库', '核对']}
            rows={processingSamples
              .filter((row) => !warehouse || row.warehouse === warehouse)
              .map((row) => [
                row.batch,
                row.warehouse,
                format(row.input),
                row.output,
                row.waste,
                <strong className={row.waste / row.input > 0.06 ? 'text-down' : undefined}>
                  {lossRate(row)}%
                </strong>,
                row.received,
                presenting ? (
                  row.received === row.output ? (
                    '一致'
                  ) : (
                    '待核对'
                  )
                ) : (
                  <button className="dc-btn whitespace-nowrap" onClick={() => setBatch(row)}>
                    查看批次
                  </button>
                ),
              ])}
          />
        </>
      )}
      {chart.kind === 'live' && (
        <>
          <p className="text-muted">只统计可匹配直播场次的支付订单 · 退款截至 11 月 26 日 09:00</p>
          <DataTable
            headers={['直播场次', '支付成交额（元）', '已退款（元）', '退款后成交额（元）']}
            rows={liveSamples.map((row) => [
              row.session,
              format(row.paid),
              format(row.refund),
              format(row.paid - row.refund),
            ])}
          />
        </>
      )}
      <footer className="mt-auto pt-4">
        <p className="text-xs text-muted">来源 · {chart.dataset}</p>
        {script && (
          <div className="mt-2 grid gap-2 text-xs text-muted">
            <p role="status">
              版本 {script.version} ·{' '}
              {
                {
                  waiting: '等待刷新',
                  running: '刷新中…',
                  success: '刷新成功',
                  failed: '刷新失败',
                }[script.status]
              }
            </p>
            <p>
              最近成功 · {script.lastSuccess === undefined ? '—' : time(script.lastSuccess)} ·
              覆盖截止 · {script.coverage ?? '未知'}
            </p>
            {script.nextRefresh !== undefined && <p>下次计划刷新 · {time(script.nextRefresh)}</p>}
            {script.error && (
              <p role="alert" className="text-down">
                {script.error}
              </p>
            )}
            {!presenting && customChart && onRefreshScript && (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="dc-btn"
                  disabled={script.status === 'running'}
                  onClick={() => onRefreshScript(customChart)}
                >
                  手动刷新
                </button>
              </div>
            )}
          </div>
        )}
        {!presenting && knowledge && 'knowledgeVersion' in chart && (
          <Link className="dc-btn-text mt-2" to={knowledge}>
            查看口径 · {chart.knowledgeVersion} →
          </Link>
        )}
      </footer>
      {batch && knowledge && (
        <Dialog title={`${batch.batch} · ${batch.warehouse}`} onClose={() => setBatch(undefined)}>
          <DataTable
            headers={['来源', '批次记录']}
            rows={[
              [
                'ERP 加工完工单',
                `投料 ${batch.input} kg，合格产出 ${batch.output} kg，报损 ${batch.waste} kg`,
              ],
              ['WMS 入库汇总', `已确认入库 ${batch.received} kg`],
            ]}
          />
          <p className="mt-4">
            加工损耗率 <strong>{lossRate(batch)}%</strong> · 复核线 6%
          </p>
          <p className="mt-2">
            合格产出与入库记录相差 <strong>{batch.output - batch.received} kg</strong>
          </p>
          <p className="my-3 text-muted">
            {batch.output !== batch.received
              ? '待核对入库单状态、同步时间和称重记录。入库差额需单独跟踪。'
              : '当前样例中合格产出与已入库重量一致。'}
          </p>
          <Link to={knowledge} className="dc-btn">
            查看损耗口径 →
          </Link>
        </Dialog>
      )}
    </section>
  );
}
