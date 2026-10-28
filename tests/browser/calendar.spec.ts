import { test, expect } from "@playwright/test";
import { demoSnapshot } from "../../scripts/demo";
const fixed = new Date("2026-10-15T12:00:00Z");

test("compact acknowledges clicks before layout and applies the latest choice", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".month-shell .fc")).toBeVisible();
  await page.clock.pauseAt(new Date("2026-10-15T12:01:00Z"));
  const toggle = page.getByRole("checkbox", { name: "Compact", exact: true });
  await toggle.uncheck();
  await expect(toggle).not.toBeChecked();
  await expect(page.locator(".month-shell .fc")).toBeVisible();
  await toggle.check();
  await toggle.uncheck();
  await expect(toggle).not.toBeChecked();
  await page.clock.runFor(100);
  await expect(page.locator(".expanded-shell .fc")).toBeVisible();
  expect(
    await page.evaluate(() => localStorage.getItem("calendar.compact.v1")),
  ).toBe("false");
});

test("compact preference switches between a fitted grid and full detailed cards", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const compact = page.getByRole("checkbox", { name: "Compact", exact: true });
  await expect(compact).toBeChecked();
  await expect(page.locator(".month-shell .fc")).toBeVisible();
  await compact.uncheck();
  await expect(page.locator(".expanded-shell .fc")).toBeVisible();
  await expect(page.locator(".event-content strong").first()).toHaveCSS(
    "font-size",
    "15px",
  );
  await expect(page.locator(".fc-daygrid-more-link")).toHaveCount(0);
  await expect(
    page.locator(".fc-daygrid-event .episode-title").first(),
  ).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollHeight),
  ).toBeGreaterThan(900);
  await page.reload();
  await expect(compact).not.toBeChecked();
  await page.getByRole("button", { name: "Month", exact: true }).click();
  await expect(compact).not.toBeChecked();
  await expect(page.locator(".fc-dayGridMonth-view")).toBeVisible();
  await compact.check();
  await expect(page.locator(".month-shell .fc")).toBeVisible();
  await page.reload();
  await expect(compact).toBeChecked();
  await page.getByRole("button", { name: "Upcoming", exact: true }).click();
  await expect(compact).toHaveCount(0);
});

test("search keeps typing local, highlights the whole field, and cancels pending text", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".fc-rolling-view")).toBeVisible();
  const input = page.getByRole("textbox", { name: "Search titles" });
  await expect(input).toHaveAttribute("placeholder", "Search titles…");
  await page.clock.pauseAt(new Date("2026-10-15T12:01:00Z"));
  await input.pressSequentially("Observatory");
  await expect(input).toHaveValue("Observatory");
  expect(new URL(page.url()).searchParams.has("q")).toBe(false);
  await expect(page.locator(".search")).toHaveCSS("outline-style", "solid");
  await expect(input).toHaveCSS("outline-style", "none");
  await page.clock.runFor(250);
  await expect(page).toHaveURL(/q=Observatory/);
  await input.fill("pending text");
  await page.getByRole("button", { name: "Clear search" }).click();
  await expect(input).toBeFocused();
  await expect(input).toHaveValue("");
  await page.clock.runFor(250);
  await expect(page).not.toHaveURL(/q=/);
  await input.fill("Harbor");
  await input.press("Enter");
  await expect(page).toHaveURL(/q=Harbor/);
  await page.clock.resume();
  await page.goto("/?q=Glass");
  await expect(input).toHaveValue("Glass");
});
test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: fixed });
});
test("production headers and real JSON errors", async ({ request }) => {
  const response = await request.get("/");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-security-policy"]).toContain(
    "connect-src 'self'",
  );
  expect(response.headers()["content-security-policy"]).not.toContain(
    "script-src 'self' 'unsafe-inline'",
  );
  expect(response.headers()["x-content-type-options"]).toBe("nosniff");
  const policy = response.headers()["content-security-policy"];
  const nonce = policy.match(/'nonce-([^']+)'/)?.[1];
  expect(nonce).toBeTruthy();
  expect(await response.text()).toContain(`nonce="${nonce}"`);
  const next = await request.get("/");
  expect(next.headers()["content-security-policy"]).not.toBe(
    response.headers()["content-security-policy"],
  );
  expect((await request.get("/healthz")).status()).toBe(200);
  const missing = await request.get("/data/does-not-exist.json");
  expect(missing.status()).toBe(404);
  expect(await missing.text()).not.toContain("Loading your calendar");
  const config = await request.get("/config.json");
  expect(config.headers()["cache-control"]).toContain("max-age=60");
});
test("default responsive view, filters, details, navigation and same-origin network", async ({
  page,
}, info) => {
  const requests: string[] = [];
  const errors: string[] = [];
  page.on("request", (r) => requests.push(r.url()));
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      /content security policy/i.test(message.text())
    )
      errors.push("CSP violation");
  });
  await page.route("**/data/calendar.json", (r) =>
    r.fulfill({ json: demoSnapshot(fixed) }),
  );
  await page.goto("/?week=2026-10-11");
  await expect(
    page.getByRole("heading", { name: "Calendar", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Calendar",
      exact: true,
    }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("Up to date", { exact: true })).toHaveCount(2);
  await page.screenshot({
    path: `artifacts/${info.project.name}-calendar.png`,
    fullPage: info.project.name === "desktop",
  });
  await page.getByRole("button", { name: "Movies", exact: true }).click();
  await expect(page).toHaveURL(/media=movie/);
  await page.getByRole("button", { name: "Upcoming", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Search titles" })
    .fill("Observatory");
  await expect(page).toHaveURL(/q=Observatory/);
  const event = page.locator(".agenda-event").first();
  await expect(event).toBeVisible();
  await event.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("dialog")).toContainText("Calendar date");
  await page.screenshot({
    path: `artifacts/${info.project.name}-details.png`,
    fullPage: false,
  });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(event).toBeFocused();
  await page.getByRole("button", { name: "Calendar", exact: true }).click();
  await page.getByRole("button", { name: "Next week" }).click();
  await expect(page).toHaveURL(/week=2026-10-18/);
  await expect(
    page.getByText("This range extends beyond", { exact: false }),
  ).toBeVisible();
  await page.goBack();
  await expect(
    page.getByText("Oct 11 – Nov 14, 2026", { exact: true }),
  ).toBeVisible();
  expect(new URL(page.url()).searchParams.has("month")).toBe(false);
  expect(errors).toEqual([]);
  expect(
    requests.every((url) => new URL(url).origin === new URL(page.url()).origin),
  ).toBe(true);
});

test("clean default URLs and readable filter links", async ({ page }) => {
  await page.route("**/data/calendar.json", (route) =>
    route.fulfill({ json: demoSnapshot(fixed) }),
  );
  const defaultView = "month";
  await page.goto(
    `/?media=all&releases=%5B%22theatrical%22%2C%22physical%22%2C%22digital%22%5D&q=&view=${defaultView}&week=2026-10-11`,
  );
  await expect(page).toHaveURL("/");
  await page.getByRole("button", { name: "Movies", exact: true }).click();
  await expect(page).toHaveURL("/?media=movie");
  await page.getByLabel("Digital", { exact: true }).uncheck();
  await expect(page).toHaveURL("/?media=movie&releases=theatrical,physical");
  await page.reload();
  await expect(page.getByLabel("Digital", { exact: true })).not.toBeChecked();
  await page.getByLabel("Digital", { exact: true }).check();
  await page.getByRole("button", { name: "All releases", exact: true }).click();
  await expect(page).toHaveURL("/");
});
test("crowded days, inert malicious text, release filters and keyboard", async ({
  page,
}, info) => {
  const data = demoSnapshot(fixed);
  data.events.push({
    id: "sonarr:999:air",
    media: "tv",
    title: "<img src=x onerror=alert(1)>",
    episodeTitle: "<script>evil()</script>",
    releaseType: "air",
    at: "2026-10-15T20:00:00Z",
  });
  await page.route("**/data/calendar.json", (r) => r.fulfill({ json: data }));
  await page.goto("/?week=2026-10-11&view=month");
  await page.locator(".fc-daygrid-more-link").first().click();
  await expect(page.locator(".fc-popover")).toBeVisible();
  await page.screenshot({
    path: `artifacts/${info.project.name}-crowded.png`,
    fullPage: false,
  });
  await page.getByRole("button", { name: "Upcoming", exact: true }).click();
  await page.getByRole("textbox", { name: "Search titles" }).fill("<img");
  const event = page.locator(".agenda-event");
  await expect(event).toHaveCount(1);
  await expect(event.locator("img,script")).toHaveCount(0);
  await event.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toContainText("<img src=x");
  await expect(page.getByRole("dialog").locator("img,script")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Clear search" }).click();
  await page.getByRole("button", { name: "Movies", exact: true }).click();
  await page.getByLabel("Digital", { exact: true }).uncheck();
  await expect(
    page.locator(".agenda-event .release-badge").filter({ hasText: "Digital" }),
  ).toHaveCount(0);
  await page.setViewportSize({ width: 900, height: 900 });
  await expect(
    page.getByRole("button", { name: "Upcoming", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
});
test("stale, unavailable, malformed, empty, and loading states", async ({
  page,
}, info) => {
  const data = demoSnapshot(fixed);
  data.sources.sonarr.health = "stale";
  data.sources.radarr = {
    health: "unavailable",
    lastSuccess: null,
    coverage: null,
  };
  data.events = data.events.filter((e) => e.media === "tv");
  await page.route("**/data/calendar.json", (r) => r.fulfill({ json: data }));
  await page.goto("/?week=2026-10-11&view=agenda");
  await expect(page.getByText("Stale data", { exact: true })).toBeVisible();
  await expect(page.getByText("Unavailable", { exact: true })).toBeVisible();
  await page
    .locator(".source-status")
    .screenshot({ path: `artifacts/${info.project.name}-source-status.png` });
  await page.screenshot({
    path: `artifacts/${info.project.name}-outage.png`,
    fullPage: false,
  });
  await page
    .getByRole("textbox", { name: "Search titles" })
    .fill("nothing-matches");
  await expect(
    page.getByText("No matching releases today.", { exact: true }),
  ).toBeVisible();
  await page.unroute("**/data/calendar.json");
  await page.route("**/data/calendar.json", (r) =>
    r.fulfill({
      json: { version: 99, apiKey: "PRIVATE_SENTINEL_DO_NOT_PUBLISH_72941" },
    }),
  );
  await page.reload();
  await page.clock.runFor(3000);
  await expect(page.getByRole("alert")).toContainText("Calendar unavailable");
  await expect(page.locator("body")).not.toContainText("PRIVATE_SENTINEL");
});
test("local DST, date-only values, reduced motion and no horizontal overflow", async ({
  page,
}) => {
  const data = demoSnapshot(fixed);
  data.events = [
    {
      id: "sonarr:1:air",
      media: "tv",
      title: "Fictional DST first",
      releaseType: "air",
      at: "2026-11-01T08:30:00Z",
    },
    {
      id: "sonarr:2:air",
      media: "tv",
      title: "Fictional DST second",
      releaseType: "air",
      at: "2026-11-01T09:30:00Z",
    },
    {
      id: "radarr:1:digital",
      media: "movie",
      title: "Fictional midnight",
      releaseType: "digital",
      date: "2026-11-01",
    },
  ];
  await page.route("**/data/calendar.json", (r) => r.fulfill({ json: data }));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/?month=2026-11&view=agenda");
  await expect(page.locator(".agenda-event")).toHaveCount(3);
  await expect(
    page.locator(".event-time").filter({ hasText: "1:30 AM" }),
  ).toHaveCount(2);
  await expect(
    page.locator('[data-day="2026-11-01"] .agenda-date strong'),
  ).toHaveText("01");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(
    await page
      .locator(".button")
      .first()
      .evaluate((el) => getComputedStyle(el).transitionDuration),
  ).toBe("0s");
});

test("loading and source-age status update even when the JSON stops changing", async ({
  page,
}) => {
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/data/calendar.json", async (route) => {
    await gate;
    await route.fulfill({ json: demoSnapshot(fixed) });
  });
  await page.goto("/?week=2026-10-11&view=agenda");
  await expect(
    page.getByRole("status", { name: "Loading releases" }),
  ).toHaveAttribute("aria-busy", "true");
  release();
  await expect(page.getByText("Up to date", { exact: true })).toHaveCount(2);
  await page.clock.fastForward(61 * 60000);
  await expect(page.getByText("Stale data", { exact: true })).toHaveCount(2);
});

test("loads data in parallel with a quiet skeleton and defers the month bundle", async ({
  page,
}, info) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let calendarRequested = false;
  const scripts: string[] = [];
  page.on("request", (request) => {
    if (request.resourceType() === "script") scripts.push(request.url());
  });
  await page.route("**/config.json", async (route) => {
    await gate;
    await route.fulfill({ json: { title: "Calendar" } });
  });
  await page.route("**/data/calendar.json", async (route) => {
    calendarRequested = true;
    await gate;
    await route.fulfill({ json: demoSnapshot(fixed) });
  });
  try {
    await page.goto("/?view=agenda");
    await expect.poll(() => calendarRequested).toBe(true);
    await expect(
      page.getByRole("status", { name: "Loading releases" }),
    ).toBeVisible();
    await expect(page.locator("body")).not.toContainText(
      "Loading your calendar",
    );
    await expect(page.locator("body")).not.toContainText("Loading releases…");
    await page.screenshot({
      path: `artifacts/${info.project.name}-loading.png`,
    });
    expect(scripts.some((url) => /month-calendar/.test(url))).toBe(false);
  } finally {
    release();
  }
  await expect(page.locator(".agenda-day").first()).toBeVisible();
  await expect(
    page.getByRole("status", { name: "Loading releases" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Calendar", exact: true }).click();
  await expect(page.locator(".fc")).toBeVisible();
  expect(scripts.some((url) => /month-calendar/.test(url))).toBe(true);
});

test("JSON revalidation returns 304 while HTML stays uncached", async ({
  request,
}) => {
  const first = await request.get("/data/calendar.json");
  expect(first.headers()["cache-control"]).toBe(
    "private, max-age=60, stale-while-revalidate=300",
  );
  const cached = await request.get("/data/calendar.json", {
    headers: { "If-None-Match": first.headers().etag },
  });
  expect(cached.status()).toBe(304);
  expect(await cached.body()).toHaveLength(0);
  expect((await request.get("/")).headers()["cache-control"]).toContain(
    "no-store",
  );
});

test("month reveals once after configuration, data and code are ready", async ({
  page,
}, info) => {
  let releaseConfig!: () => void;
  let releaseData!: () => void;
  let releaseCode!: () => void;
  const configGate = new Promise<void>((resolve) => {
    releaseConfig = resolve;
  });
  const dataGate = new Promise<void>((resolve) => {
    releaseData = resolve;
  });
  const codeGate = new Promise<void>((resolve) => {
    releaseCode = resolve;
  });
  await page.route("**/config.json", async (route) => {
    await configGate;
    await route.fulfill({ json: { title: "Calendar" } });
  });
  await page.route("**/data/calendar.json", async (route) => {
    await dataGate;
    await route.fulfill({ json: demoSnapshot(fixed) });
  });
  await page.route("**/month-calendar-*.js", async (route) => {
    await codeGate;
    await route.continue();
  });
  try {
    await page.goto("/?view=month", { waitUntil: "domcontentloaded" });
    await expect(page.locator(".month-skeleton")).toBeVisible();
    const initial = await page.locator(".calendar-panel").boundingBox();
    releaseConfig();
    await expect(
      page.getByRole("button", { name: "Today", exact: true }),
    ).toHaveCount(0);
    releaseData();
    await expect(page.locator(".month-skeleton")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Today", exact: true }),
    ).toHaveCount(0);
    const waiting = await page.locator(".calendar-panel").boundingBox();
    expect(waiting).toEqual(initial);
    await page.screenshot({
      path: `artifacts/${info.project.name}-month-loading.png`,
    });
    releaseCode();
    await expect(page.locator(".fc")).toBeVisible();
    await expect(
      page.locator(".fc-daygrid-event:visible .event-meta").first(),
    ).toBeVisible();
    await expect(page.locator(".month-skeleton")).toHaveCount(0);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    const loaded = await page.locator(".calendar-panel").boundingBox();
    expect(loaded!.x).toBe(initial!.x);
    expect(loaded!.y).toBe(initial!.y);
    expect(loaded!.width).toBe(initial!.width);
    if (info.project.name === "desktop")
      expect(loaded!.height).toBe(initial!.height);
  } finally {
    releaseConfig();
    releaseData();
    releaseCode();
  }
});

test("desktop month fits the viewport with accessible overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  let date = fixed;
  await page.route("**/data/calendar.json", (route) =>
    route.fulfill({ json: demoSnapshot(date) }),
  );
  for (const month of ["2026-10", "2026-08"]) {
    date = new Date(`${month}-15T12:00:00Z`);
    await page.goto(`/?view=month&month=${month}`);
    await expect(page.locator(".fc")).toBeVisible();
    const grid = await page.locator(".month-grid").boundingBox();
    const lastDay = await page.locator(".fc-daygrid-day").last().boundingBox();
    expect(lastDay!.y + lastDay!.height).toBeLessThanOrEqual(
      grid!.y + grid!.height + 1,
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollHeight <= window.innerHeight + 1,
      ),
    ).toBe(true);
    await page.locator(".fc-daygrid-more-link").first().click();
    await expect(page.locator(".fc-popover")).toBeVisible();
    await page.locator(".fc-popover .fc-event").first().click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await page.screenshot({ path: `artifacts/fit-month-${month}.png` });
  }
  await page.setViewportSize({ width: 1440, height: 600 });
  await expect
    .poll(async () =>
      page.evaluate(() => document.documentElement.scrollHeight),
    )
    .toBeGreaterThan(600);
});

test("month events and overflow support keyboard activation", async ({
  page,
}) => {
  await page.route("**/data/calendar.json", (route) =>
    route.fulfill({ json: demoSnapshot(fixed) }),
  );
  await page.goto("/?week=2026-10-11&view=month");
  const event = page.locator(".fc-event").first();
  await event.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(event).toBeFocused();
  const more = page.locator(".fc-daygrid-more-link").first();
  await more.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".fc-popover")).toBeVisible();
});

test("dark shell before assets load", async ({ page }) => {
  await page.route(/\.(css|js)(\?.*)?$/, (route) => route.abort());
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveCSS(
    "background-color",
    "rgb(12, 14, 18)",
  );
  await expect(page.locator("html")).toHaveCSS("color-scheme", "dark");
  await expect(page.locator("body")).toHaveCSS(
    "background-color",
    "rgb(12, 14, 18)",
  );
});

test("compact header and prominent current day", async ({ page }, info) => {
  await page.route("**/data/calendar.json", (route) =>
    route.fulfill({ json: demoSnapshot(fixed) }),
  );
  await page.goto("/?week=2026-10-11&view=month");
  await expect(
    page.getByRole("heading", { name: "Calendar", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".intro")).toHaveCount(0);
  const today = page.locator(".fc-day-today");
  await expect(today.locator(".today-label")).toHaveText("Today");
  await expect(today).toHaveCSS("background-image", "none");
  await expect(today.locator(".fc-daygrid-day-frame")).toHaveCSS(
    "box-shadow",
    "none",
  );
  await expect(today.locator(".today-number")).toHaveCSS(
    "border-radius",
    "50%",
  );
  await expect(today.locator(".today-number")).toHaveAttribute(
    "aria-current",
    "date",
  );
  const cell = await today.boundingBox();
  const marker = await today.locator(".today-number").boundingBox();
  expect(marker!.x).toBeGreaterThanOrEqual(cell!.x);
  expect(marker!.x + marker!.width).toBeLessThanOrEqual(cell!.x + cell!.width);
  await today.screenshot({ path: `artifacts/${info.project.name}-today.png` });
  if (info.project.name === "desktop") {
    await page.setViewportSize({ width: 2560, height: 1440 });
    await expect(page.locator(".event-content strong").first()).toHaveCSS(
      "font-size",
      "13px",
    );
  }
});

test("rolling calendar starts this week and Today resets navigation", async ({
  page,
}) => {
  await page.route("**/data/calendar.json", (route) =>
    route.fulfill({ json: demoSnapshot(fixed) }),
  );
  await page.goto("/");
  await expect(page.locator(".fc-daygrid-day")).toHaveCount(35);
  await expect(page.locator(".fc-daygrid-day").first()).toHaveAttribute(
    "data-date",
    "2026-10-11",
  );
  await expect(page.locator(".fc-daygrid-day").last()).toHaveAttribute(
    "data-date",
    "2026-11-14",
  );
  await expect(
    page.getByRole("button", { name: "Calendar", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await page.getByRole("button", { name: "Next week" }).click();
  await expect(page).toHaveURL("/?week=2026-10-18");
  await expect(page.locator(".fc-daygrid-day").first()).toHaveAttribute(
    "data-date",
    "2026-10-18",
  );
  await page.goBack();
  await expect(page.locator(".fc-daygrid-day").first()).toHaveAttribute(
    "data-date",
    "2026-10-11",
  );
  await page.getByRole("button", { name: "Previous week" }).click();
  await expect(page).toHaveURL("/?week=2026-10-04");
  await page.getByRole("button", { name: "Today", exact: true }).click();
  await expect(page).toHaveURL("/");
  await expect(page.locator(".fc-daygrid-day").first()).toHaveAttribute(
    "data-date",
    "2026-10-11",
  );
  await page.screenshot({ path: "artifacts/rolling-calendar.png" });
});

test("agenda marks today and scrolls only when needed", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 600 });
  const data = demoSnapshot(fixed);
  data.events = Array.from({ length: 15 }, (_, index) => ({
    id: `radarr:${index}:digital`,
    media: "movie" as const,
    title: `Release ${index}`,
    releaseType: "digital" as const,
    date: `2026-10-${String(index + 1).padStart(2, "0")}`,
  }));
  await page.route("**/data/calendar.json", (route) =>
    route.fulfill({ json: data }),
  );
  await page.goto("/?view=agenda");
  await expect(
    page.locator('.agenda-date [aria-current="date"]'),
  ).toBeInViewport();
  await page.screenshot({ path: "artifacts/agenda-today.png" });
  await page.goto("/?month=2026-11&view=month");
  await expect(
    page.getByText("Nov 1 – Dec 5, 2026", { exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});

test("upcoming starts today, expands across months, and keeps history accessible", async ({
  page,
}, info) => {
  const data = demoSnapshot(fixed);
  data.coverage = { start: "2026-09-01", end: "2026-12-31" };
  data.events = ["2026-10-14", "2026-10-16", "2026-11-01", "2026-11-20"].map(
    (date, index) => ({
      id: `radarr:${index}:digital`,
      media: "movie" as const,
      releaseType: "digital" as const,
      title: `Release ${date}`,
      date,
    }),
  );
  await page.route("**/data/calendar.json", (route) =>
    route.fulfill({ json: data }),
  );
  await page.route("**/config.json", (route) =>
    route.fulfill({
      json: {
        title: "Calendar",
        requestUrl: "https://example.com/request",
        requestLabel: "Request a title",
      },
    }),
  );
  await page.goto("/?view=agenda");
  await expect(
    page.getByRole("button", { name: "Upcoming", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByText("No releases today.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Tomorrow", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".agenda-event")).toHaveCount(2);
  await expect(page.locator(".site-header, .calendar-meta")).toHaveCount(0);
  await expect(page.locator(".panel-footer")).toContainText("Timezone:");
  await expect(
    page
      .locator(".panel-footer")
      .getByRole("link", { name: "Request a title" }),
  ).toHaveAttribute("href", "https://example.com/request");
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await page.screenshot({
    path: `artifacts/${info.project.name}-upcoming.png`,
  });
  await page.getByRole("button", { name: "Show more", exact: true }).click();
  await expect(
    page.getByText("Release 2026-11-20", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "View earlier releases" }).click();
  await expect(
    page.getByText("Release 2026-10-14", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Back to upcoming" }).click();
  await expect(
    page.getByText("Release 2026-10-14", { exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Calendar", exact: true }).click();
  await expect(page.locator(".fc")).toBeVisible();
  await expect(page).toHaveURL("/");
  await page.getByRole("button", { name: "Upcoming", exact: true }).click();
  await expect(page).toHaveURL("/?view=agenda");
  await expect(page.locator(".agenda-event")).toHaveCount(2);
});

test("remembers views while explicit links take precedence", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Calendar", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Month", exact: true }).click();
  await expect(page.locator(".fc-dayGridMonth-view")).toBeVisible();
  await page.getByRole("button", { name: "Next month", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "November 2026", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "November 2026", exact: true }),
  ).toBeVisible();
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Month", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("heading", { name: "October 2026", exact: true }),
  ).toBeVisible();
  await page.goto("/?view=agenda");
  await expect(
    page.getByRole("button", { name: "Upcoming", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Month", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Calendar", exact: true }).click();
  await expect(page.locator(".fc-rolling-view")).toBeVisible();
  await page.reload();
  await expect(page.locator(".fc-rolling-view")).toBeVisible();
});

test("view selection works when storage is unavailable", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      get() {
        throw new DOMException("Blocked", "SecurityError");
      },
    });
  });
  await page.goto("/");
  await expect(page.locator(".fc-rolling-view")).toBeVisible();
  await page.getByRole("button", { name: "Month", exact: true }).click();
  await expect(page.locator(".fc-dayGridMonth-view")).toBeVisible();
  await page.reload();
  await expect(page.locator(".fc-dayGridMonth-view")).toBeVisible();
});
