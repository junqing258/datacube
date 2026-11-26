import { useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { DataTable, Dialog, PageHeading } from '../components/PageParts';
import { chartKinds, type CustomChart } from '../data/customCharts';
import { type Board } from '../data/demo';
import { BoardChart } from './BoardCharts';

interface Props {
  charts: CustomChart[];
  boards: Board[];
  deleteChart: (id: string) => void;
  refreshChart: (chart: CustomChart) => void;
}

export function ChartsPage({ charts, boards, deleteChart, refreshChart }: Props) {
  const [query, setQuery] = useSearchParams();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const { state } = useLocation();
  const viewing = charts.find(({ id }) => id === query.get('view'));
  const removing = charts.find(({ id }) => id === query.get('delete'));
  const term = search.trim().toLowerCase();
  const visible = charts.filter((chart) => chart.name.toLowerCase().includes(term));
  const referenceCount = (id: string) => boards.filter((board) => board.cards.includes(id)).length;
  const close = () => setQuery({}, { replace: true });

  return (
    <>
      <PageHeading title="图表管理" description={`${charts.length} 个自定义图表`}>
        <Link to="/charts/new" className="dc-btn dc-btn-primary">
          ＋ 新建图表
        </Link>
      </PageHeading>
      <p role="status" className="text-muted">
        {status || (typeof state?.message === 'string' ? state.message : '')}
      </p>
      <section className="dc-page-card mt-5" aria-label="图表列表">
        {charts.length > 0 && (
          <input
            type="search"
            className="dc-control mb-4 sm:max-w-72"
            aria-label="搜索图表"
            placeholder="搜索图表名称"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        )}
        {visible.length ? (
          <DataTable
            headers={['图表名称', '类型', '数据来源', '引用看板', '操作']}
            rows={visible.map((chart) => [
              <strong>{chart.name}</strong>,
              chartKinds[chart.kind],
              chart.dataset,
              `${referenceCount(chart.id)} 个`,
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="dc-btn-text"
                  onClick={() => setQuery({ view: chart.id })}
                >
                  查看
                </button>
                <Link
                  to={`/charts/${encodeURIComponent(chart.id)}/edit`}
                  className="dc-btn-text"
                  aria-label={`编辑 ${chart.name}`}
                >
                  编辑
                </Link>
                <button
                  type="button"
                  className="dc-btn-text text-down"
                  onClick={() => setQuery({ delete: chart.id })}
                >
                  删除
                </button>
              </div>,
            ])}
          />
        ) : (
          <p className="text-muted">{charts.length ? '没有匹配的图表。' : '暂无自定义图表。'}</p>
        )}
      </section>
      {viewing && (
        <Dialog title="图表预览" className="dc-sheet" onClose={close}>
          <div className="mt-4">
            <BoardChart id={viewing.id} customChart={viewing} onRefreshScript={refreshChart} />
          </div>
        </Dialog>
      )}
      {removing && (
        <Dialog title="删除图表" onClose={close}>
          <p className="my-4">
            确定删除「{removing.name}」？
            {referenceCount(removing.id) > 0 &&
              `此图表将从引用它的 ${referenceCount(removing.id)} 个看板中移除。`}
          </p>
          <div className="flex justify-end gap-2">
            <button type="button" className="dc-btn" onClick={close}>
              取消
            </button>
            <button
              type="button"
              className="dc-btn text-down"
              onClick={() => {
                deleteChart(removing.id);
                setStatus('图表已删除');
                close();
              }}
            >
              确认删除
            </button>
          </div>
        </Dialog>
      )}
    </>
  );
}
