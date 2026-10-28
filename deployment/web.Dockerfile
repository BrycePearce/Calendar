FROM node:24-bookworm-slim AS build
WORKDIR /build
RUN corepack enable && corepack prepare pnpm@10.28.2 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/exporter/package.json apps/exporter/package.json
COPY packages/calendar-schema/package.json packages/calendar-schema/package.json
RUN pnpm install --frozen-lockfile
COPY apps/web apps/web
COPY assets assets
COPY packages packages
COPY scripts/finalize-build.mjs scripts/finalize-build.mjs
RUN pnpm --filter @calendar/web build

FROM nginx:1.30.6-alpine
COPY deployment/nginx.conf /etc/nginx/nginx.conf
COPY deployment/headers.conf /etc/nginx/headers.conf
COPY --from=build /build/apps/web/dist/csp.conf /etc/nginx/csp.conf
COPY --from=build /build/apps/web/dist/client /srv/site
USER 101:101
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
ENTRYPOINT ["nginx"]
CMD ["-g", "daemon off;"]
