import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
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
run(["dir", ".", "--config", ".gitleaks.toml", "--redact", "--no-banner"]);
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
else console.log("No Git history exists yet; history scan is not applicable.");
function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}
if (existsSync("apps/web/dist/client"))
  for (const file of walk("apps/web/dist/client")) {
    if (!/\.(js|json|html|css)$/.test(file)) continue;
    const contents = readFileSync(file, "utf8");
    if (
      /PRIVATE_SENTINEL_DO_NOT_PUBLISH_72941|X-Api-Key|\/api\/v[35]\/calendar/.test(
        contents,
      )
    )
      throw new Error(`Private marker in frontend asset: ${file}`);
  }
console.log(
  "Working-tree scan and frontend sentinel check passed. Scanning cannot guarantee absence of secrets.",
);
