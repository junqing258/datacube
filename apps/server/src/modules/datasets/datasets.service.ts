import {
  BadRequestException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { existsSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool as PgPool, types as pgTypes, type QueryArrayConfig } from 'pg';
import {
  createPool as createMySqlPool,
  type Pool as MySqlPool,
  type RowDataPacket,
} from 'mysql2/promise';
import { querySqlite } from './sqlite-query';
import { PrismaService } from '../../prisma/prisma.service';

export type Cell = string | number | boolean | null;
export type QueryRow = Record<string, Cell>;
export type QueryResult = { columns: string[]; rows: QueryRow[] };

export class ResultTooLargeException extends HttpException {
  constructor(message = '查询结果超过 10,000 行或 10 MiB。') {
    super({ code: 'RESULT_TOO_LARGE', message }, 400);
  }
}

export class QueryFailedException extends HttpException {
  constructor() {
    super({ code: 'QUERY_FAILED', message: '数据库查询失败，请核对数据连接和查询语句。' }, 502);
  }
}

export class QueryTimeoutException extends HttpException {
  constructor() {
    super({ code: 'QUERY_TIMEOUT', message: '查询超时。' }, 504);
  }
}

type Connection =
  | { kind: 'postgresql'; pool: PgPool }
  | { kind: 'mysql'; pool: MySqlPool }
  | { kind: 'sqlite'; filename: string };

type LoadedDataset = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  kind: string;
  table: string;
  timeField?: string;
  fields: { id: string; key: string; name: string; dataType: string; unit: string | null }[];
  connectionId: string;
  connectionName: string;
  connectionKind: string;
};

export interface DatasetSummary {
  id: string;
  key: string;
  name: string;
  description?: string;
  kind: string;
  connection: { id: string; name: string; kind: string };
  table: string;
  fields: string[];
  timeField?: string;
}

export interface DatasetDetail extends Omit<DatasetSummary, 'fields'> {
  fields: {
    key: string;
    name: string;
    dataType: string;
    unit?: string;
    description?: string;
  }[];
}

const identifier = /^[A-Za-z_][A-Za-z0-9_]*$/;
const tableName = /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)?$/;
export const rowLimit = 10_000;
export const resultLimit = 10 * 1024 * 1024;
const timeout = 5000;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function date(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function cell(value: unknown): value is Cell {
  return (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  );
}

function parseJson(text: string, label: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new ServiceUnavailableException(`${label}配置无效。`);
  }
}

/** Names introduced by a leading WITH clause; FROM/JOIN may only reference these or the dataset table. */
function cteNames(statement: string): string[] {
  if (!/^\s*with\b/i.test(statement)) return [];
  const names: string[] = [];
  let index = statement.search(/\bwith\b/i) + 4;
  if (/\s*recursive\b/i.test(statement.slice(index, index + 12))) {
    index = statement.slice(index).search(/recursive/i) + index + 9;
  }
  while (index < statement.length) {
    const rest = statement.slice(index);
    const start = rest.search(/[A-Za-z_]/);
    if (start < 0) break;
    const before = rest.slice(0, start).trim();
    if (before && before !== ',') break;
    const name = rest.slice(start).match(/^[A-Za-z_][A-Za-z0-9_]*/)?.[0];
    if (!name) break;
    names.push(name);
    index += start + name.length;
    const afterName = statement.slice(index);
    if (!/^\s*(?:\([^)]*\)\s*)?as\s*\(/i.test(afterName)) break;
    const open = afterName.search(/\(/i);
    let depth = 0;
    let cursor = index + open;
    for (; cursor < statement.length; cursor++) {
      if (statement[cursor] === '(') depth++;
      else if (statement[cursor] === ')' && --depth === 0) break;
    }
    index = cursor + 1;
  }
  return names;
}

function assertSqlScope(dataset: LoadedDataset, statement: string) {
  if (statement.length > 30_000) throw new BadRequestException('查询语句过长。');
  if (/[;?]|\$\d+/.test(statement.replace(/(^--[^\n]*|\/\*[\s\S]*?\*\/|'(?:''|[^'])*')/g, ''))) {
    throw new BadRequestException('请输入一条不含分号占位符的只读查询。');
  }
  if (!/^\s*select\b|^\s*with\b/i.test(statement)) {
    throw new BadRequestException('只允许 SELECT 查询。');
  }
  if (
    /\b(?:attach|detach|pragma|load_extension|readfile|writefile|into\s+outfile|into\s+dumpfile)\b/i.test(
      statement,
    )
  ) {
    throw new BadRequestException('查询包含不允许的操作。');
  }
  const allowed = new Set(cteNames(statement));
  const target = dataset.table.split('.').at(-1)!;
  for (const match of statement.matchAll(/\b(?:from|join)\s+([A-Za-z_][A-Za-z0-9_.]*)/gi)) {
    const table = match[1];
    if (table === dataset.table || table.split('.').at(-1) === target || allowed.has(table))
      continue;
    throw new BadRequestException(`查询只能读取已登记的对象 ${dataset.table}。`);
  }
}

export function bindQuery(
  statement: string,
  params: Record<string, Cell>,
  postgres = true,
  strict = true,
) {
  const values: Cell[] = [];
  const used = new Set<string>();
  const tokens =
    /--[^\r\n]*|\/\*[\s\S]*?\*\/|'(?:''|\\[\s\S]|[^'])*'|"(?:""|[^"])*"|`(?:``|[^`])*`|(\$(?:[A-Za-z_]\w*)?\$)[\s\S]*?\1|::|:([A-Za-z_]\w*)|[;?]|\$\d+/g;
  const sql = statement.replace(tokens, (token, _dollar, name: string | undefined) => {
    if (name) {
      const value = Object.hasOwn(params, name) ? params[name] : undefined;
      if (!cell(value)) throw new BadRequestException(`缺少有效的查询参数 ${name}。`);
      used.add(name);
      values.push(value);
      return postgres ? `$${values.length}` : '?';
    }
    if (token === ';' || token === '?' || /^\$\d+$/.test(token)) {
      throw new BadRequestException('请输入单条查询，参数使用 :名称。');
    }
    return token;
  });
  if (strict && used.size !== Object.keys(params).length) {
    throw new BadRequestException('查询参数须与语句中的占位符一致。');
  }
  return { sql, values };
}

@Injectable()
export class DatasetsService implements OnModuleDestroy {
  private readonly logger = new Logger(DatasetsService.name);
  private readonly connections = new Map<string, { key: string; connection: Connection }>();

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  private async load(
    spaceId: string,
    userId: string,
    role: string | null,
    datasetId: string,
  ): Promise<LoadedDataset> {
    if (!identifier.test(datasetId)) throw new NotFoundException('数据集不存在。');
    const dataset = await this.prisma.dataset.findFirst({
      where: { spaceId, id: datasetId, disabledAt: null },
      include: {
        fields: true,
        connection: true,
        grants: { where: { userId } },
      },
    });
    if (!dataset || !dataset.connection || dataset.connection.disabledAt) {
      throw new NotFoundException('数据集不存在或已停用。');
    }
    const admin = role === 'admin';
    if (!admin && !dataset.grants.length) throw new NotFoundException('数据集不存在。');
    const fieldGrants = admin
      ? []
      : await this.prisma.fieldGrant.findMany({
          where: { spaceId, datasetId, userId },
          select: { fieldId: true },
        });
    const fields =
      !admin && fieldGrants.length
        ? dataset.fields.filter((field) => fieldGrants.some(({ fieldId }) => fieldId === field.id))
        : dataset.fields;
    const contract = parseJson(dataset.contract, '数据集');
    if (
      !record(contract) ||
      typeof contract.table !== 'string' ||
      !tableName.test(contract.table)
    ) {
      throw new ServiceUnavailableException('数据集缺少有效的表或视图映射。');
    }
    return {
      id: dataset.id,
      key: dataset.key,
      name: dataset.name,
      description: dataset.description,
      kind: dataset.kind,
      table: contract.table,
      timeField:
        dataset.timeFieldKey && fields.some((field) => field.key === dataset.timeFieldKey)
          ? dataset.timeFieldKey
          : undefined,
      fields: fields.map(({ id, key, name, dataType, unit }) => ({
        id,
        key,
        name,
        dataType,
        unit,
      })),
      connectionId: dataset.connection.id,
      connectionName: dataset.connection.name,
      connectionKind: dataset.connection.kind,
    };
  }

  async list(spaceId: string, userId: string, role: string | null): Promise<DatasetSummary[]> {
    const admin = role === 'admin';
    const datasets = await this.prisma.dataset.findMany({
      where: {
        spaceId,
        disabledAt: null,
        ...(admin ? {} : { grants: { some: { userId } } }),
      },
      include: {
        fields: true,
        connection: true,
        grants: { where: { userId } },
      },
      orderBy: { createdAt: 'asc' },
    });
    const fieldGrants = admin
      ? []
      : await this.prisma.fieldGrant.findMany({
          where: { spaceId, userId },
          select: { datasetId: true, fieldId: true },
        });
    return datasets
      .filter(({ connection }) => connection && !connection.disabledAt)
      .map((dataset) => {
        const contract = parseJson(dataset.contract, '数据集');
        const table = record(contract) && typeof contract.table === 'string' ? contract.table : '';
        const allowed = fieldGrants.filter(({ datasetId }) => datasetId === dataset.id);
        const fields = (
          allowed.length
            ? dataset.fields.filter((field) => allowed.some(({ fieldId }) => fieldId === field.id))
            : dataset.fields
        ).map(({ key }) => key);
        return {
          id: dataset.id,
          key: dataset.key,
          name: dataset.name,
          description: dataset.description ?? undefined,
          kind: dataset.kind,
          connection: {
            id: dataset.connection!.id,
            name: dataset.connection!.name,
            kind: dataset.connection!.kind,
          },
          table,
          fields,
          timeField:
            dataset.timeFieldKey && fields.includes(dataset.timeFieldKey)
              ? dataset.timeFieldKey
              : undefined,
        };
      });
  }

  async detail(
    spaceId: string,
    userId: string,
    role: string | null,
    datasetId: string,
  ): Promise<DatasetDetail> {
    if (!identifier.test(datasetId)) throw new NotFoundException('数据集不存在。');
    const dataset = await this.prisma.dataset.findFirst({
      where: { spaceId, id: datasetId, disabledAt: null },
      include: {
        fields: true,
        connection: true,
        grants: { where: { userId } },
      },
    });
    if (!dataset || !dataset.connection || dataset.connection.disabledAt) {
      throw new NotFoundException('数据集不存在或已停用。');
    }
    if (role !== 'admin' && !dataset.grants.length) throw new NotFoundException('数据集不存在。');
    const fieldGrants =
      role === 'admin'
        ? []
        : await this.prisma.fieldGrant.findMany({
            where: { spaceId, datasetId, userId },
            select: { fieldId: true },
          });
    const fields = fieldGrants.length
      ? dataset.fields.filter((field) => fieldGrants.some(({ fieldId }) => fieldId === field.id))
      : dataset.fields;
    const contract = parseJson(dataset.contract, '数据集');
    const table = record(contract) && typeof contract.table === 'string' ? contract.table : '';
    return {
      id: dataset.id,
      key: dataset.key,
      name: dataset.name,
      description: dataset.description ?? undefined,
      kind: dataset.kind,
      connection: {
        id: dataset.connection.id,
        name: dataset.connection.name,
        kind: dataset.connection.kind,
      },
      table,
      fields: fields.map(({ key, name, dataType, unit, description }) => ({
        key,
        name,
        dataType,
        unit: unit ?? undefined,
        description: description ?? undefined,
      })),
      timeField:
        dataset.timeFieldKey && fields.some(({ key }) => key === dataset.timeFieldKey)
          ? dataset.timeFieldKey
          : undefined,
    };
  }

  private async connection(connectionId: string): Promise<Connection> {
    const stored = await this.prisma.dataConnection.findFirst({
      where: { id: connectionId, disabledAt: null },
    });
    if (!stored) throw new ServiceUnavailableException('数据连接不存在或已停用。');
    const cacheKey = `${stored.id}:${stored.updatedAt.getTime()}`;
    const cached = this.connections.get(stored.id);
    if (cached?.key === cacheKey) return cached.connection;

    const settings = parseJson(stored.settings, '数据连接');
    let connection: Connection;
    try {
      if (stored.kind === 'sqlite') {
        if (!record(settings) || typeof settings.path !== 'string') throw new Error();
        const path = settings.path.startsWith('file:///')
          ? fileURLToPath(settings.path)
          : isAbsolute(settings.path)
            ? settings.path
            : undefined;
        if (!path || !existsSync(path)) throw new Error();
        connection = { kind: 'sqlite', filename: path };
      } else {
        const url = this.resolveSecret(stored.secretRef);
        const { protocol } = new URL(url);
        if (protocol === 'postgresql:' || protocol === 'postgres:') {
          connection = {
            kind: 'postgresql',
            pool: new PgPool({
              connectionString: url,
              connectionTimeoutMillis: 3000,
              statement_timeout: timeout,
              query_timeout: timeout + 1000,
              max: 5,
              types: {
                getTypeParser(oid, format) {
                  if (oid === 1082) return (value: string) => value;
                  if (oid === 20 || oid === 1700)
                    return (value: string) => {
                      const numeric = Number(value);
                      return oid === 20 && !Number.isSafeInteger(numeric) ? value : numeric;
                    };
                  return pgTypes.getTypeParser(oid, format);
                },
              },
            }),
          };
          connection.pool.on('error', () => {
            // Unusable idle connections are discarded by the pool.
          });
        } else if (protocol === 'mysql:') {
          connection = {
            kind: 'mysql',
            pool: createMySqlPool({
              uri: url,
              connectionLimit: 5,
              queueLimit: 10,
              connectTimeout: 3000,
              dateStrings: true,
              supportBigNumbers: true,
              bigNumberStrings: false,
              decimalNumbers: true,
              multipleStatements: false,
            }),
          };
        } else {
          throw new Error();
        }
      }
    } catch {
      throw new ServiceUnavailableException('该数据连接的凭据或配置无效。');
    }
    const previous = this.connections.get(stored.id);
    if (previous && previous.connection.kind !== 'sqlite' && previous.connection !== connection) {
      await previous.connection.pool.end();
    }
    this.connections.set(stored.id, { key: cacheKey, connection });
    return connection;
  }

  private resolveSecret(secretRef: string | null) {
    if (!secretRef) throw new ServiceUnavailableException('数据连接缺少凭据引用。');
    if (secretRef.startsWith('env:')) {
      const value = this.config.get<string>(secretRef.slice(4));
      if (!value) throw new ServiceUnavailableException('数据连接凭据未配置。');
      return value;
    }
    if (secretRef.startsWith('connections:')) {
      const raw: unknown = JSON.parse(this.config.get<string>('CHART_DATA_CONNECTIONS') || '{}');
      const key = secretRef.slice('connections:'.length);
      const value = record(raw) ? raw[key] : undefined;
      if (typeof value !== 'string') throw new ServiceUnavailableException('数据连接凭据未配置。');
      return value;
    }
    throw new ServiceUnavailableException('数据连接凭据引用无效。');
  }

  private async run(
    connection: Connection,
    sql: string,
    values: Cell[],
    limit: number,
  ): Promise<QueryResult> {
    const query = `SELECT * FROM (\n${sql}\n) AS chart_result LIMIT ${limit + 1}`;
    let columns: string[];
    let raw: unknown[][];
    try {
      if (connection.kind === 'postgresql') {
        const client = await connection.pool.connect();
        try {
          await client.query('BEGIN READ ONLY');
          const statement: QueryArrayConfig<Cell[]> & { queryMode: 'extended' } = {
            text: query,
            values,
            rowMode: 'array',
            queryMode: 'extended',
          };
          const result = await client.query<unknown[], Cell[]>(statement);
          raw = result.rows as unknown[][];
          columns = result.fields.map(({ name }) => name);
        } finally {
          client.release(true);
        }
      } else if (connection.kind === 'mysql') {
        const client = await connection.pool.getConnection();
        const timer = setTimeout(() => client.destroy(), timeout);
        try {
          await client.query('SET SESSION MAX_EXECUTION_TIME = 5000');
          await client.query('START TRANSACTION READ ONLY');
          const [result, metadata] = await client.execute<RowDataPacket[][]>(
            { sql: query, rowsAsArray: true },
            values,
          );
          raw = result as unknown[][];
          columns = metadata.map(({ name }) => name);
        } finally {
          clearTimeout(timer);
          client.destroy();
        }
      } else {
        const result = await querySqlite({
          filename: connection.filename,
          sql: query,
          values,
        });
        raw = result.rows;
        columns = result.columns;
      }
    } catch (error) {
      if (error instanceof HttpException) throw error;
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `数据库查询失败 (${connection.kind})：${message}`,
        error instanceof Error ? error.stack : undefined,
      );
      if (/timeout|超时/i.test(message)) throw new QueryTimeoutException();
      throw new QueryFailedException();
    }
    if (raw.length > limit) throw new ResultTooLargeException();
    if (new Set(columns).size !== columns.length) {
      throw new BadRequestException('查询结果列名不能重复。');
    }
    let bytes = 0;
    const rows = raw.map((row) => {
      const item = Object.fromEntries(
        columns.map((column, index) => {
          const value = row[index];
          if (cell(value)) return [column, value];
          if (value instanceof Date && Number.isFinite(value.getTime())) {
            return [column, value.toISOString()];
          }
          if (typeof value === 'bigint') {
            const numeric = Number(value);
            return [column, Number.isSafeInteger(numeric) ? numeric : value.toString()];
          }
          throw new BadRequestException(`查询列 ${column} 须返回文本、数值、布尔值或空值。`);
        }),
      );
      bytes += Buffer.byteLength(JSON.stringify(item)) + 1;
      if (bytes > resultLimit) throw new ResultTooLargeException();
      return item;
    });
    return { columns, rows };
  }

  /** Executes a saved, parameterized SQL statement against one dataset. */
  async executeSql(
    spaceId: string,
    userId: string,
    role: string | null,
    datasetId: string,
    query: string,
    params: Record<string, Cell>,
  ) {
    const dataset = await this.load(spaceId, userId, role, datasetId);
    const statement = query.trim().replace(/;$/, '');
    assertSqlScope(dataset, statement);
    const connection = await this.connection(dataset.connectionId);
    const { sql, values } = bindQuery(statement, params, connection.kind === 'postgresql');
    const result = await this.run(connection, sql, values, rowLimit);
    return { ...result, dataset };
  }

  /** Runs a structured dataset read for browser-side JS chart transforms. */
  async read(spaceId: string, userId: string, role: string | null, body: unknown) {
    if (!record(body) || typeof body.dataset !== 'string') {
      throw new BadRequestException('请指定数据集。');
    }
    const dataset = await this.load(spaceId, userId, role, body.dataset);
    const connection = await this.connection(dataset.connectionId);
    const visible = dataset.fields.map(({ key }) => key);
    const fields = body.fields;
    if (
      fields !== undefined &&
      (!Array.isArray(fields) ||
        !fields.length ||
        fields.some((field) => typeof field !== 'string' || !identifier.test(field)) ||
        new Set(fields).size !== fields.length ||
        fields.some((field) => !visible.includes(field)))
    ) {
      throw new BadRequestException('查询字段须已登记且已授权。');
    }
    const quote = (name: string) => (connection.kind === 'mysql' ? `\`${name}\`` : `"${name}"`);
    const values: Cell[] = [];
    const bind = (value: Cell) => {
      values.push(value);
      return connection.kind === 'postgresql' ? `$${values.length}` : '?';
    };
    const projection = (fields as string[] | undefined) ?? visible.slice(0, 40);
    const table = dataset.table.split('.').map(quote).join('.');
    const conditions: string[] = [];
    let sql: string;

    if (body.mode === 'dataset') {
      if (body.window !== undefined) {
        const { window } = body;
        if (
          !dataset.timeField ||
          !record(window) ||
          !date(window.startDay) ||
          !date(window.endDay) ||
          window.startDay >= window.endDay
        ) {
          throw new BadRequestException('请选择有日期字段的数据集并提交有效日期窗口。');
        }
        conditions.push(
          `${quote(dataset.timeField)} >= ${bind(window.startDay)}`,
          `${quote(dataset.timeField)} < ${bind(window.endDay)}`,
        );
      }
      const filters = body.filters ?? [];
      if (!Array.isArray(filters) || filters.length > 20) {
        throw new BadRequestException('筛选条件无效。');
      }
      for (const filter of filters) {
        if (
          !record(filter) ||
          typeof filter.field !== 'string' ||
          !visible.includes(filter.field) ||
          !Array.isArray(filter.values) ||
          !filter.values.length ||
          filter.values.length > 100 ||
          !filter.values.every((value) => cell(value) && value !== null)
        ) {
          throw new BadRequestException('筛选须使用已登记的字段和有效的值。');
        }
        conditions.push(`${quote(filter.field)} IN (${filter.values.map(bind).join(', ')})`);
      }
      sql = `SELECT ${projection.map(quote).join(', ')} FROM ${table}`;
      if (conditions.length) sql += ` WHERE ${conditions.join(' AND ')}`;
    } else if (body.mode === 'sql' && typeof body.query === 'string') {
      const params = record(body.params) ? body.params : {};
      if (Object.values(params).some((value) => !cell(value))) {
        throw new BadRequestException('SQL 参数须为文本、数值、布尔值或空值。');
      }
      const statement = body.query.trim().replace(/;$/, '');
      assertSqlScope(dataset, statement);
      const bound = bindQuery(
        statement,
        params as Record<string, Cell>,
        connection.kind === 'postgresql',
      );
      sql = bound.sql;
      values.push(...bound.values);
    } else {
      throw new BadRequestException('查询方式无效。');
    }

    const limit = fields === undefined ? 500 : rowLimit;
    const result = await this.run(connection, sql, values, limit);
    if (fields === undefined) return { columns: result.columns, rows: result.rows };
    const selected = fields as string[];
    if (selected.some((field) => !result.columns.includes(field))) {
      throw new BadRequestException('查询结果须包含指定的列。');
    }
    return {
      columns: selected,
      rows: result.rows.map((row) =>
        Object.fromEntries(selected.map((field) => [field, row[field]])),
      ),
    };
  }

  async onModuleDestroy() {
    await Promise.all(
      [...this.connections.values()].map(({ connection }) =>
        connection.kind === 'sqlite' ? undefined : connection.pool.end(),
      ),
    );
  }
}
