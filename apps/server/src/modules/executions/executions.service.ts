import {
  BadRequestException,
  GoneException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import {
  DatasetsService,
  QueryTimeoutException,
  type Cell,
  type QueryRow,
} from '../datasets/datasets.service';
import {
  canonicalParameters,
  effectiveParameters,
  parseStoredSpec,
  readDisplay,
  record,
  type ChartSpec,
  type SqlChartSpec,
} from '../charts/chart-spec';
import { PrismaService } from '../../prisma/prisma.service';
import { type RequestSession } from '../auth/session.types';

const resultTtlMs = 7 * 24 * 60 * 60_000;
const cleanupIntervalMs = 6 * 60 * 60_000;
const cleanupBatch = 500;

function digest(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('base64url');
}

function errorCode(error: unknown) {
  if (error instanceof QueryTimeoutException) return 'QUERY_TIMEOUT';
  if (error instanceof HttpException) {
    const response = error.getResponse();
    if (typeof response === 'object' && response && 'code' in response) {
      const code = (response as { code?: unknown }).code;
      if (typeof code === 'string') return code;
    }
    const status = error.getStatus();
    if (status === 401 || status === 403) return 'PERMISSION_DENIED';
    if (status === 404) return 'DATASET_NOT_FOUND';
    if (status === 400) return 'INVALID_QUERY';
    if (status === 502) return 'QUERY_FAILED';
    if (status === 503) return 'DATASET_UNAVAILABLE';
    if (status === 504) return 'QUERY_TIMEOUT';
    return `HTTP_${status}`;
  }
  return 'QUERY_FAILED';
}

function timedOut(error: unknown) {
  return error instanceof QueryTimeoutException || errorCode(error) === 'QUERY_TIMEOUT';
}

function mappingOf(spec: SqlChartSpec) {
  return {
    label: spec.mapping?.label ?? 'label',
    value: spec.mapping?.value ?? 'value',
    x: spec.mapping?.x,
    longitude: spec.mapping?.longitude,
    latitude: spec.mapping?.latitude,
  };
}

function validateRows(
  kind: string,
  spec: SqlChartSpec,
  result: { columns: string[]; rows: QueryRow[] },
) {
  const mapping = mappingOf(spec);
  const required = ['label', 'value'] as const;
  for (const column of required) {
    if (!result.columns.includes(mapping[column])) {
      throw new BadRequestException({
        code: 'INVALID_RESULT',
        message: `查询结果须包含 ${mapping[column]} 列。`,
      });
    }
  }
  if (kind === 'scatter' && (!mapping.x || !result.columns.includes(mapping.x))) {
    throw new BadRequestException({ code: 'INVALID_RESULT', message: '散点图需要 x 字段。' });
  }
  if (
    kind === 'map' &&
    (!mapping.longitude ||
      !mapping.latitude ||
      !result.columns.includes(mapping.longitude) ||
      !result.columns.includes(mapping.latitude))
  ) {
    throw new BadRequestException({ code: 'INVALID_RESULT', message: '地图需要经纬度字段。' });
  }
  for (const [index, row] of result.rows.entries()) {
    const label = row[mapping.label];
    if ((typeof label !== 'string' && typeof label !== 'number') || !String(label).trim()) {
      throw new BadRequestException({
        code: 'INVALID_RESULT',
        message: `第 ${index + 1} 行的标签无效。`,
      });
    }
    const value = row[mapping.value];
    if (value !== null && (typeof value !== 'number' || !Number.isFinite(value))) {
      throw new BadRequestException({
        code: 'INVALID_RESULT',
        message: `第 ${index + 1} 行的数值无效。`,
      });
    }
  }
  return result;
}

@Injectable()
export class ExecutionsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ExecutionsService.name);
  private timer?: ReturnType<typeof setInterval>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly datasets: DatasetsService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => {
      void this.cleanup().catch((error) => this.logger.error('清理查询结果失败', error));
    }, cleanupIntervalMs);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async chartContext(spaceId: string, chartId: string) {
    const chart = await this.prisma.chart.findFirst({
      where: { spaceId, id: chartId },
      include: { query: true },
    });
    if (!chart) throw new NotFoundException('图表不存在。');
    let spec: ChartSpec;
    try {
      spec = parseStoredSpec(chart.query.spec);
    } catch {
      throw new BadRequestException({ code: 'INVALID_SPEC', message: '图表查询定义无效。' });
    }
    let kind = 'line';
    try {
      kind = readDisplay(JSON.parse(chart.display), chart.name).kind;
    } catch {
      // Keep the stored query runnable with the default display kind.
    }
    return { chart, spec, kind };
  }

  async create(session: RequestSession, spaceId: string, chartId: string, body: unknown) {
    const { chart, spec, kind } = await this.chartContext(spaceId, chartId);
    if (chart.archivedAt) {
      throw new BadRequestException({ code: 'CHART_ARCHIVED', message: '图表已归档，不能刷新。' });
    }
    if (spec.source !== 'sql') {
      throw new BadRequestException({
        code: 'QUERY_KIND_UNSUPPORTED',
        message: 'JS 图表的取数暂由浏览器执行，服务端保存图表定义。',
      });
    }
    const provided = record(body) ? body.parameters : undefined;
    const parameters = effectiveParameters(spec, provided);
    // Re-check dataset visibility before recording an execution.
    await this.datasets.detail(spaceId, session.userId, session.role, spec.datasetId);
    const execution = await this.prisma.queryExecution.create({
      data: {
        spaceId,
        queryId: chart.queryId,
        chartId: chart.id,
        userId: session.userId,
        origin: 'web',
        status: 'queued',
        parameters: JSON.stringify(parameters),
      },
    });
    void this.run({
      executionId: execution.id,
      spaceId,
      userId: session.userId,
      role: session.role,
      chartId: chart.id,
      queryId: chart.queryId,
      kind,
      spec,
      parameters,
    });
    return {
      id: execution.id,
      status: execution.status,
      chartId: chart.id,
      queryVersionId: chart.queryId,
      createdAt: execution.createdAt.toISOString(),
    };
  }

  private async run(input: {
    executionId: string;
    spaceId: string;
    userId: string;
    role: string | null;
    chartId: string;
    queryId: string;
    kind: string;
    spec: SqlChartSpec;
    parameters: Record<string, Cell>;
  }) {
    const startedAt = new Date();
    await this.prisma.queryExecution.update({
      where: { id: input.executionId },
      data: { status: 'running', startedAt },
    });
    try {
      const result = await this.datasets.executeSql(
        input.spaceId,
        input.userId,
        input.role,
        input.spec.datasetId,
        input.spec.sql,
        input.parameters,
      );
      const validated = validateRows(input.kind, input.spec, {
        columns: result.columns,
        rows: result.rows,
      });
      const payload = JSON.stringify(validated.rows);
      const sizeBytes = Buffer.byteLength(payload);
      const parameterDigest = digest(canonicalParameters(input.parameters));
      const scopeDigest = digest(result.dataset.fields.map(({ key }) => key).sort());
      const expiresAt = new Date(Date.now() + resultTtlMs);
      const completedAt = new Date();
      await this.prisma.$transaction(async (tx) => {
        const stored = await tx.queryResult.create({
          data: {
            spaceId: input.spaceId,
            executionId: input.executionId,
            columns: JSON.stringify(validated.columns),
            rows: payload,
            rowCount: validated.rows.length,
            sizeBytes,
            expiresAt,
          },
        });
        await tx.queryExecution.update({
          where: { id: input.executionId },
          data: {
            status: 'succeeded',
            resultRef: stored.id,
            resultExpiresAt: expiresAt,
            rowCount: validated.rows.length,
            completedAt,
            provenance: JSON.stringify({
              datasets: [
                {
                  id: result.dataset.id,
                  key: result.dataset.key,
                  connectionId: result.dataset.connectionId,
                  connectionKind: result.dataset.connectionKind,
                  fields: result.dataset.fields.map(({ key }) => key),
                  dataAsOf: null,
                },
              ],
              parameters: input.parameters,
              executedAt: startedAt.toISOString(),
            }),
          },
        });
        // A later-started execution owns the pointer; an older one may finish later.
        const existing = await tx.chartLatestResult.findUnique({
          where: {
            spaceId_chartId_queryId_parameterDigest_scopeDigest: {
              spaceId: input.spaceId,
              chartId: input.chartId,
              queryId: input.queryId,
              parameterDigest,
              scopeDigest,
            },
          },
          include: { execution: { select: { startedAt: true } } },
        });
        if (existing?.execution.startedAt && existing.execution.startedAt > startedAt) {
          return;
        }
        await tx.chartLatestResult.upsert({
          where: {
            spaceId_chartId_queryId_parameterDigest_scopeDigest: {
              spaceId: input.spaceId,
              chartId: input.chartId,
              queryId: input.queryId,
              parameterDigest,
              scopeDigest,
            },
          },
          create: {
            spaceId: input.spaceId,
            chartId: input.chartId,
            queryId: input.queryId,
            parameterDigest,
            scopeDigest,
            executionId: input.executionId,
          },
          update: { executionId: input.executionId },
        });
      });
    } catch (error) {
      const code = errorCode(error);
      await this.prisma.queryExecution.update({
        where: { id: input.executionId },
        data: {
          status: timedOut(error) ? 'timed_out' : 'failed',
          errorCode: code,
          completedAt: new Date(),
        },
      });
    }
  }

  async get(spaceId: string, id: string) {
    const execution = await this.prisma.queryExecution.findFirst({
      where: { spaceId, id },
      include: { chart: { select: { id: true, name: true, archivedAt: true } } },
    });
    if (!execution) throw new NotFoundException('执行记录不存在。');
    return {
      id: execution.id,
      chartId: execution.chartId,
      chartName: execution.chart?.name ?? null,
      queryVersionId: execution.queryId,
      status: execution.status,
      errorCode: execution.errorCode,
      rowCount: execution.rowCount,
      truncated: execution.truncated,
      parameters: execution.parameters ? JSON.parse(execution.parameters) : null,
      resultRef: execution.resultRef,
      resultExpiresAt: execution.resultExpiresAt?.toISOString() ?? null,
      createdAt: execution.createdAt.toISOString(),
      startedAt: execution.startedAt?.toISOString() ?? null,
      completedAt: execution.completedAt?.toISOString() ?? null,
      provenance: execution.provenance ? JSON.parse(execution.provenance) : null,
    };
  }

  private async readableExecution(
    session: RequestSession,
    spaceId: string,
    executionId: string,
    action: 'read' | 'download',
  ) {
    const execution = await this.prisma.queryExecution.findFirst({
      where: { spaceId, id: executionId },
      include: { query: true, chart: { select: { id: true, name: true, archivedAt: true } } },
    });
    if (!execution) throw new NotFoundException('执行记录不存在。');
    let spec: ChartSpec;
    try {
      // Read access follows the query version captured by this execution.
      spec = parseStoredSpec(execution.query.spec);
    } catch {
      throw new GoneException({ code: 'RESULT_EXPIRED', message: '查询定义已失效。' });
    }
    // Access changes take effect for existing results.
    await this.datasets.detail(spaceId, session.userId, session.role, spec.datasetId);
    const stored = await this.prisma.queryResult.findUnique({
      where: { spaceId_executionId: { spaceId, executionId } },
    });
    if (!stored || stored.expiresAt.getTime() <= Date.now() || execution.status !== 'succeeded') {
      throw new GoneException({
        code: 'RESULT_EXPIRED',
        message: '查询结果已过期，请刷新图表。',
      });
    }
    await this.prisma.auditEvent.create({
      data: {
        spaceId,
        userId: session.userId,
        origin: 'web',
        action: action === 'download' ? 'query_result.download' : 'query_result.read',
        targetType: 'QueryExecution',
        targetId: execution.id,
        status: execution.status,
        details: JSON.stringify({ rowCount: stored.rowCount, truncated: stored.truncated }),
      },
    });
    return {
      execution,
      stored,
      columns: JSON.parse(stored.columns) as string[],
      rows: JSON.parse(stored.rows) as QueryRow[],
    };
  }

  async result(session: RequestSession, spaceId: string, executionId: string) {
    const { execution, stored, columns, rows } = await this.readableExecution(
      session,
      spaceId,
      executionId,
      'read',
    );
    return {
      executionId: execution.id,
      columns,
      rows,
      rowCount: stored.rowCount,
      truncated: stored.truncated,
      expiresAt: stored.expiresAt.toISOString(),
      executedAt: (execution.completedAt ?? execution.createdAt).toISOString(),
      dataAsOf: null,
    };
  }

  async download(session: RequestSession, spaceId: string, executionId: string) {
    const { columns, rows } = await this.readableExecution(
      session,
      spaceId,
      executionId,
      'download',
    );
    return { columns, rows };
  }

  private quote(value: string, sanitizeFormula = false) {
    // Guard against spreadsheet formula injection from text cells.
    const safe = sanitizeFormula && /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
    return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
  }

  toCsv(columns: string[], rows: QueryRow[]) {
    const header = columns.map((column) => this.quote(column, true)).join(',');
    const lines = rows.map((row) =>
      columns
        .map((column) => {
          const value = row[column];
          return value === null ? '' : this.quote(String(value), typeof value === 'string');
        })
        .join(','),
    );
    return [header, ...lines].join('\r\n');
  }

  async cleanup() {
    const now = new Date();
    const pointers = await this.prisma.chartLatestResult.findMany({
      where: { execution: { resultExpiresAt: { lte: now } } },
      select: { executionId: true },
    });
    if (pointers.length) {
      await this.prisma.chartLatestResult.deleteMany({
        where: { execution: { resultExpiresAt: { lte: now } } },
      });
      // Results released from pointers keep the normal TTL from release time.
      await this.prisma.queryResult.updateMany({
        where: { executionId: { in: pointers.map(({ executionId }) => executionId) } },
        data: { expiresAt: new Date(Date.now() + resultTtlMs) },
      });
    }
    let deleted = 0;
    while (deleted < cleanupBatch) {
      const stale = await this.prisma.queryResult.findMany({
        where: { expiresAt: { lte: now } },
        select: { id: true, spaceId: true, executionId: true },
        take: 50,
      });
      if (!stale.length) break;
      deleted += stale.length;
      await this.prisma.$transaction(async (tx) => {
        await tx.queryExecution.updateMany({
          where: { resultRef: { in: stale.map(({ id }) => id) } },
          data: { resultRef: null },
        });
        await tx.queryResult.deleteMany({ where: { id: { in: stale.map(({ id }) => id) } } });
      });
    }
  }
}
