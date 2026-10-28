import type { CalendarEvent, PublicConfig } from "@calendar/schema";
export const labels = {
  air: "TV episode",
  theatrical: "Theatrical",
  digital: "Digital",
  physical: "Physical",
};
const timeFormatters = new Map<string, Intl.DateTimeFormat>();
export function timeLabel(e: CalendarEvent, config: PublicConfig) {
  if (e.media !== "tv") return "Date only";
  let formatter = timeFormatters.get(config.timezone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
      ...(config.timezone === "UTC" ? { timeZone: "UTC" } : {}),
    });
    timeFormatters.set(config.timezone, formatter);
  }
  return formatter.format(new Date(e.at));
}
