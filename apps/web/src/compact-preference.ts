import { useSyncExternalStore } from "react";

const key = "calendar.compact.v1";
const changed = "calendar-compact-changed";
let fallback = true;

function read() {
  try {
    const value = localStorage.getItem(key);
    return value === "false" ? false : value === "true" ? true : fallback;
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

export function useCompactPreference() {
  return useSyncExternalStore(subscribe, read, () => true);
}

export function saveCompactPreference(compact: boolean) {
  fallback = compact;
  try {
    localStorage.setItem(key, String(compact));
  } catch {
    // The preference still works for this session when storage is blocked.
  }
  window.dispatchEvent(new Event(changed));
}
