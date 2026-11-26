import { fork } from 'node:child_process';
import { join } from 'node:path';
import { type SqliteRequest, type SqliteResult } from './sqlite-query.process';

let activeQueries = 0;

export async function querySqlite(request: SqliteRequest): Promise<SqliteResult> {
  if (activeQueries >= 5) throw new Error('SQLite 查询繁忙。');
  activeQueries++;
  try {
    return await new Promise<SqliteResult>((resolve, reject) => {
      const child = fork(join(__dirname, 'sqlite-query.process.js'), {
        execArgv: [],
        serialization: 'advanced',
        stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
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
      child.once('message', (message: SqliteResult | null) => {
        clearTimeout(timeout);
        if (message) resolve(message);
        else reject(new Error('SQLite 查询失败。'));
      });
      child.send(request);
    });
  } finally {
    activeQueries--;
  }
}
