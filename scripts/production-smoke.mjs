// Only synthetic loopback upstreams and a new temporary data directory.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
const dir = await mkdtemp(join(tmpdir(), "calendar-production-"));
const sentinel = "PRIVATE_SENTINEL_DO_NOT_PUBLISH_72941";
let outage = false,
  calls = 0,
  child;
const upstream = createServer((req, res) => {
  calls++;
  assert.equal(req.headers["x-api-key"], sentinel);
  res.setHeader("Content-Type", "application/json");
  if (outage || req.url.startsWith("/radarr")) {
    res.writeHead(503);
    res.end(JSON.stringify({ error: sentinel }));
    return;
  }
  res.end(
    JSON.stringify([
      {
        id: 1,
        seriesId: 10,
        title: "Synthetic episode",
        series: { title: "Synthetic orbit", monitored: true, path: sentinel },
        monitored: true,
        airDateUtc: new Date().toISOString(),
        apiKey: sentinel,
      },
    ]),
  );
});
upstream.listen(0, "127.0.0.1");
await once(upstream, "listening");
const upstreamPort = upstream.address().port;
const reservation = createServer();
reservation.listen(0, "127.0.0.1");
await once(reservation, "listening");
const port = reservation.address().port;
await new Promise((r) => reservation.close(r));
const base = `http://127.0.0.1:${port}`;
const env = {
  PATH: process.env.PATH,
  SystemRoot: process.env.SystemRoot,
  NODE_ENV: "production",
  HOST: "127.0.0.1",
  PORT: String(port),
  SONARR_URL: `http://127.0.0.1:${upstreamPort}/sonarr`,
  SONARR_API_KEY: sentinel,
  RADARR_URL: `http://127.0.0.1:${upstreamPort}/radarr`,
  RADARR_API_KEY: sentinel,
  CALENDAR_PUBLIC_DIR: join(dir, "public"),
  CALENDAR_STATE_DIR: join(dir, "state"),
  REQUEST_TIMEOUT_MS: "100",
};
async function start() {
  child = spawn(process.execPath, ["apps/web/.output/server/index.mjs"], {
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let logs = "";
  child.stdout.on("data", (chunk) => {
    logs += chunk;
  });
  child.stderr.on("data", (chunk) => {
    logs += chunk;
  });
  // The startup refresh must happen before any visitor request.
  const before = calls;
  for (let i = 0; i < 100 && calls === before; i++)
    await new Promise((r) => setTimeout(r, 50));
  assert.ok(calls > before, "polling starts without requests");
  for (let i = 0; i < 100; i++) {
    if (
      await fetch(`${base}/healthz`)
        .then((r) => r.ok)
        .catch(() => false)
    )
      break;
    await new Promise((r) => setTimeout(r, 50));
  }
  assert.equal(logs.includes(sentinel), false);
}
async function stop() {
  if (!child || child.exitCode !== null) return;
  const exiting = once(child, "exit");
  child.kill("SIGTERM");
  const timer = setTimeout(() => child.kill("SIGKILL"), 10000);
  await exiting;
  clearTimeout(timer);
}
try {
  await start();
  const response = await fetch(`${base}/data/calendar.json`);
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.events.length, 1);
  assert.equal(data.sources.sonarr.health, "healthy");
  assert.equal(data.sources.radarr.health, "unavailable");
  assert.equal(JSON.stringify(data).includes(sentinel), false);
  assert.equal(JSON.stringify(data).includes("127.0.0.1"), false);
  assert.equal(
    (await fetch(`${base}/data/calendar.json`, { method: "POST" })).status,
    405,
  );
  assert.equal((await fetch(`${base}/data/missing.json`)).status, 404);
  const html = await fetch(base);
  const nonce = html.headers
    .get("content-security-policy")
    .match(/'nonce-([^']+)'/)[1];
  const markup = await html.text();
  assert.ok(markup.includes(`nonce="${nonce}"`));
  assert.ok(
    markup.includes("Synthetic orbit"),
    "HTML carries the cached public snapshot",
  );
  assert.equal(
    markup.includes(sentinel),
    false,
    "HTML must not serialize private upstream fields",
  );
  await stop();
  outage = true;
  await start();
  const restored = await (await fetch(`${base}/data/calendar.json`)).json();
  assert.equal(restored.sources.sonarr.health, "stale");
  assert.deepEqual(restored.events, data.events);
  console.log(
    "Production startup, sanitized API, partial outage, CSP, and restart persistence passed.",
  );
} finally {
  await stop();
  await new Promise((r) => upstream.close(r));
  await rm(dir, { recursive: true, force: true });
}
