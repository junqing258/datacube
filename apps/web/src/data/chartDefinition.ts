import { javascriptLanguage } from '@codemirror/lang-javascript';
import { jsonLanguage } from '@codemirror/lang-json';
import { sqlChartExample } from './chartCode';
import {
  identifier,
  isRecord,
  mappingColumns,
  readBinding,
  scriptDatasets,
  sqlIdentifier,
  validDay,
  type EtlConfig,
  type FieldType,
  type ScriptDraft,
} from './chartScript';
import { chartKinds, type CustomChart } from './customCharts';

type ChartMetadata = Pick<CustomChart, 'name' | 'kind' | 'dataset'>;
type Refresh = Pick<ScriptDraft, 'previewWindow' | 'refreshWindow' | 'intervalMinutes'>;
type JsDefinition = ChartMetadata &
  Pick<EtlConfig, 'load' | 'mapping'> & {
    schemaVersion: 1;
    source: 'js';
    refresh: Refresh;
  };
type ChartDefinition = JsDefinition | (ChartMetadata & { source: 'sql' });
const fieldTypes = new Set<unknown>(['string', 'number', 'boolean', 'date']);

function readObject(value: unknown, path: string, allowed: string[]) {
  if (!isRecord(value)) throw new Error(`${path} 须为对象。`);
  const extra = Object.keys(value).find((key) => !allowed.includes(key));
  if (extra !== undefined) throw new Error(`${path}.${extra} 是未知字段。`);
  return value;
}

function identifiers(value: unknown, path: string, allowEmpty = false): string[] {
  if (
    !Array.isArray(value) ||
    (!allowEmpty && !value.length) ||
    value.some((key) => typeof key !== 'string' || !identifier.test(key)) ||
    new Set(value).size !== value.length
  ) {
    throw new Error(`${path} 须为无重复的${allowEmpty ? '' : '非空'}标识符数组。`);
  }
  return value as string[];
}

function readWindow(value: unknown, path: string) {
  const { startDay, endDay } = readObject(value, path, ['startDay', 'endDay']);
  if (!validDay(startDay) || !validDay(endDay) || startDay >= endDay) {
    throw new Error(`${path} 须为有效日期，startDay 早于 endDay。`);
  }
  return { startDay, endDay };
}

function readExtract(value: unknown): EtlConfig['extract'] {
  const { bindings, outputs } = readObject(value, 'extractConfig', ['bindings', 'outputs']);
  if (!Array.isArray(bindings) || bindings.length > 5) {
    throw new Error('extractConfig.bindings 须为数组，最多 5 个数据源。');
  }
  const sources = bindings.map((input, index) => {
    const path = `extractConfig.bindings[${index}]`;
    const item = readObject(input, path, [
      'alias',
      'dataset',
      'mode',
      'fields',
      'useWindow',
      ...(isRecord(input) && input.mode === 'sql'
        ? ['query', 'startParameter', 'endParameter', 'parameters']
        : ['filterFields']),
    ]);
    let binding;
    try {
      binding = readBinding(item);
    } catch (error) {
      throw new Error(`${path} · ${(error as Error).message}`);
    }
    identifiers(binding.fields, `${path}.fields`);
    if (binding.mode === 'dataset') {
      const filterFields = identifiers(
        item.filterFields === undefined ? [] : item.filterFields,
        `${path}.filterFields`,
        true,
      );
      const available: readonly string[] = scriptDatasets[binding.dataset].fields;
      if ([...binding.fields, ...filterFields].some((field) => !available.includes(field))) {
        throw new Error(`${path} 包含未登记的数据集字段。`);
      }
      return { ...binding, filterFields };
    }
    if (!binding.query.trim() || !scriptDatasets[binding.dataset].connection) {
      throw new Error(`${path} 须指定数据库数据集及 SQL 查询。`);
    }
    if (binding.useWindow) {
      if (
        !sqlIdentifier.test(binding.startParameter) ||
        !sqlIdentifier.test(binding.endParameter) ||
        binding.startParameter === binding.endParameter
      ) {
        throw new Error(`${path} 须配置两个不同的日期参数。`);
      }
    } else if (Object.hasOwn(item, 'startParameter') || Object.hasOwn(item, 'endParameter')) {
      throw new Error(`${path} 启用日期窗口后才可设置日期参数。`);
    }
    const parameters = item.parameters === undefined ? {} : item.parameters;
    if (
      !isRecord(parameters) ||
      Object.entries(parameters).some(
        ([name, type]) =>
          !sqlIdentifier.test(name) ||
          !fieldTypes.has(type) ||
          (binding.useWindow && [binding.startParameter, binding.endParameter].includes(name)),
      )
    ) {
      throw new Error(`${path}.parameters 须为参数名到类型的映射，且不能与日期参数重名。`);
    }
    return { ...binding, parameters: parameters as Record<string, FieldType> };
  });
  identifiers(
    sources.map(({ alias }) => alias),
    'extractConfig.bindings 的别名',
    true,
  );
  if (!isRecord(outputs)) throw new Error('extractConfig.outputs 须为别名到字段数组的对象。');
  identifiers(Object.keys(outputs), 'extractConfig.outputs 的别名', true);
  return {
    bindings: sources,
    outputs: Object.fromEntries(
      Object.entries(outputs).map(([alias, fields]) => [
        alias,
        identifiers(fields, `extractConfig.outputs.${alias}`),
      ]),
    ),
  };
}

function readLoad(value: unknown): EtlConfig['load'] {
  const load = readObject(value, 'load', ['fields', 'rowKey']);
  if (!isRecord(load.fields)) throw new Error('load.fields 须为字段定义对象。');
  identifiers(Object.keys(load.fields), 'load.fields 的字段名');
  const fields = Object.fromEntries(
    Object.entries(load.fields).map(([field, entry]) => {
      const path = `load.fields.${field}`;
      const { type, nullable = false } = readObject(entry, path, ['type', 'nullable']);
      if (!fieldTypes.has(type) || typeof nullable !== 'boolean') {
        throw new Error(`${path} 须声明有效的 type 和可选布尔值 nullable。`);
      }
      return [field, { type: type as FieldType, nullable }];
    }),
  );
  const rowKey = identifiers(load.rowKey, 'load.rowKey');
  if (rowKey.some((field) => !Object.hasOwn(fields, field) || fields[field].nullable)) {
    throw new Error('load.rowKey 每一项须引用已声明且不可空的字段。');
  }
  return { fields, rowKey };
}

function readMapping(
  value: unknown,
  kind: ChartMetadata['kind'],
  fields: EtlConfig['load']['fields'],
) {
  const required = mappingColumns(kind);
  const mapping = readObject(value, 'mapping', [...required, 'warehouse']);
  for (const column of [
    ...required,
    ...(Object.hasOwn(mapping, 'warehouse') ? ['warehouse'] : []),
  ]) {
    const field = mapping[column];
    if (typeof field !== 'string' || !Object.hasOwn(fields, field)) {
      throw new Error(`mapping.${column} 须引用 load.fields 中声明的字段。`);
    }
    const { type, nullable } = fields[field];
    const types =
      column === 'label'
        ? ['string', 'number', 'date']
        : column === 'warehouse'
          ? ['string']
          : ['number'];
    const acceptsNull =
      column === 'warehouse' || (column === 'value' && ['line', 'bar', 'table'].includes(kind));
    if (!types.includes(type) || (nullable && !acceptsNull)) {
      throw new Error(`mapping.${column} 引用的字段类型或可空性不符合图表要求。`);
    }
  }
  return mapping as EtlConfig['mapping'];
}

function parseJsonObject(code: string, file: string) {
  let value: unknown;
  try {
    value = JSON.parse(code);
  } catch {
    throw new Error(`${file} 必须是有效的 JSON。`);
  }
  if (!isRecord(value)) throw new Error(`${file} 必须是 JSON 对象。`);
  return value;
}

function rejectDuplicateKeys(code: string, file: string) {
  jsonLanguage.parser.parse(code).iterate({
    enter(node) {
      if (node.name !== 'Object') return;
      const keys = new Set<string>();
      for (const property of node.node.getChildren('Property')) {
        const key = property.getChild('PropertyName');
        if (!key) continue;
        const name: string = JSON.parse(code.slice(key.from, key.to));
        if (keys.has(name)) {
          const line = code.slice(0, key.from).split('\n').length;
          throw new Error(`${file} 第 ${line} 行的键 ${name} 重复。`);
        }
        keys.add(name);
      }
    },
  });
}

export function parseChartDefinition(code: string): ChartDefinition {
  const value = parseJsonObject(code, 'definition.json');
  const { name, kind, source, dataset } = value;
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 80) {
    throw new Error('name 须为 1 至 80 个字符。');
  }
  if (typeof kind !== 'string' || !Object.hasOwn(chartKinds, kind)) {
    throw new Error(`kind 须为 ${Object.keys(chartKinds).join('、')} 之一。`);
  }
  if (source !== 'js' && source !== 'sql') throw new Error('source 须为 js 或 sql。');
  if (dataset !== undefined && (typeof dataset !== 'string' || dataset.trim().length > 120)) {
    throw new Error('dataset 须为不超过 120 个字符的文本。');
  }
  const metadata: ChartMetadata = {
    name: name.trim(),
    kind: kind as ChartMetadata['kind'],
    dataset: dataset?.trim() || (source === 'js' ? 'JS 脚本 · 派生数据集' : 'SQL · ERP 经营数据'),
  };
  if (source === 'sql') return { ...metadata, source };
  rejectDuplicateKeys(code, 'definition.json');

  readObject(value, 'definition.json', [
    'schemaVersion',
    'name',
    'kind',
    'source',
    'dataset',
    'load',
    'mapping',
    'refresh',
  ]);
  if (value.schemaVersion !== 1) throw new Error('schemaVersion 须为 1。');
  const {
    previewWindow,
    refreshWindow,
    intervalMinutes = 0,
  } = readObject(value.refresh, 'refresh', ['previewWindow', 'refreshWindow', 'intervalMinutes']);
  if (
    typeof intervalMinutes !== 'number' ||
    !Number.isInteger(intervalMinutes) ||
    intervalMinutes < 0 ||
    intervalMinutes > 525600
  ) {
    throw new Error('refresh.intervalMinutes 须为 0 至 525600 的整数。');
  }
  const load = readLoad(value.load);
  return {
    ...metadata,
    schemaVersion: 1,
    source,
    load,
    mapping: readMapping(value.mapping, metadata.kind, load.fields),
    refresh: {
      previewWindow: readWindow(previewWindow, 'refresh.previewWindow'),
      refreshWindow: readWindow(refreshWindow, 'refresh.refreshWindow'),
      intervalMinutes,
    },
  };
}

function parseScriptEntry(code: string, entry: 'extract' | 'transform') {
  const tree = javascriptLanguage.parser.parse(code);
  tree.iterate({
    enter(node) {
      if (node.type.isError) {
        const line = code.slice(0, node.from).split('\n').length;
        throw new Error(`${entry}.js 第 ${line} 行附近存在语法错误。`);
      }
    },
  });
  const declarations = tree.topNode.getChildren('FunctionDeclaration').filter((node) => {
    const name = node.getChild('VariableDefinition');
    return name && code.slice(name.from, name.to) === entry;
  });
  const [declaration] = declarations;
  if (
    declarations.length !== 1 ||
    Boolean(declaration.getChild('async')) !== (entry === 'extract') ||
    declaration.getChild('Star')
  ) {
    throw new Error(`${entry}.js 须声明 ${entry === 'extract' ? 'async ' : ''}function ${entry}。`);
  }
  return tree.topNode;
}

export function validateTransform(code: string) {
  parseScriptEntry(code, 'transform');
}

export function parseExtractScript(code: string) {
  const root = parseScriptEntry(code, 'extract');
  const declarations = findDeclarations(code, root, 'extractConfig');
  const [declaration] = declarations;
  const value = declaration?.getChild('ObjectExpression');
  if (
    declarations.length !== 1 ||
    !declaration.getChild('const') ||
    !value ||
    declaration.getChildren('VariableDefinition').length !== 1
  ) {
    throw new Error('extract.js 须在顶层声明 const extractConfig = { bindings, outputs }。');
  }
  try {
    return readExtract(readLiteral(code, value));
  } catch (error) {
    throw new Error(`extract.js · ${error instanceof Error ? error.message : '配置无效。'}`);
  }
}

const exampleRefresh: Refresh = {
  previewWindow: { startDay: '2026-11-23', endDay: '2026-11-27' },
  refreshWindow: { startDay: '2026-11-23', endDay: '2026-11-27' },
  intervalMinutes: 0,
};
const exampleEtl = {
  load: {
    fields: {
      day: { type: 'date' },
      revenue: { type: 'number', nullable: true },
      cost: { type: 'number', nullable: true },
      roas: { type: 'number', nullable: true },
    },
    rowKey: ['day'],
  },
  mapping: { label: 'day', value: 'roas' },
};
const exampleExtract = `const extractConfig = {
  bindings: [
    {
      alias: 'orders',
      dataset: 'daily_orders',
      mode: 'sql',
      fields: ['day', 'amount'],
      query: \`SELECT day, SUM(attributed_amount) AS amount
FROM daily_orders
WHERE day >= :startDay AND day < :endDay
GROUP BY day\`,
    },
    { alias: 'ads', dataset: 'daily_ads', fields: ['day', 'cost'] },
  ],
  outputs: { orders: ['day', 'amount'], ads: ['day', 'cost'] },
};

async function extract({ read }) {
  const [orders, ads] = await Promise.all([read('orders'), read('ads')]);
  return { orders, ads };
}`;
const exampleTransform = `function indexByDay(rows, field) {
  const values = new Map();
  for (const row of rows) {
    if (values.has(row.day)) throw new Error('输入在同一业务日出现多行。');
    values.set(row.day, row[field]);
  }
  return values;
}

function transform({ inputs }) {
  const sales = indexByDay(inputs.orders, 'amount');
  const spend = indexByDay(inputs.ads, 'cost');
  const days = [...new Set([...sales.keys(), ...spend.keys()])].sort();

  return days.map((day) => {
    const revenue = sales.get(day) ?? null;
    const cost = spend.get(day) ?? null;
    return {
      day,
      revenue,
      cost,
      roas: revenue !== null && cost !== null && cost > 0 ? revenue / cost : null,
    };
  });
}`;

type Node = ReturnType<typeof javascriptLanguage.parser.parse>['topNode'];

function syntaxChildren(node: Node) {
  const children: Node[] = [];
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (child.name !== 'LineComment' && child.name !== 'BlockComment') children.push(child);
  }
  return children;
}

function readLiteral(code: string, node: Node): unknown {
  const text = code.slice(node.from, node.to);
  switch (node.name) {
    case 'ObjectExpression': {
      const result: Record<string, unknown> = Object.create(null);
      for (const property of syntaxChildren(node)) {
        if (['{', '}', ','].includes(property.name)) continue;
        const [key, colon, value, ...extra] = syntaxChildren(property);
        if (
          property.name !== 'Property' ||
          !key ||
          colon?.name !== ':' ||
          !value ||
          extra.length ||
          !['PropertyDefinition', 'String'].includes(key.name)
        ) {
          throw new Error('配置对象须使用静态属性。');
        }
        const name =
          key.name === 'String'
            ? readStringLiteral(code.slice(key.from, key.to))
            : code.slice(key.from, key.to);
        if (name === '__proto__' || Object.hasOwn(result, name)) {
          throw new Error(`配置属性 ${name} 重复或无效。`);
        }
        result[name] = readLiteral(code, value);
      }
      return result;
    }
    case 'ArrayExpression': {
      const items = syntaxChildren(node).slice(1, -1);
      if (items.some((item, index) => (index % 2 === 1) !== (item.name === ','))) {
        throw new Error('配置数组不能包含空元素。');
      }
      return items.filter((_, index) => index % 2 === 0).map((item) => readLiteral(code, item));
    }
    case 'TemplateString':
      if (node.getChild('Interpolation')) throw new Error('配置字符串不支持模板插值。');
      return readStringLiteral(text.replace(/\r\n?/g, '\n'));
    case 'String':
      return readStringLiteral(text);
    case 'BooleanLiteral':
    case 'Null':
    case 'Number':
      return JSON.parse(text);
    default:
      throw new Error('配置须使用字面量，不能引用变量或调用函数。');
  }
}

function readStringLiteral(text: string) {
  return text
    .slice(1, -1)
    .replace(
      /\\(u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|\r\n|[\s\S])/g,
      (_, escape: string) => {
        const standard: Record<string, string> = {
          b: '\b',
          f: '\f',
          n: '\n',
          r: '\r',
          t: '\t',
          v: '\v',
          '0': '\0',
          '\r': '',
          '\n': '',
          '\r\n': '',
          '\u2028': '',
          '\u2029': '',
        };
        if (Object.hasOwn(standard, escape)) return standard[escape];
        if (escape.startsWith('u{')) return String.fromCodePoint(parseInt(escape.slice(2, -1), 16));
        if (escape.length > 1) return String.fromCharCode(parseInt(escape.slice(1), 16));
        if (/^[ux1-9]$/.test(escape)) throw new Error('配置字符串含无效转义。');
        return escape;
      },
    );
}

function findDeclarations(code: string, root: Node, name: string) {
  return root
    .getChildren('VariableDeclaration')
    .filter((node) =>
      node
        .getChildren('VariableDefinition')
        .some((binding) => code.slice(binding.from, binding.to) === name),
    );
}

function withExtractConfig(code: string, config: unknown) {
  return `const extractConfig = ${JSON.stringify(config, null, 2)};

${code}`;
}

function legacyConfig(code: string) {
  const [declaration] = findDeclarations(
    code,
    javascriptLanguage.parser.parse(code).topNode,
    'chartConfig',
  );
  const value = declaration?.getChild('ObjectExpression');
  if (!declaration || !value) return undefined;
  try {
    const config = readLiteral(code, value);
    if (!isRecord(config) || !Array.isArray(config.bindings) || !isRecord(config.mapping)) {
      return undefined;
    }
    if (declaration.getChildren('VariableDefinition').length !== 1) return undefined;
    return {
      bindings: config.bindings.map(readBinding),
      mapping: config.mapping,
      code: (code.slice(0, declaration.from) + code.slice(declaration.to)).trim(),
    };
  } catch {
    return undefined;
  }
}

function migrateChart(chart: CustomChart) {
  const draft = chart.script?.draft;
  const legacy = draft && legacyConfig(draft.code);
  const columns = mappingColumns(chart.kind);
  const mapping = Object.fromEntries(
    columns.map((column) => [
      column,
      typeof legacy?.mapping[column] === 'string' ? legacy.mapping[column] : column,
    ]),
  );
  const hasWarehouse = chart.points.some((point) => point.warehouse !== undefined);
  if (hasWarehouse) mapping.warehouse = 'warehouse';
  const nullable = ['line', 'bar', 'table'].includes(chart.kind);
  const fields = Object.fromEntries(
    Object.entries(mapping).map(([column, field]) => [
      field,
      {
        type: column === 'warehouse' || column === 'label' ? 'string' : 'number',
        nullable: column === 'warehouse' || (column === 'value' && nullable),
      },
    ]),
  );
  if (draft && mapping.label === 'day' && mapping.value === 'roas') {
    Object.assign(fields, exampleEtl.load.fields);
  }
  const rowKey = draft ? [mapping.label] : ['rowId'];
  if (!draft) fields.rowId = { type: 'number', nullable: false };
  const bindings =
    legacy?.bindings.map(({ alias, dataset, fields, mode, useWindow, ...sql }) => ({
      alias,
      dataset,
      fields,
      mode,
      useWindow,
      ...(mode === 'sql'
        ? {
            query: sql.query,
            ...(useWindow
              ? { startParameter: sql.startParameter, endParameter: sql.endParameter }
              : {}),
          }
        : {}),
    })) ?? [];
  const outputs = Object.fromEntries(bindings.map(({ alias, fields }) => [alias, fields]));
  const extract =
    bindings.length === 0
      ? 'async function extract() {\n  return {};\n}'
      : `async function extract({ read }) {
  const aliases = ${JSON.stringify(bindings.map(({ alias }) => alias))};
  const rows = await Promise.all(aliases.map((alias) => read(alias)));
  return Object.fromEntries(aliases.map((alias, index) => [alias, rows[index]]));
}`;
  const rows = chart.points.map((point, index) => ({
    rowId: index + 1,
    ...Object.fromEntries(columns.map((column) => [column, point[column]])),
    ...(hasWarehouse ? { warehouse: point.warehouse ?? null } : {}),
  }));
  return {
    extract: withExtractConfig(extract, { bindings, outputs }),
    transform:
      legacy?.code ??
      draft?.code ??
      `function transform() {\n  return ${JSON.stringify(rows, null, 2).replaceAll('\n', '\n  ')};\n}`,
    load: { fields, rowKey },
    mapping,
    migration: draft
      ? legacy
        ? '已从旧配置生成提取脚本，请核对输出字段和行键后重新预览。'
        : '旧取数配置含动态代码。请在 extract.js 补齐绑定、输出及取数逻辑后重新预览。'
      : undefined,
  };
}

export function initialChartFiles(chart?: CustomChart): {
  source: ChartDefinition['source'];
  definition: string;
  scripts: Record<'js' | 'extract' | 'sql', string>;
  migration?: string;
} {
  const draft = chart?.script?.draft;
  const etl = draft?.etl;
  const source = !draft && chart?.codeSource?.source === 'sql' ? 'sql' : 'js';
  const metadata = {
    name: chart?.name ?? '每日广告投入产出比',
    kind: chart?.kind ?? 'line',
    source,
    dataset: chart?.dataset ?? 'JS 脚本 · 派生数据集',
  };
  const scripts = {
    js: draft?.code ?? exampleTransform,
    extract: etl?.code ?? exampleExtract,
    sql: chart?.codeSource?.source === 'sql' ? chart.codeSource.code : sqlChartExample,
  };

  if (source === 'sql') {
    return { source, definition: chart?.definition ?? JSON.stringify(metadata, null, 2), scripts };
  }

  if (etl && chart?.definition) {
    const definition = chart.definition;
    let saved: unknown;
    try {
      saved = JSON.parse(definition);
    } catch {
      // Open the saved text so it can be repaired in the editor.
    }
    if (isRecord(saved)) {
      const { extract, ...metadata } = saved;
      const inlineExtract = Object.hasOwn(saved, 'extract');
      const missingLoad = !Object.hasOwn(saved, 'load');
      if (inlineExtract || missingLoad) {
        return {
          source,
          definition: JSON.stringify(
            {
              ...metadata,
              ...(missingLoad && { load: etl.config.load }),
            },
            null,
            2,
          ),
          scripts: inlineExtract
            ? { ...scripts, extract: withExtractConfig(scripts.extract, extract) }
            : scripts,
          migration: '已将旧图表配置转换为当前格式，请重新预览后保存。',
        };
      }
    }
    return { source, definition, scripts };
  }

  const migrated = chart && !etl ? migrateChart(chart) : undefined;
  const { previewWindow, refreshWindow, intervalMinutes } = draft ?? exampleRefresh;
  return {
    source,
    definition: JSON.stringify(
      {
        schemaVersion: 1,
        ...metadata,
        load: migrated?.load ?? etl?.config.load ?? exampleEtl.load,
        mapping: migrated?.mapping ?? etl?.config.mapping ?? exampleEtl.mapping,
        refresh: { previewWindow, refreshWindow, intervalMinutes },
      },
      null,
      2,
    ),
    scripts: migrated ? { ...scripts, extract: migrated.extract, js: migrated.transform } : scripts,
    migration: migrated?.migration,
  };
}
