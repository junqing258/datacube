# Repository Guidelines

## Project Structure & Module Organization
DataCube is a pnpm workspace + Turborepo monorepo. Application packages live under `apps/`: `apps/web/` houses the React/Vite client — route screens in `src/pages`, API helpers in `src/services`, shared UI in `src/components`, static assets in `public/` — and `apps/server/` hosts the NestJS API with feature modules inside `src/modules`, cross-cutting DTOs/filters in `src/common`, and the Prisma schema plus seed under `prisma/`. Root configs (`pnpm-workspace.yaml`, `turbo.json`, `.prettierrc`) span the repo. Product docs live in `产品方案.md` / `DESIGN.md`, the HTML prototype in `prototype/`, and business knowledge Markdown in `knowledge/`.

## Build, Test, and Development Commands
- `pnpm install`: one-time bootstrap (npm/yarn blocked by the `preinstall` guard).
- `pnpm dev`, `pnpm dev:web`, `pnpm dev:server`: run both apps or a scoped target with live reload.
- `pnpm build`, `pnpm build:web`, `pnpm build:server`: produce build artifacts.
- `pnpm prisma:migrate`, `pnpm prisma:seed`, `pnpm docker:up|down`: manage the database (sqlite by default, MySQL optional).
- `pnpm lint`, `pnpm type-check`, `pnpm format:check`: keep TypeScript, oxlint, and Prettier happy before commits.

## TypeScript 7 Notes
The repo uses TypeScript v7 (native compiler, `typescript@^7.0.2`). The TS 7 npm package ships only the `tsc` binary — no programmatic JS API yet. Consequences:
- Server build/dev uses `tsc` directly (not `nest build` / `nest start`).
- Tests use `@swc/jest` (not `ts-jest`).
- Linting uses `oxlint` (not `typescript-eslint`, which requires `typescript <6.1`).
- tsconfig: no `baseUrl`; `paths` entries must be relative (`"@/*": ["./src/*"]`).
Revisit when TS 7.x restores the compiler API.

## Coding Style & Naming Conventions
Strict TypeScript with oxlint + Prettier, two-space indentation, single quotes, and trailing commas. Name React components/files in PascalCase, hooks/utilities in camelCase, and env vars in `UPPER_SNAKE_CASE`. Default to functional React components and DTO-backed Nest controllers. Server imports stay relative (no runtime path alias).

## Testing Guidelines
Backend testing uses Jest (see `server/package.json`) with `*.spec.ts` colocated beside modules. Run `pnpm --filter datacube-server run test` for units and `... run test:e2e` for HTTP flows. The web package has no runner yet; if you add Vitest/Playwright, keep specs near the component and document the invocation in the PR.

## Commit & Pull Request Guidelines
Follow Conventional Commit format (`feat:`, `fix:`, `chore:`) with an optional scope (`feat(web): ...`). A PR should include a summary, screenshots for UI work, and the commands executed (`pnpm test`, `pnpm lint`, migrations).

## Security & Configuration Tips
Keep secrets out of git: no `.env*` (commit only `.env.example`), Prisma credentials, or uploaded files. Store `JWT_SECRET` and `DATABASE_URL` locally per `server/.env.example`. Prefer `pnpm prisma:migrate` over editing the database by hand.
