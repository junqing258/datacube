import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import { ArrowUpRight, Boxes, Factory, Plus, Radio, Star, TrendingUp } from 'lucide-react';

interface BoardSummary {
  id: string;
  name: string;
  description: string;
  cardCount: number;
  icon: LucideIcon;
}

const FAVORITE_BOARDS: BoardSummary[] = [
  {
    id: 'sales',
    name: '电商销售总览',
    description: '微信小程序、平台电商及其他渠道的成交与退款',
    cardCount: 2,
    icon: TrendingUp,
  },
  {
    id: 'inventory',
    name: '双仓库存与缺货',
    description: '按仓库查看可用库存、临期和缺货情况',
    cardCount: 1,
    icon: Boxes,
  },
  {
    id: 'processing',
    name: '加工损耗与入库核对',
    description: '按加工批次核对投料、报损、合格产出和入库重量',
    cardCount: 1,
    icon: Factory,
  },
  {
    id: 'channel',
    name: '直播经营复盘',
    description: '按直播场次比较成交与退款，查看整体渠道结构',
    cardCount: 2,
    icon: Radio,
  },
];

const PROCESSING_ALERT = {
  warehouse: '二号仓',
  rate: '11.0%',
  batch: 'JG-1125-02',
  gap: 32,
};

function BoardCard({
  board,
  onCopy,
}: {
  board: BoardSummary;
  onCopy: (board: BoardSummary) => void;
}) {
  const Icon = board.icon;

  return (
    <article className="dc-card group flex min-w-0 flex-col gap-3.5 p-[18px] transition-[border-color,box-shadow] hover:border-[#a4bbf4] hover:shadow-card max-[700px]:rounded-[18px] max-[700px]:p-4">
      <div className="flex items-center justify-between">
        <span className="grid size-[42px] place-items-center rounded-full bg-primary-soft text-primary">
          <Icon className="size-5" strokeWidth={2} aria-hidden="true" />
        </span>
        <span
          className="grid size-[38px] place-items-center rounded-full text-primary"
          aria-hidden="true"
        >
          <Star className="size-[18px] fill-current" strokeWidth={2} />
        </span>
      </div>
      <div>
        <Link
          to={`/dashboards?board=${board.id}`}
          className="inline-flex items-center gap-1 text-[15px] font-semibold text-ink transition-colors hover:text-primary"
        >
          {board.name}
          <ArrowUpRight className="size-3.5" aria-hidden="true" />
        </Link>
        <p className="mb-3 mt-1.5 text-[13px] leading-5 text-muted">{board.description}</p>
      </div>
      <footer className="mt-auto flex items-center justify-between gap-2 border-t border-hairline-soft pt-2.5">
        <span className="text-[13px] text-muted">{board.cardCount} 张图表</span>
        <button
          type="button"
          className="dc-btn-text min-h-8 text-[13px]"
          onClick={() => onCopy(board)}
        >
          复制
        </button>
      </footer>
    </article>
  );
}

export function HomePage() {
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  const notify = (message: string) => {
    setToast(message);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2600);
  };

  const copyBoardLink = async (board: BoardSummary) => {
    const link = `${window.location.origin}/dashboards?board=${board.id}`;
    try {
      await navigator.clipboard.writeText(link);
      notify(`已复制「${board.name}」链接`);
    } catch {
      notify('复制失败，请手动复制');
    }
  };

  return (
    <>
      <section className="grid gap-[clamp(24px,4vw,56px)] rounded-panel bg-surface-dark p-[clamp(26px,4vw,52px)] text-white min-[980px]:grid-cols-[minmax(0,1fr)_minmax(250px,360px)] max-[700px]:rounded-[22px] max-[700px]:p-[22px]">
        <div className="self-center">
          <h1 className="font-display text-[clamp(36px,4.6vw,62px)] font-normal leading-[1.18] tracking-[-0.055em]">
            生鲜经营总览
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-[#c4c8d0]">
            查看电商销售、双仓库存、加工损耗和直播经营。
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            <Link to="/dashboards" className="dc-btn dc-btn-primary">
              <Plus className="size-4" strokeWidth={2.5} aria-hidden="true" />
              新建看板
            </Link>
            <Link to="/dashboards" className="dc-btn dc-btn-on-dark">
              所有看板 <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>
        <section className="flex flex-col items-start justify-center gap-2.5 rounded-[20px] border border-[#30333b] bg-surface-elevated p-[22px]">
          <span className="dc-tag bg-[#2a2028] text-[#ffbbc4]">
            待复核 · {PROCESSING_ALERT.warehouse}
          </span>
          <div className="font-mono text-[41px] font-medium leading-none tracking-[-0.04em] tabular-nums">
            {PROCESSING_ALERT.rate}
          </div>
          <h2 className="text-[17px] font-medium leading-snug">加工损耗率</h2>
          <p className="text-[13px] leading-relaxed">
            批次 {PROCESSING_ALERT.batch} · 入库差额 {PROCESSING_ALERT.gap} kg
          </p>
          <Link
            to="/dashboards?board=processing"
            className="dc-btn-text min-h-[34px] text-[#9ebaff]"
          >
            打开加工损耗看板 →
          </Link>
        </section>
      </section>

      <section className="mt-7">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-[21px] font-semibold leading-[1.35]">收藏看板</h2>
          <Link to="/dashboards" className="dc-btn-text">
            查看全部 →
          </Link>
        </div>
        <div className="grid grid-cols-1 gap-4 min-[391px]:grid-cols-2 min-[1250px]:grid-cols-4">
          {FAVORITE_BOARDS.map((board) => (
            <BoardCard key={board.id} board={board} onCopy={copyBoardLink} />
          ))}
        </div>
      </section>

      {toast && (
        <div
          role="status"
          className="fixed bottom-[63px] right-[18px] z-40 max-w-[calc(100vw-36px)] rounded-input bg-surface-dark px-5 py-3.5 text-sm text-white shadow-card"
        >
          {toast}
        </div>
      )}
    </>
  );
}
