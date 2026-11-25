export const chartKinds = {
  line: '折线图',
  bar: '柱状图',
  pie: '饼图',
  scatter: '散点图',
  map: '地理坐标 / 地图',
  radar: '雷达图',
  funnel: '漏斗图',
  gauge: '仪表盘',
  table: '表格',
} as const;

export interface ChartPoint {
  label: string;
  value: number;
  x?: number;
  longitude?: number;
  latitude?: number;
}

export interface CustomChart {
  id: string;
  name: string;
  kind: keyof typeof chartKinds;
  dataset: string;
  points: ChartPoint[];
}

export const chartInput = {
  scatter: { columns: ['x'], example: '门店 A, 12, 85', labels: '标签、X、Y' },
  map: {
    columns: ['longitude', 'latitude'],
    example: '上海, 121.47, 31.23, 85',
    labels: '标签、经度、纬度、数值',
  },
} as const;

export function validateChartPoints(kind: CustomChart['kind'], points: ChartPoint[]) {
  if (!points.length) return '请至少输入一行数据。';

  if (kind === 'scatter' && points.some(({ x }) => !Number.isFinite(x))) {
    return '散点图每行都需要一个有效的 X 坐标。';
  }
  if (
    kind === 'map' &&
    points.some(
      ({ longitude, latitude }) =>
        longitude === undefined ||
        latitude === undefined ||
        !Number.isFinite(longitude) ||
        !Number.isFinite(latitude) ||
        Math.abs(longitude) > 180 ||
        Math.abs(latitude) > 90,
    )
  ) {
    return '地图每行都需要有效的经纬度。经度为 −180 到 180，纬度为 −90 到 90。';
  }
  if (kind === 'radar' && points.length < 3) return '雷达图至少需要三个指标。';
  if (
    (kind === 'pie' || kind === 'radar' || kind === 'funnel') &&
    points.some(({ value }) => value < 0)
  ) {
    return '该图表的数值必须大于或等于 0。';
  }
  if ((kind === 'pie' || kind === 'funnel') && points.every(({ value }) => value === 0)) {
    return '请至少提供一个大于 0 的数值。';
  }
  if (kind === 'gauge' && (points.length !== 1 || points[0].value < 0 || points[0].value > 100)) {
    return '仪表盘需要一行数据，数值必须在 0 到 100 之间。';
  }
}
