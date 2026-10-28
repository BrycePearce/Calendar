import handler, { createServerEntry } from "@tanstack/react-start/server-entry";
import { randomBytes } from "node:crypto";
import { apiResponse } from "./server/runtime.server";

export default createServerEntry({
  async fetch(request, options) {
    const nonce = randomBytes(24).toString("base64");
    const path = new URL(request.url).pathname;
    let response: Response;
    if (request.method !== "GET" && request.method !== "HEAD")
      response = Response.json(
        { error: "Method not allowed" },
        { status: 405, headers: { Allow: "GET, HEAD" } },
      );
    else
      response =
        (await apiResponse(path, request.headers.get("if-none-match"))) ??
        (await handler.fetch(request, {
          ...options,
          context: { ...options?.context, nonce },
        }));
    const headers = new Headers(response.headers);
    headers.set(
      "Content-Security-Policy",
      `default-src 'none'; script-src 'self' 'nonce-${nonce}'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'; object-src 'none'`,
    );
    if (!headers.has("Cache-Control"))
      headers.set("Cache-Control", "no-cache, no-store");
    return new Response(request.method === "HEAD" ? null : response.body, {
      status: response.status,
      headers,
    });
  },
});
