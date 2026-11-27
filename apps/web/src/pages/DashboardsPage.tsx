import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Maximize, Minimize } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useHref, useSearchParams } from 'react-router-dom';
import { BoardCard } from '../components/BoardCard';
import { BoardChart } from '../components/BoardChart';
import { Dialog, PageHeading } from '../components/PageParts';
import { apiFailure, apiMessage } from '../services/api';
import {
  addDashboardCard,
  copyDashboard,
  createDashboard,
  listCharts,
  listDashboards,
  removeDashboardCard,
  setDashboardFavorite,
  updateDashboard,
  type DashboardRecord,
} from '../services/platform';

const filters = [
  { id: 'all', label: '全部' },
  { id: 'favorites', label: '收藏' },
  { id: 'archived', label: '已归档' },
];

function timeOf(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'Asia/Shanghai',
  }).format(new Date(value));
}

export function DashboardsPage() {
  const queryClient = useQueryClient();
  const [query, setQuery] = useSearchParams();
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(false);
  const [dialog, setDialog] = useState<'share' | 'archive' | 'rename' | 'charts'>();
  const [status, setStatus] = useState('');
  const [presentationBoard, setPresentationBoard] = useState<string>();
  const [refreshKey, setRefreshKey] = useState(0);
  const boardView = useRef<HTMLDivElement>(null);

  const dashboards = useQuery({ queryKey: ['dashboards'], queryFn: listDashboards });
  const charts = useQuery({ queryKey: ['charts'], queryFn: () => listCharts() });
  const all = dashboards.data ?? [];
  const board = all.find((item) => item.id === query.get('board'));
  const original = all.find((item) => item.id === query.get('copy'));
  const creating = query.has('new') || Boolean(original);
  const active = all.filter((item) => !item.archived);
  const visible = all.filter(
    (item) =>
      item.archived === (filter === 'archived') &&
      (filter !== 'favorites' || item.favorite) &&
      item.name.toLowerCase().includes(search.trim().toLowerCase()),
  );
  const presenting = Boolean(board && presentationBoard === board.id);
  const boardHref = useHref({
    pathname: '/dashboards',
    search: board ? new URLSearchParams({ board: board.id }).toString() : '',
  });
  const shareUrl = new URL(boardHref, window.location.href).href;

  useEffect(() => {
    if (!presenting) return;
    function exitOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape' && !document.querySelector('dialog[open]')) {
        setPresentationBoard(undefined);
      }
    }
    document.addEventListener('keydown', exitOnEscape);
    return () => {
      document.removeEventListener('keydown', exitOnEscape);
      if (boardView.current && document.fullscreenElement === boardView.current) {
        void document.exitFullscreen().catch(() => {});
      }
    };
  }, [presenting]);

  function refreshDashboards() {
    void queryClient.invalidateQueries({ queryKey: ['dashboards'] });
  }

  function closeDialogs() {
    setDialog(undefined);
    setStatus('');
  }

  function open(id?: string) {
    setQuery(id ? { board: id } : {});
    setEditing(false);
    closeDialogs();
    window.scrollTo(0, 0);
  }

  function fail(error: unknown) {
    const failure = apiFailure(error);
    setStatus(failure.message);
    if (failure.code === 'DASHBOARD_VERSION_CONFLICT') refreshDashboards();
  }

  const favorite = useMutation({
    mutationFn: (item: DashboardRecord) => setDashboardFavorite(item.id, !item.favorite),
    onSuccess: refreshDashboards,
    onError: fail,
  });

  const create = useMutation({
    mutationFn: (input: { name: string; description?: string }) => createDashboard(input),
    onSuccess: (created) => {
      refreshDashboards();
      setStatus('看板已创建');
      open(created.id);
    },
    onError: fail,
  });

  const copy = useMutation({
    mutationFn: (input: { id: string; name?: string }) => copyDashboard(input.id, input.name),
    onSuccess: (created) => {
      refreshDashboards();
      setStatus('已复制看板');
      open(created.id);
    },
    onError: fail,
  });

  const update = useMutation({
    mutationFn: (changes: Record<string, unknown>) =>
      updateDashboard(board!.id, { ...changes, expectedVersion: board!.version }),
    onSuccess: () => {
      refreshDashboards();
      setStatus('看板已更新');
      closeDialogs();
    },
    onError: fail,
  });

  const addCard = useMutation({
    mutationFn: (chartId: string) => addDashboardCard(board!.id, chartId, board!.version),
    onSuccess: () => {
      refreshDashboards();
      setStatus('已添加图表');
      closeDialogs();
    },
    onError: fail,
  });

  const removeCard = useMutation({
    mutationFn: (cardId: string) => removeDashboardCard(board!.id, cardId, board!.version),
    onSuccess: () => {
      refreshDashboards();
      setStatus('已移除卡片');
    },
    onError: fail,
  });

  function saveBoard(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const name = String(fields.get('name') ?? '').trim();
    if (!name) return;
    if (original) {
      copy.mutate({ id: original.id, name });
      return;
    }
    create.mutate({
      name,
      description: String(fields.get('description') ?? '').trim() || undefined,
    });
  }

  function saveRename(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = String(new FormData(event.currentTarget).get('name') ?? '').trim();
    if (!name || !board) return;
    update.mutate({ name });
  }

  if (dashboards.isLoading) return <p className="text-muted">正在加载看板…</p>;
  if (dashboards.isError) {
    return (
      <p role="alert" className="text-down">
        {apiMessage(dashboards.error)}
      </p>
    );
  }

  return (
    <>
      {!board ? (
        <>
          <PageHeading title="团队看板" description={`${active.length} 个有效看板`}>
            <Link to="?new=1" className="dc-btn dc-btn-primary">
              ＋ 新建看板
            </Link>
          </PageHeading>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
            <div role="group" aria-label="看板状态" className="flex flex-wrap gap-1.5">
              {filters.map((item) => (
                <button
                  key={item.id}
                  className={`dc-btn ${filter === item.id ? 'dc-btn-primary' : ''}`}
                  aria-pressed={filter === item.id}
                  onClick={() => setFilter(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <input
              className="dc-control"
              type="search"
              aria-label="搜索看板"
              placeholder="搜索看板名称"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          {status && (
            <p role="status" className="mt-3 text-sm text-muted">
              {status}
            </p>
          )}
          {visible.length ? (
            <div className="mt-5 grid gap-4 sm:grid-cols-2 min-[1250px]:grid-cols-4">
              {visible.map((item) => (
                <BoardCard
                  key={item.id}
                  board={item}
                  copyTo={`?copy=${item.id}`}
                  onFavorite={() => favorite.mutate(item)}
                />
              ))}
            </div>
          ) : (
            <section className="dc-page-card mt-5">
              <h2>暂无匹配看板</h2>
              <p className="mt-2 text-muted">修改搜索条件，或创建一个新看板。</p>
            </section>
          )}
        </>
      ) : (
        <>
          <section className={presenting ? 'dc-board-presentation' : undefined}>
            <div hidden={presenting}>
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <Link
                  className="dc-btn-text"
                  to="/dashboards"
                  onClick={() => {
                    setEditing(false);
                    setStatus('');
                  }}
                >
                  ← 所有看板
                </Link>
                <select
                  aria-label="切换看板"
                  className="dc-control"
                  value={board.id}
                  onChange={(event) => open(event.target.value)}
                >
                  {(board.archived ? [...active, board] : active).map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <PageHeading title={board.name} description={board.description}>
              {presenting ? (
                <button
                  type="button"
                  className="dc-btn"
                  onClick={() => setPresentationBoard(undefined)}
                >
                  <Minimize size={16} aria-hidden="true" /> 退出全屏
                </button>
              ) : (
                <span className="dc-tag">{board.archived ? '已归档' : `v${board.version}`}</span>
              )}
            </PageHeading>
            <div hidden={presenting}>
              <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
                <span className="text-muted">
                  更新于 {timeOf(board.updatedAt)} · 数据在打开卡片时读取
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    className="dc-btn"
                    aria-pressed={board.favorite}
                    onClick={() => favorite.mutate(board)}
                  >
                    {board.favorite ? '★ 已收藏' : '☆ 收藏'}
                  </button>
                  <Link className="dc-btn" to={`?board=${board.id}&copy=${board.id}`}>
                    复制
                  </Link>
                  <button className="dc-btn" onClick={() => setDialog('share')}>
                    分享
                  </button>
                  {board.canEdit && (
                    <>
                      <button className="dc-btn" onClick={() => setDialog('archive')}>
                        {board.archived ? '恢复' : '归档'}
                      </button>
                      {!board.archived && (
                        <button
                          className="dc-btn"
                          onClick={() => setRefreshKey((value) => value + 1)}
                        >
                          ↻ 刷新
                        </button>
                      )}
                    </>
                  )}
                  <button
                    type="button"
                    className="dc-btn"
                    onClick={() => {
                      if (presenting) {
                        setPresentationBoard(undefined);
                        return;
                      }
                      setPresentationBoard(board.id);
                      boardView.current?.requestFullscreen?.().catch(() => {});
                    }}
                  >
                    <Maximize size={16} aria-hidden="true" /> 全屏
                  </button>
                  {!board.archived && board.canEdit && (
                    <>
                      {charts.data?.length ? (
                        <button className="dc-btn" onClick={() => setDialog('charts')}>
                          ＋ 添加已有图表
                        </button>
                      ) : null}
                      <button
                        className="dc-btn dc-btn-primary"
                        onClick={() => setEditing((value) => !value)}
                      >
                        {editing ? '完成编辑' : '编辑看板'}
                      </button>
                    </>
                  )}
                </div>
              </div>
              {status && (
                <p className="mt-3 text-sm text-muted" role="status">
                  {status}
                </p>
              )}
              {editing && (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-input bg-primary-soft p-3">
                  <span>可改名或移除当前看板的图表。</span>
                  <button className="dc-btn" onClick={() => setDialog('rename')}>
                    修改名称
                  </button>
                </div>
              )}
            </div>
            <div ref={boardView}>
              {board.cards.length ? (
                <div
                  className={`mt-5 grid gap-4 ${board.cards.length > 1 ? 'min-[1150px]:grid-cols-2' : ''}`}
                >
                  {board.cards.map((card) => (
                    <BoardChart
                      key={card.id}
                      chart={card.chart}
                      title={card.title}
                      fullWidth={card.layout?.fullWidth === true}
                      presenting={presenting}
                      refreshKey={refreshKey}
                      onRemove={
                        editing && !presenting && board.canEdit
                          ? () => removeCard.mutate(card.id)
                          : undefined
                      }
                    />
                  ))}
                </div>
              ) : (
                <section className="dc-page-card mt-5">
                  <h2>这个看板还没有图表</h2>
                  {!board.archived && board.canEdit && charts.data?.length ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button className="dc-btn" onClick={() => setDialog('charts')}>
                        ＋ 添加已有图表
                      </button>
                    </div>
                  ) : (
                    <p className="mt-2 text-muted">
                      {charts.data?.length ? '暂无可添加的图表。' : '请先在图表管理中创建图表。'}
                    </p>
                  )}
                </section>
              )}
            </div>
            {!presenting && (
              <p className="mt-5 text-muted">
                {board.cards.length} 张图表 · {board.origin === 'web' ? '手动' : board.origin}创建
              </p>
            )}
          </section>
        </>
      )}
      {(creating || dialog === 'rename') && (
        <Dialog
          title={original ? '复制看板' : creating ? '新建看板' : '修改看板名称'}
          onClose={() => {
            if (creating) setQuery(board ? { board: board.id } : {}, { replace: true });
            setDialog(undefined);
          }}
        >
          <form
            onSubmit={original || creating ? saveBoard : saveRename}
            key={original?.id ?? board?.id ?? 'new'}
          >
            <label className="dc-field">
              名称
              <input
                className="dc-control"
                name="name"
                required
                pattern={String.raw`.*\S.*`}
                placeholder="例如：月度经营分析"
                defaultValue={original ? `${original.name} 副本` : creating ? '' : board?.name}
              />
            </label>
            {creating && (
              <>
                <label className="dc-field">
                  说明
                  <input
                    className="dc-control"
                    name="description"
                    defaultValue={original?.description}
                  />
                </label>
                <p className="text-muted">
                  {original
                    ? '复制布局和筛选，图表沿用共享定义。'
                    : '创建空白看板后，可添加已有图表。'}
                </p>
              </>
            )}
            <button
              className="dc-btn dc-btn-primary justify-self-start"
              disabled={create.isPending || copy.isPending || update.isPending}
            >
              {original
                ? '创建副本'
                : creating
                  ? '创建看板'
                  : update.isPending
                    ? '保存中…'
                    : '应用'}
            </button>
          </form>
        </Dialog>
      )}
      {board && dialog === 'share' && (
        <Dialog title="看板独立链接" onClose={() => setDialog(undefined)}>
          <input
            className="dc-control my-4 w-full"
            aria-label="看板链接"
            readOnly
            value={shareUrl}
            onFocus={(event) => event.target.select()}
          />
          <p className="mb-4 text-muted">同一空间内已授权的成员登录后即可打开。</p>
          <button
            className="dc-btn"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(shareUrl);
                setDialog(undefined);
                setStatus('已复制看板链接');
              } catch {
                setStatus('请手动选择并复制看板链接');
              }
            }}
          >
            复制链接
          </button>
        </Dialog>
      )}
      {board && dialog === 'archive' && board.canEdit && (
        <Dialog
          title={board.archived ? '恢复看板' : '归档看板'}
          onClose={() => setDialog(undefined)}
        >
          <p className="my-4">{board.name}</p>
          <p className="mb-4 text-muted">
            {board.archived ? '恢复后回到有效看板列表。' : '归档后可在已归档列表中恢复。'}
          </p>
          <button
            className="dc-btn dc-btn-primary"
            disabled={update.isPending}
            onClick={() =>
              update.mutate(
                { archived: !board.archived },
                {
                  onSuccess: () => {
                    setFilter(board.archived ? 'all' : 'archived');
                    open();
                  },
                },
              )
            }
          >
            {update.isPending ? '保存中…' : '确认'}
          </button>
        </Dialog>
      )}
      {board && !board.archived && dialog === 'charts' && (
        <Dialog title="添加已有图表" onClose={() => setDialog(undefined)}>
          <Link className="dc-btn-text mt-3" to="/charts">
            前往图表管理 →
          </Link>
          {charts.isLoading && <p className="mt-3 text-muted">正在加载图表…</p>}
          {charts.data?.map((chart) => {
            const added = board.cards.some((card) => card.chartId === chart.id);
            return (
              <div
                key={chart.id}
                className="flex items-center justify-between gap-3 border-b border-hairline-soft py-3"
              >
                <div>
                  <strong>{chart.name}</strong>
                  <p className="text-muted">{chart.dataset}</p>
                </div>
                <button
                  className="dc-btn"
                  disabled={added || addCard.isPending}
                  onClick={() => addCard.mutate(chart.id)}
                >
                  {added ? '已添加' : '添加'}
                </button>
              </div>
            );
          })}
          {!charts.isLoading && !charts.data?.length && (
            <p className="my-3 text-muted">暂无可添加的图表。</p>
          )}
        </Dialog>
      )}
    </>
  );
}
