import { readFile, writeFile, realpath } from "node:fs/promises";
import { join, resolve, relative, isAbsolute } from "node:path";
import { privateConfigSchema } from "./config.js";
import { Exporter, fetchCalendar, prepareDirectories } from "./engine.js";

async function main() {
  const configFile = resolve(
    process.env.EXPORTER_CONFIG ?? "./private/exporter.json",
  );
  const config = privateConfigSchema.parse(
    JSON.parse(await readFile(configFile, "utf8")),
  );
  await prepareDirectories(config);
  const rel = relative(
    await realpath(config.publicDir),
    await realpath(configFile),
  );
  if (!rel || (!rel.startsWith("..") && !isAbsolute(rel)))
    throw new Error("Private configuration location invalid");
  const exporter = new Exporter(config, (_source, c, w) =>
    fetchCalendar(c, w, config.timeoutMs),
  );
  let stopped = false;
  process.on("SIGTERM", () => {
    stopped = true;
  });
  process.on("SIGINT", () => {
    stopped = true;
  });
  while (!stopped) {
    try {
      await exporter.refresh();
      await writeFile(join(config.stateDir, "heartbeat"), String(Date.now()));
      console.info("Calendar refresh completed.");
    } catch {
      console.error(
        "Calendar refresh failed. Check private configuration and storage.",
      );
    }
    const until = Date.now() + config.intervalMinutes * 60000;
    while (!stopped && Date.now() < until)
      await new Promise((r) =>
        setTimeout(r, Math.min(1000, until - Date.now())),
      );
  }
}
main().catch(() => {
  console.error("Exporter could not start. Check private configuration.");
  process.exitCode = 1;
});
