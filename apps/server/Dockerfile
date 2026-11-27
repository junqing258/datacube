FROM node:24-bookworm-slim AS base
ARG DEBIAN_MIRROR
RUN if [ -n "$DEBIAN_MIRROR" ]; then sed -i "s|http://deb.debian.org|$DEBIAN_MIRROR|g" /etc/apt/sources.list.d/debian.sources; fi \
    && apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/server/package.json apps/server/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm install --global pnpm@12.15.0 && pnpm install --frozen-lockfile
COPY apps/server/src apps/server/src
COPY apps/server/prisma apps/server/prisma
COPY apps/server/tsconfig*.json apps/server/
COPY apps/web apps/web
COPY docs/prototype/knowledge-data.js docs/prototype/knowledge-data.js
COPY docs/knowledge docs/knowledge
RUN pnpm prisma:generate && pnpm build:server && pnpm build:web

FROM base AS runtime
ENV NODE_ENV=production PORT=3001 API_PREFIX=api WEB_ROOT=/app/apps/server/public
ENV DATABASE_URL=file:/data/datacube.db
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/server/node_modules ./apps/server/node_modules
COPY --from=build /app/apps/server/dist ./apps/server/dist
COPY --from=build /app/apps/server/prisma ./apps/server/prisma
COPY --from=build /app/apps/server/src ./apps/server/src
COPY --from=build /app/apps/web/dist ./apps/server/public
RUN mkdir -p /data && chown node:node /data
WORKDIR /app/apps/server
USER node
EXPOSE 3001
CMD ["sh", "-c", "set -e; if [ \"${DEMO_LOGIN_ENABLED:-false}\" = true ]; then BUSINESS_SQLITE_PATH=/tmp/datacube-sample-business.db node node_modules/tsx/dist/cli.mjs prisma/sample-business.ts; fi; node node_modules/prisma/build/index.js migrate deploy; node node_modules/tsx/dist/cli.mjs prisma/seed.ts; exec node dist/main.js"]
