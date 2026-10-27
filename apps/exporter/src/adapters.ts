import { z } from "zod";
import {
  eventSchema,
  type CalendarEvent,
  type Coverage,
} from "@calendar/schema";
import type { SourceConfig } from "./config.js";

const id = z.number().int().positive();
const name = z.string().trim().min(1).max(500);
const episode = z.object({
  id,
  seriesId: id,
  title: name.nullish(),
  seasonNumber: z.number().int().nonnegative().optional(),
  episodeNumber: z.number().int().nonnegative().optional(),
  airDateUtc: z.string().nullish(),
  monitored: z.boolean().optional(),
  series: z.object({ title: name, monitored: z.boolean().optional() }),
});
const movie = z.object({
  id,
  title: name,
  monitored: z.boolean().optional(),
  inCinemas: z.string().nullish(),
  digitalRelease: z.string().nullish(),
  physicalRelease: z.string().nullish(),
});
function allowed(
  id: number,
  monitored: boolean | undefined,
  config: SourceConfig,
) {
  return (
    (config.allowIds === undefined || config.allowIds.includes(id)) &&
    (!config.monitoredOnly || monitored === true)
  );
}
export function normalize(
  source: "sonarr" | "radarr",
  raw: unknown,
  config: SourceConfig,
  coverage: Coverage,
): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  if (source === "sonarr") {
    for (const e of z.array(episode).max(50000).parse(raw)) {
      if (
        !allowed(e.seriesId, e.series.monitored, config) ||
        (config.monitoredOnly && e.monitored !== true) ||
        !e.airDateUtc
      )
        continue;
      // Construct every public field explicitly. Never spread upstream metadata.
      events.push(
        eventSchema.parse({
          id: `sonarr:${e.id}:air`,
          media: "tv",
          title: e.series.title,
          episodeTitle: e.title ?? undefined,
          season: e.seasonNumber,
          episode: e.episodeNumber,
          releaseType: "air",
          at: e.airDateUtc,
        }),
      );
    }
  } else {
    for (const m of z.array(movie).max(50000).parse(raw)) {
      if (!allowed(m.id, m.monitored, config)) continue;
      for (const [field, type] of [
        ["inCinemas", "theatrical"],
        ["digitalRelease", "digital"],
        ["physicalRelease", "physical"],
      ] as const) {
        const rawDate = m[field];
        if (!rawDate) continue;
        // Radarr exposes midnight timestamps as release dates. Preserve the written date.
        if (
          !/^\d{4}-\d{2}-\d{2}(?:T00:00:00(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))?$/.test(
            rawDate,
          )
        )
          throw new Error("Invalid release date");
        events.push(
          eventSchema.parse({
            id: `radarr:${m.id}:${type}`,
            media: "movie",
            title: m.title,
            releaseType: type,
            date: rawDate.slice(0, 10),
          }),
        );
      }
    }
  }
  return [
    ...new Map(
      events
        .filter((e) => {
          const date =
            e.media === "tv"
              ? new Date(e.at).toISOString().slice(0, 10)
              : e.date;
          return date >= coverage.start && date <= coverage.end;
        })
        .map((e) => [e.id, e]),
    ).values(),
  ].sort((a, b) => a.id.localeCompare(b.id));
}
