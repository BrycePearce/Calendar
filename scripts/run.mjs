import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
if (existsSync(".env")) process.loadEnvFile(".env");
if (process.argv[2] === "demo") process.env.CALENDAR_DEMO = "true";
const child = spawn(
  process.execPath,
  ["apps/web/node_modules/vite/bin/vite.js", "apps/web", "--host", "127.0.0.1"],
  { stdio: "inherit", env: process.env },
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
child.on("exit", (code) => {
  process.exitCode = code ?? 0;
});
