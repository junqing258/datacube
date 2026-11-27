import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { Link } from 'react-router-dom';
import { BoardCard } from '../components/BoardCard';
import { BoardChart } from '../components/BoardChart';
import { DataTable } from '../components/PageParts';
import { apiMessage } from '../services/api';
import {
  listDashboards,
  runChartExecution,
  setDashboardFavorite,
  type DashboardRecord,
} from '../services/platform';

const formatAmount = new Intl.NumberFormat('zh-CN', {
  style: 'currency',
  currency: 'CNY',
  maximumFractionDigits: 0,
});

function SalesSummary({ chartId }: { chartId?: string }) {
  const result = useQuery({
    queryKey: ['home-sales-summary', chartId],
    queryFn: () => runChartExecution(chartId!),
    enabled: Boolean(chartId),
    staleTime: 5 * 60_000,
  });
  if (!chartId) return <p className="text-muted">销售看板尚未绑定真实查询。</p>;
  if (result.isLoading) return <p className="text-muted">正在读取销售数据…</p>;
  if (result.isError) {
    return (
      <p role="alert" className="text-sm text-down">
        {result.error instanceof Error ? result.error.message : '销售数据读取失败。'}
      </p>
    );
  }
  const rows = result.data?.rows ?? [];
  const values = rows
    .map((row) => row.value)
    .filter((value): value is number => typeof value === 'number');
  if (!values.length) return <p className="text-muted">当前窗口暂无销售数据。</p>;
  const total = values.reduce((sum, value) => sum + value, 0);
  const average = total / values.length;
  const best = Math.max(...values);
  const last = String(rows.at(-1)?.label ?? '—');
  const tiles = [
    ['净销售额', formatAmount.format(total), `${values.length} 天合计`],
    ['日均净销售额', formatAmount.format(average), '按有数据日期'],
    ['最高单日', formatAmount.format(best), '窗口内峰值'],
    ['统计截止', last, `共 ${result.data?.rowCount ?? values.length} 天`],
  ];
  return (
    <div className="mb-4 grid gap-4 sm:grid-cols-2 min-[1150px]:grid-cols-4">
      {tiles.map(([label, value, note]) => (
        <div key={label} className="dc-page-card">
          <h3 className="text-muted">{label}</h3>
          <p className="py-2 font-mono text-2xl font-semibold">{value}</p>
          <p className="text-sm text-muted">{note}</p>
        </div>
      ))}
    </div>
  );
}

export function HomePage() {
  const [query] = useSearchParams();
  const queryClient = useQueryClient();
  const variant = query.get('variant');
  const dashboards = useQuery({ queryKey: ['dashboards'], queryFn: listDashboards });
  const favorite = useMutation({
    mutationFn: ({ board }: { board: DashboardRecord }) =>
      setDashboardFavorite(board.id, !board.favorite),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['dashboards'] }),
  });

  if (dashboards.isLoading) return <p className="text-muted">正在加载看板…</p>;
  if (dashboards.isError) {
    return (
      <p role="alert" className="text-down">
        {apiMessage(dashboards.error)}
      </p>
    );
  }

  const all = dashboards.data ?? [];
  const active = all.filter((board) => !board.archived);
  const visible = variant === 'B' ? active : active.filter((board) => board.favorite);
  const salesBoard = active.find((board) => board.kind === 'sales');
  const salesChart = salesBoard?.cards.find((card) => card.chart.source === 'sql');
  const status = favorite.isError
    ? apiMessage(favorite.error)
    : favorite.isPending
      ? '保存收藏…'
      : '';

  return (
    <>
      <section className="flex min-w-0 flex-col justify-center bg-surface-warm p-[clamp(24px,4vw,48px)]">
        <h1 className="font-display text-[clamp(36px,4.6vw,56px)] font-normal leading-[1.2] after:mt-4 after:block after:h-1 after:w-10 after:bg-gold">
          经营总览
        </h1>
        <p className="mt-3 text-base leading-relaxed text-body">
          查看电商销售、多仓库存、加工损耗和直播经营。
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <Link to="/dashboards?new=1" className="dc-btn dc-btn-primary">
            <Plus className="size-4" strokeWidth={2.5} aria-hidden="true" />
            新建看板
          </Link>
          <Link to="/dashboards" className="dc-btn">
            所有看板 <span aria-hidden="true">→</span>
          </Link>
        </div>
        {status && (
          <p role="status" className="mt-3 text-sm text-muted">
            {status}
          </p>
        )}
      </section>

      {variant === 'B' && (
        <section className="mt-7">
          <h2 className="mb-3 text-[21px] font-semibold">销售表现</h2>
          <SalesSummary chartId={salesChart?.chartId} />
          {salesBoard?.cards.length ? (
            <div className="dc-columns">
              {salesBoard.cards.map((card) => (
                <BoardChart key={card.id} chart={card.chart} title={card.title} />
              ))}
            </div>
          ) : (
            <p className="dc-page-card text-muted">销售看板还没有绑定真实查询。</p>
          )}
        </section>
      )}

      {variant === 'C' ? (
        <div className="dc-columns mt-7">
          <section className="dc-page-card">
            <h2>团队看板</h2>
            <DataTable
              headers={['看板', '来源', '版本']}
              rows={active.map((board) => [
                <Link className="dc-btn-text" to={`/dashboards?board=${board.id}`}>
                  {board.name}
                </Link>,
                board.origin === 'web' ? '手动' : board.origin,
                `v${board.version}`,
              ])}
            />
          </section>
          <section className="dc-page-card space-y-3">
            <h2>业务知识</h2>
            <p className="text-muted">查阅看板与外部工具共用的指标口径。</p>
            <Link to="/knowledge" className="dc-btn">
              阅读业务知识 →
            </Link>
            <h2>AI接入</h2>
            <Link to="/ai-access" className="dc-btn">
              管理 API Key →
            </Link>
          </section>
        </div>
      ) : (
        <section className="mt-7">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-[21px] font-semibold leading-[1.35]">
              {variant === 'B' ? '团队看板' : '收藏看板'}
            </h2>
            <Link to="/dashboards" className="dc-btn-text">
              查看全部 →
            </Link>
          </div>
          {!visible.length && (
            <p className="dc-page-card text-muted">
              {variant === 'B' ? '暂无有效看板。' : '暂无收藏看板。'}
            </p>
          )}
          <div className="grid grid-cols-1 gap-4 min-[391px]:grid-cols-2 min-[1250px]:grid-cols-4">
            {visible.map((board) => (
              <BoardCard
                key={board.id}
                board={board}
                copyTo={`/dashboards?copy=${board.id}`}
                onFavorite={() => favorite.mutate({ board })}
              />
            ))}
          </div>
        </section>
      )}
      <nav aria-label="首页布局" className="mt-8 flex flex-wrap gap-2">
        {[
          ['A', '收藏看板'],
          ['B', '销售概览'],
          ['C', '团队资产'],
        ].map(([id, label]) => {
          const selected = id === (variant === 'B' || variant === 'C' ? variant : 'A');
          return (
            <Link
              key={id}
              className={`dc-btn ${selected ? 'dc-btn-primary' : ''}`}
              aria-current={selected ? 'page' : undefined}
              to={`?variant=${id}`}
            >
              {label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
