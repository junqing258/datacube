import { readChartData } from '../services/chartData';
import { type ChartPoint } from './customCharts';

export const sqlChartExample =
  'SELECT day AS label, net_amount AS value\nFROM sales_daily\nWHERE day >= :startDay AND day < :endDay\nORDER BY day;';

function previewWindow() {
  const end = new Date();
  end.setUTCDate(end.getUTCDate() + 1);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 30);
  return {
    startDay: start.toISOString().slice(0, 10),
    endDay: end.toISOString().slice(0, 10),
  };
}

export async function previewSql(dataset: string, query: string, signal: AbortSignal) {
  const params = /:\s*startDay/.test(query) || /:\s*endDay/.test(query) ? previewWindow() : {};
  const { columns, rows } = await readChartData({ dataset, query, mode: 'sql', params }, signal);
  if (!columns.includes('label') || !columns.includes('value')) {
    throw new Error('查询必须返回 label 和 value 两列。');
  }
  return rows.map(({ label, value, x, longitude, latitude }) => {
    if (
      (typeof label !== 'string' && typeof label !== 'number') ||
      !String(label).trim() ||
      (value !== null && typeof value !== 'number')
    ) {
      throw new Error('label 须为非空文本或数字，value 须为有限数值或 null。');
    }
    const point: ChartPoint = { label: String(label), value };
    if (typeof x === 'number') point.x = x;
    if (typeof longitude === 'number') point.longitude = longitude;
    if (typeof latitude === 'number') point.latitude = latitude;
    return point;
  });
}
