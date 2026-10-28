# Migrate the existing installation

No local deployment override was available during this refactor. These commands are for the deployment host; they were not executed against Unraid. Keep the existing project name (`edoncloud-calendar` below). Run from the repository root.

## Before replacing the old checkout

Preserve the old Compose files and tag the **running** images. These commands assume your current override is `deployment/compose.local.yaml`; omit that `-f` and copy command if unused.

```sh
cp -n deployment/compose.yaml deployment/compose.rollback.local.yaml
cp -n deployment/compose.local.yaml deployment/compose.override.rollback.local.yaml
docker image tag "$(docker compose -p edoncloud-calendar -f deployment/compose.yaml -f deployment/compose.local.yaml images -q web)" calendar-web:rollback
docker image tag "$(docker compose -p edoncloud-calendar -f deployment/compose.yaml -f deployment/compose.local.yaml images -q exporter)" calendar-exporter:rollback
```

Keep a private backup of `private/`, `.env`, and both `runtime/` directories. Preserve original key files and JSON; do not regenerate them. If the checkout is already updated, recover the old tracked Compose file from your pre-refactor revision using `git show PRE_REFACTOR_REVISION:deployment/compose.yaml > deployment/compose.rollback.local.yaml`. Preserve your original ignored override separately.

## Map the override

| Old setting or mount                                  | New app setting                                                                      |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `web.ports` (including LAN binding)                   | `app.ports`, same host address and port; container port stays 8080                   |
| `web.networks`, tunnel network and aliases            | `app.networks`; preserve existing external network declarations                      |
| `exporter.networks` used to reach private sources     | Add those networks to `app.networks`                                                 |
| exporter UID/GID                                      | `CALENDAR_UID` / `CALENDAR_GID` (or `app.user`), keep the existing exporter identity |
| `private/exporter.json:/run/config/exporter.json:ro`  | Same mount on `app`; `CALENDAR_CONFIG=/run/config/exporter.json`                     |
| `/run/secrets/sonarr-key`, `/run/secrets/radarr-key`  | Same read-only mounts and container paths on `app`                                   |
| `runtime/public:/srv/public`                          | Same read/write mount on `app`                                                       |
| `runtime/private-state:/srv/private-state`            | Same read/write mount on `app`                                                       |
| `private/public-config.json:/srv/site/config.json:ro` | Same mount on `app`; `PUBLIC_CONFIG_FILE=/srv/site/config.json`                      |
| `CALENDAR_ICON_URL`                                   | Unchanged; install template metadata for `app`                                       |

Keep `apiKeyFile` strings, upstream URL spelling, and publication policies identical during migration: they participate in the existing cache identity. Moving host directories is safe if mounted at the same container paths. Changing those identity inputs intentionally discards incompatible cached events. The public snapshot alone is insufficient: retain the private per-source state too.

Replace `web` and `exporter` sections in your active override with one `app` section. Do not merge the old override unchanged, which would recreate obsolete services. Example for unchanged private files (add your original ports/networks/user settings):

```yaml
services:
  app:
    environment:
      CALENDAR_CONFIG: /run/config/exporter.json
      PUBLIC_CONFIG_FILE: /srv/site/config.json
    volumes:
      - ../private/exporter.json:/run/config/exporter.json:ro
      - ../private/sonarr-key:/run/secrets/sonarr-key:ro
      - ../private/radarr-key:/run/secrets/radarr-key:ro
      - ../private/public-config.json:/srv/site/config.json:ro
```

Do not copy `.env.example` over an existing `.env`. When retaining legacy JSON, do not add example source variables that override it. The existing host `:8080` tunnel route stays unchanged. For a tunnel on Docker networking, retain its network and original destination hostname as an alias on `app` (default `web` and `edoncloud-calendar-web-1` are already provided). An old container IP is not stable; retain a hostname or host-port destination.

## Build, then switch

Build while the old services still run. During the cutover stop the old exporter before starting the new poller, so two writers never share storage. Do not remove the old containers or images.

```sh
docker compose -p edoncloud-calendar -f deployment/compose.yaml -f deployment/compose.local.yaml build app
docker compose -p edoncloud-calendar -f deployment/compose.rollback.local.yaml -f deployment/compose.override.rollback.local.yaml stop web exporter
docker compose -p edoncloud-calendar -f deployment/compose.yaml -f deployment/compose.local.yaml up -d --no-build app
curl -f http://127.0.0.1:8080/healthz
```

The initial refresh may take up to about three minutes with the maximum timeout. Check source status in the calendar after health succeeds. Old stopped services may produce an orphan warning; do not use `--remove-orphans` during the rollback window. Neither live Unraid networking nor Cloudflare was modified or verified locally.

## Roll back the migration

If the old containers still exist, restart them unchanged after stopping the new writer:

```sh
docker compose -p edoncloud-calendar -f deployment/compose.yaml -f deployment/compose.local.yaml stop app
docker compose -p edoncloud-calendar -f deployment/compose.rollback.local.yaml -f deployment/compose.override.rollback.local.yaml start exporter web
```

If the old containers were removed, recreate them using the saved images. Create an ignored `deployment/compose.images.rollback.local.yaml`:

```yaml
services:
  web:
    image: calendar-web:rollback
  exporter:
    image: calendar-exporter:rollback
```

```sh
docker compose -p edoncloud-calendar -f deployment/compose.rollback.local.yaml -f deployment/compose.override.rollback.local.yaml -f deployment/compose.images.rollback.local.yaml up -d --no-build --pull never exporter web
```

The state format is unchanged. Keep all runtime data and original private settings in place for either version. Never run both pollers at once.
