import {
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  Filler,
  Legend,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
  type ChartConfiguration,
} from 'chart.js';
import { useEffect, useRef } from 'react';
import { type CustomChart } from '../data/customCharts';

Chart.register(
  BarController,
  BarElement,
  CategoryScale,
  Filler,
  Legend,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
);

const dates = ['01', '03', '05', '07', '09', '11', '13', '15', '17', '19', '22', '25'].map(
  (day) => `11/${day}`,
);
// Approximate values in 万元 read from the original demo's plotted coordinates.
const monthlySales = [3.1, 4.1, 3.6, 5.5, 5.2, 5.9, 4.1, 4.4, 3.3, 4.1, 3.1, 3.8];
const previousSales = [3.3, 4.4, 3.8, 6.4, 5.6, 7.1, 6, 7.3, 5.8, 6.9, 6.1, 7.3];

const channels = [
  { label: '微信小程序', value: 54 },
  { label: '平台电商', value: 38.7 },
  { label: '直播渠道', value: 25.6 },
  { label: '其他渠道', value: 10.3 },
];

export default function SalesChart({
  kind,
  title,
  customChart,
}: {
  kind: 'line' | 'bar';
  title: string;
  customChart?: CustomChart;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvas.current) return;

    const style = getComputedStyle(canvas.current);
    const primary = style.getPropertyValue('--chart-primary').trim();
    const muted = style.getPropertyValue('--chart-muted').trim();
    const gridColor = style.getPropertyValue('--chart-grid').trim();
    const areaColor = style.getPropertyValue('--chart-area').trim();
    const amountAxis = {
      beginAtZero: true,
      grid: { color: gridColor },
      ticks: { callback: (value: string | number) => (customChart ? value : `${value} 万`) },
    };
    const categoryAxis = { grid: { display: false } };

    const config: ChartConfiguration<'line' | 'bar'> = {
      type: kind,
      data: customChart
        ? {
            labels: customChart.points.map(({ label }) => label),
            datasets: [
              {
                label: title,
                data: customChart.points.map(({ value }) => value),
                borderColor: primary,
                backgroundColor: primary,
              },
            ],
          }
        : kind === 'line'
          ? {
              labels: dates,
              datasets: [
                {
                  label: '本月',
                  data: monthlySales,
                  borderColor: primary,
                  backgroundColor: areaColor,
                  fill: 'origin',
                  pointRadius: 0,
                },
                {
                  label: '上月同期',
                  data: previousSales,
                  borderColor: muted,
                  borderDash: [5, 5],
                  pointRadius: 0,
                },
              ],
            }
          : {
              labels: channels.map(({ label }) => label),
              datasets: [
                {
                  label: '销售额',
                  data: channels.map(({ value }) => value),
                  backgroundColor: [primary, muted, '#918982', '#b7afa7'],
                  borderRadius: 3,
                  maxBarThickness: 20,
                },
              ],
            },
      options: {
        color: muted,
        font: { family: style.fontFamily, size: 12 },
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        indexAxis: kind === 'bar' ? 'y' : 'x',
        interaction: { mode: 'index', axis: kind === 'bar' ? 'y' : 'x', intersect: false },
        scales:
          kind === 'line'
            ? { x: { ...categoryAxis, ticks: { maxTicksLimit: 6, maxRotation: 0 } }, y: amountAxis }
            : { x: amountAxis, y: categoryAxis },
        plugins: {
          legend: { display: !customChart && kind === 'line', align: 'end' },
          tooltip: {
            callbacks: {
              label: ({ dataset, raw }) =>
                customChart
                  ? `${dataset.label}：${raw}`
                  : `${dataset.label}：${Number(raw).toFixed(1)} 万元`,
            },
          },
        },
      },
    };

    const chart = new Chart(canvas.current, config);
    return () => chart.destroy();
  }, [kind, title, customChart]);

  const summary = customChart
    ? customChart.points.map(({ label, value }) => `${label} ${value}`).join('，')
    : kind === 'line'
      ? '使用 11 月 1 日至 25 日的样例数据，对比本月和上月同期销售额。'
      : channels.map(({ label, value }) => `${label} ${value.toFixed(1)} 万元`).join('，');

  return (
    <div className="dc-chart relative my-2 h-56 min-w-0 sm:h-60">
      <canvas ref={canvas} role="img" aria-label={`${title}。 ${summary}`}>
        {summary}
      </canvas>
    </div>
  );
}
