import { describe, expect, it } from "vitest";
import { defaultParseSearch } from "../apps/web/node_modules/@tanstack/react-router";
import { searchSchema } from "../packages/calendar-schema/src/index";
import { stringifyCalendarSearch } from "../apps/web/src/search";

describe("calendar URLs", () => {
  it("preserves weekly links and rejects invalid dates", () => {
    expect(stringifyCalendarSearch({ week: "2026-12-27" })).toBe(
      "?week=2026-12-27",
    );
    expect(searchSchema.parse({ week: "2026-02-30" }).week).toBeUndefined();
  });
  it("omits default filters, regardless of release order", () => {
    expect(stringifyCalendarSearch({})).toBe("");
    expect(
      stringifyCalendarSearch({
        media: "all",
        q: "",
        releases: ["physical", "theatrical", "digital"],
      }),
    ).toBe("");
  });

  it("writes readable release selections and preserves empty selections", () => {
    expect(
      stringifyCalendarSearch({
        media: "movie",
        releases: ["physical", "theatrical"],
      }),
    ).toBe("?media=movie&releases=theatrical,physical");
    expect(
      searchSchema.parse(
        defaultParseSearch(stringifyCalendarSearch({ releases: [] })),
      ).releases,
    ).toEqual([]);
  });

  it("round trips reserved search characters and accepts old array links", () => {
    const q = "Dune & Alien + #1 / 日本語";
    expect(
      searchSchema.parse(defaultParseSearch(stringifyCalendarSearch({ q }))).q,
    ).toBe(q);
    expect(
      searchSchema.parse(defaultParseSearch("?releases=%5B%22digital%22%5D"))
        .releases,
    ).toEqual(["digital"]);
    expect(
      searchSchema.parse(defaultParseSearch("?releases=theatrical,digital"))
        .releases,
    ).toEqual(["theatrical", "digital"]);
  });
});
