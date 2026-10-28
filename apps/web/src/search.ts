import { defaultStringifySearch } from "@tanstack/react-router";
import { releaseTypes, searchSchema } from "@calendar/schema";

export function stringifyCalendarSearch(input: Record<string, unknown>) {
  const search = searchSchema.parse(input);
  const releases = releaseTypes.filter((type) =>
    search.releases.includes(type),
  );
  return defaultStringifySearch({
    media: search.media === "all" ? undefined : search.media,
    releases:
      releases.length === releaseTypes.length ? undefined : releases.join(","),
    q: search.q || undefined,
    view: search.view,
    month: search.month,
    week: search.week,
  }).replace(/(releases=)[^&]*/g, (value) => value.replaceAll("%2C", ","));
}
