import { z } from "zod";

export const calendarDate = z.iso.date();
export const timestamp = z.iso.datetime({ offset: true });
export const releaseTypes = ["theatrical", "digital", "physical"] as const;
const text = z.string().trim().min(1).max(500);
const common = {
  id: z
    .string()
    .regex(/^(sonarr|radarr):[0-9]+:(air|theatrical|digital|physical)$/),
  title: text,
};
export const eventSchema = z
  .discriminatedUnion("media", [
    z
      .object({
        ...common,
        media: z.literal("tv"),
        releaseType: z.literal("air"),
        at: timestamp,
        episodeTitle: text.optional(),
        season: z.number().int().nonnegative().optional(),
        episode: z.number().int().nonnegative().optional(),
      })
      .strict(),
    z
      .object({
        ...common,
        media: z.literal("movie"),
        releaseType: z.enum(releaseTypes),
        date: calendarDate,
      })
      .strict(),
  ])
  .refine(
    (e) =>
      e.id.startsWith(e.media === "tv" ? "sonarr:" : "radarr:") &&
      e.id.endsWith(":" + e.releaseType),
    "Event ID does not match its media and release type",
  );
export const coverageSchema = z
  .object({ start: calendarDate, end: calendarDate })
  .strict()
  .refine((v) => v.start <= v.end);
export const sourceSchema = z
  .object({
    health: z.enum(["healthy", "stale", "unavailable"]),
    lastSuccess: timestamp.nullable(),
    coverage: coverageSchema.nullable(),
  })
  .strict();
export const snapshotSchema = z
  .object({
    version: z.literal(1),
    generatedAt: timestamp,
    coverage: coverageSchema,
    sources: z.object({ sonarr: sourceSchema, radarr: sourceSchema }).strict(),
    events: z.array(eventSchema).max(50000),
  })
  .strict()
  .superRefine((s, ctx) => {
    if (new Set(s.events.map((e) => e.id)).size !== s.events.length)
      ctx.addIssue({ code: "custom", message: "Duplicate event IDs" });
    for (const key of ["sonarr", "radarr"] as const) {
      const source = s.sources[key];
      if (
        (source.health === "unavailable") !== (source.lastSuccess === null) ||
        (source.lastSuccess === null) !== (source.coverage === null)
      )
        ctx.addIssue({ code: "custom", message: "Inconsistent source state" });
      if (
        source.health === "unavailable" &&
        s.events.some((e) => e.id.startsWith(key + ":"))
      )
        ctx.addIssue({
          code: "custom",
          message: "Unavailable source has events",
        });
    }
    for (const e of s.events)
      if (!e.id.startsWith(e.media === "tv" ? "sonarr:" : "radarr:"))
        ctx.addIssue({ code: "custom", message: "Invalid event namespace" });
  });
export const publicConfigSchema = z
  .object({
    title: z.string().trim().min(1).max(80).default("EdonCloud Calendar"),
    tagline: z
      .string()
      .max(160)
      .default("Your next great watch, on the horizon."),
    brandMark: z.string().min(1).max(3).default("E"),
    timezone: z.enum(["local", "UTC"]).default("local"),
    requestUrl: z
      .url()
      .refine((s) => {
        const u = new URL(s);
        return u.protocol === "https:" && !u.username && !u.password;
      })
      .optional(),
    requestLabel: z.string().min(1).max(50).default("Request a title"),
    staleAfterMinutes: z.number().int().min(15).max(10080).default(60),
  })
  .strict();
export const searchSchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .refine((s) => +s.slice(0, 4) >= 1970 && +s.slice(0, 4) <= 2100)
    .optional()
    .catch(undefined),
  view: z.enum(["month", "agenda"]).optional().catch(undefined),
  media: z.enum(["all", "tv", "movie"]).default("all").catch("all"),
  releases: z
    .array(z.enum(releaseTypes))
    .max(3)
    .default([...releaseTypes])
    .catch([...releaseTypes]),
  q: z.string().max(100).default("").catch(""),
});
export type CalendarEvent = z.infer<typeof eventSchema>;
export type Snapshot = z.infer<typeof snapshotSchema>;
export type PublicConfig = z.infer<typeof publicConfigSchema>;
export type Search = z.infer<typeof searchSchema>;
export type Coverage = z.infer<typeof coverageSchema>;
