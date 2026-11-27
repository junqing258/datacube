import { ArrowUpRight, Boxes, Factory, LayoutGrid, Radio, Star, TrendingUp } from 'lucide-react';
import { Link } from 'react-router-dom';
import { type DashboardRecord } from '../services/platform';

const boardIcons: Record<string, typeof TrendingUp> = {
  sales: TrendingUp,
  inventory: Boxes,
  processing: Factory,
  channel: Radio,
};

export function BoardCard({
  board,
  onFavorite,
  copyTo,
}: {
  board: DashboardRecord;
  onFavorite: () => void;
  copyTo: string;
}) {
  const Icon = boardIcons[board.kind] ?? LayoutGrid;
  return (
    <article className="dc-page-card flex flex-col gap-3.5 transition-colors hover:border-field-border">
      <div className="flex items-center justify-between">
        <span className="grid size-[42px] place-items-center rounded-card bg-primary-soft text-primary">
          <Icon size={20} aria-hidden="true" />
        </span>
        <button
          type="button"
          className="grid size-9 place-items-center rounded-full text-primary hover:bg-primary-soft"
          aria-label={`收藏 ${board.name}`}
          aria-pressed={board.favorite}
          onClick={onFavorite}
        >
          <Star size={18} fill={board.favorite ? 'currentColor' : 'none'} aria-hidden="true" />
        </button>
      </div>
      <div>
        <Link
          className="inline-flex items-center gap-1 text-[15px] font-semibold hover:text-link"
          to={`/dashboards?board=${board.id}`}
        >
          {board.name}
          <ArrowUpRight size={14} aria-hidden="true" />
        </Link>
        <p className="mt-1.5 text-[13px] text-muted">{board.description}</p>
      </div>
      <footer className="mt-auto flex items-center justify-between gap-2 border-t border-hairline-soft pt-3 text-[13px] text-muted">
        <span>
          {board.cards.length} 张图表 · v{board.version}
          {board.archived && ' · 已归档'}
        </span>
        <Link to={copyTo} className="dc-btn-text" aria-label={`复制 ${board.name}`}>
          复制
        </Link>
      </footer>
    </article>
  );
}
