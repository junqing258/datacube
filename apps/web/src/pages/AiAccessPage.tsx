import { useState, type Dispatch, type SetStateAction } from 'react';
import { DataTable, Dialog, PageHeading } from '../components/PageParts';

const endpoint = 'https://datacube.example.internal/mcp';
const config = JSON.stringify(
  {
    mcpServers: {
      datacube: { url: endpoint, headers: { Authorization: 'Bearer <DATACUBE_API_KEY>' } },
    },
  },
  null,
  2,
);

export interface DemoKey {
  name: string;
  write: boolean;
  revoked: boolean;
}

export function AiAccessPage({
  keys,
  setKeys,
}: {
  keys: DemoKey[];
  setKeys: Dispatch<SetStateAction<DemoKey[]>>;
}) {
  const [dialog, setDialog] = useState<'create' | 'key' | 'config'>();
  const [copyStatus, setCopyStatus] = useState('');
  const demoKey = `dc_demo_not_a_real_secret_${keys.length}`;

  function show(next?: typeof dialog) {
    setCopyStatus('');
    setDialog(next);
  }

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopyStatus('已复制');
    } catch {
      setCopyStatus('请手动选择并复制');
    }
  }

  return (
    <>
      <PageHeading
        title="AI接入"
        description="在外部 AI 工具中分析数据，结果保存到 DataCube 的图表和看板。"
      >
        <button className="dc-btn dc-btn-primary" onClick={() => show('create')}>
          ＋ 创建 API Key
        </button>
      </PageHeading>
      <div className="dc-columns mt-6">
        <section className="dc-page-card space-y-3">
          <span className="dc-tag">MCP</span>
          <h2>连接外部 AI 客户端</h2>
          <p>服务地址</p>
          <pre className="dc-code">{endpoint}</pre>
          <p className="text-muted">示例地址 · 将地址与 API Key 配置到支持 MCP 的客户端。</p>
          <h3>可授权的能力</h3>
          <p className="leading-7">
            读取已部署的 Markdown 业务知识 · 执行只读查询
            <br />
            创建图表 · 按 ID 更新看板 · 读取执行状态
          </p>
          <button className="dc-btn" onClick={() => show('config')}>
            查看连接配置
          </button>
        </section>
        <section className="dc-page-card space-y-3">
          <span className="dc-tag">SKILL</span>
          <h2>通过 Skill 使用</h2>
          <p className="leading-7">
            Skill 指导外部 Agent 理解平台指标和调用流程，通过 MCP 或平台 API 执行操作。沿用同一 API
            Key 权限。
          </p>
          <ol className="list-decimal space-y-2 pl-5">
            <li>安装企业提供的 DataCube Skill</li>
            <li>配置平台地址与 API Key</li>
            <li>在外部工具中查数或生成看板</li>
            <li>回到平台查看与管理结果</li>
          </ol>
        </section>
      </div>
      <section className="dc-page-card mt-5">
        <h2>API Keys</h2>
        <p className="mt-2 text-muted">
          Key 绑定创建者、业务空间及授权范围。完整密钥仅在创建时展示一次。
        </p>
        {keys.length ? (
          <DataTable
            headers={['名称', '标识', '权限', '到期时间', '状态', '操作']}
            rows={keys.map((key, index) => [
              key.name,
              `dc_demo_••••${1000 + index}`,
              key.write ? '查询、创建图表与看板' : '只读查询',
              '30 天后',
              key.revoked ? '已撤销' : '有效',
              <button
                className="dc-btn"
                disabled={key.revoked}
                onClick={() =>
                  setKeys((current) =>
                    current.map((item, position) =>
                      position === index ? { ...item, revoked: true } : item,
                    ),
                  )
                }
              >
                撤销
              </button>,
            ])}
          />
        ) : (
          <p className="mt-4 rounded-input bg-surface-soft p-4 text-muted">
            暂无 API Key，创建后可配置到外部客户端。
          </p>
        )}
      </section>
      {dialog === 'create' && (
        <Dialog title="创建 API Key" onClose={() => show()}>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const fields = new FormData(event.currentTarget);
              const name = String(fields.get('name')).trim();
              if (!name) return;
              setKeys((current) => [
                ...current,
                { name, write: fields.get('scope') === 'write', revoked: false },
              ]);
              show('key');
            }}
          >
            <label className="dc-field">
              名称
              <input
                name="name"
                className="dc-control"
                required
                pattern={String.raw`.*\S.*`}
                placeholder="例如：个人分析工具"
              />
            </label>
            <label className="dc-field">
              业务空间
              <select className="dc-control">
                <option>经营分析空间</option>
              </select>
            </label>
            <label className="dc-field">
              授权范围
              <select name="scope" className="dc-control">
                <option value="read">只读查询</option>
                <option value="write">查询 + 创建图表与看板</option>
              </select>
            </label>
            <label className="dc-field">
              有效期
              <select className="dc-control">
                <option>30 天</option>
              </select>
            </label>
            <p className="text-muted">权限受创建者已有权限限制，业务数据仅供读取。</p>
            <button className="dc-btn dc-btn-primary justify-self-start">创建</button>
          </form>
        </Dialog>
      )}
      {dialog === 'key' && (
        <Dialog title="API Key 已创建" onClose={() => show()}>
          <p className="my-3 text-muted">此密钥仅用于演示。关闭后将隐藏完整内容。</p>
          <pre className="dc-code">{demoKey}</pre>
          <div className="mt-4 flex flex-wrap gap-2">
            <button className="dc-btn" onClick={() => copy(demoKey)}>
              复制演示 Key
            </button>
            <button className="dc-btn dc-btn-primary" onClick={() => show()}>
              已保存，关闭
            </button>
          </div>
          {copyStatus && (
            <p className="mt-2" role="status">
              {copyStatus}
            </p>
          )}
        </Dialog>
      )}
      {dialog === 'config' && (
        <Dialog title="MCP 客户端连接配置" onClose={() => show()}>
          <pre className="dc-code my-4">{config}</pre>
          <button className="dc-btn" onClick={() => copy(config)}>
            复制配置
          </button>
          {copyStatus && (
            <p className="mt-2" role="status">
              {copyStatus}
            </p>
          )}
        </Dialog>
      )}
    </>
  );
}
