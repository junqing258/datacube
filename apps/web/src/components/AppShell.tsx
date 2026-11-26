import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { BookOpen, Bot, Cable, ChartNoAxesCombined, Home, LayoutGrid } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { getHealth } from '@/services/health';

const NAV_ITEMS = [
  { to: '/', label: '首页', icon: Home, end: true },
  { to: '/dashboards', label: '看板', icon: LayoutGrid },
  { to: '/charts', label: '图表管理', icon: ChartNoAxesCombined },
  { to: '/knowledge', label: '业务知识', icon: BookOpen },
  { to: '/data-sources', label: '数据接入', icon: Cable },
  { to: '/ai-access', label: 'AI接入', icon: Bot },
];

function EnvironmentPill() {
  const { data } = useQuery({ queryKey: ['health'], queryFn: getHealth });
  const healthy = data?.database === 'up';
  const databaseDown = data?.database === 'down';
  const label = databaseDown ? '数据服务 · 异常' : healthy ? '数据服务 · 正常' : '演示数据';

  return (
    <span className="inline-flex shrink-0 items-center gap-[7px] rounded-pill bg-surface-soft px-3 py-1.5 text-xs">
      <span
        className={clsx(
          'size-[7px] rounded-full',
          databaseDown ? 'bg-down' : healthy ? 'bg-up' : 'bg-primary',
        )}
      />
      {label}
    </span>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const current =
    NAV_ITEMS.find((item) =>
      item.end ? location.pathname === item.to : location.pathname.startsWith(item.to),
    ) ?? NAV_ITEMS[0];

  return (
    <div className="min-h-screen">
      <aside className="dc-aside">
        <Link to="/" className="dc-brand">
          <span className="dc-logo" aria-hidden="true">
            <span className="dc-logo-mark" />
          </span>
          <span>DataCube</span>
        </Link>
        <div className="mt-8 px-2 text-xs font-semibold text-body max-[700px]:hidden">
          经营分析空间
        </div>
        <nav aria-label="主导航" className="dc-nav">
          {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => clsx('dc-nav-link', isActive && 'dc-nav-link-active')}
            >
              <Icon
                className="size-5 shrink-0 max-[700px]:hidden"
                strokeWidth={2}
                aria-hidden="true"
              />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto hidden items-center gap-2.5 border-t border-hairline-soft px-2 pt-3.5 min-[701px]:flex">
          <span className="grid size-9 place-items-center rounded-full bg-primary-soft text-sm font-semibold text-primary">
            林
          </span>
          <div>
            <strong className="block text-sm font-[650] leading-tight">林晓</strong>
            <small className="block text-xs leading-tight text-muted">业务管理员</small>
          </div>
        </div>
      </aside>
      <div className="dc-workspace">
        <header className="dc-header">
          <div className="dc-content flex min-h-16 items-center justify-between gap-3 max-[700px]:min-h-[47px]">
            <span className="min-w-0 truncate">
              经营分析空间 / <b className="font-[650] text-ink">{current.label}</b>
            </span>
            <EnvironmentPill />
          </div>
        </header>
        <main className="dc-content dc-main">{children}</main>
      </div>
    </div>
  );
}
