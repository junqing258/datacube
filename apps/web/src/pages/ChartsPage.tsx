import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { BoardChart } from '../components/BoardChart';
import { DataTable, Dialog, PageHeading } from '../components/PageParts';
import { chartKinds } from '../data/customCharts';
import { apiMessage } from '../services/api';
import { getSession } from '../services/auth';
import { listCharts, updateChart, type ChartRecord } from '../services/platform';

export function ChartsPage() {
  const queryClient = useQueryClient();
  const [query, setQuery] = useSearchParams();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const { state } = useLocation();
  const charts = useQuery({ queryKey: ['charts', 'all'], queryFn: () => listCharts(true) });
  const session = useQuery({ queryKey: ['session'], queryFn: getSession });
  const data = charts.data ?? [];
  const canMutate = (chart: ChartRecord) =>
    session.data?.space?.role === 'admin' || chart.createdById === session.data?.user.id;
  const viewing = data.find(({ id }) => id === query.get('view'));
  const archiving = data.find(({ id }) => id === query.get('archive'));
  const term = search.trim().toLowerCase();
  const visible = data.filter((chart) => chart.name.toLowerCase().includes(term));
  const close = () => setQuery({}, { replace: true });

  const archive = useMutation({
    mutationFn: ({ chart, archived }: { chart: ChartRecord; archived: boolean }) =>
      updateChart(chart.id, { archived }),
    onSuccess: (_updated, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['charts'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboards'] });
      setStatus(variables.archived ? '图表已归档' : '图表已恢复');
      close();
    },
    onError: (error) => setStatus(apiMessage(error)),
  });

  return (
    <>
      <PageHeading
        title="图表管理"
        description={`${data.filter((chart) => !chart.archived).length} 个有效图表`}
      >
        <Link to="/charts/new" className="dc-btn dc-btn-primary">
          ＋ 新建图表
        </Link>
      </PageHeading>
      <p role="status" className="text-muted">
        {status || (typeof state?.message === 'string' ? state.message : '')}
      </p>
      <section className="dc-page-card mt-5" aria-label="图表列表">
        {data.length > 0 && (
          <input
            type="search"
            className="dc-control mb-4 sm:max-w-72"
            aria-label="搜索图表"
            placeholder="搜索图表名称"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        )}
        {charts.isLoading ? (
          <p className="text-muted">正在加载图表…</p>
        ) : visible.length ? (
          <DataTable
            headers={['图表名称', '类型', '数据来源', '引用看板', '操作']}
            rows={visible.map((chart) => [
              <strong>
                {chart.name}
                {chart.archived && <span className="dc-tag ml-2 text-muted">已归档</span>}
              </strong>,
              chartKinds[chart.kind] ?? chart.kind,
              chart.dataset,
              `${chart.referencedBy} 个`,
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="dc-btn-text"
                  onClick={() => setQuery({ view: chart.id })}
                >
                  查看
                </button>
                {canMutate(chart) ? (
                  <>
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
                      onClick={() => setQuery({ archive: chart.id })}
                    >
                      {chart.archived ? '恢复' : '归档'}
                    </button>
                  </>
                ) : (
                  <span className="text-muted">只读</span>
                )}
              </div>,
            ])}
          />
        ) : (
          <p className="text-muted">{data.length ? '没有匹配的图表。' : '暂无图表。'}</p>
        )}
      </section>
      {viewing && (
        <Dialog title="图表预览" className="dc-dialog-wide" onClose={close}>
          <div className="mt-4">
            <BoardChart chart={viewing} />
          </div>
        </Dialog>
      )}
      {archiving && (
        <Dialog title={archiving.archived ? '恢复图表' : '归档图表'} onClose={close}>
          <p className="my-4">
            {archiving.archived
              ? `恢复「${archiving.name}」后，引用它的看板会重新读取结果。`
              : `确定归档「${archiving.name}」？${
                  archiving.referencedBy > 0
                    ? `引用它的 ${archiving.referencedBy} 个看板将显示图表已归档。`
                    : ''
                }`}
          </p>
          <div className="flex justify-end gap-2">
            <button type="button" className="dc-btn" onClick={close}>
              取消
            </button>
            <button
              type="button"
              className="dc-btn"
              disabled={archive.isPending}
              onClick={() => archive.mutate({ chart: archiving, archived: !archiving.archived })}
            >
              {archive.isPending ? '保存中…' : archiving.archived ? '确认恢复' : '确认归档'}
            </button>
          </div>
        </Dialog>
      )}
    </>
  );
}
