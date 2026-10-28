// The next timer is scheduled only after a refresh settles. close() drains it.
export function createPoller(
  refresh: () => Promise<unknown>,
  intervalMs: number,
) {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastCompleted = 0;
  let successful = false;
  let pending: Promise<void>;
  const tick = async () => {
    try {
      await refresh();
      successful = true;
    } catch {
      successful = false;
      console.error(
        "Calendar refresh failed. Check configuration and storage.",
      );
    } finally {
      lastCompleted = Date.now();
      if (!stopped) {
        timer = setTimeout(() => {
          pending = tick();
        }, intervalMs);
        timer.unref?.();
      }
    }
  };
  pending = tick();
  return {
    healthy: () =>
      successful && Date.now() - lastCompleted < intervalMs + 240000,
    async close() {
      stopped = true;
      clearTimeout(timer);
      await pending;
    },
  };
}

// One singleton per server process, including re-evaluation during development.
const key = Symbol.for("calendar.polling.v1");
const registry = globalThis as typeof globalThis & {
  [key]?: Promise<ReturnType<typeof createPoller>>;
};
export function startOnce(
  factory: () => Promise<ReturnType<typeof createPoller>>,
) {
  return (registry[key] ??= factory());
}
export function currentPoller() {
  return registry[key];
}
export async function stopPolling() {
  const current = registry[key];
  if (current) await (await current).close();
  if (registry[key] === current) delete registry[key];
}
