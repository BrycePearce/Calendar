import { useSyncExternalStore } from "react";

const key = "calendar.density.v1";
const changed = "calendar-density-changed";
export type Density = "compact" | "standard" | "expanded";
let fallback: Density = "standard";

function read() {
  try {
    const value = localStorage.getItem(key);
    return value === "compact" || value === "standard" || value === "expanded"
      ? value
      : fallback;
  } catch {
    return fallback;
  }
}

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(changed, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(changed, callback);
  };
}

export function useDensityPreference() {
  return useSyncExternalStore(subscribe, read, () => "standard" as Density);
}

export function saveDensityPreference(density: Density) {
  fallback = density;
  try {
    localStorage.setItem(key, density);
  } catch {
    // The preference still works for this session when storage is blocked.
  }
  window.dispatchEvent(new Event(changed));
}
