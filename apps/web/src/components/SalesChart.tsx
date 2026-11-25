import {
  BarChart,
  FunnelChart,
  GaugeChart,
  LineChart,
  PieChart,
  RadarChart,
  ScatterChart,
  type BarSeriesOption,
  type FunnelSeriesOption,
  type GaugeSeriesOption,
  type LineSeriesOption,
  type PieSeriesOption,
  type RadarSeriesOption,
  type ScatterSeriesOption,
} from 'echarts/charts';
import {
  GeoComponent,
  GridComponent,
  RadarComponent,
  LegendComponent,
  TooltipComponent,
  type GeoComponentOption,
  type GridComponentOption,
  type RadarComponentOption,
  type LegendComponentOption,
  type TooltipComponentOption,
} from 'echarts/components';
import { getMap, init, registerMap, use, type ComposeOption } from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { useEffect, useRef, useState } from 'react';
import { type CustomChart } from '../data/customCharts';

use([
  BarChart,
  FunnelChart,
  GaugeChart,
  LineChart,
  PieChart,
  RadarChart,
  ScatterChart,
  GeoComponent,
  GridComponent,
  LegendComponent,
  RadarComponent,
  TooltipComponent,
  CanvasRenderer,
]);

type ChartOption = ComposeOption<
  | BarSeriesOption
  | LineSeriesOption
  | FunnelSeriesOption
  | GaugeSeriesOption
  | PieSeriesOption
  | RadarSeriesOption
  | ScatterSeriesOption
  | GeoComponentOption
  | GridComponentOption
  | RadarComponentOption
  | LegendComponentOption
  | TooltipComponentOption
>;

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

const worldMap = 'datacube-world-land';

function customChartOption(
  { kind, name, points }: CustomChart,
  {
    primary,
    muted,
    gridColor,
    areaColor,
  }: Record<'primary' | 'muted' | 'gridColor' | 'areaColor', string>,
): ChartOption {
  const data = points.map(({ label, value }) => ({ name: label, value }));
  switch (kind) {
    case 'pie':
      return { series: { type: 'pie', name, radius: '65%', data, avoidLabelOverlap: true } };
    case 'funnel':
      return {
        series: {
          type: 'funnel',
          name,
          sort: 'none',
          max: points.reduce((max, point) => Math.max(max, point.value), 0),
          minSize: '0%',
          gap: 3,
          label: { position: 'inside' },
          data,
        },
      };
    case 'scatter': {
      const axis = {
        type: 'value' as const,
        scale: true,
        axisLabel: { color: muted },
        splitLine: { lineStyle: { color: gridColor } },
      };
      return {
        grid: { top: 18, bottom: 22, left: 8, right: 24 },
        xAxis: { ...axis, name: 'X' },
        yAxis: { ...axis, name: 'Y' },
        series: {
          type: 'scatter',
          name,
          dimensions: ['X', 'Y'],
          data: points.map(({ label, x, value }) => ({ name: label, value: [x ?? 0, value] })),
        },
      };
    }
    case 'map':
      return {
        geo: {
          map: worldMap,
          roam: true,
          silent: false,
          tooltip: { show: false },
          itemStyle: { areaColor, borderColor: gridColor },
          emphasis: { disabled: true },
        },
        series: {
          type: 'scatter',
          name,
          coordinateSystem: 'geo',
          dimensions: ['经度', '纬度', '数值'],
          data: points.map(({ label, longitude, latitude, value }) => ({
            name: label,
            value: [longitude ?? 0, latitude ?? 0, value],
          })),
        },
      };
    case 'radar': {
      const max = points.reduce((max, point) => Math.max(max, point.value), 1);
      return {
        radar: {
          radius: '60%',
          indicator: points.map(({ label }) => ({ name: label, max })),
          axisName: { color: muted },
        },
        series: {
          type: 'radar',
          name,
          data: [{ name, value: points.map(({ value }) => value) }],
          areaStyle: { opacity: 0.15 },
        },
      };
    }
    case 'gauge':
      return {
        series: {
          type: 'gauge',
          name,
          min: 0,
          max: 100,
          radius: '88%',
          progress: { show: true },
          axisLine: { lineStyle: { width: 10, color: [[1, gridColor]] } },
          axisLabel: { color: muted, fontSize: 10, distance: 12 },
          itemStyle: { color: primary },
          title: { color: muted, offsetCenter: [0, '70%'] },
          detail: { formatter: '{value}%', fontSize: 20, color: primary },
          data,
        },
      };
    default:
      return {};
  }
}

export default function SalesChart({
  kind,
  title,
  customChart,
}: {
  kind: Exclude<CustomChart['kind'], 'table'>;
  title: string;
  customChart?: CustomChart;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [mapError, setMapError] = useState(false);

  useEffect(() => {
    const element = container.current;
    if (!element) return;

    const style = getComputedStyle(element);
    const primary = style.getPropertyValue('--chart-primary').trim();
    const muted = style.getPropertyValue('--chart-muted').trim();
    const gridColor = style.getPropertyValue('--chart-grid').trim();
    const areaColor = style.getPropertyValue('--chart-area').trim();
    const isBar = kind === 'bar';
    const isCartesian = kind === 'line' || isBar;
    const showLegend = !customChart && kind === 'line';
    const points = customChart?.points ?? channels;
    const labels = showLegend ? dates : points.map(({ label }) => label);
    const amountAxis = {
      type: 'value' as const,
      axisLabel: { color: muted, formatter: customChart ? '{value}' : '{value} 万' },
      splitLine: { show: true, lineStyle: { color: gridColor } },
    };
    const categoryAxis = {
      type: 'category' as const,
      data: labels,
      inverse: isBar,
      boundaryGap: isBar,
      axisLabel: { color: muted, hideOverlap: true },
      axisLine: { lineStyle: { color: gridColor } },
      axisTick: { show: false },
      splitLine: { show: false },
    };

    let series: ChartOption['series'];
    if (isBar) {
      const channelColors = [primary, muted, '#918982', '#b7afa7'];
      series = {
        type: 'bar',
        name: customChart ? title : '销售额',
        data: points.map(({ value }, index) => ({
          value,
          itemStyle: { color: customChart ? primary : channelColors[index] },
        })),
        barMaxWidth: 20,
        itemStyle: { borderRadius: 3 },
      };
    } else if (kind === 'line' && customChart) {
      series = {
        type: 'line',
        name: title,
        data: customChart.points.map(({ value }) => value),
        itemStyle: { color: primary },
      };
    } else if (kind === 'line') {
      series = [
        {
          type: 'line',
          name: '本月',
          data: monthlySales,
          showSymbol: false,
          itemStyle: { color: primary },
          areaStyle: { color: areaColor, opacity: 1 },
        },
        {
          type: 'line',
          name: '上月同期',
          data: previousSales,
          showSymbol: false,
          itemStyle: { color: muted },
          lineStyle: { type: 'dashed' },
        },
      ];
    }

    const cartesianOption: ChartOption = {
      grid: { top: showLegend ? 32 : 8, bottom: 8, left: 8, right: 16 },
      legend: { show: showLegend, right: 8, textStyle: { color: muted } },
      tooltip: {
        trigger: 'axis',
        axisPointer: { axis: isBar ? 'y' : 'x' },
        confine: true,
        valueFormatter: (value) =>
          customChart ? String(value) : `${Number(value).toFixed(1)} 万元`,
      },
      xAxis: isBar ? amountAxis : categoryAxis,
      yAxis: isBar ? categoryAxis : amountAxis,
      series,
    };

    const option: ChartOption = {
      animation: false,
      color: [primary, '#4e79a7', '#3d8870', '#ad6a26', '#8d6da7', muted],
      textStyle: { color: muted, fontFamily: style.fontFamily, fontSize: 12 },
      tooltip: { trigger: 'item', confine: true },
      ...(isCartesian || !customChart
        ? cartesianOption
        : customChartOption(customChart, { primary, muted, gridColor, areaColor })),
    };

    let cancelled = false;
    let chart: ReturnType<typeof init> | undefined;
    const observer = new ResizeObserver(() => chart?.resize());

    function render(target: HTMLDivElement) {
      if (cancelled) return;
      chart = init(target);
      chart.setOption(option);
      observer.observe(target);
    }

    if (kind === 'map' && !getMap(worldMap)) {
      void import('../data/maps/world-land.json')
        .then(({ default: land }) => {
          if (cancelled) return;
          // Natural Earth 1:110m physical land polygons, v5.1.2.
          if (!getMap(worldMap)) registerMap(worldMap, JSON.stringify(land));
          render(element);
        })
        .catch(() => {
          if (!cancelled) setMapError(true);
        });
    } else {
      render(element);
    }

    return () => {
      cancelled = true;
      observer.disconnect();
      chart?.dispose();
    };
  }, [kind, title, customChart]);

  const summary = customChart
    ? customChart.points.map(({ label, value }) => `${label} ${value}`).join('，')
    : kind === 'line'
      ? '使用 11 月 1 日至 25 日的样例数据，对比本月和上月同期销售额。'
      : channels.map(({ label, value }) => `${label} ${value.toFixed(1)} 万元`).join('，');

  return (
    <div
      ref={container}
      className="dc-chart relative my-2 h-56 min-w-0 sm:h-60"
      role="img"
      aria-label={`${title}。 ${summary}`}
    >
      {kind === 'map' && mapError && <p role="status">世界底图加载失败。</p>}
    </div>
  );
}
