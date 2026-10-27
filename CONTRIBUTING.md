# Contributing

Use Node.js 24 LTS and pnpm 10.28.2. Install with `pnpm install --frozen-lockfile`; run `pnpm demo` and `pnpm dev` for fictional local data. Never develop against or commit a real library export. Do not add credentials to frontend configuration or VITE variables.

Create a focused branch (`codex/` prefix for agent-created branches), preserve existing work, and open a pull request only after the owner approves publishing. No license has been selected yet; clarify contribution licensing before accepting external contributions.

Required checks:

```sh
pnpm build
pnpm lint
pnpm typecheck
pnpm test
pnpm format:check
pnpm scan
```

Build before typecheck on a clean checkout because TanStack generates the route tree. `pnpm format` applies Prettier. Schema changes require tests for both allowed fields and rejection of private fields. Keep fixture data synthetic. Tests intentionally include clearly named sentinel text, never real secrets.

For browser verification, build and run the web image locally (see deployment guide), then:

```sh
pnpm exec playwright install chromium
pnpm test:e2e
```

The browser tests use `http://127.0.0.1:8080`, with `TEST_BASE_URL` available for another local address. They intercept JSON with fictional fixtures and exercise desktop/mobile, overflow, details, filters, history, inert HTML, timezone boundaries, errors, reduced motion, and network isolation. Screenshots go into ignored `artifacts/`. Do not upload traces or screenshots from live data.

Windows fallback when Docker is unavailable: download the official Nginx 1.30.6 zip into ignored `.tools/` and extract it as `.tools/nginx-1.30.6`; run `node scripts/nginx-local.mjs` after building. This applies the production Nginx rules with local filesystem path substitutions. Stop it using `node scripts/nginx-local.mjs --stop` **before rebuilding**, then start it again so the bootstrap CSP hashes match the new HTML. This verifies static hosting but does not establish Linux container behavior.

Install Gitleaks 8.30.1 from its official release and set `GITLEAKS_BIN` or put it on PATH. `pnpm scan` redacts findings and scans current files plus all existing history. `.gitleaks.toml` extends the standard rules, excluding only dependency metadata, installed packages, Git internals (scanned separately), and ignored downloaded tools. Runtime/config folders are **not** excluded from local scanning. Never add a broad allowlist to suppress a real finding. If a credential is found, avoid repeating it; remove it from public material, identify its location, and rotate it if shared or committed.

Before any future publication, inspect `git diff --cached`, tracked files, generated artifacts, and all history. Check for internal addresses, user paths, private titles, and secrets in addition to automated scanning. CI runs quality checks, Gitleaks, container builds, and the Playwright suite against the actual web image.
