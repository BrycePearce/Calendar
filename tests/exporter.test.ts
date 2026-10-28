import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  rm,
  readdir,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { normalize } from "../apps/web/src/server/adapters.server";
import {
  Exporter,
  atomicJson,
  fetchCalendar,
  prepareDirectories,
} from "../apps/web/src/server/engine.server";
import {
  privateConfigSchema,
  type PrivateConfig,
} from "../apps/web/src/server/config.server";
import {
  snapshotSchema,
  searchSchema,
  publicConfigSchema,
} from "../packages/calendar-schema/src/index";

const window = { start: "2026-10-01", end: "2026-11-30" };
const source = {
  url: "http://upstream.invalid",
  apiKeyFile: "unused",
  apiVersion: "v3" as const,
  monitoredOnly: false,
};
const sentinel = "PRIVATE_SENTINEL_DO_NOT_PUBLISH_72941";
const tv = {
  id: 1,
  seriesId: 10,
  title: "<img src=x onerror=alert(1)>",
  series: { title: "Fictional orbit", monitored: true, path: sentinel },
  seasonNumber: 1,
  episodeNumber: 2,
  airDateUtc: "2026-11-01T08:30:00Z",
  monitored: true,
  apiKey: sentinel,
  downloadId: sentinel,
  path: sentinel,
};
const movie = {
  id: 2,
  title: "Fictional moon",
  inCinemas: "2026-10-12T00:00:00Z",
  digitalRelease: "2026-10-12",
  physicalRelease: "2026-10-15T00:00:00Z",
  path: sentinel,
};
describe("upstream adapters and public boundary", () => {
  it("explicitly allowlists fields; keeps text inert and stable IDs", () => {
    const events = normalize("sonarr", [tv], source, window);
    expect(events).toEqual([
      {
        id: "sonarr:1:air",
        media: "tv",
        title: "Fictional orbit",
        episodeTitle: tv.title,
        season: 1,
        episode: 2,
        releaseType: "air",
        at: tv.airDateUtc,
      },
    ]);
    expect(JSON.stringify(events)).not.toContain(sentinel);
  });
  it("preserves calendar dates, all release types and deduplicates", () => {
    const events = normalize("radarr", [movie, movie], source, window);
    expect(events).toHaveLength(3);
    expect(events[0]).toMatchObject({ date: "2026-10-12" });
    expect(new Set(events.map((e) => e.releaseType)).size).toBe(3);
  });
  it("omits undated events and dates outside coverage", () => {
    expect(
      normalize("sonarr", [{ ...tv, airDateUtc: null }], source, window),
    ).toEqual([]);
    expect(
      normalize("radarr", [{ id: 4, title: "Fictional" }], source, window),
    ).toEqual([]);
    expect(
      normalize("sonarr", [tv], source, {
        start: "2026-10-01",
        end: "2026-10-31",
      }),
    ).toEqual([]);
  });
  it("rejects malformed upstream shapes rather than replacing good data", () => {
    for (const bad of [{}, [{}], [{ ...tv, airDateUtc: "yesterday" }]])
      expect(() => normalize("sonarr", bad, source, window)).toThrow();
    expect(() =>
      normalize(
        "radarr",
        [{ ...movie, digitalRelease: "2026-02-30" }],
        source,
        window,
      ),
    ).toThrow();
  });
  it("enforces publication allowlist and monitored policy", () => {
    expect(
      normalize("sonarr", [tv], { ...source, allowIds: [] }, window),
    ).toEqual([]);
    expect(
      normalize("sonarr", [tv], { ...source, allowIds: [10] }, window),
    ).toHaveLength(1);
    expect(
      normalize("radarr", [movie], { ...source, monitoredOnly: true }, window),
    ).toEqual([]);
  });
  it("rejects unknown public fields and unsafe configuration", () => {
    expect(() => publicConfigSchema.parse({ apiKey: sentinel })).toThrow();
    expect(() =>
      publicConfigSchema.parse({ requestUrl: "javascript:alert(1)" }),
    ).toThrow();
    expect(() =>
      publicConfigSchema.parse({
        requestUrl: "https://name:password@example.invalid",
      }),
    ).toThrow();
  });
  it("normalizes malformed URL state", () => {
    expect(
      searchSchema.parse({
        month: "2026-99",
        view: "invalid",
        media: "secret",
        releases: ["wrong"],
        q: 42,
      }),
    ).toMatchObject({
      media: "all",
      q: "",
      releases: ["theatrical", "digital", "physical"],
    });
  });
});
describe("independent durable publishing", () => {
  let dir: string, config: PrivateConfig;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "calendar-test-"));
    config = privateConfigSchema.parse({
      sonarr: source,
      radarr: source,
      publicDir: join(dir, "public"),
      stateDir: join(dir, "state"),
    });
    await mkdir(config.publicDir);
    await mkdir(config.stateDir);
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });
  const now = () => new Date("2026-10-15T12:00:00Z");
  it("retains last-good data across restarts and partial outages", async () => {
    const first = await new Exporter(
      config,
      async (s) => (s === "sonarr" ? [tv] : [movie]),
      now,
    ).refresh();
    expect(first?.sources.sonarr.health).toBe("healthy");
    const next = await new Exporter(
      config,
      async (s) => {
        if (s === "sonarr") throw new Error(sentinel);
        return [];
      },
      now,
    ).refresh();
    expect(next?.sources.sonarr.health).toBe("stale");
    expect(next?.sources.radarr.health).toBe("healthy");
    expect(next?.events).toHaveLength(1);
    expect(JSON.stringify(next)).not.toContain(sentinel);
    expect(
      snapshotSchema.parse(
        JSON.parse(
          await readFile(join(config.publicDir, "calendar.json"), "utf8"),
        ),
      ),
    ).toEqual(next);
    expect(await readdir(config.publicDir)).toEqual(["calendar.json"]);
  });
  it("initial failure is unavailable and never demo data", async () => {
    const s = await new Exporter(
      config,
      async () => {
        throw new Error(sentinel);
      },
      now,
    ).refresh();
    expect(s?.events).toEqual([]);
    expect(s?.sources.sonarr).toEqual({
      health: "unavailable",
      lastSuccess: null,
      coverage: null,
    });
  });
  it("invalid upstream response retains previous good data", async () => {
    await new Exporter(config, async () => [tv], now).refresh();
    const s = await new Exporter(
      config,
      async () => ({ error: sentinel }),
      now,
    ).refresh();
    expect(s?.sources.sonarr.health).toBe("stale");
    expect(s?.events).toHaveLength(1);
  });
  it("policy changes invalidate caches before an outage", async () => {
    await new Exporter(config, async () => [tv], now).refresh();
    config.sonarr = { ...source, allowIds: [] };
    const s = await new Exporter(
      config,
      async () => {
        throw new Error();
      },
      now,
    ).refresh();
    expect(s?.events).toEqual([]);
  });
  it("does not overlap refreshes", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const exporter = new Exporter(
      config,
      async () => {
        await gate;
        return [];
      },
      now,
    );
    const running = exporter.refresh();
    expect(await exporter.refresh()).toBeUndefined();
    release();
    await running;
  });
  it("atomic writes replace complete snapshots and clean temporary files", async () => {
    const path = join(config.publicDir, "calendar.json");
    await atomicJson(path, { old: true });
    await atomicJson(path, { next: true });
    expect(JSON.parse(await readFile(path, "utf8"))).toEqual({ next: true });
    expect(await readdir(config.publicDir)).toEqual(["calendar.json"]);
    const circular: { self?: unknown } = {};
    circular.self = circular;
    await expect(atomicJson(path, circular)).rejects.toThrow();
    expect(JSON.parse(await readFile(path, "utf8"))).toEqual({ next: true });
    expect(await readdir(config.publicDir)).toEqual(["calendar.json"]);
  });
  it("corrupt private state cannot be published on initial outage", async () => {
    await writeFile(
      join(config.stateDir, "sonarr.json"),
      JSON.stringify({ raw: sentinel }),
    );
    const snapshot = await new Exporter(
      config,
      async () => {
        throw new Error();
      },
      now,
    ).refresh();
    expect(snapshot?.sources.sonarr.health).toBe("unavailable");
    expect(snapshot?.events).toEqual([]);
  });
  it("oversized responses are cancelled and never published", async () => {
    const keyFile = join(dir, "key");
    await writeFile(keyFile, sentinel);
    const fetcher: typeof fetch = async () =>
      new Response(new Uint8Array(10 * 1024 * 1024 + 1));
    await expect(
      fetchCalendar({ ...source, apiKeyFile: keyFile }, window, 1000, fetcher),
    ).rejects.toThrow("Upstream unavailable");
  });
  it("rejects snapshots with unknown private fields or inconsistent statuses", async () => {
    const s = await new Exporter(config, async () => [], now).refresh();
    expect(() => snapshotSchema.parse({ ...s, raw: sentinel })).toThrow();
    expect(() =>
      snapshotSchema.parse({
        ...s,
        sources: {
          ...s?.sources,
          sonarr: { health: "healthy", lastSuccess: null, coverage: null },
        },
      }),
    ).toThrow();
  });
  it("rejects nested public/private paths", async () => {
    await expect(
      prepareDirectories({
        ...config,
        sonarr: undefined,
        radarr: undefined,
        stateDir: join(config.publicDir, "private"),
      }),
    ).rejects.toThrow("separate");
  });
  it("a missing key file does not prevent the other source from refreshing", async () => {
    config.sonarr = { ...source, apiKeyFile: join(dir, "missing-key") };
    config.radarr = { ...source, apiKeyFile: undefined, apiKey: sentinel };
    await prepareDirectories(config);
    const s = await new Exporter(
      config,
      async (name, c, coverage) => {
        if (name === "sonarr") return fetchCalendar(c, coverage, 100);
        return [movie];
      },
      now,
    ).refresh();
    expect(s?.sources.sonarr.health).toBe("unavailable");
    expect(s?.sources.radarr.health).toBe("healthy");
    expect(s?.events).toHaveLength(3);
  });
  it("uses header authentication, no redirects, bounded retries and generic errors", async () => {
    const keyFile = join(dir, "key");
    await writeFile(keyFile, sentinel);
    let calls = 0;
    const fake: typeof fetch = async (input, init) => {
      calls++;
      expect(String(input)).not.toContain(sentinel);
      expect((init?.headers as Record<string, string>)["X-Api-Key"]).toBe(
        sentinel,
      );
      expect(init?.redirect).toBe("error");
      return new Response(sentinel, { status: 503 });
    };
    await expect(
      fetchCalendar({ ...source, apiKeyFile: keyFile }, window, 100, fake),
    ).rejects.toThrow("Upstream unavailable");
    expect(calls).toBe(3);
  });
});
