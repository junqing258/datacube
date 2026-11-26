import { readChartData } from '../services/chartData';
import { type ChartPoint } from './customCharts';

export const sqlChartExample =
  'SELECT day AS label, order_count AS value\nFROM your_order_summary\nORDER BY day;';

export async function previewSql(dataset: string, query: string, signal: AbortSignal) {
  const { columns, rows } = await readChartData({ dataset, query, mode: 'sql' }, signal);
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
