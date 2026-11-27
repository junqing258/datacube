import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DatasetsService } from '../datasets/datasets.service';
import { readChartSpec, readDisplay, type ChartSpec } from './chart-spec';
import { type RequestSession } from '../auth/session.types';

type ChartWithRelations = {
  id: string;
  name: string;
  spaceId: string;
  queryId: string;
  createdById: string;
  display: string;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  query: { spec: string; datasetId: string; kind: string; createdAt: Date };
  latestResults?: {
    executionId: string;
    updatedAt: Date;
    execution: {
      id: string;
      status: string;
      rowCount: number | null;
      truncated: boolean;
      errorCode: string | null;
      completedAt: Date | null;
      parameters: string | null;
    };
  }[];
  knowledge?: { topic: string; version: number }[];
  _count?: { cards: number };
};

function readDisplaySafe(value: string, name: string) {
  try {
    return readDisplay(JSON.parse(value), name);
  } catch {
    return { kind: 'line' as const, dataset: name };
  }
}

function serialize(chart: ChartWithRelations, withSpec: boolean) {
  const display = readDisplaySafe(chart.display, chart.name);
  const latest = chart.latestResults?.[0];
  return {
    id: chart.id,
    name: chart.name,
    createdById: chart.createdById,
    kind: display.kind,
    dataset: display.dataset,
    display,
    source: chart.query.kind,
    queryVersionId: chart.queryId,
    archived: Boolean(chart.archivedAt),
    archivedAt: chart.archivedAt?.toISOString() ?? null,
    referencedBy: chart._count?.cards ?? 0,
    knowledge: chart.knowledge ?? [],
    createdAt: chart.createdAt.toISOString(),
    updatedAt: chart.updatedAt.toISOString(),
    ...(withSpec ? { spec: readChartSpecSafe(chart.query.spec) } : {}),
    latest: latest
      ? {
          executionId: latest.execution.id,
          status: latest.execution.status,
          rowCount: latest.execution.rowCount,
          truncated: latest.execution.truncated,
          errorCode: latest.execution.errorCode,
          parameters: latest.execution.parameters
            ? readJsonSafe(latest.execution.parameters)
            : null,
          completedAt: latest.execution.completedAt?.toISOString() ?? null,
          updatedAt: latest.updatedAt.toISOString(),
        }
      : null,
  };
}

const aliasPattern = /^[A-Za-z_][A-Za-z0-9_]*$/;

type BindingInput = { alias: string; datasetId: string };

function readBindings(value: unknown): BindingInput[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 10) {
    throw new BadRequestException('数据绑定须为最多 10 项的数组。');
  }
  const aliases = new Set<string>();
  return value.map((entry) => {
    if (typeof entry !== 'object' || entry === null) {
      throw new BadRequestException('数据绑定配置无效。');
    }
    const record = entry as Record<string, unknown>;
    const { alias, datasetId } = record;
    if (
      typeof alias !== 'string' ||
      !aliasPattern.test(alias) ||
      typeof datasetId !== 'string' ||
      !datasetId ||
      aliases.has(alias)
    ) {
      throw new BadRequestException('数据绑定的别名须为唯一标识符，并指定数据集。');
    }
    aliases.add(alias);
    return { alias, datasetId };
  });
}

function readJsonSafe(text: string) {
  try {
    return JSON.parse(text) as Record<string, string | number | boolean | null>;
  } catch {
    return null;
  }
}

function readChartSpecSafe(spec: string) {
  try {
    const parsed = JSON.parse(spec);
    return parsed as ChartSpec;
  } catch {
    return null;
  }
}

@Injectable()
export class ChartsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly datasets: DatasetsService,
  ) {}

  private relations = {
    query: { select: { spec: true, datasetId: true, kind: true, createdAt: true } },
    knowledge: { select: { topic: true, version: true } },
    latestResults: {
      take: 1,
      orderBy: { updatedAt: 'desc' as const },
      include: {
        execution: {
          select: {
            id: true,
            status: true,
            rowCount: true,
            truncated: true,
            errorCode: true,
            completedAt: true,
            parameters: true,
          },
        },
      },
    },
  };

  async list(spaceId: string, archived = false) {
    const charts = await this.prisma.chart.findMany({
      where: { spaceId, ...(archived ? {} : { archivedAt: null }) },
      include: { ...this.relations, _count: { select: { cards: true } } },
      orderBy: { updatedAt: 'desc' },
    });
    return charts.map((chart) => serialize(chart as ChartWithRelations, false));
  }

  async find(spaceId: string, id: string) {
    const chart = await this.prisma.chart.findFirst({
      where: { spaceId, id },
      include: this.relations,
    });
    if (!chart) throw new NotFoundException('图表不存在。');
    return chart as ChartWithRelations;
  }

  async detail(spaceId: string, id: string) {
    return serialize(await this.find(spaceId, id), true);
  }

  async create(session: RequestSession, spaceId: string, body: unknown) {
    if (typeof body !== 'object' || body === null) {
      throw new BadRequestException('图表配置无效。');
    }
    const input = body as Record<string, unknown>;
    const name = typeof input.name === 'string' ? input.name.trim() : '';
    if (!name || name.length > 80) throw new BadRequestException('图表名称须为 1 至 80 个字符。');
    const spec = readChartSpec(input.spec);
    const display = readDisplay(input.display, spec.datasetId);
    const bindings = readBindings(input.bindings);
    if (spec.source === 'js' && (!bindings || !bindings.length)) {
      throw new BadRequestException('JS 图表须提交数据集绑定。');
    }
    if (bindings && !bindings.some(({ datasetId }) => datasetId === spec.datasetId)) {
      throw new BadRequestException('数据集绑定须包含图表的主数据集。');
    }
    if (bindings) {
      for (const { datasetId } of bindings) {
        await this.datasets.detail(spaceId, session.userId, session.role, datasetId);
      }
    }
    // Fail early when the selected dataset is not visible to this member.
    const dataset = await this.datasets.detail(
      spaceId,
      session.userId,
      session.role,
      spec.datasetId,
    );
    const created = await this.prisma.$transaction(async (tx) => {
      const query = await tx.queryDefinition.create({
        data: {
          spaceId,
          datasetId: spec.datasetId,
          kind: spec.source,
          spec: JSON.stringify(spec),
        },
      });
      if (bindings?.length) {
        await tx.queryDatasetBinding.createMany({
          data: bindings.map(({ alias, datasetId }) => ({
            spaceId,
            queryId: query.id,
            alias,
            datasetId,
          })),
        });
      }
      return tx.chart.create({
        data: {
          spaceId,
          queryId: query.id,
          createdById: session.userId,
          origin: 'web',
          name,
          display: JSON.stringify({ ...display, dataset: display.dataset || dataset.name }),
        },
      });
    });
    return this.detail(spaceId, created.id);
  }

  async update(session: RequestSession, spaceId: string, id: string, body: unknown) {
    const chart = await this.find(spaceId, id);
    if (session.role !== 'admin' && chart.createdById !== session.userId) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: '没有编辑该图表的权限。' });
    }
    if (typeof body !== 'object' || body === null) {
      throw new BadRequestException('图表配置无效。');
    }
    const input = body as Record<string, unknown>;
    const data: { name?: string; display?: string; archivedAt?: Date | null; queryId?: string } =
      {};
    if (input.name !== undefined) {
      if (typeof input.name !== 'string' || !input.name.trim() || input.name.length > 80) {
        throw new BadRequestException('图表名称须为 1 至 80 个字符。');
      }
      data.name = input.name.trim();
    }
    if (input.display !== undefined) {
      data.display = JSON.stringify(readDisplay(input.display, chart.name));
    }
    if (input.archived === true) data.archivedAt = new Date();
    if (input.archived === false) data.archivedAt = null;

    let nextSpec: ChartSpec | undefined;
    const bindings = readBindings(input.bindings);
    if (input.spec !== undefined) {
      const spec = readChartSpec(input.spec);
      nextSpec = spec;
      if (spec.source === 'js' && (!bindings || !bindings.length)) {
        throw new BadRequestException('JS 图表须提交数据集绑定。');
      }
      if (bindings && !bindings.some(({ datasetId }) => datasetId === spec.datasetId)) {
        throw new BadRequestException('数据集绑定须包含图表的主数据集。');
      }
      if (bindings) {
        for (const { datasetId } of bindings) {
          await this.datasets.detail(spaceId, session.userId, session.role, datasetId);
        }
      }
      await this.datasets.detail(spaceId, session.userId, session.role, spec.datasetId);
    }

    await this.prisma.$transaction(async (tx) => {
      if (nextSpec) {
        const query = await tx.queryDefinition.create({
          data: {
            spaceId,
            datasetId: nextSpec.datasetId,
            kind: nextSpec.source,
            spec: JSON.stringify(nextSpec),
          },
        });
        data.queryId = query.id;
        if (bindings?.length) {
          await tx.queryDatasetBinding.createMany({
            data: bindings.map(({ alias, datasetId }) => ({
              spaceId,
              queryId: query.id,
              alias,
              datasetId,
            })),
          });
        }
      }
      await tx.chart.update({ where: { id: chart.id }, data });
      if (nextSpec !== undefined || input.archived === true) {
        // Pointers valid for the replaced/archived query version no longer apply.
        await tx.chartLatestResult.deleteMany({ where: { spaceId, chartId: chart.id } });
      }
    });
    return this.detail(spaceId, chart.id);
  }
}
