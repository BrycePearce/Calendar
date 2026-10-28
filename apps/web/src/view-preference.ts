import { useSyncExternalStore } from "react";
import type { Search } from "@calendar/schema";

export type CalendarView = NonNullable<Search["view"]>;
const key = "calendar.view.v1";
const changed = "calendar-view-changed";
function read(): CalendarView {
  try {
    const value = localStorage.getItem(key);
    if (value === "month" || value === "monthly" || value === "agenda")
      return value;
  } catch {
    /* Storage can be unavailable in private or restricted browsers. */
  }
  return "month";
}
function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(changed, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(changed, callback);
  };
}
export function useViewPreference() {
  return useSyncExternalStore(subscribe, read, () => undefined);
}
export function saveViewPreference(view: CalendarView) {
  try {
    localStorage.setItem(key, view);
    window.dispatchEvent(new Event(changed));
  } catch {
    /* URL state still works without storage. */
  }
}
export function resolveView(
  search: Partial<Search>,
  preferred?: CalendarView,
): CalendarView {
  return (
    search.view ??
    (search.week || search.month ? "month" : (preferred ?? "month"))
  );
}
