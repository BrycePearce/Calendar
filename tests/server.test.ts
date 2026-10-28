import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createPoller,
  startOnce,
  stopPolling,
} from "../apps/web/src/server/poller.server";
import { loadSettings } from "../apps/web/src/server/settings.server";
import {
  apiResponse,
  startRuntime,
} from "../apps/web/src/server/runtime.server";

afterEach(async () => {
  await stopPolling();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});
describe("process polling lifecycle", () => {
  it("starts immediately, deduplicates hot reload, drains and never overlaps", async () => {
    vi.useFakeTimers();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const refresh = vi.fn(() => gate);
    const factory = vi.fn(async () => createPoller(refresh, 900000));
    const first = startOnce(factory);
    expect(startOnce(factory)).toBe(first);
    const poller = await first;
    await vi.advanceTimersByTimeAsync(1800000);
    expect(factory).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledTimes(1);
    let closed = false;
    const closing = stopPolling().then(() => {
      closed = true;
    });
    await Promise.resolve();
    expect(closed).toBe(false);
    release();
    await closing;
    await vi.advanceTimersByTimeAsync(1800000);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(poller.healthy()).toBe(false);
  });
  it("refreshes again after the interval and survives generic failures", async () => {
    vi.useFakeTimers();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const refresh = vi
      .fn()
      .mockRejectedValueOnce(new Error("private upstream detail"))
      .mockResolvedValue(undefined);
    const poller = createPoller(refresh, 900000);
    await vi.advanceTimersByTimeAsync(0);
    expect(poller.healthy()).toBe(false);
    await vi.advanceTimersByTimeAsync(900000);
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(poller.healthy()).toBe(true);
    expect(JSON.stringify(log.mock.calls)).not.toContain(
      "private upstream detail",
    );
    await poller.close();
    log.mockRestore();
  });
});

describe("runtime configuration and API boundary", () => {
  it("supports env credentials and rejects ambiguous publication settings", async () => {
    const config = await loadSettings({
      SONARR_URL: "http://upstream.invalid",
      SONARR_API_KEY: "synthetic",
      SONARR_ALLOW_IDS: "1,2",
    });
    expect(config.sonarr).toMatchObject({
      monitoredOnly: true,
      allowIds: [1, 2],
    });
    expect(config.intervalMinutes).toBe(15);
    await expect(
      loadSettings({ SONARR_URL: "http://upstream.invalid" }),
    ).rejects.toThrow();
    await expect(
      loadSettings({
        SONARR_URL: "http://upstream.invalid",
        SONARR_API_KEY: "synthetic",
        SONARR_MONITORED_ONLY: "yes",
      }),
    ).rejects.toThrow();
    await expect(loadSettings({ DAYS_AHEAD: "bad" })).rejects.toThrow();
  });
  it("returns validated JSON, generic initial errors and no demo fallback", async () => {
    const dir = await mkdtemp(join(tmpdir(), "calendar-api-"));
    try {
      const config = join(dir, "settings.json");
      await writeFile(
        config,
        JSON.stringify({
          publicDir: join(dir, "public"),
          stateDir: join(dir, "state"),
        }),
      );
      vi.stubEnv("CALENDAR_CONFIG", config);
      vi.stubEnv("CALENDAR_DEMO", "false");
      expect((await apiResponse("/data/calendar.json"))?.status).toBe(503);
      expect(await (await apiResponse("/data/calendar.json"))?.json()).toEqual({
        error: "Calendar unavailable",
      });
      await startRuntime();
      await vi.waitFor(async () =>
        expect((await apiResponse("/healthz"))?.status).toBe(200),
      );
      const response = await apiResponse("/data/calendar.json");
      const data = await response?.json();
      expect(data.events).toEqual([]);
      expect(data.sources.sonarr.health).toBe("unavailable");
      expect(JSON.stringify(data)).not.toContain(dir);
      expect((await apiResponse("/data/nope.json"))?.status).toBe(404);
      expect(response?.headers.get("cache-control")).toContain("no-store");
    } finally {
      await stopPolling();
      await rm(dir, { recursive: true, force: true });
    }
  });
});
