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

pnpm dev                     # 同时启动 web (5173) + server (3000)
```

单独启动：

```bash
pnpm dev:web                 # http://localhost:5173
pnpm dev:server              # http://localhost:3000/api，Swagger 文档 /api/docs
```

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
