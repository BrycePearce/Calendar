# EdonCloud Calendar

A calm, read-only TV and movie release guide. A dark month calendar on desktop, a focused agenda on mobile, and cyan TV / amber movie badges throughout. Dates describe scheduled airings and releases, **not media-server availability**.

## Architecture

```text
Private Sonarr / Radarr
        | authenticated, bounded calendar requests
Private exporter (no listening port)
        | explicit field allowlist + schema validation + atomic replacement
Sanitized calendar.json
        | read-only mount
Nginx static SPA -> existing Cloudflare Tunnel -> visitors
```

No database, authentication, proxy endpoints, posters, playback, downloads, analytics, third-party runtime assets, or public iCal feeds. The frontend cannot contact upstream services: it receives no credentials and fetches only `/config.json` and `/data/calendar.json`. A configured request link is an intentional external navigation, not a background request.

## Local quick start

Use Node.js 24 LTS and pnpm 10.28.2. Commands work in PowerShell and POSIX shells from the repository root.

```sh
corepack enable
corepack prepare pnpm@10.28.2 --activate
pnpm install --frozen-lockfile
pnpm demo
pnpm dev
```

Open the printed local URL. `pnpm demo` explicitly generates fictional titles for the current month into ignored `apps/web/public/data/calendar.json`. It does not contact any service. Production never falls back to demo data; the Docker allowlist excludes this generated folder. Remove that file to exercise the initial unavailable state locally. Demo output is not a production export.

```sh
pnpm build
pnpm lint
pnpm typecheck
pnpm test
pnpm format:check
pnpm scan
```

`pnpm scan` requires [Gitleaks](https://github.com/gitleaks/gitleaks) on PATH (or `GITLEAKS_BIN`). It scans the working tree, existing Git history, and frontend assets for the test sentinel. Reports are redacted. A passing scan is not a guarantee that secrets are absent. See [CONTRIBUTING](CONTRIBUTING.md) for browser tests and [validation](docs/VALIDATION.md) for the actual local results.

## Public configuration

`apps/web/public/config.json` is the safe build default. Mount a replacement at `/srv/site/config.json` in production. Every field is **public**, downloadable by visitors, and validated with a strict Zod schema. Unknown fields are rejected. Never put credentials or internal addresses here.

| Field               | Default                                | Meaning                                                                                       |
| ------------------- | -------------------------------------- | --------------------------------------------------------------------------------------------- |
| `title`             | EdonCloud Calendar                     | Header, footer, browser title; maximum 80 characters                                          |
| `brandMark`         | E                                      | Text mark, 1–3 characters                                                                     |
| `tagline`           | Your next great watch, on the horizon. | Introductory text, maximum 160 characters                                                     |
| `timezone`          | local                                  | `local` displays episode timestamps in the visitor's timezone; `UTC` explicitly opts into UTC |
| `requestUrl`        | omitted                                | Optional public HTTPS request-service link; no embedded credentials                           |
| `requestLabel`      | Request a title                        | Link label                                                                                    |
| `staleAfterMinutes` | 60                                     | Display healthy sources as stale if their last success becomes older than this threshold      |

Movie dates always remain calendar dates. The timezone and per-source last success are visible. URL search state validates `month` (`YYYY-MM`), `view` (`month`/`agenda`), `media` (`all`/`tv`/`movie`), `releases` (array of `theatrical`, `digital`, `physical`), and `q`. Router links encode arrays as JSON. Back/forward restores filters and month. The initial layout follows the device width; selecting a view persists it in the URL and resizing does not override it.

## Private exporter configuration

Copy [the private example](deployment/exporter.example.json) to ignored `private/exporter.json`. Enter API keys directly into ignored local secret files or a runtime secret mount, **never into chat, shell command arguments, URLs, build arguments, or VITE variables**. The exporter reads key-file contents and uses `X-Api-Key` request headers. See [deployment](docs/DEPLOYMENT.md) for mount paths.

Both sources are optional. Each source accepts a private `url` (including an optional URL base), `apiKeyFile`, `apiVersion`, optional `allowIds`, and `monitoredOnly`. Sonarr supports configured v3 or v5 paths; Radarr uses v3. Defaults: refresh at startup, then 15 minutes after each completed cycle; 30 days back / 180 days ahead; 10-second request timeout. Three attempts with short exponential backoff; redirects rejected; maximum response 10 MiB and 50,000 records. No overlapping cycles. Set `intervalMinutes`, `daysBack`, `daysAhead`, `timeoutMs`, `publicDir`, and `stateDir` privately.

**Default publication policy:** omitting `allowIds` publishes all dated records returned by the calendar API; `monitoredOnly` defaults to false. An empty allowlist publishes nothing. The example deliberately sets empty allowlists. TV allowlists use series IDs; movie allowlists use movie IDs. Monitored-only TV publication requires both series and episode to be monitored. Frontend filters are not privacy controls. A change to private source configuration invalidates its old cached state before publishing, so a narrower policy cannot retain previously published titles through an outage.

Each source saves only schema-validated, sanitized last-good records in private state. Failure preserves that source's data and last-success coverage, marking it stale; initial failure yields unavailable with no events. Missing/disabled sources are unavailable. Success in one source does not depend on success in the other. Only generic errors are logged. Storage failures preserve the previous atomic public file. The UI independently detects old last-success timestamps, including when the exporter stops entirely.

## Public data contract

See [the shared schema](packages/calendar-schema/src/index.ts). Version 1 exposes only:

- `version`, `generatedAt`, requested inclusive date `coverage.start/end`.
- `sources.sonarr/radarr`: generic `health`, nullable `lastSuccess`, and nullable **last-success coverage**. These remain truthful during outages; the UI warns when the selected month extends beyond a relevant source's coverage.
- Events: stable namespaced `id`, `media`, `title`, `releaseType`; TV optionally includes `episodeTitle`, `season`, `episode` and requires an offset-aware `at`; movies require a date-only `date`.

Event identities use upstream numeric episode/movie IDs prefixed by source and suffixed by release type. These numeric identifiers are intentionally public in this contract. No paths, links, artwork, library/quality/download fields, credentials, raw errors, or upstream objects are published. Duplicate identities collapse; distinct movie release types stay distinct, including on the same date. Undated records are omitted. Invalid dated records fail that source's refresh and retain its last-good data. Text is rendered through React, never HTML injection.

## Production and limitations

See [Compose, Unraid, Tunnel, upgrades and rollback](docs/DEPLOYMENT.md). The web image contains only `dist/client`, generated CSP headers, and Nginx. Start's build-time server output is not shipped. The static SPA is proven using Nginx, not Vite preview. No server functions or server routes exist.

Upstream adapters use documented calendar response shapes with synthetic tests. **Actual installed Sonarr/Radarr versions, live responses, credentials, and network reachability remain unverified.** Verify privately before enabling publication. Calendar data inherits upstream date accuracy and the configured export horizon. Stale data can be incomplete; timezone conversion can put an episode on an adjacent calendar date at the coverage boundary.

Official compatibility references: [TanStack Start SPA mode](https://tanstack.com/start/latest/docs/framework/react/guide/spa-mode), [Vite](https://vite.dev/guide/), [FullCalendar v6 React](https://fullcalendar.io/docs/v6/react), [shadcn/ui](https://ui.shadcn.com/docs/installation/vite), [Sonarr API](https://sonarr.tv/docs/api/), [Radarr API](https://radarr.video/docs/api/), and [Node release schedule](https://github.com/nodejs/Release). Stable package versions are resolved in the committed lockfile; FullCalendar 6 is intentionally retained for its established standard plugin API. No premium plugins are used.

## Before publication

Nothing in this task authorizes pushing or deploying. Remaining owner decisions:

1. GitHub repository owner/name and public/private visibility.
2. Open-source license selection. MIT is an option; **this repository is not currently MIT-licensed**.
3. Actual deployment paths, network, permitted titles, and private credentials.
4. Explicit approval to publish or deploy.

See [third-party notices](THIRD_PARTY_NOTICES.md) and [security reporting](SECURITY.md).
