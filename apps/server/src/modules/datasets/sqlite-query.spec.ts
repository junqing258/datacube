import { isResult } from './sqlite-query';

describe('isResult', () => {
  it('accepts the worker result payload', () => {
    expect(isResult({ columns: ['label', 'value'], rows: [['2026-11-01', 12]] })).toBe(true);
  });

  it('rejects the dependency report node --watch injects into forked children', () => {
    expect(isResult({ 'watch:require': ['/tmp/sqlite-query.process.js'] })).toBe(false);
  });

  it('rejects the null error payload and other messages', () => {
    expect(isResult(null)).toBe(false);
    expect(isResult(undefined)).toBe(false);
    expect(isResult({ columns: ['label'] })).toBe(false);
    expect(isResult({ rows: [[1]] })).toBe(false);
  });
});
