import { fork } from 'node:child_process';
import { join } from 'node:path';
import { type SqliteRequest, type SqliteResult } from './sqlite-query.process';

let activeQueries = 0;

export function isResult(message: unknown): message is SqliteResult {
  return (
    typeof message === 'object' &&
    message !== null &&
    !Array.isArray(message) &&
    Array.isArray((message as SqliteResult).columns) &&
    Array.isArray((message as SqliteResult).rows)
  );
}

export async function querySqlite(request: SqliteRequest): Promise<SqliteResult> {
  if (activeQueries >= 5) throw new Error('SQLite 查询繁忙。');
  activeQueries++;
  try {
    return await new Promise<SqliteResult>((resolve, reject) => {
      // `node --watch` marks watched processes with WATCH_REPORT_DEPENDENCIES, and
      // Node makes any fork inherit it. The worker would then send an internal
      // dependency report (`{"watch:require":[...]}`) before our own message,
      // which must not be mistaken for a query result.
      const env = { ...process.env };
      delete env.WATCH_REPORT_DEPENDENCIES;
      const child = fork(join(__dirname, 'sqlite-query.process.js'), {
        execArgv: [],
        serialization: 'advanced',
        stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
        env,
      });
      const timeout = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error('SQLite 查询超时。'));
      }, 5000);
      child.once('exit', () => {
        clearTimeout(timeout);
        reject(new Error('SQLite 查询进程已退出。'));
      });
      child.once('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      child.on('message', (message: unknown) => {
        // Ignore diagnostics that are not the single result payload the worker sends.
        if (!isResult(message) && message !== null) return;
        clearTimeout(timeout);
        if (isResult(message)) resolve(message);
        else reject(new Error('SQLite 查询失败。'));
      });
      child.send(request);
    });
  } finally {
    activeQueries--;
  }
}
