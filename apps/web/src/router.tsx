import { createRouter } from "@tanstack/react-router";
import {
  createIsomorphicFn,
  getGlobalStartContext,
} from "@tanstack/react-start";
import { routeTree } from "./routeTree.gen";
import { stringifyCalendarSearch } from "./search";
const getNonce = createIsomorphicFn()
  .server(
    () => (getGlobalStartContext() as { nonce?: string } | undefined)?.nonce,
  )
  .client(
    () =>
      document.querySelector<HTMLMetaElement>('meta[property="csp-nonce"]')
        ?.content,
  );
export function getRouter() {
  return createRouter({
    routeTree,
    stringifySearch: stringifyCalendarSearch,
    ssr: { nonce: getNonce() },
    scrollRestoration: true,
    defaultPendingComponent: () => (
      <p className="loading">Loading your calendar…</p>
    ),
  });
}
declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
