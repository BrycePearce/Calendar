import { spawnSync } from "node:child_process";
import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  mkdtempSync,
  mkdirSync,
  copyFileSync,
  rmSync,
} from "node:fs";
import { join, dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
const exe =
  process.env.GITLEAKS_BIN ??
  (existsSync(".tools/gitleaks/gitleaks.exe")
    ? ".tools/gitleaks/gitleaks.exe"
    : "gitleaks");
function run(args) {
  const r = spawnSync(exe, args, { stdio: "inherit" });
  if (r.error || r.status !== 0)
    throw new Error("Secret scan failed or scanner unavailable");
}
if (!process.argv.includes("--assets-only")) {
  // Scan publishable source only; never open ignored keys, .env, runtime data,
  // deployment overrides, or local rollback copies.
  const listing = spawnSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    { encoding: "utf8" },
  );
  if (listing.status !== 0) throw new Error("Cannot enumerate scan inputs");
  const staging = mkdtempSync(join(tmpdir(), "calendar-scan-"));
  try {
    for (const file of listing.stdout.split("\0").filter(Boolean)) {
      if (!existsSync(file) || !statSync(file).isFile()) continue;
      const destination = join(staging, file);
      mkdirSync(dirname(destination), { recursive: true });
      copyFileSync(file, destination);
    }
    run([
      "dir",
      staging,
      "--config",
      resolve(".gitleaks.toml"),
      "--redact",
      "--no-banner",
    ]);
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
  const history = spawnSync("git", ["rev-parse", "--verify", "HEAD"], {
    stdio: "ignore",
  });
  if (history.status === 0)
    run([
      "git",
      ".",
      "--config",
      ".gitleaks.toml",
      "--redact",
      "--no-banner",
      "--log-opts=--all",
    ]);
  else
    console.log("No Git history exists yet; history scan is not applicable.");
}
function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}
if (!existsSync("apps/web/.output/public"))
  throw new Error("Build before scanning browser assets");
for (const file of walk("apps/web/.output/public")) {
  if (!/\.(js|json|html|css)$/.test(file)) continue;
  const contents = readFileSync(file, "utf8");
  if (
    /PRIVATE_SENTINEL_DO_NOT_PUBLISH_72941|X-Api-Key|SONARR_API_KEY|RADARR_API_KEY|\/api\/v[35]\/calendar/.test(
      contents,
    )
  )
    throw new Error(`Private marker in frontend asset: ${file}`);
}
console.log(
  "Working-tree scan and frontend sentinel check passed. Scanning cannot guarantee absence of secrets.",
);
