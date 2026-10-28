import { readFile } from "node:fs/promises";
import { snapshotSchema, publicConfigSchema } from "@calendar/schema";
import { loadSettings } from "./settings.server";
import { Exporter, fetchCalendar, prepareDirectories } from "./engine.server";
import { createPoller, startOnce, currentPoller } from "./poller.server";
import { demoSnapshot } from "./demo.server";

const runtimeKey = Symbol.for("calendar.runtime.v1");
type Runtime = { snapshot?: unknown; publicConfig?: unknown; ready: boolean };
const globals = globalThis as typeof globalThis & { [runtimeKey]?: Runtime };
const state = () => (globals[runtimeKey] ??= { ready: false });

export function startRuntime() {
  return startOnce(async () => {
    globals[runtimeKey] = { ready: false };
    const runtime = state();
    try {
      runtime.publicConfig = publicConfigSchema.parse(
        process.env.PUBLIC_CONFIG_FILE
          ? JSON.parse(await readFile(process.env.PUBLIC_CONFIG_FILE, "utf8"))
          : {},
      );
      if (process.env.CALENDAR_DEMO === "true") {
        return createPoller(async () => {
          runtime.snapshot = demoSnapshot();
          runtime.ready = true;
        }, 900000);
      }
      const config = await loadSettings();
      await prepareDirectories(config);
      const exporter = new Exporter(config, (_source, source, coverage) =>
        fetchCalendar(source, coverage, config.timeoutMs),
      );
      // Do not serve an old public snapshot until the current publication policy
      // has been checked against the durable per-source state by the exporter.
      return createPoller(async () => {
        runtime.snapshot = await exporter.refresh();
        runtime.ready = true;
      }, config.intervalMinutes * 60000);
    } catch {
      console.error(
        "Calendar could not initialize. Check configuration and storage.",
      );
      // Retry initialization only on process restart, keeping responses generic.
      return createPoller(async () => {
        throw new Error("Unavailable");
      }, 900000);
    }
  });
}

export async function apiResponse(path: string): Promise<Response | undefined> {
  if (!["/data/calendar.json", "/config.json", "/healthz"].includes(path))
    return path.startsWith("/data/")
      ? Response.json({ error: "Not found" }, { status: 404 })
      : undefined;
  try {
    if (path === "/healthz") {
      const poller = await currentPoller();
      return Response.json(
        { status: poller?.healthy() && state().ready ? "ok" : "unavailable" },
        { status: poller?.healthy() && state().ready ? 200 : 503 },
      );
    }
    const data =
      path === "/config.json"
        ? publicConfigSchema.parse(state().publicConfig)
        : snapshotSchema.parse(state().snapshot);
    return Response.json(data, {
      headers: { "Cache-Control": "no-cache, no-store" },
    });
  } catch {
    return Response.json(
      { error: "Calendar unavailable" },
      {
        status: 503,
        headers: { "Cache-Control": "no-store", "Retry-After": "60" },
      },
    );
  }
}
