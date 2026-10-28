import { test, expect } from "@playwright/test";

test("server snapshot renders without initial JSON requests and still polls", async ({
  page,
}) => {
  const errors: string[] = [];
  const requests: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.clock.install();
  await page.route(/\/(config|data\/calendar)\.json$/, async (route) => {
    requests.push(new URL(route.request().url()).pathname);
    await route.fulfill({
      status: 503,
      json: { error: "Calendar unavailable" },
    });
  });
  const response = await page.goto("/");
  expect(await response!.text()).toContain("Small Town Stories");
  await expect(page.locator(".fc-event").first()).toBeVisible();
  expect(requests).toEqual([]);
  await page.getByRole("button", { name: "Next week", exact: true }).click();
  await expect(page.locator(".fc-event").first()).toBeVisible();
  expect(requests).toEqual([]);
  await page.clock.fastForward(61000);
  await expect.poll(() => requests.includes("/data/calendar.json")).toBe(true);
  await page.clock.fastForward(5000);
  await expect(page.getByRole("alert")).toContainText("Refresh failed");
  await expect(page.locator(".fc-event").first()).toBeVisible();
  expect(errors).toEqual([]);
});

test("server data respects saved agenda and loads the grid only when selected", async ({
  page,
}) => {
  const scripts: string[] = [];
  const jsonRequests: string[] = [];
  page.on("request", (request) => {
    if (request.resourceType() === "script") scripts.push(request.url());
    if (/\/(config|data\/calendar)\.json$/.test(request.url()))
      jsonRequests.push(request.url());
  });
  await page.addInitScript(() =>
    localStorage.setItem("calendar.view.v1", "agenda"),
  );
  await page.goto("/");
  await expect(page.locator(".agenda-day").first()).toBeVisible();
  expect(scripts.some((url) => url.includes("month-calendar"))).toBe(false);
  expect(jsonRequests).toEqual([]);
  await page.getByRole("button", { name: "Month", exact: true }).click();
  await expect(page.locator(".fc-dayGridMonth-view")).toBeVisible();
  expect(scripts.some((url) => url.includes("month-calendar"))).toBe(true);
  await page.reload();
  await expect(page.locator(".fc-dayGridMonth-view")).toBeVisible();
  expect(jsonRequests).toEqual([]);
});
