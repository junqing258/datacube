import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { readDisplay } from '../charts/chart-spec';
import { type RequestSession } from '../auth/session.types';

const kinds = new Set(['sales', 'inventory', 'processing', 'channel', 'custom']);
const visibilities = new Set(['private', 'space']);
const identifier = /^[A-Za-z0-9_-]{1,64}$/;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseJson(text: string, fallback: unknown) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function text(value: unknown, field: string, max: number, required = true) {
  if (value === undefined || value === null) {
    if (required) throw new BadRequestException(`${field}不能为空。`);
    return undefined;
  }
  if (typeof value !== 'string' || (required && !value.trim()) || value.length > max) {
    throw new BadRequestException(`${field}无效。`);
  }
  return value.trim();
}

function version(value: unknown) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new BadRequestException('expectedVersion 无效。');
  }
  return value;
}

function jsonField(value: unknown, field: string, maxBytes = 100_000) {
  if (value === undefined) return undefined;
  const parsed =
    typeof value === 'string'
      ? (() => {
          try {
            return JSON.parse(value);
          } catch {
            throw new BadRequestException(`${field}须为有效 JSON。`);
          }
        })()
      : value;
  if (typeof parsed !== 'object' || parsed === null)
    throw new BadRequestException(`${field}须为对象。`);
  if (Buffer.byteLength(JSON.stringify(parsed)) > maxBytes) {
    throw new BadRequestException(`${field}过大。`);
  }
  return JSON.stringify(parsed);
}

function cardLayout(value: unknown) {
  if (value === undefined) return undefined;
  return jsonField(value, '布局', 10_000);
}

function chartSummary(chart: {
  id: string;
  name: string;
  display: string;
  archivedAt: Date | null;
  query: { kind: string };
}) {
  let display: { kind: string; dataset: string } = { kind: 'line', dataset: chart.name };
  try {
    const parsed = readDisplay(JSON.parse(chart.display), chart.name);
    display = parsed;
  } catch {
    // Fall back to a neutral display when the stored config is broken.
  }
  return {
    id: chart.id,
    name: chart.name,
    kind: display.kind,
    dataset: display.dataset,
    source: chart.query.kind,
    archived: Boolean(chart.archivedAt),
  };
}

const dashboardInclude = {
  cards: {
    orderBy: { position: 'asc' as const },
    include: { chart: { include: { query: { select: { kind: true } } } } },
  },
  favorites: { select: { userId: true } },
  grants: { select: { userId: true, permission: true } },
};

type DashboardEntry = {
  id: string;
  name: string;
  description: string | null;
  kind: string;
  origin: string;
  version: number;
  visibility: string;
  archivedAt: Date | null;
  publishedAt: Date | null;
  filters: string;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
  cards: {
    id: string;
    chartId: string;
    titleOverride: string | null;
    layout: string;
    position: number;
    filterMapping: string | null;
    chart: {
      id: string;
      name: string;
      display: string;
      archivedAt: Date | null;
      query: { kind: string };
    };
  }[];
  favorites: { userId: string }[];
  grants: { userId: string; permission: string }[];
};

@Injectable()
export class DashboardsService {
  constructor(private readonly prisma: PrismaService) {}

  private serialize(dashboard: DashboardEntry, userId: string, admin: boolean) {
    const grant = dashboard.grants.find((item) => item.userId === userId);
    return {
      id: dashboard.id,
      name: dashboard.name,
      description: dashboard.description ?? '',
      kind: dashboard.kind,
      origin: dashboard.origin,
      visibility: dashboard.visibility,
      version: dashboard.version,
      archived: Boolean(dashboard.archivedAt),
      published: Boolean(dashboard.publishedAt),
      favorite: dashboard.favorites.some((item) => item.userId === userId),
      filters: parseJson(dashboard.filters, []),
      canEdit: admin || dashboard.createdById === userId || grant?.permission === 'edit',
      createdAt: dashboard.createdAt.toISOString(),
      updatedAt: dashboard.updatedAt.toISOString(),
      cards: dashboard.cards.map((card) => ({
        id: card.id,
        chartId: card.chartId,
        title: card.titleOverride ?? card.chart.name,
        position: card.position,
        layout: parseJson(card.layout, {}),
        filterMapping: parseJson(card.filterMapping ?? 'null', null),
        chart: chartSummary(card.chart),
      })),
    };
  }

  private visibility(spaceId: string, session: RequestSession) {
    if (session.role === 'admin') return { spaceId };
    return {
      spaceId,
      OR: [
        { visibility: 'space' },
        { createdById: session.userId },
        { grants: { some: { userId: session.userId } } },
      ],
    };
  }

  async list(spaceId: string, session: RequestSession) {
    const dashboards = await this.prisma.dashboard.findMany({
      where: this.visibility(spaceId, session),
      include: dashboardInclude,
      orderBy: { updatedAt: 'desc' },
    });
    return dashboards.map((dashboard) =>
      this.serialize(dashboard as DashboardEntry, session.userId, session.role === 'admin'),
    );
  }

  async detail(spaceId: string, session: RequestSession, id: string) {
    const dashboard = await this.prisma.dashboard.findFirst({
      where: {
        spaceId,
        id,
        ...(session.role === 'admin' ? {} : this.visibility(spaceId, session)),
      },
      include: dashboardInclude,
    });
    if (!dashboard) throw new NotFoundException('看板不存在或无权访问。');
    return this.serialize(dashboard as DashboardEntry, session.userId, session.role === 'admin');
  }

  async create(session: RequestSession, spaceId: string, body: unknown) {
    if (!record(body)) throw new BadRequestException('看板配置无效。');
    const name = text(body.name, '看板名称', 80) as string;
    const description = text(body.description, '说明', 500, false);
    const kind = typeof body.kind === 'string' && kinds.has(body.kind) ? body.kind : 'custom';
    const visibility =
      typeof body.visibility === 'string' && visibilities.has(body.visibility)
        ? body.visibility
        : 'space';
    const filters = jsonField(body.filters, '筛选定义') ?? '[]';
    const dashboard = await this.prisma.dashboard.create({
      data: {
        spaceId,
        createdById: session.userId,
        origin: 'web',
        name,
        description,
        kind,
        visibility,
        filters,
      },
      include: dashboardInclude,
    });
    return this.serialize(dashboard as DashboardEntry, session.userId, session.role === 'admin');
  }

  private async authorize(
    spaceId: string,
    session: RequestSession,
    id: string,
    mode: 'view' | 'edit',
  ) {
    if (!identifier.test(id)) throw new NotFoundException('看板不存在。');
    const dashboard = await this.prisma.dashboard.findFirst({
      where: { spaceId, id },
      include: { grants: { where: { userId: session.userId } } },
    });
    if (!dashboard) throw new NotFoundException('看板不存在。');
    const admin = session.role === 'admin';
    const visible =
      admin ||
      dashboard.visibility === 'space' ||
      dashboard.createdById === session.userId ||
      dashboard.grants.length > 0;
    if (!visible) throw new NotFoundException('看板不存在或无权访问。');
    if (mode === 'edit') {
      const grant = dashboard.grants[0];
      if (!admin && dashboard.createdById !== session.userId && grant?.permission !== 'edit') {
        throw new ForbiddenException({ code: 'FORBIDDEN', message: '没有编辑该看板的权限。' });
      }
    }
    return dashboard;
  }

  private async bump(
    spaceId: string,
    id: string,
    expected: number,
    allowArchived: boolean,
    mutate: (tx: Prisma.TransactionClient) => Promise<void>,
  ) {
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.dashboard.updateMany({
        where: {
          spaceId,
          id,
          version: expected,
          ...(allowArchived ? {} : { archivedAt: null }),
        },
        data: { version: { increment: 1 } },
      });
      if (updated.count === 0) {
        const current = await tx.dashboard.findFirst({ where: { spaceId, id } });
        throw new ConflictException({
          code: 'DASHBOARD_VERSION_CONFLICT',
          message: '看板已在其他会话更新，请刷新后重试。',
          currentVersion: current?.version ?? null,
        });
      }
      await mutate(tx);
    });
  }

  async update(spaceId: string, session: RequestSession, id: string, body: unknown) {
    if (!record(body)) throw new BadRequestException('看板配置无效。');
    await this.authorize(spaceId, session, id, 'edit');
    const expected = version(body.expectedVersion);
    const data: {
      name?: string;
      description?: string | null;
      kind?: string;
      visibility?: string;
      filters?: string;
      archivedAt?: Date | null;
    } = {};
    if (body.name !== undefined) data.name = text(body.name, '看板名称', 80) as string;
    if (body.description !== undefined) {
      data.description = text(body.description, '说明', 500, false) ?? null;
    }
    if (body.kind !== undefined) {
      if (typeof body.kind !== 'string' || !kinds.has(body.kind)) {
        throw new BadRequestException('看板类型无效。');
      }
      data.kind = body.kind;
    }
    if (body.visibility !== undefined) {
      if (typeof body.visibility !== 'string' || !visibilities.has(body.visibility)) {
        throw new BadRequestException('看板可见范围无效。');
      }
      data.visibility = body.visibility;
    }
    if (body.filters !== undefined) data.filters = jsonField(body.filters, '筛选定义');
    if (body.archived === true) data.archivedAt = new Date();
    if (body.archived === false) data.archivedAt = null;

    await this.bump(spaceId, id, expected, true, async (tx) => {
      await tx.dashboard.update({ where: { id }, data });
    });
    return this.detail(spaceId, session, id);
  }

  async addCard(spaceId: string, session: RequestSession, id: string, body: unknown) {
    if (!record(body)) throw new BadRequestException('卡片配置无效。');
    await this.authorize(spaceId, session, id, 'edit');
    const expected = version(body.expectedVersion);
    const chartId = text(body.chartId, '图表', 120) as string;
    const chart = await this.prisma.chart.findFirst({
      where: { spaceId, id: chartId, archivedAt: null },
    });
    if (!chart) throw new NotFoundException('图表不存在或已归档。');
    const titleOverride = text(body.titleOverride, '卡片标题', 80, false);
    const layout = cardLayout(body.layout) ?? '{}';
    const filterMapping =
      body.filterMapping === undefined
        ? null
        : (jsonField(body.filterMapping, '筛选映射', 10_000) ?? null);
    await this.bump(spaceId, id, expected, false, async (tx) => {
      const position = (await tx.dashboardCard.count({ where: { spaceId, dashboardId: id } })) + 1;
      await tx.dashboardCard.create({
        data: {
          spaceId,
          dashboardId: id,
          chartId,
          titleOverride,
          layout,
          position,
          filterMapping,
        },
      });
    });
    return this.detail(spaceId, session, id);
  }

  async updateCard(
    spaceId: string,
    session: RequestSession,
    id: string,
    cardId: string,
    body: unknown,
  ) {
    if (!record(body)) throw new BadRequestException('卡片配置无效。');
    await this.authorize(spaceId, session, id, 'edit');
    const expected = version(body.expectedVersion);
    const card = await this.prisma.dashboardCard.findFirst({
      where: { spaceId, dashboardId: id, id: cardId },
    });
    if (!card) throw new NotFoundException('卡片不存在。');
    const data: {
      titleOverride?: string | null;
      layout?: string;
      filterMapping?: string | null;
    } = {};
    if (body.titleOverride !== undefined) {
      data.titleOverride = text(body.titleOverride, '卡片标题', 80, false) ?? null;
    }
    if (body.layout !== undefined) data.layout = cardLayout(body.layout);
    if (body.filterMapping !== undefined) {
      data.filterMapping = jsonField(body.filterMapping, '筛选映射', 10_000) ?? null;
    }
    await this.bump(spaceId, id, expected, false, async (tx) => {
      await tx.dashboardCard.update({ where: { id: card.id }, data });
    });
    return this.detail(spaceId, session, id);
  }

  async removeCard(
    spaceId: string,
    session: RequestSession,
    id: string,
    cardId: string,
    body: unknown,
  ) {
    if (!record(body)) throw new BadRequestException('请提交看板版本。');
    await this.authorize(spaceId, session, id, 'edit');
    const expected = version(body.expectedVersion);
    const card = await this.prisma.dashboardCard.findFirst({
      where: { spaceId, dashboardId: id, id: cardId },
    });
    if (!card) throw new NotFoundException('卡片不存在。');
    await this.bump(spaceId, id, expected, false, async (tx) => {
      await tx.dashboardCard.delete({ where: { id: card.id } });
      await tx.dashboardCard.updateMany({
        where: { spaceId, dashboardId: id, position: { gt: card.position } },
        data: { position: { decrement: 1 } },
      });
    });
    return this.detail(spaceId, session, id);
  }

  async layout(spaceId: string, session: RequestSession, id: string, body: unknown) {
    if (!record(body)) throw new BadRequestException('布局配置无效。');
    await this.authorize(spaceId, session, id, 'edit');
    const expected = version(body.expectedVersion);
    if (!Array.isArray(body.cards) || !body.cards.length) {
      throw new BadRequestException('请提交完整的卡片列表。');
    }
    const entries = body.cards.map((entry) => {
      if (
        !record(entry) ||
        typeof entry.id !== 'string' ||
        typeof entry.position !== 'number' ||
        !Number.isInteger(entry.position) ||
        entry.position < 1
      ) {
        throw new BadRequestException('卡片布局无效。');
      }
      return {
        id: entry.id,
        position: entry.position,
        layout: cardLayout(entry.layout),
      };
    });
    const cards = await this.prisma.dashboardCard.findMany({
      where: { spaceId, dashboardId: id },
      select: { id: true },
    });
    const existing = new Set(cards.map(({ id: cardId }) => cardId));
    const submitted = new Set(entries.map(({ id: cardId }) => cardId));
    if (
      submitted.size !== entries.length ||
      submitted.size !== existing.size ||
      entries.some(({ id: cardId }) => !existing.has(cardId))
    ) {
      throw new BadRequestException('布局须提交该看板的全部唯一卡片。');
    }
    const positions = new Set(entries.map(({ position }) => position));
    if (positions.size !== entries.length) throw new BadRequestException('卡片位置不能重复。');
    await this.bump(spaceId, id, expected, false, async (tx) => {
      for (const entry of entries) {
        await tx.dashboardCard.update({
          where: { id: entry.id },
          data: {
            position: entry.position,
            ...(entry.layout === undefined ? {} : { layout: entry.layout }),
          },
        });
      }
    });
    return this.detail(spaceId, session, id);
  }

  async copy(spaceId: string, session: RequestSession, id: string, body: unknown) {
    await this.authorize(spaceId, session, id, 'view');
    const source = await this.prisma.dashboard.findFirst({
      where: { spaceId, id },
      include: { cards: true },
    });
    if (!source) throw new NotFoundException('看板不存在。');
    const name = record(body) ? text(body.name, '看板名称', 80, false) : undefined;
    const created = await this.prisma.$transaction(async (tx) => {
      const dashboard = await tx.dashboard.create({
        data: {
          spaceId,
          createdById: session.userId,
          origin: 'web',
          name: name ?? `${source.name} 副本`,
          description: source.description,
          kind: source.kind,
          visibility: 'private',
          filters: source.filters,
        },
      });
      if (source.cards.length) {
        await tx.dashboardCard.createMany({
          data: source.cards.map((card) => ({
            spaceId,
            dashboardId: dashboard.id,
            chartId: card.chartId,
            titleOverride: card.titleOverride,
            layout: card.layout,
            position: card.position,
            filterMapping: card.filterMapping,
          })),
        });
      }
      return tx.dashboard.findFirstOrThrow({
        where: { id: dashboard.id },
        include: dashboardInclude,
      });
    });
    return this.serialize(created, session.userId, session.role === 'admin');
  }

  async favorite(spaceId: string, session: RequestSession, id: string, value: boolean) {
    await this.authorize(spaceId, session, id, 'view');
    if (value) {
      await this.prisma.dashboardFavorite.upsert({
        where: { spaceId_userId_dashboardId: { spaceId, userId: session.userId, dashboardId: id } },
        create: { spaceId, userId: session.userId, dashboardId: id },
        update: {},
      });
    } else {
      await this.prisma.dashboardFavorite.deleteMany({
        where: { spaceId, userId: session.userId, dashboardId: id },
      });
    }
    return { favorite: value };
  }
}
