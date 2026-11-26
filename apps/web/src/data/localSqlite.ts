import type { ChartPoint } from './customCharts';

export interface LocalSqliteSource {
  id: string;
  name: string;
  fileName: string;
  checkedAt: number;
}

type StoredSource = LocalSqliteSource & { file: File };

export const localSqliteSourcesKey = ['local-sqlite-sources'] as const;
export const sqlitePreviewLimit = 20;

async function withSourceStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('datacube-local-sqlite', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('sources', { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('无法打开浏览器中的 SQLite 数据源。'));
  });
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction('sources', mode);
      transaction.onabort = () => reject(new Error('无法读写浏览器中的 SQLite 数据源。'));
      const request = run(transaction.objectStore('sources'));
      transaction.oncomplete = () => resolve(request.result);
    });
  } finally {
    db.close();
  }
}

export async function listLocalSqliteSources(): Promise<LocalSqliteSource[]> {
  const sources: StoredSource[] = await withSourceStore('readonly', (store) => store.getAll());
  return sources
    .map(({ id, name, fileName, checkedAt }) => ({ id, name, fileName, checkedAt }))
    .sort((left, right) => right.checkedAt - left.checkedAt);
}

export async function readLocalSqliteFile(id: string): Promise<File> {
  const source: StoredSource | undefined = await withSourceStore('readonly', (store) => store.get(id));
  if (!source) throw new Error('本地 SQLite 数据源已不可用，请重新选择数据源。');
  return source.file;
}

export async function saveLocalSqliteSource(source: StoredSource): Promise<void> {
  await withSourceStore('readwrite', (store) => store.put(source));
}

export interface SqliteTable {
  name: string;
  type: 'table' | 'view';
}

export interface SqliteTablePreview {
  columns: string[];
  rows: string[][];
  truncated: boolean;
}

type SqliteJobs = {
  inspect: { input: { file: File }; result: SqliteTable[] };
  table: { input: { file: File; table: string }; result: SqliteTablePreview };
  chart: { input: { file?: File; sql: string }; result: ChartPoint[] };
};

export type SqliteJob = {
  [K in keyof SqliteJobs]: { kind: K } & SqliteJobs[K]['input'];
}[keyof SqliteJobs];

export function runSqlite<J extends SqliteJob>(
  job: J,
  signal?: AbortSignal,
): Promise<SqliteJobs[J['kind']]['result']> {
  return new Promise((resolve, reject) => {
    signal?.throwIfAborted();
    const worker = new Worker(new URL('./sqlite.worker.ts', import.meta.url), { type: 'module' });
    const timeout = window.setTimeout(() => {
      close();
      reject(new Error('SQLite 读取超时，请缩小文件或查询范围后重试。'));
    }, 5000);

    function abort() {
      close();
      reject(signal?.reason);
    }

    function close() {
      window.clearTimeout(timeout);
      signal?.removeEventListener('abort', abort);
      worker.terminate();
    }

    signal?.addEventListener('abort', abort, { once: true });
    worker.onmessage = ({ data }) => {
      close();
      if ('error' in data) reject(new Error(data.error));
      else resolve(data.result);
    };
    worker.onerror = () => {
      close();
      reject(new Error('SQLite 加载失败，请重试。'));
    };
    worker.postMessage(job);
  });
}
