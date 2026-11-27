import { PrismaClient, type Prisma } from '@prisma/client';
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { demoEmail, demoLoginConfig } from '../src/modules/auth/demo-login';
import { hashPassword, verifyPassword } from '../src/modules/auth/password';

const prisma = new PrismaClient();

const identifier = /^[A-Za-z_][A-Za-z0-9_]*$/;
const tablePattern = /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)?$/;

type SeedDataset = {
  datasetId: string;
  name: string;
  table: string;
  timeField?: string;
  fields: string[];
};

type BoardChartSeed = {
  name: string;
  kind: 'line' | 'bar' | 'table';
  sql: string;
  mapping?: { label: string; value: string };
};

const batchDatasetKey = 'processing_batches';
const stockDatasetKey = 'stock_snapshots';
const boardDatasetGrains = new Map([
  ['live_sessions', 'session'],
  [batchDatasetKey, 'batch'],
  [stockDatasetKey, 'snapshot'],
]);

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function envJson(name: string): Record<string, unknown> {
  const raw = process.env[name];
  if (!raw) return {};
  const value: unknown = JSON.parse(raw);
  if (!record(value)) throw new Error(`${name} 须为 JSON 对象。`);
  return value;
}

function password(name: string, fallback: string) {
  const value = process.env[name];
  if (value) {
    if (value.length < 8 || value.length > 128) throw new Error(`${name} 须为 8 至 128 个字符。`);
    return value;
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error(`生产环境必须设置 ${name}。`);
  }
  console.warn(`未设置 ${name}，使用开发默认口令 ${fallback}。`);
  return fallback;
}

function sqliteColumnTypes(path: string, table: string) {
  if (!identifier.test(table) || !existsSync(path)) return new Map<string, string>();
  const database = new DatabaseSync(path, { readOnly: true });
  try {
    const rows = database.prepare(`PRAGMA table_info("${table}")`).all() as {
      name: string;
      type: string;
    }[];
    return new Map(rows.map(({ name, type }) => [name, type]));
  } finally {
    database.close();
  }
}

function dataType(type: string | undefined) {
  const value = (type ?? '').toUpperCase();
  if (/INT|REAL|NUM|DOUBLE|FLOAT|DECIMAL/.test(value)) return 'number';
  if (/BOOL/.test(value)) return 'boolean';
  if (/DATE|TIME/.test(value)) return 'date';
  return 'string';
}

async function seedIdentity() {
  const adminEmail = (process.env.SEED_ADMIN_EMAIL ?? 'admin@datacube.local').toLowerCase();
  const memberEmail = (process.env.SEED_MEMBER_EMAIL ?? 'member@datacube.local').toLowerCase();
  if (adminEmail === demoEmail || memberEmail === demoEmail) {
    throw new Error('demo@datacube.local 已保留给演示账号。');
  }
  const demoLogin = demoLoginConfig();
  const adminPassword = password('SEED_ADMIN_PASSWORD', 'admin-datacube-2026');
  const memberPassword = password('SEED_MEMBER_PASSWORD', 'member-datacube-2026');

  const space = await prisma.space.upsert({
    where: { slug: 'ops' },
    create: {
      slug: 'ops',
      name: '经营分析空间',
      description: '电商销售、库存、加工与直播经营分析。',
    },
    update: { name: '经营分析空间' },
  });

  const admin = await upsertUser(adminEmail, '林晓', 'admin', adminPassword);
  const member = await upsertUser(memberEmail, '陈默', 'member', memberPassword);

  const users = [admin, member];
  if (demoLogin) {
    const demo = await upsertUser(demoLogin.email, '演示成员', 'member', demoLogin.password);
    if (!(await verifyPassword(demoLogin.password, demo.password))) {
      await prisma.user.update({
        where: { id: demo.id },
        data: { password: await hashPassword(demoLogin.password) },
      });
    }
    users.push(demo);
  }

  for (const { id: userId, role } of users) {
    await prisma.spaceMember.upsert({
      where: { spaceId_userId: { spaceId: space.id, userId } },
      create: { spaceId: space.id, userId, role },
      update: { role, disabledAt: null },
    });
  }
  return { space, admin, member, users };
}

async function upsertUser(email: string, name: string, role: string, initialPassword: string) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return prisma.user.update({ where: { id: existing.id }, data: { name, role } });
  }
  return prisma.user.create({
    data: { email, name, role, password: await hashPassword(initialPassword) },
  });
}

function contractOf(table: string, timeField?: string) {
  return {
    table,
    timeZone: 'Asia/Shanghai',
    timeFieldFormat: 'YYYY-MM-DD',
    amountUnit: 'CNY',
    snapshotTime: null,
    ...(timeField ? { timeFieldKey: timeField } : {}),
  };
}

async function seedSources(spaceId: string, userIds: string[]) {
  const connections = envJson('CHART_DATA_CONNECTIONS');
  const sources = envJson('CHART_DATA_SOURCES');
  if (!Object.keys(sources).length) {
    console.log('未提供 CHART_DATA_SOURCES，跳过业务数据集登记。');
    return new Map<string, SeedDataset>();
  }

  const registered = new Map<string, SeedDataset>();

  for (const [key, entry] of Object.entries(sources)) {
    if (!record(entry)) throw new Error(`数据源 ${key} 的配置须为对象。`);
    const { name, connection, table, fields, timeField } = entry;
    if (
      !identifier.test(key) ||
      typeof name !== 'string' ||
      !name.trim() ||
      typeof connection !== 'string' ||
      !identifier.test(connection) ||
      typeof table !== 'string' ||
      !tablePattern.test(table) ||
      !Array.isArray(fields) ||
      !fields.length ||
      fields.some((field) => typeof field !== 'string' || !identifier.test(field)) ||
      new Set(fields).size !== fields.length ||
      (timeField !== undefined && (typeof timeField !== 'string' || !fields.includes(timeField)))
    ) {
      throw new Error(`数据源 ${key} 的配置无效。`);
    }
    const url = connections[connection];
    if (typeof url !== 'string') throw new Error(`数据源 ${key} 的连接 ${connection} 未配置。`);

    const protocol = new URL(url).protocol;
    let kind: string;
    let settings: string;
    let secretRef: string | null = null;
    let sqlitePath: string | undefined;
    if (protocol === 'file:') {
      kind = 'sqlite';
      sqlitePath = fileURLToPath(url);
      if (!existsSync(sqlitePath)) throw new Error(`数据源 ${key} 的 SQLite 文件不存在。`);
      settings = JSON.stringify({ path: sqlitePath });
    } else if (protocol === 'mysql:') {
      kind = 'mysql';
      settings = '{}';
      secretRef = `connections:${connection}`;
    } else if (protocol === 'postgresql:' || protocol === 'postgres:') {
      kind = 'postgresql';
      settings = '{}';
      secretRef = `connections:${connection}`;
    } else {
      throw new Error(`数据源 ${key} 的连接协议不受支持。`);
    }

    const dataConnection = await prisma.dataConnection.upsert({
      where: { id: connection },
      create: {
        id: connection,
        spaceId,
        name: `${connection} 业务库`,
        kind,
        settings,
        secretRef,
        checkStatus: 'ok',
        checkedAt: new Date(),
      },
      update: { spaceId, kind, settings, secretRef, checkStatus: 'ok', checkedAt: new Date() },
    });

    const types =
      kind === 'sqlite' && sqlitePath
        ? sqliteColumnTypes(sqlitePath, table.split('.').at(-1)!)
        : new Map<string, string>();

    const existing = await prisma.dataset.findFirst({
      where: { spaceId, connectionId: dataConnection.id, key },
    });
    const grain = boardDatasetGrains.get(key);
    const dataset = existing
      ? await prisma.dataset.update({
          where: { id: existing.id },
          data: {
            name,
            grain,
            contract: JSON.stringify(contractOf(table, timeField as string | undefined)),
            timeFieldKey: (timeField as string | undefined) ?? null,
            disabledAt: null,
            description: `由环境变量 CHART_DATA_SOURCES 登记。`,
          },
        })
      : await prisma.dataset.create({
          data: {
            spaceId,
            connectionId: dataConnection.id,
            key,
            name,
            description: '由环境变量 CHART_DATA_SOURCES 登记。',
            grain: grain ?? (timeField ? 'daily' : 'record'),
            kind: 'table',
            contract: JSON.stringify(contractOf(table, timeField as string | undefined)),
            timeFieldKey: (timeField as string | undefined) ?? null,
          },
        });

    for (const field of fields as string[]) {
      await prisma.datasetField.upsert({
        where: { spaceId_datasetId_key: { spaceId, datasetId: dataset.id, key: field } },
        create: {
          spaceId,
          datasetId: dataset.id,
          key: field,
          name: field,
          dataType: dataType(types.get(field)),
          semantics: field === timeField ? JSON.stringify({ role: 'time' }) : undefined,
          unit: field.endsWith('_kg')
            ? 'kg'
            : field === 'available_qty'
              ? '件'
              : /amount|price|revenue|cost/i.test(field)
                ? 'CNY'
                : undefined,
        },
        update: {
          dataType: dataType(types.get(field)),
          ...(field === timeField ? { semantics: JSON.stringify({ role: 'time' }) } : {}),
        },
      });
    }

    for (const userId of userIds) {
      await prisma.datasetGrant.upsert({
        where: { spaceId_datasetId_userId: { spaceId, datasetId: dataset.id, userId } },
        create: { spaceId, datasetId: dataset.id, userId },
        update: {},
      });
    }
    registered.set(key, {
      datasetId: dataset.id,
      name,
      table,
      timeField: (timeField as string | undefined) ?? undefined,
      fields: fields as string[],
    });
  }
  return registered;
}

const boardSeeds = [
  {
    name: '电商销售总览',
    kind: 'sales',
    description: '微信小程序、平台电商及其他渠道的成交与退款',
  },
  {
    name: '多仓库存',
    legacyName: '多仓库存与缺货',
    kind: 'inventory',
    description: '按仓库查看可用库存、临期和缺货情况',
  },
  {
    name: '加工损耗与入库核对',
    kind: 'processing',
    description: '按加工批次核对投料、报损、合格产出和入库重量',
  },
  {
    name: '直播经营复盘',
    kind: 'channel',
    description: '按直播场次比较成交与退款，查看整体渠道结构',
  },
];

async function seedDashboards(spaceId: string, adminId: string, userIds: string[]) {
  const boards = new Map<string, string>();
  for (const seed of boardSeeds) {
    let existing = await prisma.dashboard.findFirst({ where: { spaceId, name: seed.name } });
    if (!existing && seed.legacyName) {
      const legacy = await prisma.dashboard.findFirst({
        where: { spaceId, name: seed.legacyName, kind: seed.kind },
      });
      if (legacy) {
        existing = await prisma.dashboard.update({
          where: { id: legacy.id },
          data: { name: seed.name, version: { increment: 1 } },
        });
      }
    }
    const dashboard =
      existing ??
      (await prisma.dashboard.create({
        data: {
          spaceId,
          createdById: adminId,
          origin: 'web',
          name: seed.name,
          description: seed.description,
          kind: seed.kind,
          visibility: 'space',
        },
      }));
    boards.set(seed.kind, dashboard.id);
    for (const userId of userIds) {
      await prisma.dashboardFavorite.upsert({
        where: { spaceId_userId_dashboardId: { spaceId, userId, dashboardId: dashboard.id } },
        create: { spaceId, userId, dashboardId: dashboard.id },
        update: {},
      });
    }
  }
  return boards;
}

async function seedSalesChart(
  spaceId: string,
  adminId: string,
  boardId: string,
  dataset: SeedDataset,
) {
  if (!dataset.timeField) return;
  const valueField = ['net_amount', 'net_sales', 'amount', 'paid_amount', 'revenue'].find((field) =>
    dataset.fields.includes(field),
  );
  if (!valueField || !identifier.test(dataset.table)) return;
  const existing = await prisma.chart.findFirst({ where: { spaceId, name: '销售额趋势' } });
  if (existing) {
    await prisma.queryDatasetBinding.upsert({
      where: {
        spaceId_queryId_alias: { spaceId, queryId: existing.queryId, alias: 'result' },
      },
      create: {
        spaceId,
        queryId: existing.queryId,
        alias: 'result',
        datasetId: dataset.datasetId,
      },
      update: {},
    });
    await attachCard(spaceId, boardId, existing.id);
    return;
  }
  const sql = `SELECT ${dataset.timeField} AS label, ${valueField} AS value
FROM ${dataset.table}
WHERE ${dataset.timeField} >= :startDay AND ${dataset.timeField} < :endDay
ORDER BY label`;
  const spec = {
    source: 'sql',
    datasetId: dataset.datasetId,
    sql,
    window: { days: 30 },
  };
  const created = await prisma.$transaction(async (tx) => {
    const query = await tx.queryDefinition.create({
      data: { spaceId, datasetId: dataset.datasetId, kind: 'sql', spec: JSON.stringify(spec) },
    });
    const chart = await tx.chart.create({
      data: {
        spaceId,
        queryId: query.id,
        createdById: adminId,
        origin: 'web',
        name: '销售额趋势',
        display: JSON.stringify({ kind: 'line', dataset: '商城订单与退款' }),
      },
    });
    await tx.queryDatasetBinding.create({
      data: { spaceId, queryId: query.id, alias: 'result', datasetId: dataset.datasetId },
    });
    await tx.chartKnowledgeReference.create({
      data: { spaceId, chartId: chart.id, topic: 'sales', version: 1 },
    });
    return chart;
  });
  await attachCard(spaceId, boardId, created.id);
}

async function seedChannelChart(spaceId: string, adminId: string, dataset: SeedDataset) {
  const timeField = dataset.timeField;
  const channelField = dataset.fields.find((field) => field === 'channel');
  const valueField = ['net_amount', 'net_sales', 'paid_amount', 'amount'].find((field) =>
    dataset.fields.includes(field),
  );
  if (!timeField || !channelField || !valueField) return;
  const existing = await prisma.chart.findFirst({ where: { spaceId, name: '渠道销售额分布' } });
  if (existing) {
    await prisma.queryDatasetBinding.upsert({
      where: {
        spaceId_queryId_alias: { spaceId, queryId: existing.queryId, alias: 'result' },
      },
      create: {
        spaceId,
        queryId: existing.queryId,
        alias: 'result',
        datasetId: dataset.datasetId,
      },
      update: {},
    });
    return existing.id;
  }
  const sql = `SELECT ${channelField} AS label, SUM(${valueField}) AS value
FROM ${dataset.table}
WHERE ${timeField} >= :startDay AND ${timeField} < :endDay
  AND (:channel = 'all' OR ${channelField} = :channel)
GROUP BY ${channelField}
ORDER BY value DESC`;
  const spec = {
    source: 'sql',
    datasetId: dataset.datasetId,
    sql,
    window: { days: 30 },
    parameters: { channel: { type: 'string', default: 'all' } },
  };
  const created = await prisma.$transaction(async (tx) => {
    const query = await tx.queryDefinition.create({
      data: { spaceId, datasetId: dataset.datasetId, kind: 'sql', spec: JSON.stringify(spec) },
    });
    const chart = await tx.chart.create({
      data: {
        spaceId,
        queryId: query.id,
        createdById: adminId,
        origin: 'web',
        name: '渠道销售额分布',
        display: JSON.stringify({ kind: 'bar', dataset: '商城订单与退款' }),
      },
    });
    await tx.queryDatasetBinding.create({
      data: { spaceId, queryId: query.id, alias: 'result', datasetId: dataset.datasetId },
    });
    await tx.chartKnowledgeReference.create({
      data: { spaceId, chartId: chart.id, topic: 'sales', version: 1 },
    });
    return chart;
  });
  return created.id;
}

async function seedLiveCharts(
  spaceId: string,
  adminId: string,
  boardId: string,
  dataset: SeedDataset,
  channelChartId?: string,
) {
  const required = [
    'platform',
    'session_name',
    'order_count',
    'paid_amount',
    'refund_amount',
    'net_amount',
  ];
  if (!dataset.timeField || !required.every((field) => dataset.fields.includes(field))) {
    console.warn('直播场次数据集缺少日期或场次汇总字段，跳过直播图表。');
    return;
  }

  const day = dataset.timeField;
  const source = `FROM ${dataset.table}
WHERE ${day} >= :startDay AND ${day} < :endDay`;
  const charts: BoardChartSeed[] = [
    {
      name: '直播净成交额趋势（元）',
      kind: 'line',
      sql: `SELECT ${day} AS label, ROUND(CAST(SUM(net_amount) AS DECIMAL(20, 4)), 2) AS value
${source}
GROUP BY ${day}
ORDER BY ${day}`,
    },
    {
      name: '场次净成交额前 8（元）',
      kind: 'bar',
      sql: `SELECT session_name AS label, net_amount AS value
${source}
ORDER BY net_amount DESC, ${day} DESC, session_name
LIMIT 8`,
    },
    {
      name: '平台退款金额占支付金额（%）',
      kind: 'bar',
      sql: `SELECT platform AS label,
       ROUND(100.0 * CAST(SUM(refund_amount) AS DECIMAL(20, 4))
         / NULLIF(CAST(SUM(paid_amount) AS DECIMAL(20, 4)), 0), 2) AS value
${source}
GROUP BY platform
ORDER BY value DESC, platform`,
    },
    {
      name: '直播场次明细',
      kind: 'table',
      sql: `SELECT session_name AS "场次", platform AS "平台", order_count AS "支付订单数",
       paid_amount AS "支付金额（元）", refund_amount AS "成功退款金额（元）",
       net_amount AS "净成交额"
${source}
ORDER BY ${day} DESC, session_name`,
      mapping: { label: '场次', value: '净成交额' },
    },
  ];

  await seedBoardCharts(spaceId, adminId, boardId, dataset, 'live', charts, channelChartId);
}

async function seedProcessingCharts(
  spaceId: string,
  adminId: string,
  boardId: string,
  dataset: SeedDataset,
) {
  const required = [
    'warehouse',
    'batch',
    'completed_at',
    'confirmed_at',
    'input_kg',
    'waste_kg',
    'qualified_kg',
    'received_kg',
    'gap_kg',
    'receipt_status',
  ];
  if (!dataset.timeField || !required.every((field) => dataset.fields.includes(field))) {
    console.warn('加工批次数据集缺少日期或核对字段，跳过加工图表。');
    return;
  }

  const day = dataset.timeField;
  const source = `FROM ${dataset.table}
WHERE ${day} >= :startDay AND ${day} < :endDay
  AND warehouse <> '华北仓'`;
  const lossRate = `ROUND(100.0 * CAST(SUM(waste_kg) AS DECIMAL(20, 4))
         / NULLIF(CAST(SUM(input_kg) AS DECIMAL(20, 4)), 0), 2)`;
  const batchLabel = "CONCAT(warehouse, ' ', batch)";
  const charts: BoardChartSeed[] = [
    {
      name: '每日加工损耗率（%）',
      kind: 'line',
      sql: `SELECT ${day} AS label, ${lossRate} AS value
${source}
  AND completed_at IS NOT NULL
GROUP BY ${day}
ORDER BY ${day}`,
    },
    {
      name: '各仓加工损耗率（%）',
      kind: 'bar',
      sql: `SELECT warehouse AS label, ${lossRate} AS value
${source}
  AND completed_at IS NOT NULL
GROUP BY warehouse
ORDER BY CASE WHEN SUM(input_kg) = 0 THEN 1 ELSE 0 END, value DESC, warehouse`,
    },
    {
      name: '入库差额绝对值前 8 批次（kg）',
      kind: 'bar',
      sql: `SELECT ${batchLabel} AS label, gap_kg AS value
${source}
  AND gap_kg <> 0
ORDER BY ABS(gap_kg) DESC, ${day} DESC, warehouse, batch
LIMIT 8`,
    },
    {
      name: '入库核对状态（批次）',
      kind: 'bar',
      sql: `SELECT receipt_status AS label, COUNT(*) AS value
${source}
GROUP BY receipt_status
ORDER BY value DESC, receipt_status`,
    },
    {
      name: '待核对批次明细',
      kind: 'table',
      sql: `SELECT ${batchLabel} AS "仓库批次", completed_at AS "ERP完工时间",
       confirmed_at AS "WMS确认时间", input_kg AS "投料kg", waste_kg AS "报损kg",
       qualified_kg AS "合格产出kg", received_kg AS "确认入库kg", gap_kg AS "入库差额kg",
       receipt_status AS "入库核对状态",
       CASE WHEN input_kg = 0 THEN '投料为零' END AS "投料异常"
${source}
  AND (receipt_status <> '重量一致' OR input_kg = 0)
ORDER BY ${day} DESC, warehouse, batch`,
      mapping: { label: '仓库批次', value: '入库差额kg' },
    },
  ];

  await seedBoardCharts(spaceId, adminId, boardId, dataset, 'processing', charts);
}

async function seedInventoryCharts(
  spaceId: string,
  adminId: string,
  boardId: string,
  dataset: SeedDataset,
) {
  const required = [
    'snapshot_at',
    'warehouse',
    'sku',
    'batch',
    'available_qty',
    'expires_on',
    'days_to_expiry',
  ];
  if (!dataset.timeField || !required.every((field) => dataset.fields.includes(field))) {
    console.warn('库存快照数据集缺少日期或库存字段，跳过多仓库存图表。');
    return;
  }

  const day = dataset.timeField;
  const range = `${day} >= :startDay AND ${day} < :endDay`;
  const latest = `WITH latest_stock AS (
  SELECT warehouse, sku, batch, available_qty, expires_on, days_to_expiry, snapshot_at
  FROM ${dataset.table}
  WHERE snapshot_at = (SELECT MAX(snapshot_at) FROM ${dataset.table} WHERE ${range})
)`;
  const skuStock = `${latest},
stock_by_sku AS (
  SELECT warehouse, sku, SUM(available_qty) AS available_qty, MAX(snapshot_at) AS snapshot_at
  FROM latest_stock
  GROUP BY warehouse, sku
)`;
  const expiring = 'days_to_expiry BETWEEN 0 AND 3';
  const charts: BoardChartSeed[] = [
    {
      name: '可用库存趋势（件）',
      kind: 'line',
      sql: `WITH daily_snapshots AS (
  SELECT ${day} AS day, MAX(snapshot_at) AS snapshot_at
  FROM ${dataset.table}
  WHERE ${range}
  GROUP BY ${day}
)
SELECT d.day AS label, SUM(s.available_qty) AS value
FROM daily_snapshots d
JOIN ${dataset.table} s ON s.${day} = d.day AND s.snapshot_at = d.snapshot_at
GROUP BY d.day
ORDER BY d.day`,
    },
    {
      name: '各仓可用库存（件）',
      kind: 'bar',
      sql: `${latest}
SELECT warehouse AS label, SUM(available_qty) AS value, MAX(snapshot_at) AS snapshot_at
FROM latest_stock
GROUP BY warehouse
ORDER BY value DESC, warehouse`,
    },
    {
      name: '各仓缺货 SKU 数',
      kind: 'bar',
      sql: `${skuStock}
SELECT warehouse AS label,
       SUM(CASE WHEN available_qty = 0 THEN 1 ELSE 0 END) AS value,
       MAX(snapshot_at) AS snapshot_at
FROM stock_by_sku
GROUP BY warehouse
ORDER BY value DESC, warehouse`,
    },
    {
      name: '各仓 3 天内临期可用库存（件）',
      kind: 'bar',
      sql: `${latest}
SELECT warehouse AS label,
       SUM(CASE WHEN ${expiring} THEN available_qty ELSE 0 END) AS value,
       MAX(snapshot_at) AS snapshot_at
FROM latest_stock
GROUP BY warehouse
ORDER BY value DESC, warehouse`,
    },
    {
      name: '缺货与临期明细',
      kind: 'table',
      sql: `${skuStock},
risk_rows AS (
  SELECT 1 AS risk_order, '缺货' AS risk, warehouse, sku, NULL AS batch, available_qty,
         NULL AS expires_on, NULL AS days_to_expiry, snapshot_at
  FROM stock_by_sku
  WHERE available_qty = 0
  UNION ALL
  SELECT 2, '临期', warehouse, sku, batch, available_qty, expires_on, days_to_expiry, snapshot_at
  FROM latest_stock
  WHERE ${expiring} AND available_qty > 0
)
SELECT risk AS "风险类型", warehouse AS "仓库", sku AS "SKU", batch AS "批次",
       available_qty AS "可用件数", expires_on AS "到期日期", days_to_expiry AS "距到期天数",
       snapshot_at AS "快照时间"
FROM risk_rows
ORDER BY risk_order, days_to_expiry, warehouse, sku, batch`,
      mapping: { label: 'SKU', value: '可用件数' },
    },
  ];

  await seedBoardCharts(spaceId, adminId, boardId, dataset, 'inventory', charts);
}

async function seedBoardCharts(
  spaceId: string,
  adminId: string,
  boardId: string,
  dataset: SeedDataset,
  topic: string,
  charts: BoardChartSeed[],
  supplementalChartId?: string,
) {
  await prisma.$transaction(async (tx) => {
    for (const chart of charts) {
      if (chart.kind === 'table' && supplementalChartId) {
        await attachCard(spaceId, boardId, supplementalChartId, tx);
      }
      const existing = await tx.chart.findFirst({
        where: { spaceId, name: chart.name, query: { datasetId: dataset.datasetId } },
      });
      let chartId = existing?.id;
      if (!chartId) {
        const spec = {
          source: 'sql',
          datasetId: dataset.datasetId,
          sql: chart.sql,
          window: { days: 30 },
          mapping: chart.mapping,
        };
        const query = await tx.queryDefinition.create({
          data: { spaceId, datasetId: dataset.datasetId, kind: 'sql', spec: JSON.stringify(spec) },
        });
        await tx.queryDatasetBinding.create({
          data: { spaceId, queryId: query.id, alias: 'result', datasetId: dataset.datasetId },
        });
        const created = await tx.chart.create({
          data: {
            spaceId,
            queryId: query.id,
            createdById: adminId,
            origin: 'web',
            name: chart.name,
            display: JSON.stringify({ kind: chart.kind, dataset: dataset.name }),
          },
        });
        chartId = created.id;
        await tx.chartKnowledgeReference.create({
          data: { spaceId, chartId, topic, version: 1 },
        });
      }
      await attachCard(spaceId, boardId, chartId, tx, chart.kind === 'table');
    }
  });
}

async function attachCard(
  spaceId: string,
  boardId: string,
  chartId: string,
  client: Prisma.TransactionClient = prisma,
  fullWidth = false,
) {
  const existing = await client.dashboardCard.findFirst({
    where: { spaceId, dashboardId: boardId, chartId },
  });
  if (existing) return;
  const last = await client.dashboardCard.aggregate({
    where: { spaceId, dashboardId: boardId },
    _max: { position: true },
  });
  await client.dashboard.update({
    where: { spaceId_id: { spaceId, id: boardId } },
    data: {
      version: { increment: 1 },
      cards: {
        create: {
          chartId,
          position: (last._max.position ?? 0) + 1,
          layout: JSON.stringify(fullWidth ? { fullWidth: true } : {}),
        },
      },
    },
  });
}

async function main() {
  console.log('Seeding DataCube database...');
  const { space, admin, member, users } = await seedIdentity();
  const userIds = users.map(({ id }) => id);
  const datasets = await seedSources(space.id, userIds);
  const boards = await seedDashboards(space.id, admin.id, userIds);
  const salesDataset =
    datasets.get('sales_daily') ??
    [...datasets.entries()].find(([key]) => !boardDatasetGrains.has(key))?.[1];
  const salesBoardId = boards.get('sales');
  if (salesDataset && salesBoardId) {
    await seedSalesChart(space.id, admin.id, salesBoardId, salesDataset);
  }
  const channelDataset = datasets.get('channel_sales_daily');
  const channelChartId =
    channelDataset && (await seedChannelChart(space.id, admin.id, channelDataset));
  if (channelChartId && salesBoardId) {
    await attachCard(space.id, salesBoardId, channelChartId);
  }
  const liveDataset = datasets.get('live_sessions');
  const liveBoardId = boards.get('channel');
  if (liveDataset && liveBoardId) {
    await seedLiveCharts(space.id, admin.id, liveBoardId, liveDataset, channelChartId);
  }
  const processingDataset = datasets.get(batchDatasetKey);
  const processingBoardId = boards.get('processing');
  if (processingDataset && processingBoardId) {
    await seedProcessingCharts(space.id, admin.id, processingBoardId, processingDataset);
  }
  const stockDataset = datasets.get(stockDatasetKey);
  const inventoryBoardId = boards.get('inventory');
  if (stockDataset && inventoryBoardId) {
    await seedInventoryCharts(space.id, admin.id, inventoryBoardId, stockDataset);
  }
  console.log(`空间 ${space.name}（${space.slug}）已就绪。`);
  console.log(`管理员 ${admin.email}，普通成员 ${member.email}。`);
}

main()
  .then(() => {
    console.log('Seed completed.');
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
