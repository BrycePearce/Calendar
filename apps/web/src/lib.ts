import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { CalendarEvent } from "@calendar/schema";
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
export function dayOf(event: CalendarEvent, timezone: "local" | "UTC") {
  if (event.media === "movie") return event.date;
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...(timezone === "UTC" ? { timeZone: "UTC" } : {}),
  }).formatToParts(new Date(event.at));
  return ["year", "month", "day"]
    .map((type) => parts.find((p) => p.type === type)?.value)
    .join("-");
}
export function episodeLabel(e: CalendarEvent) {
  return e.media === "tv" && e.season !== undefined && e.episode !== undefined
    ? `S${String(e.season).padStart(2, "0")}E${String(e.episode).padStart(2, "0")}`
    : "";
}
