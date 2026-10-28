import {
  mkdir,
  readFile,
  rename,
  writeFile,
  unlink,
  realpath,
} from "node:fs/promises";
import { resolve, relative, isAbsolute, join } from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { z } from "zod";
import {
  snapshotSchema,
  coverageSchema,
  eventSchema,
  timestamp,
  type Snapshot,
  type Coverage,
} from "@calendar/schema";
import type { PrivateConfig, SourceConfig } from "./config.server";
import { normalize } from "./adapters.server";

const stateSchema = z
  .object({
    identity: z.string(),
    lastSuccess: timestamp,
    coverage: coverageSchema,
    events: z.array(eventSchema),
  })
  .strict();
type State = z.infer<typeof stateSchema>;
export type FetchSource = (
  source: "sonarr" | "radarr",
  config: SourceConfig,
  coverage: Coverage,
) => Promise<unknown>;
export async function atomicJson(file: string, value: unknown) {
  const temp = `${file}.${randomUUID()}.tmp`;
  try {
    await writeFile(temp, JSON.stringify(value), { mode: 0o644, flag: "wx" });
    await rename(temp, file);
  } finally {
    await unlink(temp).catch(() => {});
  }
}
export function windowFor(now: Date, config: PrivateConfig): Coverage {
  return {
    start: new Date(now.getTime() - config.daysBack * 86400000)
      .toISOString()
      .slice(0, 10),
    end: new Date(now.getTime() + config.daysAhead * 86400000)
      .toISOString()
      .slice(0, 10),
  };
}
function inside(parent: string, child: string) {
  const r = relative(parent, child);
  return !r || (!r.startsWith("..") && !isAbsolute(r));
}
export async function prepareDirectories(config: PrivateConfig) {
  await mkdir(config.publicDir, { recursive: true });
  await mkdir(config.stateDir, { recursive: true, mode: 0o700 });
  const pub = await realpath(config.publicDir),
    state = await realpath(config.stateDir);
  if (inside(pub, state) || inside(state, pub))
    throw new Error("Public and private directories must be separate");
  for (const source of [config.sonarr, config.radarr]) {
    if (!source?.apiKeyFile) continue;
    const path = await realpath(source.apiKeyFile).catch(
      (error: NodeJS.ErrnoException) => {
        // A missing credential is a source outage, not an outage of both sources.
        if (error.code === "ENOENT") return resolve(source.apiKeyFile!);
        throw new Error("Credential location unavailable");
      },
    );
    if (inside(pub, path))
      throw new Error("Secret file must be outside public directory");
  }
}
export class Exporter {
  private running = false;
  constructor(
    private config: PrivateConfig,
    private fetchSource: FetchSource,
    private now: () => Date = () => new Date(),
  ) {}
  async refresh(): Promise<Snapshot | undefined> {
    if (this.running) return;
    this.running = true;
    try {
      const now = this.now(),
        coverage = windowFor(now, this.config);
      const result = await Promise.all(
        (["sonarr", "radarr"] as const).map(async (source) => {
          const config = this.config[source];
          const file = join(this.config.stateDir, `${source}.json`);
          // A policy or upstream change invalidates the old cache, avoiding accidental republication.
          const identity = createHash("sha256")
            .update(JSON.stringify(config ?? null))
            .digest("hex");
          let state: State | undefined;
          if (config)
            try {
              const saved = stateSchema.parse(
                JSON.parse(await readFile(file, "utf8")),
              );
              if (
                saved.identity === identity &&
                saved.events.every(
                  (e) =>
                    e.id.startsWith(source + ":") &&
                    e.media === (source === "sonarr" ? "tv" : "movie"),
                )
              )
                state = saved;
            } catch {
              /* Generic unavailable status only. */
            }
          let healthy = false;
          if (config)
            try {
              const events = normalize(
                source,
                await this.fetchSource(source, config, coverage),
                config,
                coverage,
              );
              const next = stateSchema.parse({
                identity,
                lastSuccess: now.toISOString(),
                coverage,
                events,
              });
              await atomicJson(file, next);
              state = next;
              healthy = true;
            } catch {
              /* Raw errors must never reach logs or public output. */
            }
          return { source, state, healthy };
        }),
      );
      const status = (r: (typeof result)[number]) => ({
        health: r.healthy
          ? ("healthy" as const)
          : r.state
            ? ("stale" as const)
            : ("unavailable" as const),
        lastSuccess: r.state?.lastSuccess ?? null,
        coverage: r.state?.coverage ?? null,
      });
      const snapshot = snapshotSchema.parse({
        version: 1,
        generatedAt: now.toISOString(),
        coverage,
        sources: { sonarr: status(result[0]), radarr: status(result[1]) },
        events: result.flatMap((r) => r.state?.events ?? []),
      });
      await atomicJson(join(this.config.publicDir, "calendar.json"), snapshot);
      return snapshot;
    } finally {
      this.running = false;
    }
  }
}
export async function fetchCalendar(
  config: SourceConfig,
  coverage: Coverage,
  timeoutMs: number,
  fetcher: typeof fetch = fetch,
): Promise<unknown> {
  const key = (
    config.apiKeyFile
      ? await readFile(resolve(config.apiKeyFile), "utf8")
      : (config.apiKey ?? "")
  ).trim();
  if (!key || /[\r\n]/.test(key)) throw new Error("Invalid credential file");
  const url = new URL(
    config.url.replace(/\/$/, "") + `/api/${config.apiVersion}/calendar`,
  );
  url.searchParams.set("start", coverage.start);
  url.searchParams.set(
    "end",
    new Date(Date.parse(coverage.end) + 86400000).toISOString().slice(0, 10),
  );
  url.searchParams.set("includeSeries", "true");
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetcher(url, {
        headers: { "X-Api-Key": key, Accept: "application/json" },
        signal: AbortSignal.timeout(timeoutMs),
        redirect: "error",
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error("Upstream unavailable");
      }
      const reader = response.body?.getReader();
      if (!reader) throw new Error("Empty response");
      let size = 0;
      const chunks: Uint8Array[] = [];
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.length;
          if (size > 10 * 1024 * 1024) throw new Error("Response too large");
          chunks.push(value);
        }
      } finally {
        await reader.cancel().catch(() => {});
      }
      return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
    } catch {
      if (attempt === 2) throw new Error("Upstream unavailable");
      await new Promise((r) => setTimeout(r, 250 * 2 ** attempt));
    }
  }
  throw new Error("Upstream unavailable");
}
