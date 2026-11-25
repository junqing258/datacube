export interface Board {
  id: string;
  name: string;
  description: string;
  type: string;
  favorite: boolean;
  archived: boolean;
  source: string;
  cards: string[];
  version: number;
  warehouse?: string;
}

export const dashboards: Board[] = [
  {
    id: 'sales',
    name: '电商销售总览',
    description: '微信小程序、平台电商及其他渠道的成交与退款',
    type: 'sales',
    favorite: true,
    archived: false,
    source: 'MCP',
    cards: ['sales-trend', 'channel-sales'],
    version: 1,
  },
  {
    id: 'inventory',
    name: '多仓库存与缺货',
    description: '按仓库查看可用库存、临期和缺货情况',
    type: 'inventory',
    favorite: true,
    archived: false,
    source: 'MCP',
    cards: ['inventory-health'],
    version: 1,
  },
  {
    id: 'processing',
    name: '加工损耗与入库核对',
    description: '按加工批次核对投料、报损、合格产出和入库重量',
    type: 'processing',
    favorite: true,
    archived: false,
    source: 'MCP',
    cards: ['processing-loss'],
    version: 1,
  },
  {
    id: 'channel',
    name: '直播经营复盘',
    description: '按直播场次比较成交与退款，查看整体渠道结构',
    type: 'channel',
    favorite: true,
    archived: false,
    source: 'Skill',
    cards: ['live-performance', 'channel-sales'],
    version: 1,
  },
];

export const chartLibrary = [
  {
    id: 'sales-trend',
    name: '销售额趋势',
    kind: 'line',
    dataset: '商城订单与退款',
    topic: 'sales',
    knowledgeVersion: 'v1',
  },
  {
    id: 'channel-sales',
    name: '渠道销售额分布',
    kind: 'bar',
    dataset: '商城订单与退款',
    topic: 'sales',
    knowledgeVersion: 'v1',
  },
  {
    id: 'inventory-health',
    name: '仓库库存快照',
    kind: 'inventory',
    dataset: 'WMS 库存快照',
    topic: 'inventory',
    knowledgeVersion: 'v1',
  },
  {
    id: 'processing-loss',
    name: '加工批次与损耗',
    kind: 'processing',
    dataset: 'ERP 加工单 · WMS 入库单',
    topic: 'processing',
    knowledgeVersion: 'v1',
  },
  {
    id: 'live-performance',
    name: '按场次看成交与退款',
    kind: 'live',
    dataset: '直播平台订单 · 商城退款',
    topic: 'live',
    knowledgeVersion: 'v1',
  },
];

export const warehouseSamples = [
  { warehouse: '一号仓', available: 6000, nearExpiry: 720, shortages: 2 },
  { warehouse: '二号仓', available: 5000, nearExpiry: 160, shortages: 1 },
];

export const processingSamples = [
  { batch: 'JG-1125-01', warehouse: '一号仓', input: 1000, output: 960, waste: 40, received: 960 },
  { batch: 'JG-1125-02', warehouse: '二号仓', input: 800, output: 712, waste: 88, received: 680 },
];

export const liveSamples = [
  { session: '直播 A · 11 月 25 日', paid: 18600, refund: 600 },
  { session: '直播 B · 11 月 25 日', paid: 14200, refund: 2200 },
  { session: '直播 C · 11 月 25 日', paid: 9400, refund: 400 },
];
