import { type CustomChart } from './customCharts';

const warehousePath = '/api/inventory/warehouse-summary';
const warehousePoints = [
  { label: '华东仓', value: 860, x: 5, longitude: 121.47, latitude: 31.23 },
  { label: '华南仓', value: 640, x: 3, longitude: 113.26, latitude: 23.13 },
  { label: '华北仓', value: 420, x: 2, longitude: 116.41, latitude: 39.9 },
];

export const chartCodeExamples = {
  sql: {
    dataset: 'SQL · ERP 经营数据',
    code: 'SELECT day AS label, order_count AS value\nFROM daily_orders\nORDER BY day;',
  },
  api: {
    dataset: 'API · WMS 与平台接口',
    code: JSON.stringify({ method: 'GET', path: warehousePath, warehouse: '' }, null, 2),
  },
};

export function previewApi(code: string): CustomChart['points'] {
  const request = JSON.parse(code);
  if (request?.method !== 'GET' || request?.path !== warehousePath) {
    throw new Error(`演示接口为 GET ${warehousePath}。`);
  }
  if (request.warehouse === undefined || request.warehouse === '') return warehousePoints;
  if (typeof request.warehouse !== 'string') throw new Error('warehouse 必须是字符串。');
  return warehousePoints.filter(({ label }) => label === request.warehouse);
}

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
