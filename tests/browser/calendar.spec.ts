import { test, expect } from "@playwright/test";
import { demoSnapshot } from "../../scripts/demo";
const fixed = new Date("2026-10-15T12:00:00Z");
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
  expect(config.headers()["cache-control"]).toContain("no-cache");
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
  await page.goto("/?month=2026-10");
  await expect(
    page.getByRole("heading", { name: "Calendar", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: info.project.name === "mobile" ? "Agenda" : "Month",
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
  await page.getByRole("button", { name: "Agenda", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Search titles" })
    .fill("Observatory");
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
  await page.getByRole("button", { name: "Next month" }).click();
  await expect(page).toHaveURL(/2026-11/);
  await expect(
    page.getByText("This month extends beyond", { exact: false }),
  ).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/2026-10/);
  expect(errors).toEqual([]);
  expect(
    requests.every((url) => new URL(url).origin === new URL(page.url()).origin),
  ).toBe(true);
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
  await page.goto("/?month=2026-10&view=month");
  await page.locator(".fc-daygrid-more-link").first().click();
  await expect(page.locator(".fc-popover")).toBeVisible();
  await page.screenshot({
    path: `artifacts/${info.project.name}-crowded.png`,
    fullPage: false,
  });
  await page.getByRole("button", { name: "Agenda", exact: true }).click();
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
    page.getByRole("button", { name: "Agenda", exact: true }),
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
  await page.goto("/?month=2026-10&view=agenda");
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
    page.getByRole("heading", { name: "No releases to show" }),
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
  await expect(page.locator(".agenda-date strong")).toHaveText("01");
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
  await page.goto("/?month=2026-10&view=agenda");
  await expect(page.getByRole("status")).toHaveText("Loading releases…");
  release();
  await expect(page.getByText("Up to date", { exact: true })).toHaveCount(2);
  await page.clock.fastForward(61 * 60000);
  await expect(page.getByText("Stale data", { exact: true })).toHaveCount(2);
});

test("month events and overflow support keyboard activation", async ({
  page,
}) => {
  await page.route("**/data/calendar.json", (route) =>
    route.fulfill({ json: demoSnapshot(fixed) }),
  );
  await page.goto("/?month=2026-10&view=month");
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
  await page.goto("/?month=2026-10&view=month");
  await expect(
    page.getByRole("heading", { name: "Calendar", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".intro")).toHaveCount(0);
  const today = page.locator(".fc-day-today");
  await expect(today.locator(".today-label")).toHaveText("Today");
  await expect(today).toHaveCSS("background-image", /linear-gradient/);
  await expect(today.locator(".fc-daygrid-day-frame")).toHaveCSS(
    "box-shadow",
    /inset/,
  );
  if (info.project.name === "desktop") {
    await page.setViewportSize({ width: 2560, height: 1440 });
    await expect(page.locator(".event-content strong").first()).toHaveCSS(
      "font-size",
      "15px",
    );
  }
});
