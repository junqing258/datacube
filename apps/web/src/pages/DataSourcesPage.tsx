import { useEffect, useState } from 'react';
import { DataTable, PageHeading } from '../components/PageParts';
import {
  connectChartData,
  listChartDataSources,
  type ChartDataSource,
} from '../services/chartData';

const connectionKinds = { sqlite: 'SQLite', mysql: 'MySQL', postgresql: 'PostgreSQL' };

export function DataSourcesPage() {
  const [sources, setSources] = useState<ChartDataSource[]>([]);
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const request = new AbortController();
    listChartDataSources(undefined, request.signal)
      .then(setSources)
      .catch((error: unknown) => {
        if (!request.signal.aborted) {
          setError(error instanceof Error ? error.message : '无法读取数据源。');
        }
      });
    return () => request.abort();
  }, []);

  async function connect() {
    setBusy(true);
    setError('');
    try {
      setSources(await connectChartData(token.trim()));
      setToken('');
    } catch (error) {
      setError(error instanceof Error ? error.message : '无法读取数据源。');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeading title="数据接入" />
      <section className="dc-page-card mt-5">
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!busy && token.trim()) void connect();
          }}
        >
          <label className="dc-field">
            图表数据访问令牌
            <input
              className="dc-control"
              type="password"
              autoComplete="off"
              value={token}
              onChange={(event) => setToken(event.target.value)}
            />
          </label>
          <button className="dc-btn dc-btn-primary" disabled={busy || !token.trim()}>
            {busy ? '验证中…' : '验证令牌'}
          </button>
        </form>
        {error && (
          <p role="status" className="mt-3 text-muted">
            {error}
          </p>
        )}
      </section>
      {sources.length > 0 && (
        <section className="dc-page-card mt-5" aria-label="已登记数据源">
          <DataTable
            headers={['数据源', '类型', '标识', '表或视图', '字段', '日期字段']}
            rows={sources.map(({ id, name, kind, table, fields, timeField }) => [
              name,
              connectionKinds[kind],
              id,
              table,
              fields.join('、'),
              timeField ?? '—',
            ])}
          />
        </section>
      )}
    </>
  );
}
