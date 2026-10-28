import { definePlugin } from "nitro";
import { startRuntime } from "./runtime.server";
import { stopPolling } from "./poller.server";

export default definePlugin(async (app) => {
  await startRuntime();
  app.hooks.hook("close", stopPolling);
  app.hooks.hook("response", (response) => {
    response.headers.set("X-Content-Type-Options", "nosniff");
    response.headers.set("X-Frame-Options", "DENY");
    response.headers.set("Referrer-Policy", "no-referrer");
    response.headers.set(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=()",
    );
  });
});
