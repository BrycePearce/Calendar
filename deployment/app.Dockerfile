FROM node:24-alpine AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.28.2 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/package.json
COPY packages/calendar-schema/package.json packages/calendar-schema/package.json
RUN pnpm install --frozen-lockfile
COPY apps/web apps/web
COPY packages packages
COPY assets assets
COPY tsconfig.json ./
RUN pnpm build

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8080
COPY --from=build --chown=node:node /app/apps/web/.output ./.output
RUN mkdir -p /srv/public /srv/private-state && chown -R node:node /srv
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=210s --retries=3 CMD node -e "fetch('http://127.0.0.1:8080/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", ".output/server/index.mjs"]
