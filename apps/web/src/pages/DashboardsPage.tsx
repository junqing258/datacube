import { useState, type FormEvent } from 'react';
import { BoardCard } from '../components/BoardCard';
import { Link, useHref, useSearchParams } from 'react-router-dom';
import { Dialog, PageHeading } from '../components/PageParts';
import { chartLibrary, type Board } from '../data/demo';
import { BoardChart } from './BoardCharts';

const filters = [
  { id: 'all', label: '全部' },
  { id: 'favorites', label: '收藏' },
  { id: 'archived', label: '已归档' },
];

interface Props {
  boards: Board[];
  updateBoard: (id: string, changes: Partial<Board>) => void;
  addBoard: (board: Board) => void;
}

export function DashboardsPage({ boards, updateBoard, addBoard }: Props) {
  const [query, setQuery] = useSearchParams();
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [editingBoard, setEditingBoard] = useState<string>();
  const [dialog, setDialog] = useState<'share' | 'archive' | 'rename' | 'charts'>();
  const [status, setStatus] = useState('');
  const board = boards.find((item) => item.id === query.get('board'));
  const boardHref = useHref({
    pathname: '/dashboards',
    search: board ? new URLSearchParams({ board: board.id }).toString() : '',
  });
  const shareUrl = new URL(boardHref, window.location.href).href;
  const original = boards.find((item) => item.id === query.get('copy'));
  const creating = query.has('new') || Boolean(original);
  const editing = Boolean(board && editingBoard === board.id);
  const active = boards.filter((item) => !item.archived);
  const visible = boards.filter(
    (item) =>
      item.archived === (filter === 'archived') &&
      (filter !== 'favorites' || item.favorite) &&
      item.name.toLowerCase().includes(search.trim().toLowerCase()),
  );
  const warehouse = board?.warehouse ?? '';

  function open(id?: string) {
    setQuery(id ? { board: id } : {});
    setEditingBoard(undefined);
    setDialog(undefined);
    setStatus('');
    window.scrollTo(0, 0);
  }

  function saveBoard(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const name = String(fields.get('name')).trim();
    if (!name) return;
    if (!creating && board) {
      updateBoard(board.id, { name });
      setDialog(undefined);
      return;
    }
    const id = `board-${crypto.randomUUID()}`;
    addBoard({
      id,
      name,
      description: String(fields.get('description')).trim(),
      type: original?.type ?? 'custom',
      favorite: false,
      archived: false,
      source: '手动',
      cards: [...(original?.cards ?? [])],
      version: 1,
      warehouse: original?.warehouse,
    });
    open(id);
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
          {visible.length ? (
            <div className="mt-5 grid gap-4 sm:grid-cols-2 min-[1250px]:grid-cols-4">
              {visible.map((item) => (
                <BoardCard
                  key={item.id}
                  board={item}
                  copyTo={`?copy=${item.id}`}
                  onFavorite={() => updateBoard(item.id, { favorite: !item.favorite })}
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
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <Link
              className="dc-btn-text"
              to="/dashboards"
              onClick={() => {
                setEditingBoard(undefined);
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
          <PageHeading title={board.name} description={board.description}>
            <span className="dc-tag">{board.archived ? '已归档' : `v${board.version}`}</span>
          </PageHeading>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            {['inventory', 'processing'].includes(board.type) ? (
              <div className="flex flex-wrap items-center gap-2">
                <select
                  className="dc-control"
                  aria-label="仓库"
                  value={warehouse}
                  onChange={(event) => updateBoard(board.id, { warehouse: event.target.value })}
                >
                  <option value="">全部仓库</option>
                  <option>一号仓</option>
                  <option>二号仓</option>
                </select>
                <span className="text-muted">11 月 25 日示例</span>
              </div>
            ) : (
              <span className="text-muted">
                {board.type === 'sales'
                  ? '11 月 1–25 日销售样例'
                  : board.type === 'channel'
                    ? '11 月 25 日直播场次样例'
                    : '演示数据'}
              </span>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <button
                className="dc-btn"
                aria-pressed={board.favorite}
                onClick={() => updateBoard(board.id, { favorite: !board.favorite })}
              >
                {board.favorite ? '★ 已收藏' : '☆ 收藏'}
              </button>
              <Link className="dc-btn" to={`?board=${board.id}&copy=${board.id}`}>
                复制
              </Link>
              <button className="dc-btn" onClick={() => setDialog('share')}>
                分享
              </button>
              <button className="dc-btn" onClick={() => setDialog('archive')}>
                {board.archived ? '恢复' : '归档'}
              </button>
              <button className="dc-btn" onClick={() => setStatus('已刷新当前看板的演示结果')}>
                ↻ 刷新
              </button>
              {!board.archived && (
                <>
                  {board.cards.length > 0 && (
                    <button className="dc-btn" onClick={() => setDialog('charts')}>
                      ＋ 添加已有图表
                    </button>
                  )}
                  <button
                    className="dc-btn dc-btn-primary"
                    onClick={() => {
                      if (editing) updateBoard(board.id, { version: board.version + 1 });
                      setEditingBoard(editing ? undefined : board.id);
                    }}
                  >
                    {editing ? '完成编辑' : '编辑看板'}
                  </button>
                </>
              )}
            </div>
          </div>
          {status && (
            <p className="mt-3 text-muted" role="status">
              {status}
            </p>
          )}
          {editing && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-input bg-primary-soft p-3">
              <span>可改名或调整当前看板的图表。</span>
              <button className="dc-btn" onClick={() => setDialog('rename')}>
                修改名称
              </button>
            </div>
          )}
          {board.cards.length ? (
            <div
              className={`mt-5 grid gap-4 ${board.cards.length > 1 ? 'min-[1150px]:grid-cols-2' : ''}`}
            >
              {board.cards.map((id) => (
                <BoardChart
                  key={`${board.id}-${id}`}
                  id={id}
                  boardId={board.id}
                  warehouse={warehouse}
                  onRemove={
                    editing
                      ? () =>
                          updateBoard(board.id, {
                            cards: board.cards.filter((item) => item !== id),
                          })
                      : undefined
                  }
                />
              ))}
            </div>
          ) : (
            <section className="dc-page-card mt-5">
              <h2>这个看板还没有图表</h2>
              <p className="my-3 text-muted">从已有图表中选择，或通过外部 MCP / Skill 创建。</p>
              {!board.archived && (
                <button className="dc-btn dc-btn-primary" onClick={() => setDialog('charts')}>
                  ＋ 添加已有图表
                </button>
              )}
            </section>
          )}
          <p className="mt-5 text-muted">
            {board.cards.length} 张图表 · {board.source}创建
          </p>
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
          <form onSubmit={saveBoard} key={original?.id ?? board?.id ?? 'new'}>
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
                <label className="dc-field">
                  空间
                  <select className="dc-control">
                    <option>经营分析空间</option>
                  </select>
                </label>
                <p className="text-muted">
                  {original
                    ? '复制布局和筛选，图表沿用共享定义。'
                    : '创建空白看板后，可添加已有图表。'}
                </p>
              </>
            )}
            <button className="dc-btn dc-btn-primary justify-self-start">
              {original ? '创建副本' : creating ? '创建看板' : '应用'}
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
          {board.source === '手动' && (
            <p className="mb-4 text-muted">新建看板仅保留在当前演示会话。</p>
          )}
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
          {status && (
            <p className="mt-2 text-muted" role="status">
              {status}
            </p>
          )}
        </Dialog>
      )}
      {board && dialog === 'archive' && (
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
            onClick={() => {
              updateBoard(board.id, { archived: !board.archived });
              setFilter(board.archived ? 'all' : 'archived');
              open();
            }}
          >
            确认
          </button>
        </Dialog>
      )}
      {board && dialog === 'charts' && (
        <Dialog title="添加已有图表" onClose={() => setDialog(undefined)}>
          <p className="my-3 text-muted">添加共享图表引用。</p>
          {chartLibrary.map((chart) => (
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
                disabled={board.cards.includes(chart.id)}
                onClick={() => {
                  updateBoard(board.id, {
                    cards: [...board.cards, chart.id],
                    version: board.version + 1,
                  });
                  setDialog(undefined);
                }}
              >
                {board.cards.includes(chart.id) ? '已添加' : '添加'}
              </button>
            </div>
          ))}
        </Dialog>
      )}
    </>
  );
}
