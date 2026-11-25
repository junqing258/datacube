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

## SSH 一键部署

本地需要 Docker Engine、Buildx、Docker Compose 和 SSH。目标 Linux 主机需要 Bash、Docker、支持 `up --wait` 的 Compose，以及 `gzip`、`tar` 和 `flock`。SSH 用户须能写入部署目录并运行 Docker。

1. 将 `.env.deploy.example` 复制为 `.env.deploy`。填写 `DEPLOY_SSH_TARGET`（如 `deploy@example.com`），并将 `JWT_SECRET` 替换为部署专用随机值（可用 `openssl rand -hex 32` 生成）。
2. 执行 `DEPLOY_DRY_RUN=1 pnpm run deploy` 校验 Compose 配置。
3. 执行 `pnpm run deploy` 构建、上传并启动服务。部署成功后，通过目标主机的 `DATACUBE_PORT` 访问 Web（默认 `3001`）。同一端口提供 `/api`、`/api/docs` 和 `/api/health`。

Web 由 NestJS 直接提供，Compose 只启动一个 Server 容器。容器启动时执行 Prisma 迁移，SQLite 数据存放在 Compose 的 `data` 卷中。默认部署目录为 `/opt/datacube`，后续更新在同一目录执行相同的部署命令即可复用数据卷。

可用 `pnpm run deploy test` 读取 `.env.test`。环境专用文件会覆盖可选的根目录 `.env`。同一主机上的不同环境应使用不同的部署目录末级名称和端口，以隔离 Compose 项目及数据库。

## 常用命令

| 命令 | 说明 |
| --- | --- |
| `pnpm build` | 构建全部（`build:web` / `build:server`） |
| `pnpm lint` / `pnpm lint:fix` | ESLint 检查 / 修复 |
| `pnpm type-check` | tsc --noEmit 类型检查 |
| `pnpm format` | Prettier 格式化 |
| `pnpm test` | 运行测试 |
| `pnpm prisma:migrate` | 数据库迁移（dev） |
| `pnpm prisma:studio` | Prisma 数据浏览 |
| `pnpm docker:up` / `docker:down` | MySQL（可选） |

## 规范

- Conventional Commits（`feat:`、`fix:`、`chore:`，可加 scope 如 `feat(web): ...`）
- 提交前跑 `pnpm lint` 与 `pnpm type-check`
- 密钥不入库：`.env` 只放本地，参照 `.env.example`
