import { type CustomChart } from './customCharts';

export const sqlChartExample =
  'SELECT day AS label, order_count AS value\nFROM daily_orders\nORDER BY day;';

export function previewSql(code: string): Promise<CustomChart['points']> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./chartSql.worker.ts', import.meta.url), { type: 'module' });
    const timeout = window.setTimeout(() => {
      worker.terminate();
      reject(new Error('SQL 查询超时，请缩小查询范围后重试。'));
    }, 5000);

    worker.onmessage = ({ data }) => {
      window.clearTimeout(timeout);
      worker.terminate();
      if ('error' in data) reject(new Error(data.error));
      else resolve(data.points);
    };
    worker.onerror = () => {
      window.clearTimeout(timeout);
      worker.terminate();
      reject(new Error('演示数据库加载失败，请重试。'));
    };
    worker.postMessage(code);
  });
}
