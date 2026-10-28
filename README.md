# Calendar

A TV and movie release calendar powered by Sonarr and Radarr. Shows air and release dates, not download availability.

![Calendar with fictional demo data](docs/images/calendar-demo.png)

## Try the demo

Use Node.js 24 and pnpm 10.28.2. No credentials or Docker needed.

```sh
corepack enable
corepack prepare pnpm@10.28.2 --activate
pnpm install --frozen-lockfile
pnpm dev:demo
```

Open the URL printed in the terminal. Demo data is fictional and refreshes to the current month each time you run the command. It is excluded from production Docker builds.

## Run with Sonarr and Radarr

The app uses two containers: a private exporter reads Sonarr/Radarr, and a web server displays the calendar. Only the exporter receives API keys.

1. Create `private/`, `runtime/public/`, and `runtime/private-state/`.
2. Copy the two example JSON files from `deployment/` into `private/`, removing `.example` from their names.
3. Set your upstream URLs in `private/exporter.json`. Save API keys in `private/sonarr-key` and `private/radarr-key`.
4. For monitored items, remove the `allowIds` entries and set `monitoredOnly: true`. The example's empty allowlists publish nothing.
5. Give the exporter read access to its private files and write access to both runtime folders. Default UID/GID: exporter `1000:1000`, web `101:101`. Web needs read access to public output and `private/public-config.json`.

```sh
docker compose -p edoncloud-calendar -f deployment/compose.yaml up -d --build
```

The default address is `http://127.0.0.1:8080`. For Unraid or a separate tunnel container, configure a reachable address in an ignored `deployment/compose.local.yaml` and add `-f deployment/compose.local.yaml` to Compose commands. Point the tunnel only to the web container.

Edit `private/public-config.json` for the site title, timezone, and optional request link. Everything in that file is public. Keep API keys, upstream addresses, and live exports out of Git.

Data refreshes every 15 minutes by default. Restart the exporter after changing its configuration or keys.

## Update

From the deployment folder:

```sh
git pull --ff-only
docker compose -p edoncloud-calendar -f deployment/compose.yaml -f deployment/compose.local.yaml up -d --build
```

Omit the second `-f` if you do not use a local override. For frontend-only changes, append `--no-deps web`. Keep private files and runtime folders in place; containers do not need to be deleted first.

## Unraid icons

Set `CALENDAR_ICON_URL` in your ignored `.env` to the public URL of `assets/calendar.png`, then run Compose again. Install the matching icon templates once:

```sh
bash deployment/install-unraid-icons.sh https://example.com/calendar.png
```

Replace the example with your actual icon URL. Use Compose for container updates; these templates only provide icons. If Unraid still shows question marks, its icon metadata may need refreshing.

## Development checks

```sh
pnpm build
pnpm lint
pnpm typecheck
pnpm test
pnpm format:check
pnpm scan
```

Secret scanning requires Gitleaks. Browser tests use `pnpm test:e2e` with the built web container running on port 8080 and Playwright Chromium installed. GitHub CI runs checks without deploying.

No application license selected yet. Bundled component notices are in `licenses/`.
