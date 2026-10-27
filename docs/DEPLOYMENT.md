# Deployment and operations

These are instructions for a future approved deployment. Nothing here modifies an existing Unraid server or Tunnel automatically.

## Prepare private runtime files

Create separate directories `private/`, `runtime/public/`, and `runtime/private-state/` in your checkout or deployment directory. They are ignored. Copy `deployment/exporter.example.json` to `private/exporter.json` and `deployment/public-config.example.json` to `private/public-config.json`. Enter keys with a private editor into `private/sonarr-key` and `private/radarr-key`; each contains only its service's key. Do not put key values on a command line. Remove the optional request link if unused.

Replace only the private upstream URLs with reachable service addresses. Check installed versions privately via their UI or `/api/v3/system/status` (or the installed Sonarr v5 equivalent) with header authentication. Inspect calendar response fields locally without saving raw responses into the repository or public output. Sonarr requests `/api/{v3|v5}/calendar?start=...&end=...&includeSeries=true`; Radarr uses `/api/v3/calendar`. The API end parameter is one day past the inclusive export end. Required Sonarr fields: episode `id`, `seriesId`, embedded `series.title`, optional episode title/numbers, and offset-aware `airDateUtc`. Radarr requires `id`, `title`, and optional `inCinemas`, `digitalRelease`, `physicalRelease`. Midnight timestamps are interpreted as the literal written movie date, never converted through UTC. Missing dates are omitted; malformed dates fail the source. Check this assumption against your installed versions.

**Publication is deliberate:** examples contain `allowIds: []` (publish nothing). Populate these private lists with permitted series/movie IDs, or deliberately remove `allowIds` to publish all dated API results. `monitoredOnly` defaults to false. Never rely on browser filters to hide titles.

## Permissions and persistence

The exporter runs as numeric UID/GID 1000:1000 by default; the web process uses 101:101. Choose appropriate local IDs using `EXPORTER_UID`, `EXPORTER_GID`, `WEB_UID`, and `WEB_GID` for Compose. Unraid commonly uses a dedicated account or its `nobody`/`users` IDs; confirm those IDs locally rather than assuming them. There is no PUID/PGID entrypoint that changes ownership automatically.

Create bind-mounted directories **before starting** the containers and set their owner/group on the host. The exporter needs write and directory rename permission on public output and private state. Public directory traversal/read access must be available to the web UID (for example, public directory 0755 and JSON 0644); private state should be 0700 or a deliberately restricted group. Secret/config files should be 0600 or 0640 with access only to the exporter identity. The public configuration file is deliberately public and must be readable by Nginx. Do not use world-writable private directories.

Both runtime directories persist across image replacement. Keep them separate and non-nested; the exporter rejects nesting. Do not place private configuration, symlinked secrets, raw upstream caches, or media in public output. Use local storage with same-filesystem atomic rename behavior. Network filesystems with unusual rename semantics need separate validation. One exporter process owns each output/state pair; do not run multiple replicas against the same files.

## Docker Compose

From the repository root, after preparing files and permissions:

```sh
docker compose -f deployment/compose.yaml config --quiet
docker compose -f deployment/compose.yaml build
docker compose -f deployment/compose.yaml up -d
docker compose -f deployment/compose.yaml ps
```

The web image contains only Nginx, built static client files, and generated security headers. The exporter image contains its bundled Node program and no keys. Runtime secret files are mounted separately. The Docker context is an explicit allowlist and excludes local data, tests, secrets, Git, tools, screenshots, logs, and demo exports. Both containers have read-only root filesystems, dropped capabilities, no privilege escalation, and a temporary `/tmp`. The exporter exposes no port. Only the web port 8080 is bound to host loopback by default.

Nginx health checks validate static service availability; exporter health checks validate a recent completed publish cycle using its private heartbeat. A healthy exporter container can still report a stale/unavailable source in JSON. Monitor both layers. No raw upstream diagnostics are logged. Configure log retention on the host. Test a restart and one-source outage before enabling access.

For an isolated browser-test run with no upstream access:

```sh
docker build -f deployment/web.Dockerfile -t calendar-web:test .
docker run --rm --read-only --tmpfs /tmp --cap-drop ALL --security-opt no-new-privileges -p 127.0.0.1:8080:8080 calendar-web:test
```

Run `pnpm test:e2e` in a second terminal. Tests supply synthetic snapshots in the browser; the real missing JSON path is separately asserted to return 404. No Vite or Start server is required. The build's `dist/server` directory is a prerendering intermediate and is not copied into the web image.

## Equivalent Unraid container settings

Build both images locally on the server from the reviewed checkout, or transfer approved images through your own process. Do not assume a registry image has been published.

| Setting          | Exporter                                                                        | Web                                               |
| ---------------- | ------------------------------------------------------------------------------- | ------------------------------------------------- |
| Image            | `calendar-exporter:local`                                                       | `calendar-web:local`                              |
| User             | Chosen exporter UID:GID                                                         | Chosen web UID:GID                                |
| Ports            | None                                                                            | Container 8080 only                               |
| Public output    | Host public directory -> `/srv/public`, read/write                              | Same directory -> `/srv/public`, read-only        |
| Private state    | Host state directory -> `/srv/private-state`, read/write                        | None                                              |
| Config           | Private JSON -> `/run/config/exporter.json`, read-only                          | Public JSON -> `/srv/site/config.json`, read-only |
| Keys             | Key files -> `/run/secrets/sonarr-key` and `/run/secrets/radarr-key`, read-only | None                                              |
| Environment      | `EXPORTER_CONFIG=/run/config/exporter.json`                                     | None required                                     |
| Extra parameters | `--read-only --tmpfs /tmp --cap-drop ALL --security-opt no-new-privileges`      | Same                                              |

Neither container mounts media libraries or the Docker socket. The web container must have no private state/config/key mounts. The only file from `private/` mounted into web is the explicitly public branding JSON; its directory is never mounted wholesale.

## Existing Cloudflare Tunnel

Point the future public hostname (for example, `calendar.example.com`) **only** to the web service. Do not route public traffic to Sonarr, Radarr, or the exporter. No new public port forwarding is needed.

Confirm which of these network arrangements applies before editing the tunnel:

1. **Shared Docker network:** attach the existing tunnel container to the web container's frontend network (or an existing dedicated external network through an ignored Compose override). Origin is `http://web:8080` only if `web` resolves on that shared network. Do not attach the tunnel to the exporter network.
2. **Tunnel running on the host:** use `http://127.0.0.1:8080` with the default loopback publish.
3. **Tunnel on a separate Docker network or host:** container loopback is not the Unraid host. Choose a host-reachable bind/address or a controlled shared network, restrict access with host firewall rules, and verify reachability from the tunnel's network. Do not assume `localhost` or an arbitrary container name works.

Confirm public DNS/hostname ownership, origin reachability, TLS at the edge, and any existing cache rules. Bypass edge caching for `/data/*`, `/config.json`, and HTML; hashed `/assets/*` may be cached immutably. Missing JSON must remain a 404 instead of an SPA HTML response. Nginx sends CSP, nosniff, deny-framing, no-referrer, and restricted permissions headers. FullCalendar requires inline styles; inline scripts are permitted only by exact build-generated hashes. Do not replace CSP with `unsafe-inline` scripts. Add HTTPS/HSTS policy at the edge only after confirming the real hostname's requirements.

The exporter network must reach the configured LAN services. Web and exporter are on distinct Compose networks, but those networks alone are not a LAN egress firewall. Apply host/network policy if preventing arbitrary web-container egress is required. The application makes no upstream calls from web.

## Upgrade and rollback

Back up private configuration, secret files, and both runtime directories using your private backup process. Keep backups outside the repository/public storage. Record the previous image IDs and tag them for rollback. Review dependency/schema changes, build new images, run checks, and update containers. Preserve persistent mounts.

For rollback, restore the previously recorded web/exporter images together. If a future data schema changes incompatibly, restore a matching sanitized state/output backup or let the matching exporter regenerate it. Never substitute demo data. Recheck health, per-source last-success times, JSON status codes, and Tunnel origin. Do not delete persistent volumes as part of normal upgrades.

Rotate credentials by replacing the secret files privately, then restart the exporter. Updating source configuration also requires a restart. Public branding configuration is revalidated on the frontend's normal refresh. Changes to publication policy invalidate the old source cache; verify the resulting public snapshot before reopening public access.
