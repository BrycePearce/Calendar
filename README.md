# EdonCloud Calendar

Read-only TV and movie release calendar. Sonarr and Radarr feed a private exporter, which writes sanitized JSON for a static Nginx website. Dates describe scheduled airings and releases, not download or playback availability.

![Calendar month view with fictional TV and movie releases](docs/images/calendar-demo.png)

_Preview uses fictional demo data._

## Try it locally

Use Node.js 24 LTS and pnpm 10.28.2.

```sh
corepack enable
corepack prepare pnpm@10.28.2 --activate
pnpm install --frozen-lockfile
pnpm dev:demo
```

`pnpm dev:demo` generates fictional TV episodes and movie releases for the current month, then starts the development server. No API keys, Sonarr/Radarr, or Docker are needed. Open the local URL printed in the terminal; filters, search, event details, and mobile agenda work normally.

Run it again to refresh the demo dates. Data stays in ignored `apps/web/public/data/` and is excluded from production Docker builds. Production never falls back to demo data. To develop without fixtures, delete `apps/web/public/data/calendar.json` and run `pnpm dev`.

## Deployment

Two containers: `web` serves static files; `exporter` contacts private Sonarr/Radarr services and exposes no port.

1. Create `private/`, `runtime/public/`, and `runtime/private-state/`.
2. Copy `deployment/exporter.example.json` to `private/exporter.json` and `deployment/public-config.example.json` to `private/public-config.json`.
3. Enter API keys privately into `private/sonarr-key` and `private/radarr-key`. Set upstream URLs in the private exporter config.
4. Choose publication settings. The example's empty `allowIds` lists publish nothing. Remove `allowIds` and set `monitoredOnly: true` to publish monitored items. TV requires both series and episode monitoring. Without either restriction, all dated calendar results are eligible.
5. Set host permissions before starting: exporter UID/GID defaults to `1000:1000`, web to `101:101`. Exporter needs write access to both runtime directories and read access to its keys/config. Keep private files restricted; public directories/files must be readable by web (typically 0755/0644). Compose supports `EXPORTER_UID`, `EXPORTER_GID`, `WEB_UID`, and `WEB_GID` overrides.

```sh
docker compose -f deployment/compose.yaml config --quiet
docker compose -f deployment/compose.yaml up -d --build
docker compose -f deployment/compose.yaml ps
```

Put machine-specific settings in an ignored `deployment/compose.local.yaml` and include it with a second `-f` argument. Compose binds web to host loopback port 8080 by default. A tunnel in another container cannot reach that host binding through its own `localhost`: use a shared Docker network or a deliberately configured host-reachable port. Point Cloudflare Tunnel only to web. Never expose Sonarr/Radarr or mount private files into web.

The exporter refreshes at startup and every 15 minutes by default, covering 30 days back through 180 days ahead. Settings include `intervalMinutes`, `daysBack`, `daysAhead`, and `timeoutMs`. Source config supports `url`, `apiKeyFile`, `apiVersion`, `allowIds`, and `monitoredOnly`. Sonarr supports v3/v5 paths; Radarr uses v3. Validate compatibility with installed versions privately.

Only sanitized data is retained on upstream failures. Check the UI's per-source status; container health alone does not establish upstream success. Keys/config changes require an exporter restart. Keep persistent state and public output across upgrades. Back up private files separately and retain previous images for rollback.

## Public configuration and data

All fields in `private/public-config.json` are public: `title`, `brandMark`, `tagline`, `timezone` (`local` or `UTC`), optional `requestUrl` (HTTPS), `requestLabel`, and `staleAfterMinutes`. Never put credentials or internal addresses here. See `deployment/public-config.example.json` for an example.

The versioned contract in `packages/calendar-schema/src/index.ts` publishes generation time, coverage, source health/last-success times, and events containing namespaced numeric IDs, media type, titles, release type, and dates. Episodes may include season/episode numbers and use timestamped air dates. Movie dates remain date-only. Titles and these fields are intentionally public. Browser filters do not control publication.

Nginx serves missing JSON as 404. Keep HTML, config, and calendar JSON revalidating at the CDN; hashed assets may be cached immutably. No Start server runtime or upstream proxy is deployed.

## Checks

```sh
pnpm build
pnpm lint
pnpm typecheck
pnpm test
pnpm format:check
pnpm scan
```

`pnpm scan` requires Gitleaks on PATH or `GITLEAKS_BIN`; it checks the working tree, Git history, and built frontend markers. Scanning cannot guarantee absence of secrets. Keep credentials, live exports, logs, and screenshots out of Git. Rotate credentials if they reach shared artifacts or history.

Browser tests use synthetic data against the built web container at `http://127.0.0.1:8080` (override with `TEST_BASE_URL`): run `pnpm exec playwright install chromium`, then `pnpm test:e2e`. GitHub CI runs checks and container tests automatically; it does not deploy.

No application license has been selected. Bundled font and UI component license notices are in `licenses/`.
