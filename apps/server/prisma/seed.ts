import { PrismaClient } from '@prisma/client';
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { hashPassword } from '../src/modules/auth/password';

const prisma = new PrismaClient();

const identifier = /^[A-Za-z_][A-Za-z0-9_]*$/;
const tablePattern = /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)?$/;

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

  for (const [user, role] of [
    [admin, 'admin'],
    [member, 'member'],
  ] as const) {
    await prisma.spaceMember.upsert({
      where: { spaceId_userId: { spaceId: space.id, userId: user.id } },
      create: { spaceId: space.id, userId: user.id, role },
      update: { role, disabledAt: null },
    });
  }
  return { space, admin, member };
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
    return new Map<
      string,
      { datasetId: string; table: string; timeField?: string; fields: string[] }
    >();
  }

  const registered = new Map<
    string,
    { datasetId: string; table: string; timeField?: string; fields: string[] }
  >();

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
    const dataset = existing
      ? await prisma.dataset.update({
          where: { id: existing.id },
          data: {
            name,
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
            grain: timeField ? 'daily' : 'record',
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
          unit: /amount|price|revenue|cost/i.test(field) ? 'CNY' : undefined,
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
    name: '多仓库存与缺货',
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

async function seedDashboards(spaceId: string, adminId: string, memberId: string) {
  const boards = new Map<string, string>();
  for (const seed of boardSeeds) {
    const existing = await prisma.dashboard.findFirst({ where: { spaceId, name: seed.name } });
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
    for (const userId of [adminId, memberId]) {
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
  dataset: { datasetId: string; table: string; timeField?: string; fields: string[] },
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

async function seedChannelChart(
  spaceId: string,
  adminId: string,
  boardId: string,
  dataset: { datasetId: string; table: string; timeField?: string; fields: string[] },
) {
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
    await attachCard(spaceId, boardId, existing.id);
    return;
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
  await attachCard(spaceId, boardId, created.id);
}

async function attachCard(spaceId: string, boardId: string, chartId: string) {
  const existing = await prisma.dashboardCard.findFirst({
    where: { spaceId, dashboardId: boardId, chartId },
  });
  if (existing) return;
  const position =
    (await prisma.dashboardCard.count({ where: { spaceId, dashboardId: boardId } })) + 1;
  await prisma.dashboardCard.create({
    data: { spaceId, dashboardId: boardId, chartId, position, layout: JSON.stringify({}) },
  });
}

async function main() {
  console.log('Seeding DataCube database...');
  const { space, admin, member } = await seedIdentity();
  const datasets = await seedSources(space.id, [admin.id, member.id]);
  const boards = await seedDashboards(space.id, admin.id, member.id);
  const salesDataset = datasets.get('sales_daily') ?? datasets.values().next().value;
  if (salesDataset && boards.get('sales')) {
    await seedSalesChart(space.id, admin.id, boards.get('sales')!, salesDataset);
    const channelDataset = datasets.get('channel_sales_daily');
    if (channelDataset) {
      await seedChannelChart(space.id, admin.id, boards.get('sales')!, channelDataset);
    }
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
