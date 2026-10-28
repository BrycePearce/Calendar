import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
} from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createIsomorphicFn } from "@tanstack/react-start";
import { useState, type ReactNode } from "react";
import css from "../styles.css?url";
import iconSvg from "../../../../assets/calendar.svg?url";
import iconPng from "../../../../assets/calendar.png?url";
const loadInitialData = createIsomorphicFn()
  .server(async () => {
    const { initialCalendarData } = await import("../server/runtime.server");
    return initialCalendarData();
  })
  .client(() => null);
export const Route = createRootRoute({
  loader: () => loadInitialData(),
  staleTime: Infinity,
  shouldReload: false,
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Calendar" },
      { name: "color-scheme", content: "dark" },
      { name: "theme-color", content: "#0c0e12" },
      {
        name: "description",
        content: "A read-only TV and movie release calendar.",
      },
    ],
    links: [
      { rel: "stylesheet", href: css },
      { rel: "icon", type: "image/png", sizes: "512x512", href: iconPng },
      { rel: "icon", type: "image/svg+xml", sizes: "any", href: iconSvg },
      { rel: "apple-touch-icon", href: iconPng },
    ],
  }),
  component: Root,
  shellComponent: Shell,
});
function Shell({ children }: { children: ReactNode }) {
  return (
    <html lang="en" style={{ background: "#0c0e12", colorScheme: "dark" }}>
      <head>
        <HeadContent />
      </head>
      <body style={{ margin: 0, background: "#0c0e12", color: "#e8ebf1" }}>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
function Root() {
  const initial = Route.useLoaderData();
  const [client] = useState(() => {
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: 1, staleTime: 60000, refetchInterval: 60000 },
      },
    });
    if (initial?.config)
      client.setQueryData(["config"], initial.config, {
        updatedAt: initial.checkedAt,
      });
    if (initial?.snapshot)
      client.setQueryData(["calendar"], initial.snapshot, {
        updatedAt: initial.checkedAt,
      });
    return client;
  });
  return (
    <QueryClientProvider client={client}>
      <Outlet />
    </QueryClientProvider>
  );
}
