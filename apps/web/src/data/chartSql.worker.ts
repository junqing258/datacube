import initSqlJs from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm-browser.wasm?url';
import { type CustomChart } from './customCharts';

self.onmessage = async (event: MessageEvent<string>) => {
  try {
    const { Database } = await initSqlJs({ locateFile: () => wasmUrl });
    const database = new Database();
    try {
      database.run(`
        CREATE TABLE daily_orders (day TEXT, order_count INTEGER);
        INSERT INTO daily_orders VALUES ('11-23', 120), ('11-24', 156), ('11-25', 142);
        PRAGMA query_only = ON;
      `);

      const query = event.data.trim().replace(/;\s*$/, '');
      const statement = database.prepare(`SELECT * FROM (\n${query}\n) AS chart_result LIMIT 501`);
      try {
        const columns = statement.getColumnNames().map((name) => name.toLowerCase());
        const labelIndex = columns.indexOf('label');
        const valueIndex = columns.indexOf('value');
        if (labelIndex < 0 || valueIndex < 0) {
          throw new Error('查询必须返回 label 和 value 两列。');
        }
        const coordinateColumns = ['x', 'longitude', 'latitude'] as const;
        const points: CustomChart['points'] = [];
        while (statement.step()) {
          const row = statement.get();
          const label = row[labelIndex];
          const value = row[valueIndex];
          if (
            (typeof label !== 'string' && typeof label !== 'number') ||
            !String(label).trim() ||
            typeof value !== 'number' ||
            !Number.isFinite(value)
          ) {
            throw new Error('label 必须是非空文本或数字，value 必须是有限数值。');
          }
          const point: CustomChart['points'][number] = { label: String(label), value };
          for (const column of coordinateColumns) {
            const coordinate = row[columns.indexOf(column)];
            if (typeof coordinate === 'number' && Number.isFinite(coordinate)) {
              point[column] = coordinate;
            }
          }
          points.push(point);
        }
        if (points.length > 500) throw new Error('最多预览 500 行，请缩小查询范围。');
        self.postMessage({ points });
      } finally {
        statement.free();
      }
    } finally {
      database.close();
    }
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : 'SQL 查询失败。' });
  }
};
