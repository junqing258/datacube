# DataCube

面向外部 Agent 的企业 BI 平台。产品方案见 [产品方案.md](./产品方案.md)，原型见 [prototype/](./prototype)。

## 项目结构

pnpm workspace + Turborepo monorepo，前后端分离：

```
datacube/
├── apps/
│   ├── web/      # React 18 + Vite + Tailwind 前端
│   └── server/   # NestJS 10 + Prisma API 服务
├── prototype/    # 产品原型（静态 HTML）
├── knowledge/    # 业务知识文档
└── research/     # 调研资料
```

技术栈与 `hopegoo/appcenter` 一致，TypeScript 使用 v7（原生编译器）。

> **TS 7 工具链说明**：TS 7 的 npm 包只提供 `tsc` 可执行文件，暂无编译器 JS API。因此 server 构建/dev 使用 `tsc` 直出（非 `nest build`），测试用 `@swc/jest`，lint 用 `oxlint`（typescript-eslint 尚不支持 TS 7）。详见 [AGENTS.md](./AGENTS.md)。

## 环境要求

- Node.js >= 20
- pnpm >= 9（`npm i -g pnpm`）

## 快速开始

```bash
pnpm install                 # 安装依赖

# 数据库（默认 sqlite，零配置；需要 MySQL 时再启动 docker）
cd apps/server && cp -n .env.example .env && cd ../..
pnpm prisma:migrate          # 初始化数据库

pnpm dev                     # 同时启动 Web (5173) 和 API（默认 3001）
```

单独启动：

```bash
pnpm dev:web                 # http://localhost:5173
pnpm dev:server              # API 默认端口 3001，Swagger 文档 /api/docs
```

Vite 的 `/api` 代理与 Nest 使用相同的 `PORT` 优先级：进程环境变量、`apps/server/.env.local`、`apps/server/.env`，默认 `3001`。修改端口后重启前后端开发服务。

## 登录、真实数据与看板

浏览器会话使用同源 `HttpOnly` Cookie。种子脚本按空间、连接和数据集标识幂等初始化用户、空间、数据集目录、内置看板和销售趋势图表。

```bash
pnpm business:sample         # 生成本地示例业务库 apps/server/prisma/sample-business.db
```

在 `apps/server/.env.local` 设置初始口令和服务端数据目录，然后执行迁移和种子：

```bash
# apps/server/.env.local
SEED_ADMIN_PASSWORD=<至少 8 位>
SEED_MEMBER_PASSWORD=<至少 8 位>
CHART_DATA_CONNECTIONS='{"local":"file:///<绝对路径>/apps/server/prisma/sample-business.db"}'
CHART_DATA_SOURCES='{"sales_daily":{"name":"销售日汇总","connection":"local","table":"sales_daily","fields":["day","order_count","paid_amount","refund_amount","net_amount"],"timeField":"day"},"channel_sales_daily":{"name":"渠道销售日汇总","connection":"local","table":"channel_sales_daily","fields":["day","channel","order_count","paid_amount","refund_amount","net_amount"],"timeField":"day"}}'

pnpm prisma:migrate
pnpm prisma:seed
pnpm dev
```

开发环境未设置口令时使用默认口令 `admin-datacube-2026`（管理员）和 `member-datacube-2026`（普通成员），账号为 `admin@datacube.local` / `member@datacube.local`；生产环境必须显式设置。

- 登录后「数据接入」展示当前空间授权的数据集目录，连接配置与凭据只保留在服务端环境变量，页面不展示数据库地址。
- SQL 图表使用数据集的 `id` 作为 `definition.json` 的 `dataSource`，`query.sql` 返回 `label` 和 `value` 两列，日期参数使用 `:startDay` 和 `:endDay`。保存后由服务端按 30 天窗口执行并落库，结果保留 7 天。
- JS 图表保存脚本定义，取数仍在浏览器执行。`extract.js` 的 `dataset` 同样填写数据集 `id`。
- PostgreSQL 和 MySQL 使用只读连接字符串，`secretRef` 指向 `CHART_DATA_CONNECTIONS` 中的连接标识。SQL 的访问范围由业务数据库账号的授权限定，SQLite 则以只读方式访问配置的文件。
- 看板、卡片、收藏和查询版本保存在平台数据库。看板写入提交 `expectedVersion`，冲突返回 `409 DASHBOARD_VERSION_CONFLICT`。

## SSH 一键部署

本地需要 Docker Engine、Buildx、Docker Compose 和 SSH。目标 Linux 主机需要 Bash、Docker、支持 `up --wait` 的 Compose，以及 `gzip`、`tar` 和 `flock`。SSH 用户须能写入部署目录并运行 Docker。

1. 将 `.env.deploy.example` 复制为 `.env.deploy`。填写 `DEPLOY_SSH_TARGET`（如 `deploy@example.com`）和两个种子初始口令 `SEED_ADMIN_PASSWORD` / `SEED_MEMBER_PASSWORD`（8–128 个字符）。
2. 执行 `DEPLOY_DRY_RUN=1 pnpm run deploy` 校验 Compose 配置。
3. 执行 `pnpm run deploy` 构建、上传并启动服务。部署成功后，通过目标主机的 `DATACUBE_PORT` 访问 Web（默认 `3001`）。同一端口提供 `/api`、`/api/docs` 和 `/api/health`。

Web 由 NestJS 直接提供，Compose 只启动一个 Server 容器。容器启动时执行 Prisma 迁移并幂等运行种子，SQLite 数据存放在 Compose 的 `data` 卷中。种子只在首次创建用户时使用初始口令，后续启动不会重置已有密码。HTTPS 部署时将 `SESSION_COOKIE_SECURE` 设为 `true`。默认部署目录为 `/opt/datacube`，后续更新在同一目录执行相同的部署命令即可复用数据卷。

可用 `pnpm run deploy test` 读取 `.env.test`。环境专用文件会覆盖可选的根目录 `.env`。同一主机上的不同环境应使用不同的部署目录末级名称和端口，以隔离 Compose 项目及数据库。

## 常用命令

| 命令                             | 说明                                           |
| -------------------------------- | ---------------------------------------------- |
| `pnpm build`                     | 构建全部（`build:web` / `build:server`）       |
| `pnpm lint` / `pnpm lint:fix`    | ESLint 检查 / 修复                             |
| `pnpm type-check`                | tsc --noEmit 类型检查                          |
| `pnpm format`                    | Prettier 格式化                                |
| `pnpm test`                      | 运行测试                                       |
| `pnpm prisma:migrate`            | 数据库迁移（dev）                              |
| `pnpm prisma:seed`               | 数据库种子（用户、空间、数据集目录、内置看板） |
| `pnpm business:sample`           | 生成本地示例业务 SQLite 库                     |
| `pnpm prisma:studio`             | Prisma 数据浏览                                |
| `pnpm docker:up` / `docker:down` | MySQL（可选）                                  |

## 规范

- Conventional Commits（`feat:`、`fix:`、`chore:`，可加 scope 如 `feat(web): ...`）
- 提交前跑 `pnpm lint` 与 `pnpm type-check`
- 密钥不入库：`.env` 只放本地，参照 `.env.example`
