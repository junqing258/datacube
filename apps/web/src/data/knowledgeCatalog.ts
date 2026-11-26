import generated from '../../../../docs/prototype/knowledge-data.js?raw';

interface KnowledgeDocument {
  title: string;
  summary: string;
  source: string;
  html: string;
}

export interface KnowledgeMetric {
  id: string;
  name: string;
  aliases?: string[];
  formula: string;
  unit: string;
  time: string;
  dimensions: string;
  rules: string[];
  datasets: string[];
}

export interface KnowledgeDataset {
  id: string;
  name: string;
  source: string;
  grain: string;
  key: string;
  time: string;
  fields: [key: string, meaning: string, type: string][];
}

export interface KnowledgeRelationship {
  id: string;
  name: string;
  from: string;
  to: string;
  key: string;
  cardinality: string;
  method: string;
  rule: string;
  datasets: string[];
}

interface TopicCatalog {
  owner: string;
  workflow: string;
  terms: [term: string, meaning: string][];
  metrics: KnowledgeMetric[];
  datasets: KnowledgeDataset[];
  relationships: KnowledgeRelationship[];
}

// The HTML is rendered from Markdown with raw HTML disabled by the prototype generator.
const documents = JSON.parse(
  generated.slice(generated.indexOf('{'), generated.lastIndexOf('}') + 1),
) as Record<string, Record<string, KnowledgeDocument>>;

const markdownFiles = import.meta.glob<string>('../../../../docs/knowledge/*/v*.md', {
  eager: true,
  query: '?url',
  import: 'default',
});

// These mappings describe the sample catalog. Each set belongs to one exact document version.
const catalog: Partial<Record<string, TopicCatalog>> = {
  'sales/v1': {
    owner: '经营分析组',
    workflow: '商城订单付款后，可产生多笔退款。每笔成功退款回到原订单的支付期和渠道。',
    terms: [
      ['支付期', '原订单支付日所在的统计期间，日期按北京时间划分。'],
      ['退款截至时点', '用于判断哪些退款已成功的快照时点，可以晚于统计期间结束。'],
    ],
    metrics: [
      {
        id: 'net-sales',
        name: '净销售额',
        aliases: ['净销额', '退款后销售额'],
        formula: '已支付订单的支付金额合计 − 归属这些订单的成功退款金额合计',
        unit: '人民币元',
        time: '按原订单支付日期归属（北京时间），退款截至查询快照时点。',
        dimensions: '支付日期、原订单渠道',
        rules: [
          '排除测试订单、未支付订单和未成功退款。',
          '先按订单汇总退款。指标用于经营分析，财务确认收入采用财务口径。',
        ],
        datasets: ['orders', 'refunds'],
      },
    ],
    datasets: [
      {
        id: 'orders',
        name: '商城订单',
        source: '商城 · orders',
        grain: '一行一笔商城订单',
        key: '来源渠道 + 平台订单号（跨系统对齐）',
        time: 'paid_at · 原订单支付时间',
        fields: [
          ['platform_order_no', '平台订单号', '标识'],
          ['channel', '原订单的来源渠道', '枚举'],
          ['paid_at', '订单支付时间', '时间'],
          ['paid_amount', '实际支付金额', '人民币元'],
          ['is_test', '是否为测试订单', '布尔值'],
        ],
      },
      {
        id: 'refunds',
        name: '商城退款',
        source: '商城 · refunds',
        grain: '一行一笔退款记录',
        key: '退款记录标识',
        time: 'success_at · 退款成功时间',
        fields: [
          ['refund_id', '退款记录标识', '标识'],
          ['platform_order_no', '原平台订单号', '标识'],
          ['channel', '原订单的来源渠道', '枚举'],
          ['refund_amount', '退款金额', '人民币元'],
          ['status', '退款处理状态', '枚举'],
          ['success_at', '退款成功时间', '时间'],
        ],
      },
    ],
    relationships: [
      {
        id: 'order-refunds',
        name: '订单与退款归属',
        from: '商城订单',
        to: '商城退款',
        key: '来源渠道 + 平台订单号（示例；以实际订单契约为准）',
        cardinality: '一对多 · 订单可有零到多笔退款',
        method: '先聚合，再关联',
        rule: '截至快照筛选成功退款，先按订单汇总，再关联回订单。保留无退款订单，避免多笔退款放大支付金额。',
        datasets: ['orders', 'refunds'],
      },
    ],
  },
  'inventory/v1': {
    owner: '仓储运营组',
    workflow: '在 WMS 库存快照中按仓库查看可履约库存，再下钻到 SKU 和批次。',
    terms: [
      ['库存快照', '指定时点的库存视图。跨日累加会重复计算库存。'],
      ['临期', '从快照日期起，在指定天数内到期。样例窗口为 3 天。'],
    ],
    metrics: [
      {
        id: 'available-stock',
        name: '可用库存',
        formula: '同一快照时点内的 WMS 可用件数合计',
        unit: '件',
        time: '快照时点',
        dimensions: '仓库、SKU、批次',
        rules: ['跨仓比较使用同一快照时点，或注明各仓时间差。'],
        datasets: ['stock-snapshots'],
      },
      {
        id: 'expiring-stock',
        name: '临期可用库存',
        aliases: ['临期库存'],
        formula: '满足临期窗口的批次可用件数合计',
        unit: '件',
        time: '从快照日期起未来 3 天（演示参数）',
        dimensions: '仓库、SKU、批次',
        rules: ['明细按批次判断到期日。比较优先级时同时核对临期件数和临期件数占可用库存的比例。'],
        datasets: ['stock-snapshots'],
      },
      {
        id: 'out-of-stock-skus',
        name: '缺货 SKU 数',
        aliases: ['缺货商品数'],
        formula: '在所选范围内对缺货 SKU 去重计数',
        unit: '个 SKU',
        time: '快照时点',
        dimensions: '仓库或全局',
        rules: ['同一 SKU 在多个仓均缺货时，全局商品数只计一次。'],
        datasets: ['stock-snapshots'],
      },
    ],
    datasets: [
      {
        id: 'stock-snapshots',
        name: 'WMS 库存快照',
        source: 'WMS · 库存接口',
        grain: '一行对应某个快照时点的仓库、SKU 和批次',
        key: '仓库 + SKU + 批次 + 快照时间',
        time: 'snapshot_at · 快照时间',
        fields: [
          ['warehouse', '仓库标识', '标识'],
          ['sku', '商品规格标识', '标识'],
          ['batch', '库存批次标识', '标识'],
          ['snapshot_at', '库存快照时间', '时间'],
          ['expires_on', '批次到期日', '日期'],
          ['available_qty', '可用于履约的库存数量', '件'],
        ],
      },
    ],
    relationships: [
      {
        id: 'sku-by-warehouse',
        name: '跨仓 SKU 对齐',
        from: '单仓库存快照',
        to: '同一 SKU 的其他仓库存',
        key: 'SKU + 快照时点',
        cardinality: '同一 SKU 可在多个仓库、多个批次出现',
        method: '按时点分组与去重',
        rule: '先确认各仓的快照时间。缺货商品按 SKU 去重，单仓缺货数不可直接相加为全局数量。',
        datasets: ['stock-snapshots'],
      },
    ],
  },
  'processing/v1': {
    owner: '仓储运营组',
    workflow: 'ERP 记录加工投料、报损和合格产出，WMS 记录已确认入库。按仓库和加工批次核对。',
    terms: [
      ['报损重量', '加工批次记录的报损重量，用于计算加工损耗率。'],
      ['入库差额', 'ERP 合格产出与 WMS 已确认入库之间的重量差，单独跟踪。'],
    ],
    metrics: [
      {
        id: 'processing-loss-rate',
        name: '加工损耗率',
        aliases: ['损耗率', '加工报损率'],
        formula: '已完工批次报损重量合计 ÷ 投料重量合计',
        unit: '%',
        time: 'ERP 完工批次',
        dimensions: '仓库、加工批次',
        rules: ['跨批次以总报损除以总投料。投料为零时标为待核对。'],
        datasets: ['production-orders'],
      },
      {
        id: 'receiving-discrepancy',
        name: '入库差额',
        aliases: ['入库差异', '产出入库差'],
        formula: 'ERP 合格产出重量 − WMS 已确认入库重量',
        unit: 'kg',
        time: '分别记录 ERP 与 WMS 的数据时点',
        dimensions: '仓库、加工批次',
        rules: ['先核对入库状态、同步时间、计量单位和现场记录。'],
        datasets: ['production-orders', 'warehouse-receipts'],
      },
    ],
    datasets: [
      {
        id: 'production-orders',
        name: 'ERP 加工完工单',
        source: 'ERP · 加工模块',
        grain: '一行一条加工完工明细，一个批次可有多条明细',
        key: '明细标识；仓库 + 加工批次用于汇总',
        time: 'completed_at · 完工时间',
        fields: [
          ['warehouse', '加工仓库', '标识'],
          ['batch', '加工批次', '标识'],
          ['completed_at', '完工时间', '时间'],
          ['input_kg', '投料重量', 'kg'],
          ['waste_kg', '报损重量', 'kg'],
          ['qualified_kg', '合格产出重量', 'kg'],
        ],
      },
      {
        id: 'warehouse-receipts',
        name: 'WMS 入库单',
        source: 'WMS · 入库接口',
        grain: '一行一条入库明细，一个加工批次可分次入库',
        key: '明细标识；仓库 + 加工批次用于汇总',
        time: 'confirmed_at · 入库确认时间',
        fields: [
          ['warehouse', '入库仓库', '标识'],
          ['batch', '入库对应的加工批次', '标识'],
          ['status', '入库状态', '枚举'],
          ['received_kg', '入库重量', 'kg'],
          ['confirmed_at', '入库确认时间', '时间'],
        ],
      },
    ],
    relationships: [
      {
        id: 'production-receipts',
        name: '加工批次与入库对账',
        from: 'ERP 加工完工单',
        to: 'WMS 入库单',
        key: '仓库 + 加工批次',
        cardinality: '两侧明细各可有多条；汇总后每侧每个键至多一条',
        method: '跨源预整理',
        rule: '统一重量为 kg。两侧分别按仓库和加工批次汇总，只计 WMS 已确认入库。对齐后保留两侧数据时间，单边缺失标为待核对。',
        datasets: ['production-orders', 'warehouse-receipts'],
      },
    ],
  },
  'live/v1': {
    owner: '直播运营组',
    workflow: '先将直播平台订单归因到场次，再以商城退款更新各场的成交额。',
    terms: [
      ['场次归因', '使用平台场次标识匹配订单。无法匹配场次的订单单列。'],
      ['退款观察窗口', '从成交起观察后续退款的时间范围。跨场比较要对齐窗口或列出各自截至时点。'],
    ],
    metrics: [
      {
        id: 'live-net-turnover',
        name: '退款后成交额',
        aliases: ['直播净成交额'],
        formula: '归因到场次的订单支付金额 − 截至统计时点的成功退款金额',
        unit: '人民币元',
        time: '场次成交归属期及退款观察窗口',
        dimensions: '平台、直播场次',
        rules: ['只汇总可匹配场次的订单。利润还需投放、佣金和履约成本。'],
        datasets: ['live-orders', 'store-refunds'],
      },
    ],
    datasets: [
      {
        id: 'live-orders',
        name: '直播平台订单',
        source: '直播平台 · 订单接口',
        grain: '一行一笔平台订单',
        key: '平台 + 平台订单号',
        time: 'paid_at · 订单支付时间',
        fields: [
          ['platform', '直播平台', '枚举'],
          ['platform_order_no', '平台订单号', '标识'],
          ['session_id', '用于归因的直播场次标识', '标识'],
          ['paid_at', '订单支付时间', '时间'],
          ['paid_amount', '支付金额', '人民币元'],
        ],
      },
      {
        id: 'store-refunds',
        name: '商城退款记录',
        source: '商城 · 退款记录',
        grain: '一行一笔退款记录',
        key: '退款记录标识',
        time: 'success_at · 退款成功时间',
        fields: [
          ['refund_id', '退款记录标识', '标识'],
          ['platform', '原订单平台', '枚举'],
          ['platform_order_no', '原平台订单号', '标识'],
          ['refund_amount', '退款金额', '人民币元'],
          ['status', '退款处理状态', '枚举'],
          ['success_at', '退款成功时间', '时间'],
        ],
      },
    ],
    relationships: [
      {
        id: 'live-attribution',
        name: '直播场次归因与退款',
        from: '直播平台订单',
        to: '商城退款记录',
        key: '平台 + 平台订单号；场次归因使用平台场次标识',
        cardinality: '一个场次可有多笔订单；每笔订单可有多笔退款',
        method: '跨源预整理',
        rule: '先按平台与订单号汇总成功退款，再归入可匹配的场次。无法归因的订单单列。',
        datasets: ['live-orders', 'store-refunds'],
      },
    ],
  },
};

function topicVersions(topic: string) {
  return Object.hasOwn(documents, topic)
    ? Object.keys(documents[topic]).sort((a, b) => Number(b.slice(1)) - Number(a.slice(1)))
    : [];
}

export function readKnowledgeTopic(topic: string, version?: string) {
  const versions = topicVersions(topic);
  const selected = version ?? versions[0];
  if (!versions.includes(selected)) return undefined;
  const document = documents[topic][selected];
  return {
    ...document,
    topic,
    version: selected,
    versions,
    catalog: catalog[`${topic}/${selected}`],
    downloadUrl: markdownFiles[`../../../../docs/${document.source}`],
  };
}

export type KnowledgeTopic = NonNullable<ReturnType<typeof readKnowledgeTopic>>;

export const knowledgeTopics = Object.keys(documents).flatMap((topic) => {
  const latest = readKnowledgeTopic(topic);
  return latest ? [latest] : [];
});
