import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  NotFoundException,
  OnModuleDestroy,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Pool as PgPool, types as pgTypes, type QueryArrayConfig } from 'pg';
import {
  createPool as createMySqlPool,
  type Pool as MySqlPool,
  type RowDataPacket,
} from 'mysql2/promise';
import { querySqlite } from './sqlite-query';

type Cell = string | number | boolean | null;
type Source = {
  name: string;
  connection: string;
  table: string;
  fields: string[];
  timeField?: string;
};
type Connection =
  | { kind: 'postgresql'; pool: PgPool }
  | { kind: 'mysql'; pool: MySqlPool }
  | { kind: 'sqlite'; filename: string };
const identifier = /^[A-Za-z_][A-Za-z0-9_]*$/;
const rowLimit = 10_000;
const resultLimit = 10 * 1024 * 1024;

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

function readSources(config: ConfigService) {
  const keys = new Map<string, Source>();
  const raw: unknown = JSON.parse(config.get<string>('CHART_DATA_SOURCES') || '{}');
  if (!record(raw)) throw new Error('CHART_DATA_SOURCES 须为 JSON 对象。');
  for (const [key, entry] of Object.entries(raw)) {
    if (!record(entry)) throw new Error('数据源配置须为对象。');
    const { name, connection, table, fields, timeField } = entry;
    if (
      !identifier.test(key) ||
      typeof name !== 'string' ||
      !name.trim() ||
      typeof connection !== 'string' ||
      !identifier.test(connection) ||
      typeof table !== 'string' ||
      !table.split('.').every((part) => identifier.test(part)) ||
      !Array.isArray(fields) ||
      !fields.length ||
      fields.some((field) => typeof field !== 'string' || !identifier.test(field)) ||
      new Set(fields).size !== fields.length ||
      (timeField !== undefined && (typeof timeField !== 'string' || !fields.includes(timeField)))
    ) {
      throw new Error(`数据源 ${key} 的配置无效。`);
    }
    keys.set(key, { name, connection, table, fields, timeField });
  }
  return keys;
}

function hash(text: string) {
  return createHash('sha256').update(text).digest();
}

@Injectable()
export class ChartDataService implements OnModuleDestroy {
  private readonly sources: Map<string, Source>;
  private readonly urls: Record<string, unknown>;
  private readonly credential?: Buffer;
  private readonly connections = new Map<string, Connection>();

  constructor(config: ConfigService) {
    this.sources = readSources(config);
    const urls: unknown = JSON.parse(config.get<string>('CHART_DATA_CONNECTIONS') || '{}');
    if (!record(urls)) throw new Error('CHART_DATA_CONNECTIONS 须为 JSON 对象。');
    this.urls = urls;
    const token = config.get<string>('CHART_DATA_TOKEN');
    if (token) this.credential = hash(token);
  }

  authorize(header?: string) {
    if (!this.credential || !this.sources.size) {
      throw new ServiceUnavailableException('服务端尚未配置图表数据源。');
    }
    const token = header?.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token || !timingSafeEqual(this.credential, hash(token))) {
      throw new UnauthorizedException('请输入图表数据访问令牌。');
    }
  }

  list() {
    return [...this.sources].map(([id, { name, connection, table, fields, timeField }]) => ({
      id,
      name,
      kind: this.connection(connection).kind,
      table,
      fields,
      timeField,
    }));
  }

  private connection(id: string): Connection {
    const cached = this.connections.get(id);
    if (cached) return cached;
    const url = Object.hasOwn(this.urls, id) ? this.urls[id] : undefined;
    let connection: Connection;
    try {
      if (typeof url !== 'string') throw new Error();
      const { protocol } = new URL(url);
      if (protocol === 'postgresql:' || protocol === 'postgres:') {
        connection = {
          kind: 'postgresql',
          pool: new PgPool({
            connectionString: url,
            connectionTimeoutMillis: 3000,
            statement_timeout: 5000,
            query_timeout: 6000,
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
          // The pool discards unusable idle connections.
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
      } else if (protocol === 'file:' && url.startsWith('file:///')) {
        connection = { kind: 'sqlite', filename: fileURLToPath(url) };
      } else {
        throw new Error();
      }
    } catch {
      throw new ServiceUnavailableException('该数据源的数据库连接配置无效。');
    }
    this.connections.set(id, connection);
    return connection;
  }

  async read(body: unknown) {
    if (!record(body) || typeof body.dataset !== 'string') {
      throw new BadRequestException('请指定数据源。');
    }
    const source = this.sources.get(body.dataset);
    if (!source) throw new NotFoundException('数据源未登记。');
    const connection = this.connection(source.connection);
    const fields = body.fields;
    if (
      fields !== undefined &&
      (!Array.isArray(fields) ||
        !fields.length ||
        fields.some((field) => typeof field !== 'string' || !identifier.test(field)) ||
        new Set(fields).size !== fields.length)
    ) {
      throw new BadRequestException('查询字段须为无重复的标识符。');
    }
    const quote = (name: string) => (connection.kind === 'mysql' ? `\`${name}\`` : `"${name}"`);
    const values: Cell[] = [];
    const bind = (value: Cell) => {
      values.push(value);
      return connection.kind === 'postgresql' ? `$${values.length}` : '?';
    };
    let sql: string;
    if (body.mode === 'dataset') {
      if (!Array.isArray(fields) || fields.some((field) => !source.fields.includes(field))) {
        throw new BadRequestException('查询字段须已登记在数据源中。');
      }
      const conditions: string[] = [];
      if (body.window !== undefined) {
        const { window } = body;
        if (
          !source.timeField ||
          !record(window) ||
          !date(window.startDay) ||
          !date(window.endDay) ||
          window.startDay >= window.endDay
        ) {
          throw new BadRequestException('请选择有日期字段的数据源并提交有效日期窗口。');
        }
        const field = quote(source.timeField);
        conditions.push(
          `${field} >= ${bind(window.startDay)}`,
          `${field} < ${bind(window.endDay)}`,
        );
      }
      const filters = body.filters ?? [];
      if (!Array.isArray(filters) || filters.length > 20)
        throw new BadRequestException('筛选条件无效。');
      for (const filter of filters) {
        if (
          !record(filter) ||
          typeof filter.field !== 'string' ||
          !source.fields.includes(filter.field) ||
          !Array.isArray(filter.values) ||
          !filter.values.length ||
          filter.values.length > 100 ||
          !filter.values.every((value) => cell(value) && value !== null)
        ) {
          throw new BadRequestException('筛选须使用已登记的字段和有效的值。');
        }
        conditions.push(`${quote(filter.field)} IN (${filter.values.map(bind).join(', ')})`);
      }
      const table = source.table.split('.').map(quote).join('.');
      sql = `SELECT ${fields.map(quote).join(', ')} FROM ${table}`;
      if (conditions.length) sql += ` WHERE ${conditions.join(' AND ')}`;
    } else if (body.mode === 'sql' && typeof body.query === 'string') {
      sql = bindQuery(body.query, body.params ?? {}, bind);
    } else {
      throw new BadRequestException('查询方式无效。');
    }

    const limit = fields === undefined ? 500 : rowLimit;
    const query = `SELECT * FROM (\n${sql}\n) AS chart_result LIMIT ${limit + 1}`;
    let columns: string[];
    let rows: unknown[][];
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
          rows = result.rows;
          columns = result.fields.map(({ name }) => name);
        } finally {
          // Discard the session instead of retaining state set by the query.
          client.release(true);
        }
      } else if (connection.kind === 'mysql') {
        const client = await connection.pool.getConnection();
        const timeout = setTimeout(() => client.destroy(), 5000);
        try {
          await client.query('SET SESSION MAX_EXECUTION_TIME = 5000');
          await client.query('START TRANSACTION READ ONLY');
          const [result, metadata] = await client.execute<RowDataPacket[][]>(
            { sql: query, rowsAsArray: true },
            values,
          );
          rows = result;
          columns = metadata.map(({ name }) => name);
        } finally {
          clearTimeout(timeout);
          client.destroy();
        }
      } else {
        ({ rows, columns } = await querySqlite({
          filename: connection.filename,
          sql: query,
          values,
        }));
      }
    } catch {
      throw new BadGatewayException('数据库查询失败，请核对连接、查询语句和只读账号权限。');
    }
    if (rows.length > limit) throw new BadRequestException(`查询结果超过 ${limit} 行。`);
    const selected: string[] = fields ?? columns;
    if (
      new Set(columns).size !== columns.length ||
      selected.some((field) => !columns.includes(field))
    ) {
      throw new BadRequestException('查询结果须包含指定的列，且列名不能重复。');
    }
    const indexes = selected.map((field) => columns.indexOf(field));
    let bytes = 0;
    const result = rows.map((row) => {
      const entries = indexes.map((index) => {
        const value = row[index];
        if (cell(value)) return [columns[index], value];
        if (value instanceof Date && Number.isFinite(value.getTime())) {
          return [columns[index], value.toISOString()];
        }
        throw new BadRequestException(`查询列 ${columns[index]} 须返回文本、数值、布尔值或空值。`);
      });
      const item = Object.fromEntries(entries);
      bytes += Buffer.byteLength(JSON.stringify(item)) + 1;
      if (bytes > resultLimit) throw new BadRequestException('查询结果超过 10 MiB。');
      return item;
    });
    return { columns: selected, rows: result };
  }

  async onModuleDestroy() {
    await Promise.all(
      [...this.connections.values()].map((connection) =>
        connection.kind === 'sqlite' ? undefined : connection.pool.end(),
      ),
    );
  }
}

function bindQuery(query: string, params: unknown, bind: (value: Cell) => string) {
  const statement = query.trim().replace(/;$/, '');
  if (statement.length > 30_000 || !/^(?:SELECT|WITH)\b/i.test(statement) || !record(params)) {
    throw new BadRequestException('请输入一条 SELECT 查询。');
  }
  const used = new Set<string>();
  const tokens =
    /--[^\r\n]*|\/\*[\s\S]*?\*\/|'(?:''|\\[\s\S]|[^'])*'|"(?:""|[^"])*"|`(?:``|[^`])*`|(\$(?:[A-Za-z_]\w*)?\$)[\s\S]*?\1|::|:([A-Za-z_]\w*)|[;?]|\$\d+/g;
  const sql = statement.replace(tokens, (token, _dollar, name: string | undefined) => {
    if (name) {
      const value = Object.hasOwn(params, name) ? params[name] : undefined;
      if (!cell(value)) throw new BadRequestException(`缺少有效的 SQL 参数 ${name}。`);
      used.add(name);
      return bind(value);
    }
    if (token === ';' || token === '?' || /^\$\d+$/.test(token)) {
      throw new BadRequestException('请输入单条查询，参数使用 :名称。');
    }
    return token;
  });
  if (used.size !== Object.keys(params).length)
    throw new BadRequestException('SQL 参数须匹配查询。');
  return sql;
}
