import {
  addDays,
  effectiveParameters,
  readChartSpec,
  readDisplay,
  todayInShanghai,
  type SqlChartSpec,
} from './chart-spec';

describe('readChartSpec', () => {
  it('reads a SQL spec with a window and mapping', () => {
    const spec = readChartSpec({
      source: 'sql',
      datasetId: 'cm123',
      sql: 'SELECT day AS label, net AS value FROM sales_daily',
      window: { days: 30 },
      mapping: { label: 'day', value: 'net' },
      parameters: { channel: { type: 'string', default: 'all' } },
    });
    expect(spec).toMatchObject({
      source: 'sql',
      datasetId: 'cm123',
      window: { days: 30 },
      mapping: { label: 'day', value: 'net' },
    });
  });

  it('rejects unknown sources, unsafe windows and invalid mappings', () => {
    expect(() => readChartSpec({ source: 'api' })).toThrow();
    expect(() =>
      readChartSpec({ source: 'sql', datasetId: 'x', sql: 'select 1', window: { days: 0 } }),
    ).toThrow();
    expect(() =>
      readChartSpec({
        source: 'sql',
        datasetId: 'x',
        sql: 'select 1',
        mapping: { label: 'not an identifier' },
      }),
    ).toThrow();
  });

  it('keeps JS definitions and scripts', () => {
    const spec = readChartSpec({
      source: 'js',
      datasetId: 'cm123',
      definition: '{"source":"js"}',
      scripts: { extract: 'async function extract() {}', js: 'function transform() {}' },
      refresh: { previewWindow: { startDay: '2026-11-01', endDay: '2026-11-30' } },
    });
    expect(spec.source).toBe('js');
    if (spec.source !== 'js') throw new Error('expected a JS spec');
    expect(spec.scripts.js).toContain('transform');
  });
});

describe('effectiveParameters', () => {
  const spec: SqlChartSpec = {
    source: 'sql',
    datasetId: 'cm123',
    sql: 'SELECT day AS label, net AS value FROM sales_daily WHERE day >= :startDay AND day < :endDay',
    window: { days: 30 },
  };

  it('derives a half-open window ending tomorrow in Asia/Shanghai', () => {
    const parameters = effectiveParameters(spec, undefined);
    const end = addDays(todayInShanghai(), 1);
    const start = addDays(end, -30);
    expect(parameters.startDay).toBe(start);
    expect(parameters.endDay).toBe(end);
  });

  it('accepts explicit window overrides and declared parameters', () => {
    const withChannel: SqlChartSpec = {
      ...spec,
      parameters: { channel: { type: 'string', default: 'all' } },
    };
    expect(
      effectiveParameters(withChannel, {
        startDay: '2026-10-01',
        endDay: '2026-10-31',
        channel: 'wechat',
      }),
    ).toEqual({ channel: 'wechat', startDay: '2026-10-01', endDay: '2026-10-31' });
  });

  it('rejects undeclared and mistyped parameters', () => {
    expect(() => effectiveParameters(spec, { unknown: 1 })).toThrow();
    expect(() => effectiveParameters(spec, { startDay: '2026-13-01' })).toThrow();
    expect(() =>
      effectiveParameters({ ...spec, parameters: { count: { type: 'number' } } }, { count: 'x' }),
    ).toThrow();
  });
});

describe('readDisplay', () => {
  it('validates chart kinds', () => {
    expect(readDisplay({ kind: 'bar', dataset: '销售' }, 'x')).toEqual({
      kind: 'bar',
      dataset: '销售',
    });
    expect(() => readDisplay({ kind: 'unknown' }, 'x')).toThrow();
    expect(readDisplay(undefined, 'fallback')).toEqual({ kind: 'line', dataset: '未命名数据集' });
  });
});
