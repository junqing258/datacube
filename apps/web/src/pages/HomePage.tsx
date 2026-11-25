import { Link, useSearchParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { type Board } from '../data/demo';
import { BoardCard } from '../components/BoardCard';
import { DataTable } from '../components/PageParts';
import { BoardChart } from './BoardCharts';

const PROCESSING_ALERT = {
  warehouse: '二号仓',
  rate: '11.0%',
  batch: 'JG-1125-02',
  gap: 32,
};

export function HomePage({
  boards,
  updateBoard,
}: {
  boards: Board[];
  updateBoard: (id: string, changes: Partial<Board>) => void;
}) {
  const [query] = useSearchParams();
  const variant = query.get('variant');
  const active = boards.filter((board) => !board.archived);
  const visible = variant === 'B' ? active : active.filter((board) => board.favorite);

  const showAlert = boards.some((board) => board.id === 'processing' && !board.archived);
  return (
    <>
      <div
        className={`grid gap-4 ${showAlert ? 'min-[1100px]:grid-cols-[minmax(0,1fr)_minmax(280px,0.36fr)]' : ''}`}
      >
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
        </section>
        {showAlert && (
          <section className="dc-page-card flex flex-col items-start justify-center gap-2.5 bg-surface-tint p-6">
            <span className="dc-tag bg-white text-down">待复核 · {PROCESSING_ALERT.warehouse}</span>
            <div className="font-mono text-[41px] font-medium leading-none tabular-nums">
              {PROCESSING_ALERT.rate}
            </div>
            <h2 className="text-[17px] font-medium leading-snug">加工损耗率</h2>
            <p className="text-[13px] leading-relaxed text-body">
              批次 {PROCESSING_ALERT.batch} · 入库差额 {PROCESSING_ALERT.gap} kg
            </p>
            <Link to="/dashboards?board=processing" className="dc-btn-text min-h-[34px]">
              打开加工损耗看板 →
            </Link>
          </section>
        )}
      </div>

      {variant === 'B' && (
        <section className="mt-7">
          <h2 className="mb-3 text-[21px] font-semibold">销售表现</h2>
          <div className="mb-4 grid gap-4 sm:grid-cols-2 min-[1150px]:grid-cols-4">
            {[
              ['净销售额', '¥ 128.6 万', '8.9%'],
              ['支付订单数', '8,426', '6.2%'],
              ['客单价', '¥ 152.6', '2.9%'],
              ['退款率', '3.8%', '0.3 个百分点'],
            ].map(([label, value, change]) => (
              <div key={label} className="dc-page-card">
                <h3 className="text-muted">{label}</h3>
                <p className="py-2 font-mono text-2xl font-semibold">{value}</p>
                <p className="text-sm text-muted">
                  <span className={label === '退款率' ? 'text-up' : 'text-down'}>↘ {change}</span>{' '}
                  较上月同期
                </p>
              </div>
            ))}
          </div>
          <div className="dc-columns">
            <BoardChart id="sales-trend" boardId="sales" warehouse="" />
            <BoardChart id="channel-sales" boardId="sales" warehouse="" />
          </div>
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
                board.source,
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
                onFavorite={() => updateBoard(board.id, { favorite: !board.favorite })}
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
