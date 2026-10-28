import { expect, it } from "vitest";
import type { CalendarEvent } from "../packages/calendar-schema/src/index";
import {
  groupEpisodes,
  groupedEpisodeLabel,
  groupedEpisodeTitle,
} from "../apps/web/src/episode-groups";

const episode = (number: number, extra = {}): CalendarEvent => ({
  id: `sonarr:${number}:air`,
  media: "tv",
  releaseType: "air",
  title: "VisionQuest",
  season: 1,
  episode: number,
  at: "2026-10-28T01:00:00Z",
  episodeTitle: `Episode ${number}`,
  ...extra,
});

it("combines a double bill, keeps original records and uses the earliest instant", () => {
  const later = episode(6, { at: "2026-10-27T18:50:00-07:00" });
  const earlier = episode(5);
  const grouped = groupEpisodes([later, earlier], "UTC");
  expect(grouped).toHaveLength(1);
  expect(grouped[0].id).toBe(earlier.id);
  expect(grouped[0].episodes).toEqual([earlier, later]);
  expect(groupedEpisodeLabel(grouped[0])).toBe("S01E05–06");
  expect(groupedEpisodeTitle(grouped[0])).toBe("Episode 5 · Episode 6");
  expect(earlier).not.toHaveProperty("episodes");
});

it("does not imply missing episodes and handles a season drop", () => {
  expect(
    groupedEpisodeLabel(
      groupEpisodes([episode(8), episode(5), episode(6)], "UTC")[0],
    ),
  ).toBe("S01E05–06, 08");
  expect(
    groupedEpisodeLabel(
      groupEpisodes(
        Array.from({ length: 12 }, (_, i) => episode(i + 1)),
        "UTC",
      )[0],
    ),
  ).toBe("S01E01–12");
});

it("keeps different dates, shows, seasons, unnumbered episodes and movies separate", () => {
  const records: CalendarEvent[] = [
    episode(5),
    episode(6, { at: "2026-10-29T01:00:00Z" }),
    episode(7, { title: "Other show" }),
    episode(8, { season: 2 }),
    episode(9, { episode: undefined }),
    {
      id: "radarr:1:digital",
      media: "movie",
      title: "VisionQuest",
      releaseType: "digital",
      date: "2026-10-28",
    },
  ];
  expect(groupEpisodes(records, "UTC")).toHaveLength(records.length);
  expect(groupedEpisodeLabel(groupEpisodes([episode(6)], "UTC")[0])).toBe(
    "S01E06",
  );
});
