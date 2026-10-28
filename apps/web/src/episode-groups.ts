import type { CalendarEvent } from "@calendar/schema";
import { dayOf, episodeLabel } from "./lib";

type Episode = Extract<CalendarEvent, { media: "tv" }>;
export type DisplayEvent = CalendarEvent & { episodes?: Episode[] };

// Group only the filtered display records; the source snapshot stays intact.
export function groupEpisodes(
  events: CalendarEvent[],
  timezone: "local" | "UTC",
): DisplayEvent[] {
  const result: DisplayEvent[] = [];
  const groups = new Map<string, DisplayEvent>();
  for (const event of events) {
    if (
      event.media !== "tv" ||
      event.season === undefined ||
      event.episode === undefined
    ) {
      result.push(event);
      continue;
    }
    // The public snapshot has no series ID, so use its exact show title.
    const key = JSON.stringify([
      event.title,
      event.season,
      dayOf(event, timezone),
    ]);
    const group = groups.get(key);
    if (group?.episodes) {
      group.episodes.push(event);
    } else {
      const entry = { ...event, episodes: [event] };
      groups.set(key, entry);
      result.push(entry);
    }
  }
  return result.map((group) => {
    if (!group.episodes) return group;
    const episodes = [...group.episodes].sort(
      (a, b) => Date.parse(a.at) - Date.parse(b.at),
    );
    return { ...episodes[0], episodes };
  });
}

export function groupedEpisodeLabel(event: DisplayEvent) {
  if (!event.episodes || event.episodes.length < 2) return episodeLabel(event);
  const numbers = [...new Set(event.episodes.map((e) => e.episode!))].sort(
    (a, b) => a - b,
  );
  const ranges: string[] = [];
  for (let i = 0; i < numbers.length; i++) {
    const first = numbers[i];
    let last = first;
    while (numbers[i + 1] === last + 1) last = numbers[++i];
    const pad = (n: number) => String(n).padStart(2, "0");
    ranges.push(first === last ? pad(first) : `${pad(first)}–${pad(last)}`);
  }
  return `S${String(event.episodes[0].season).padStart(2, "0")}E${ranges.join(", ")}`;
}

export function groupedEpisodeTitle(event: DisplayEvent) {
  return event.episodes
    ? [...event.episodes]
        .sort((a, b) => a.episode! - b.episode!)
        .map((e) => e.episodeTitle)
        .filter(Boolean)
        .join(" · ")
    : event.media === "tv"
      ? event.episodeTitle
      : undefined;
}
