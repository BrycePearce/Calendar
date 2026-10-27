// Local-only validation using the production Nginx rules; paths are substituted, not routing or headers.
import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
const root = resolve(".").replaceAll("\\", "/");
const prefix = root + "/.tools/nginx-1.30.6/";
let previousPid;
try {
  previousPid = Number(await readFile(prefix + "logs/calendar.pid", "utf8"));
} catch {
  /* Not running. */
}
if (previousPid && !process.argv.includes("--stop"))
  throw new Error(
    "Local Nginx is already running; stop it before rebuilding or starting.",
  );
await mkdir("runtime/public", { recursive: true });
await mkdir("artifacts", { recursive: true });
let config = await readFile("deployment/nginx.conf", "utf8");
const replacements = {
  "/tmp/nginx.pid": prefix + "logs/calendar.pid",
  "/etc/nginx/mime.types": prefix + "conf/mime.types",
  "/etc/nginx/headers.conf": prefix + "conf/calendar-headers.conf",
  "/srv/site": root + "/apps/web/dist/client",
  "/srv/public/": root + "/runtime/public/",
};
for (const [from, to] of Object.entries(replacements))
  config = config.replaceAll(from, to);
for (const type of ["client", "proxy", "fastcgi", "uwsgi", "scgi"])
  config = config.replaceAll("/tmp/" + type + "_temp", prefix + type + "_temp");
await writeFile(prefix + "conf/calendar.conf", config);
await writeFile(
  prefix + "conf/calendar-headers.conf",
  (await readFile("deployment/headers.conf", "utf8")).replace(
    "/etc/nginx/csp.conf",
    prefix + "conf/calendar-csp.conf",
  ),
);
await copyFile("apps/web/dist/csp.conf", prefix + "conf/calendar-csp.conf");
const args = [
  "-p",
  prefix,
  "-c",
  "conf/calendar.conf",
  ...(process.argv.includes("--stop") ? ["-s", "quit"] : ["-t"]),
];
let result = spawnSync(prefix + "nginx.exe", args, {
  stdio: "inherit",
  windowsHide: true,
});
if (result.status !== 0) process.exit(result.status ?? 1);
if (process.argv.includes("--stop") && previousPid) {
  for (let i = 0; i < 100; i++) {
    try {
      process.kill(previousPid, 0);
    } catch {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
    if (i === 99)
      throw new Error(
        "Nginx has not finished stopping; do not start a second instance.",
      );
  }
}
if (!process.argv.includes("--stop")) {
  const child = spawn(
    prefix + "nginx.exe",
    ["-p", prefix, "-c", "conf/calendar.conf"],
    { stdio: "ignore", windowsHide: true, detached: true },
  );
  child.on("error", () => {
    console.error("Could not launch Nginx");
    process.exitCode = 1;
  });
  child.unref();
  console.log("Production static hosting available at http://127.0.0.1:8080");
}
