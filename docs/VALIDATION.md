# Local validation report

Validated with synthetic data only. No upstream credentials, library exports, or live server access were used.

## Completed

- Production SPA and exporter builds succeeded on checksum-verified Node.js 24.22.1 LTS. The lockfile resolves stable, compatible package versions; TanStack Start's Vite 8 peer requirement is satisfied.
- ESLint (including hooks rules), strict TypeScript checking, and Prettier checks passed.
- 20 Vitest tests passed: explicit public-field allowlisting, sentinel exclusion, distinct releases, duplicates, missing/invalid dates, publication filtering, partial/initial outages, restart persistence, corrupt-cache rejection, policy-change invalidation, no overlap, bounded retries/response size, atomic replacement/failure, and schema/URL/date semantics.
- 14 Playwright cases passed across Chromium desktop and mobile profiles. They exercise filters/search, browser history, details and focus return, keyboard event/overflow activation, reduced motion, DST repeated local times, date-only releases, device defaults, chosen-view persistence, loading/empty/malformed/stale/unavailable states, and automatic ageing of unchanged snapshots.
- The built SPA was served by official Nginx 1.30.6 on Windows using the production configuration with filesystem path substitutions. No Vite or TanStack Start runtime served requests. CSP/bootstrap hashes, same-origin browser traffic, security headers, and missing JSON returning 404 were checked. The local runtime also served a real synthetic JSON file; browser tests intercepted calendar JSON to make scenarios deterministic.
- Desktop/mobile screenshots of the calendar, details, crowded-day overflow, and stale/unavailable source status were captured and visually inspected. Local screenshots are ignored under `artifacts/`. FullCalendar's embedded icon font is allowed as a data URL; all external network connections remain restricted to the same origin.
- Docker Compose configuration validation passed. Public manifests for the Node, Nginx, and Gitleaks image tags were verified to exist. The Docker build context uses an explicit safe-source allowlist.
- Gitleaks 8.30.1 reported no findings in the working tree. The final local commit/history is scanned during handoff. Frontend assets passed sentinel/private-API-marker checks. Repository review found no owner-specific domains, LAN IP addresses, user paths, or real fixture data. The product package name and portable container paths are intentional.
- Private configs, keys, runtime data, local tools, test screenshots, and build output are ignored. Safe example files remain trackable. No Git remote was added; nothing was pushed, published, or deployed.

## Not verified here

- Docker's Linux daemon was unavailable. **The production images were not built or run locally.** CI is configured to build both and run the browser tests against the actual hardened web container, but CI has not run remotely. Windows Nginx validation does not prove Linux image startup, filesystem ownership, health checks, or Unraid behavior.
- Installed Sonarr/Radarr versions, actual calendar response shapes, monitored flags, date semantics, credentials, allowlists, and LAN reachability need private live validation. Sonarr API version is configurable; the implemented adapter assumptions are documented.
- Real host UID/GID permissions, persistent mounts, backup/rollback, firewall/egress rules, Tunnel network membership, DNS/TLS, and edge caching remain deployment checks.
- Browser validation used Chromium, including mobile emulation; physical iOS/Safari/Firefox and assistive-technology testing remain useful pre-release checks. Keyboard and reduced-motion tests do not constitute a comprehensive accessibility audit.
- Automated secret scans cannot guarantee absence of secrets. Re-scan the reviewed tree, all history, images, and any later publication artifacts before publishing.

## Remaining owner decisions

Confirm GitHub owner/name and visibility; select the application's license (MIT is an option, not an assigned license); provide private deployment configuration/credentials outside chat; and explicitly approve publication or deployment.
