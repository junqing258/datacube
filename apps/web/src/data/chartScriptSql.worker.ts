import initSqlJs from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm-browser.wasm?url';
import { type ScriptBinding, type Window } from './chartScript';

self.onmessage = async ({
  data,
}: MessageEvent<{
  binding: ScriptBinding;
  range: Window;
  queryParams: Record<string, string | number>;
  tables: { name: string; fields: string[]; rows: Record<string, string | number>[] }[];
}>) => {
  const { binding, tables, range } = data;
  try {
    const query = binding.query.trim().replace(/;\s*$/, '');
    if (!/^SELECT\b/i.test(query) || query.includes(';'))
      throw new Error('请输入单条只读 SELECT。');
    const { Database } = await initSqlJs({ locateFile: () => wasmUrl });
    const db = new Database();
    try {
      for (const { name, fields, rows } of tables) {
        db.run(
          `CREATE TABLE ${name} (${fields.map((field) => `${field} ${field === 'day' ? 'TEXT' : 'REAL'}`).join(', ')})`,
        );
        const placeholders = fields.map(() => '?').join(', ');
        for (const row of rows) {
          db.run(
            `INSERT INTO ${name} VALUES (${placeholders})`,
            fields.map((field) => row[field]),
          );
        }
      }
      db.run('PRAGMA query_only = ON');
      const statement = db.prepare(query);
      try {
        const columns = statement.getColumnNames();
        if (
          new Set(columns).size !== columns.length ||
          binding.fields.some((field) => !columns.includes(field))
        ) {
          throw new Error('查询结果缺少所选列，请核对 SELECT 别名。');
        }
        const parameters = [
          ...new Set(
            statement
              .getSQL()
              .match(
                /--[^\n]*|\/\*[\s\S]*?\*\/|'(?:''|[^'])*'|"(?:""|[^"])*"|`(?:``|[^`])*`|\[[^\]]*\]|([:@$][A-Za-z_]\w*|\?\d*)/g,
              )
              ?.filter((token) => /^[:@$?]/.test(token)) ?? [],
          ),
        ];
        const start = `:${binding.startParameter}`;
        const end = `:${binding.endParameter}`;
        const valuesToBind = {
          ...data.queryParams,
          ...(binding.useWindow ? { [start]: range.startDay, [end]: range.endDay } : {}),
        };
        if (
          parameters.length !== Object.keys(valuesToBind).length ||
          parameters.some((parameter) => !Object.hasOwn(valuesToBind, parameter))
        ) {
          throw new Error('SQL 命名参数须匹配声明及日期窗口。');
        }
        statement.bind(valuesToBind);
        const result = [];
        while (statement.step()) {
          const values = statement.get();
          result.push(
            Object.fromEntries(
              binding.fields.map((field) => {
                const value = values[columns.indexOf(field)];
                if (value instanceof Uint8Array)
                  throw new Error(`字段 ${field} 须返回 JSON 标量。`);
                return [field, value];
              }),
            ),
          );
          if (result.length > 10000) break;
        }
        self.postMessage({ rows: result });
      } finally {
        statement.free();
      }
    } finally {
      db.close();
    }
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : 'SQL 查询失败。' });
  }
};
