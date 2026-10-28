import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { snapshotSchema, publicConfigSchema } from "@calendar/schema";
import { loadSettings } from "./settings.server";
import { Exporter, fetchCalendar, prepareDirectories } from "./engine.server";
import { createPoller, startOnce, currentPoller } from "./poller.server";
import { demoSnapshot } from "./demo.server";

const runtimeKey = Symbol.for("calendar.runtime.v2");
type Prepared = { body: string; etag: string };
type Runtime = { snapshot?: Prepared; publicConfig?: Prepared; ready: boolean };
const globals = globalThis as typeof globalThis & { [runtimeKey]?: Runtime };
const state = () => (globals[runtimeKey] ??= { ready: false });
function prepare(data: unknown): Prepared {
  const body = JSON.stringify(data);
  return {
    body,
    etag: `W/"${createHash("sha256").update(body).digest("hex")}"`,
  };
}

export function startRuntime() {
  return startOnce(async () => {
    globals[runtimeKey] = { ready: false };
    const runtime = state();
    try {
      runtime.publicConfig = prepare(
        publicConfigSchema.parse(
          process.env.PUBLIC_CONFIG_FILE
            ? JSON.parse(await readFile(process.env.PUBLIC_CONFIG_FILE, "utf8"))
            : {},
        ),
      );
      if (process.env.CALENDAR_DEMO === "true") {
        return createPoller(async () => {
          runtime.snapshot = prepare(
            snapshotSchema.parse(demoSnapshot(new Date(), 2)),
          );
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
        runtime.snapshot = prepare(
          snapshotSchema.parse(await exporter.refresh()),
        );
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

export async function apiResponse(
  path: string,
  ifNoneMatch?: string | null,
): Promise<Response | undefined> {
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
      path === "/config.json" ? state().publicConfig : state().snapshot;
    if (!data) throw new Error("Unavailable");
    const headers = {
      // Reuse immediately across reloads; refresh stale snapshots in the
      // background. Validators still avoid transferring unchanged JSON.
      "Cache-Control": "private, max-age=60, stale-while-revalidate=300",
      "Content-Type": "application/json; charset=utf-8",
      ETag: data.etag,
    };
    const unchanged = ifNoneMatch
      ?.split(",")
      .some(
        (tag) =>
          tag.trim() === "*" ||
          tag.trim().replace(/^W\//, "") === data.etag.replace(/^W\//, ""),
      );
    return new Response(unchanged ? null : data.body, {
      status: unchanged ? 304 : 200,
      headers,
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
