import { DatabaseSync } from 'node:sqlite';

export type SqliteRequest = {
  filename: string;
  sql: string;
  values: (string | number | boolean | null)[];
};
export type SqliteResult = { columns: string[]; rows: unknown[][] };

process.once('message', ({ filename, sql, values }: SqliteRequest) => {
  try {
    const database = new DatabaseSync(filename, { readOnly: true, allowExtension: false });
    try {
      database.exec('PRAGMA query_only = ON');
      const statement = database.prepare(sql);
      if (statement.sourceSQL !== sql) throw new Error('请输入单条查询。');
      statement.setReturnArrays(true);
      statement.setReadBigInts(true);
      const columns = statement.columns().map(({ name }) => name);
      const args = values.map((value) => (typeof value === 'boolean' ? Number(value) : value));
      const rows = [];
      let bytes = 0;
      for (const raw of statement.iterate(...args)) {
        const row = (raw as unknown as unknown[]).map((value) => {
          if (typeof value !== 'bigint') return value;
          const number = Number(value);
          return Number.isSafeInteger(number) ? number : value.toString();
        });
        bytes += Buffer.byteLength(JSON.stringify(row));
        if (bytes > 10 * 1024 * 1024) throw new Error('SQLite 结果超过 10 MiB。');
        rows.push(row);
      }
      process.send?.({ columns, rows });
    } finally {
      database.close();
    }
  } catch {
    process.send?.(null);
  } finally {
    process.disconnect?.();
  }
});
