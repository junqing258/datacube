import { Link } from 'react-router-dom';
import { DataTable, Dialog } from '../components/PageParts';
import { chartLibrary, liveSamples, processingSamples, warehouseSamples } from '../data/demo';
import { useState } from 'react';

const format = new Intl.NumberFormat('zh-CN').format;
const salesTrend =
  'M45 150 L95 128 L145 140 L195 96 L245 103 L295 88 L345 128 L395 121 L445 145 L495 128 L545 150 L580 135';
const lossRate = (row: (typeof processingSamples)[number]) =>
  ((row.waste / row.input) * 100).toFixed(1);

export function BoardChart({
  id,
  boardId,
  warehouse,
  onRemove,
}: {
  id: string;
  boardId: string;
  warehouse: string;
  onRemove?: () => void;
}) {
  const [batch, setBatch] = useState<(typeof processingSamples)[number]>();
  const chart = chartLibrary.find((item) => item.id === id);
  if (!chart) return null;

  const knowledge = `/knowledge/${chart.topic}/${chart.knowledgeVersion}?${new URLSearchParams({ board: boardId })}`;

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
      {chart.kind === 'line' && (
        <>
          <p className="text-xs text-muted">● 本月　 ┄ 上月同期</p>
          <svg
            className="my-4 w-full text-[12px]"
            viewBox="0 0 600 225"
            role="img"
            aria-label="销售额趋势"
          >
            {[8, 6, 4, 2].map((value, index) => {
              const y = 40 + index * 45;
              return (
                <g key={value}>
                  <line x1="45" x2="580" y1={y} y2={y} className="stroke-hairline" />
                  <text x="0" y={y + 4}>
                    {value}万
                  </text>
                </g>
              );
            })}
            <path
              d="M45 145 L95 120 L145 135 L195 75 L245 95 L295 60 L345 85 L395 56 L445 90 L495 65 L545 83 L580 55"
              fill="none"
              className="stroke-muted"
              strokeWidth="2"
              strokeDasharray="5 5"
            />
            <path d={salesTrend + ' L580 185 L45 185Z'} className="fill-surface-warm" />
            <path d={salesTrend} fill="none" className="stroke-primary" strokeWidth="3" />
            {['11/01', '11/05', '11/10', '11/15', '11/20', '11/25'].map((date, index) => (
              <text key={date} x={45 + index * 102} y="210">
                {date}
              </text>
            ))}
          </svg>
        </>
      )}
      {chart.kind === 'bar' && (
        <ul className="my-4 grid gap-5">
          {[
            { label: '微信小程序', value: 54, color: 'bg-primary' },
            { label: '平台电商', value: 38.7, color: 'bg-primary/75' },
            { label: '直播渠道', value: 25.6, color: 'bg-primary/50' },
            { label: '其他渠道', value: 10.3, color: 'bg-primary/25' },
          ].map(({ label, value, color }) => (
            <li
              key={label}
              className="grid grid-cols-[75px_minmax(0,1fr)_55px] items-center gap-2 text-xs"
            >
              <span>{label}</span>
              <span
                className={`h-4 rounded-sm ${color}`}
                style={{ width: `${(value / 54) * 100}%` }}
              />
              <span className="text-right text-muted">{value.toFixed(1)}万</span>
            </li>
          ))}
        </ul>
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
                <button className="dc-btn whitespace-nowrap" onClick={() => setBatch(row)}>
                  查看批次
                </button>,
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
        <Link className="dc-btn-text mt-2" to={knowledge}>
          查看口径 · {chart.knowledgeVersion} →
        </Link>
      </footer>
      {batch && (
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
