import { useQuery } from '@tanstack/react-query';
import { DataTable, PageHeading } from '../components/PageParts';
import { apiMessage } from '../services/api';
import { listDatasets } from '../services/platform';

const connectionKinds: Record<string, string> = {
  sqlite: 'SQLite',
  mysql: 'MySQL',
  postgresql: 'PostgreSQL',
};

export function DataSourcesPage() {
  const datasets = useQuery({ queryKey: ['datasets'], queryFn: listDatasets });

  return (
    <>
      <PageHeading title="数据接入" description="当前空间已授权的数据集目录" />
      {datasets.isLoading && <p className="mt-5 text-muted">正在加载数据源…</p>}
      {datasets.isError && (
        <p role="alert" className="mt-5 text-down">
          {apiMessage(datasets.error)}
        </p>
      )}
      {datasets.data && (
        <section className="dc-page-card mt-5" aria-label="已登记数据源">
          {!datasets.data.length && (
            <p className="text-muted">当前空间尚未登记数据集，请联系管理员接入业务库。</p>
          )}
          {datasets.data.length > 0 && (
            <DataTable
              headers={['数据集', '数据集 ID', '连接类型', '表或视图', '字段', '日期字段']}
              rows={datasets.data.map(({ id, key, name, connection, table, fields, timeField }) => [
                <div>
                  <strong>{name}</strong>
                  <p className="text-muted">{key}</p>
                </div>,
                <code className="text-xs">{id}</code>,
                connectionKinds[connection.kind] ?? connection.kind,
                <code className="text-xs">{table}</code>,
                fields.join('、'),
                timeField ?? '—',
              ])}
            />
          )}
        </section>
      )}
      <section className="dc-page-card mt-5">
        <h2>连接与凭据</h2>
        <p className="mt-2 text-muted">
          连接配置和凭据由服务端环境变量登记，页面不展示数据库地址。数据读取按空间成员与数据集授权校验；
          SQLite 文件只读打开，MySQL 和 PostgreSQL 使用业务只读账号。
        </p>
      </section>
    </>
  );
}
