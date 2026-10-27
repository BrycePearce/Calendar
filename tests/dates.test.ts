import { expect, it } from "vitest";
import { dayOf } from "../apps/web/src/lib";
import type { CalendarEvent } from "../packages/calendar-schema/src/index";
it("preserves movie dates independent of timezone and UTC boundaries", () => {
  const e: CalendarEvent = {
    id: "radarr:1:digital",
    media: "movie",
    title: "Fictional",
    releaseType: "digital",
    date: "2026-11-01",
  };
  expect(dayOf(e, "local")).toBe("2026-11-01");
  expect(dayOf(e, "UTC")).toBe("2026-11-01");
});
it("renders explicit timestamps accurately in UTC at daylight-saving transitions", () => {
  for (const at of [
    "2026-03-08T01:30:00-08:00",
    "2026-11-01T01:30:00-07:00",
    "2026-11-01T01:30:00-08:00",
  ]) {
    const e: CalendarEvent = {
      id: "sonarr:1:air",
      media: "tv",
      title: "Fictional",
      releaseType: "air",
      at,
    };
    expect(dayOf(e, "UTC")).toBe(new Date(at).toISOString().slice(0, 10));
  }
});
