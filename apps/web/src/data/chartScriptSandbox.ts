import { type ScriptRow, type Window } from './chartScript';

type Params = Window & { timeZone: string };
type Job = {
  code: string;
  phase: 'config' | 'transform' | 'extract' | 'etlTransform';
  inputs: Record<string, ScriptRow[]>;
  params: Params;
};

type Read = (alias: string, options: unknown) => Promise<ScriptRow[]>;

function scriptWorker() {
  self.onmessage = async ({ data, ports }: MessageEvent<Job>) => {
    const port = ports[0];
    const reply = port.postMessage.bind(port);
    const stringify = JSON.stringify;
    const encode = new TextEncoder();
    const {
      create,
      freeze,
      fromEntries,
      keys,
      getPrototypeOf,
      getOwnPropertyDescriptors,
      getOwnPropertyDescriptor,
    } = Object;
    const ownKeys = Reflect.ownKeys;
    const isArray = Array.isArray;
    const arrayPrototype = Array.prototype;
    const objectPrototype = Object.prototype;
    const finite = Number.isFinite;
    const pending = new Map<
      number,
      { resolve: (rows: ScriptRow[]) => void; reject: (error: Error) => void }
    >();
    let nextRead = 0;

    port.onmessage = ({ data: result }) => {
      const read = pending.get(result.id);
      if (!read) return;
      pending.delete(result.id);
      if (typeof result.error === 'string') read.reject(new Error(result.error));
      else read.resolve(result.rows);
    };

    function read(alias: string, options?: unknown) {
      return new Promise<ScriptRow[]>((resolve, reject) => {
        const id = ++nextRead;
        reply({ type: 'read', id, alias, options });
        pending.set(id, { resolve, reject });
      });
    }

    function rowsForTransfer(value: unknown) {
      if (!isArray(value) || getPrototypeOf(value) !== arrayPrototype || value.length > 10000) {
        throw new Error('输出须为对象数组，最多 10,000 行。');
      }
      const rows = [];
      for (let index = 0; index < value.length; index++) {
        const item = getOwnPropertyDescriptor(value, index)?.value;
        if (
          item === null ||
          typeof item !== 'object' ||
          ![objectPrototype, null].includes(getPrototypeOf(item))
        ) {
          throw new Error(`第 ${index + 1} 行须为普通对象，数组须连续。`);
        }
        const own = getOwnPropertyDescriptors(item);
        const row: ScriptRow = create(null);
        for (const key of ownKeys(own)) {
          if (typeof key !== 'string') throw new Error('输出字段名须为字符串。');
          const cell = own[key].value;
          if (
            cell !== null &&
            typeof cell !== 'string' &&
            typeof cell !== 'boolean' &&
            !(typeof cell === 'number' && finite(cell))
          ) {
            throw new Error(`第 ${index + 1} 行的 ${key} 须为 JSON 标量。`);
          }
          row[key] = cell;
        }
        rows.push(row);
      }
      return rows;
    }

    try {
      const inputs = freeze(
        fromEntries(
          keys(data.inputs).map((alias) => [
            alias,
            freeze(data.inputs[alias].map((row) => freeze(row))),
          ]),
        ),
      );
      const entry = {
        config:
          'if (typeof chartConfig === "undefined") throw new Error("请声明 chartConfig。");\nreturn [chartConfig];',
        extract:
          'if (typeof extract !== "function") throw new Error("请声明 async function extract({ read, params })。");\nreturn extract(context);',
        transform:
          'if (typeof transform !== "function") throw new Error("请声明 function transform({ inputs, params })。");\nreturn transform(context);',
      };
      const extracting = data.phase === 'extract';
      const run = new Function(
        'context',
        `"use strict";\n${data.code}\n${entry[data.phase === 'etlTransform' ? 'transform' : data.phase]}`,
      );
      const params = freeze(data.params);
      const result = run(freeze(extracting ? { read, params } : { inputs, params }));
      let output: unknown = result;
      if (extracting) {
        const extracted = await result;
        if (pending.size) throw new Error('extract.js 返回前必须等待全部读取完成。');
        if (
          extracted === null ||
          typeof extracted !== 'object' ||
          ![objectPrototype, null].includes(getPrototypeOf(extracted))
        ) {
          throw new Error('extract.js 须返回按别名组织的对象。');
        }
        const descriptors = getOwnPropertyDescriptors(extracted);
        const groups: Record<string, ScriptRow[]> = create(null);
        for (const key of ownKeys(descriptors)) {
          if (typeof key !== 'string') throw new Error('提取结果别名须为字符串。');
          groups[key] = rowsForTransfer(descriptors[key].value);
        }
        output = groups;
      } else if (data.phase === 'etlTransform') {
        output = rowsForTransfer(result);
      } else if (!isArray(result) || result.length > 10000) {
        throw new Error('transform 必须同步返回对象数组，最多 10,000 行。');
      }

      const json = stringify(output, (_key, value) => {
        if (
          (typeof value === 'number' && !finite(value)) ||
          value === undefined ||
          typeof value === 'function' ||
          typeof value === 'symbol'
        ) {
          throw new Error('输出须为有效的 JSON 数据。');
        }
        return value;
      });
      if (encode.encode(json).byteLength > (extracting ? 10 : 5) * 1024 * 1024) {
        throw new Error(extracting ? '提取结果超过 10 MiB。' : '输出超过 5 MiB。');
      }
      reply({ type: 'result', json });
    } catch (error) {
      reply({ type: 'error', error: error instanceof Error ? error.message : '脚本执行失败。' });
    }
  };
}

function runSandbox(job: Job, signal?: AbortSignal, read?: Read) {
  signal?.throwIfAborted();
  return new Promise<unknown>((resolve, reject) => {
    const frame = document.createElement('iframe');
    frame.sandbox.add('allow-scripts');
    frame.hidden = true;
    frame.title = 'JS 脚本预览';
    const channel = new MessageChannel();
    const nonce = crypto.randomUUID();
    frame.srcdoc = `<!doctype html>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}' 'unsafe-eval'; worker-src blob:">
<script nonce="${nonce}">
addEventListener('message', (event) => {
  if (event.source !== parent || !event.ports[0]) return;
  const port = event.ports[0];
  const bridge = new MessageChannel();
  const url = URL.createObjectURL(new Blob([${JSON.stringify(`(${scriptWorker.toString()})();`).replace(/</g, '\\u003c')}], { type: 'text/javascript' }));
  const worker = new Worker(url);
  URL.revokeObjectURL(url);
  bridge.port1.onmessage = ({ data }) => {
    port.postMessage(data);
    if (data.type !== 'read') worker.terminate();
  };
  port.onmessage = ({ data }) => bridge.port1.postMessage(data);
  worker.onerror = () => { worker.terminate(); port.postMessage({ type: 'error', error: '脚本运行环境加载失败。' }); };
  worker.postMessage(event.data, [bridge.port2]);
}, { once: true });
</script>`;
    const pending = new Set<number>();
    let finished = false;

    function finish() {
      finished = true;
      clearTimeout(timeout);
      signal?.removeEventListener('abort', abort);
      channel.port1.close();
      frame.remove();
    }
    function fail(error: unknown) {
      if (finished) return;
      finish();
      reject(error);
    }
    function abort() {
      fail(signal?.reason);
    }
    const timeout =
      job.phase === 'extract'
        ? undefined
        : window.setTimeout(() => {
            fail(new Error('脚本执行超时（2 秒）。'));
          }, 2000);
    signal?.addEventListener('abort', abort, { once: true });

    channel.port1.onmessage = async ({ data }) => {
      if (data?.type === 'read') {
        const { id, alias, options } = data;
        if (!read || !Number.isSafeInteger(id) || typeof alias !== 'string' || pending.has(id)) {
          fail(new Error('无效的脚本读取请求。'));
          return;
        }
        if (pending.size >= 5) {
          fail(new Error('最多同时读取 5 次。'));
          return;
        }
        pending.add(id);
        try {
          const rows = await read(alias, options);
          if (!finished) channel.port1.postMessage({ id, rows });
        } catch (error) {
          fail(error);
        } finally {
          pending.delete(id);
        }
        return;
      }
      try {
        if (data?.type === 'error' && typeof data.error === 'string') {
          throw new Error(data.error.slice(0, 500));
        }
        const maxBytes = (job.phase === 'extract' ? 10 : 5) * 1024 * 1024;
        if (
          pending.size ||
          data?.type !== 'result' ||
          typeof data.json !== 'string' ||
          new Blob([data.json]).size > maxBytes
        ) {
          throw new Error('脚本输出无效、超限或仍有读取未完成。');
        }
        const result = JSON.parse(data.json);
        finish();
        resolve(result);
      } catch (error) {
        fail(error);
      }
    };
    frame.onload = () => frame.contentWindow?.postMessage(job, '*', [channel.port2]);
    document.body.append(frame);
  });
}

export async function executeScript(
  code: string,
  inputs: Job['inputs'],
  params: Params,
  phase: 'config' | 'transform' | 'etlTransform' = 'transform',
  signal?: AbortSignal,
) {
  const rows = await runSandbox({ code, inputs, params, phase }, signal);
  if (!Array.isArray(rows) || rows.length > 10000) {
    throw new Error('脚本输出无效或超过 10,000 行。');
  }
  return rows as unknown[];
}

export function executeExtract(code: string, params: Params, signal: AbortSignal, read: Read) {
  return runSandbox({ code, inputs: {}, params, phase: 'extract' }, signal, read);
}
