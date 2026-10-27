FROM node:24-bookworm-slim AS build
WORKDIR /build
RUN corepack enable && corepack prepare pnpm@10.28.2 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/exporter/package.json apps/exporter/package.json
COPY packages/calendar-schema/package.json packages/calendar-schema/package.json
RUN pnpm install --frozen-lockfile
COPY apps/exporter/src apps/exporter/src
COPY packages packages
RUN pnpm --filter @calendar/exporter build

FROM node:24-bookworm-slim
WORKDIR /app
COPY --from=build /build/apps/exporter/dist/main.mjs /app/main.mjs
USER 1000:1000
ENV EXPORTER_CONFIG=/run/config/exporter.json
HEALTHCHECK --interval=60s --timeout=5s --start-period=90s CMD node --input-type=module -e "import{readFileSync}from'node:fs';const c=JSON.parse(readFileSync(process.env.EXPORTER_CONFIG));const t=Number(readFileSync((c.stateDir||'./runtime/private-state')+'/heartbeat'));if(!t||Date.now()-t>(c.intervalMinutes||15)*60000+180000)process.exit(1)"
ENTRYPOINT ["node", "/app/main.mjs"]
