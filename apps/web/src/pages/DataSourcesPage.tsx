import { useState } from 'react';
import { DataTable, Dialog, PageHeading } from '../components/PageParts';

const sources = [
  { icon: 'PG', name: 'ERP 经营数据', type: 'PostgreSQL' },
  { icon: 'MY', name: '商城与小程序', type: 'MySQL' },
  { icon: 'API', name: 'WMS 与平台接口', type: 'API' },
] as const;

export function DataSourcesPage() {
  const [connection, setConnection] = useState<(typeof sources)[number]['type']>();
  const [name, setName] = useState('');
  const [tested, setTested] = useState(false);
  const [saved, setSaved] = useState(false);

  function configure(source?: (typeof sources)[number]) {
    setConnection(source?.type ?? 'PostgreSQL');
    setName(source?.name ?? '');
    setTested(false);
    setSaved(false);
  }

  return (
    <>
      <PageHeading title="数据接入" description="管理数据库和业务 API 连接。">
        <button className="dc-btn dc-btn-primary" onClick={() => configure()}>
          ＋ 添加数据源
        </button>
      </PageHeading>
      <div className="mt-6 grid gap-4 min-[1080px]:grid-cols-3">
        {sources.map((source) => (
          <article className="dc-page-card" key={source.type}>
            <span className="grid size-11 place-items-center rounded-xl bg-primary-soft font-semibold text-primary">
              {source.icon}
            </span>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
              <h3>{source.name}</h3>
              <span className="dc-tag text-up">● 正常</span>
            </div>
            <p className="mt-1 text-muted">{source.type} · 演示映射</p>
            <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-hairline-soft pt-4">
              <span className="text-xs text-muted">最近检测 10:30</span>
              <button
                className="dc-btn"
                aria-label={`配置 ${source.name}`}
                onClick={() => configure(source)}
              >
                配置 →
              </button>
            </div>
          </article>
        ))}
      </div>
      <div className="mt-5 rounded-input bg-primary-soft p-4">
        <strong>从连接到可分析，还差一步业务理解</strong>
        <p className="mt-1 text-body">
          接入后补充字段说明、指标口径和表关联，为查询与外部分析工具提供一致的业务口径。
        </p>
      </div>
      <section className="dc-page-card mt-5">
        <h2>业务数据如何对齐</h2>
        <DataTable
          headers={['业务记录', '演示来源', '用于关联的标识', '核对项']}
          rows={[
            [
              '订单与退款',
              '微信小程序 / 商城、ERP',
              '来源渠道＋平台订单号',
              '支付、退款与 ERP 订单状态',
            ],
            [
              '库存与发货',
              'WMS',
              '仓库＋SKU＋批次、履约单号',
              '可用库存、出入库和签收状态（有回传时）',
            ],
            ['加工投入与产出', 'ERP 加工单、WMS 入库单', '仓库＋加工批次', '完工产出与已入库重量'],
            ['直播归因', '平台接口', '平台＋直播场次＋平台订单号', '只计入可匹配场次的订单'],
          ]}
        />
        <p className="mt-3 text-muted">
          示例沿用 MySQL、PostgreSQL 和 API 的接入方式。系统、字段和同步时效需现场确认。
        </p>
      </section>
      {saved && (
        <p className="mt-4 text-up" role="status">
          演示配置已完成。
        </p>
      )}
      {connection && (
        <Dialog title="配置数据源" onClose={() => setConnection(undefined)}>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              setConnection(undefined);
              setSaved(true);
            }}
          >
            <label className="dc-field">
              连接类型
              <select
                className="dc-control"
                value={connection}
                onChange={(event) => {
                  setConnection(event.target.value as typeof connection);
                  setTested(false);
                }}
              >
                {sources.map((source) => (
                  <option key={source.type}>{source.type}</option>
                ))}
              </select>
            </label>
            <label className="dc-field">
              显示名称
              <input
                className="dc-control"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="例如：经营数据库"
              />
            </label>
            {connection === 'API' ? (
              <>
                <label className="dc-field">
                  API 模式
                  <select className="dc-control">
                    <option>参数化查询 API</option>
                    <option>明细数据集 API</option>
                  </select>
                </label>
                <label className="dc-field">
                  接口 URL
                  <input
                    className="dc-control"
                    type="url"
                    placeholder="https://internal.example/api/inventory"
                  />
                </label>
                <label className="dc-field">
                  鉴权方式
                  <select className="dc-control">
                    <option>Bearer Token</option>
                    <option>自定义 Header</option>
                  </select>
                </label>
                <label className="dc-field">
                  返回数据路径
                  <input className="dc-control" placeholder="data.items" />
                </label>
              </>
            ) : (
              <div className="grid gap-4" key={connection}>
                <label className="dc-field">
                  主机
                  <input className="dc-control" placeholder="db.internal.example" />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="dc-field">
                    端口
                    <input
                      className="dc-control"
                      type="number"
                      defaultValue={connection === 'MySQL' ? 3306 : 5432}
                    />
                  </label>
                  <label className="dc-field">
                    数据库
                    <input className="dc-control" placeholder="business" />
                  </label>
                </div>
                <label className="dc-field">
                  只读账号
                  <input className="dc-control" placeholder="analytics_reader" />
                </label>
                <label className="dc-field">
                  密码
                  <input
                    className="dc-control"
                    type="password"
                    autoComplete="new-password"
                    placeholder="输入演示密码"
                  />
                </label>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <button type="button" className="dc-btn" onClick={() => setTested(true)}>
                测试连接
              </button>
              <button className="dc-btn dc-btn-primary">保存配置</button>
            </div>
            {tested && (
              <p role="status" className="text-up">
                ✓ 演示连接测试通过。
              </p>
            )}
          </form>
        </Dialog>
      )}
    </>
  );
}
