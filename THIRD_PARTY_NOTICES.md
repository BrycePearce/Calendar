# Third-party notices

No license has been selected for this application's original code. The following third-party components retain their own licenses; this document does not license the whole repository.

| Component                                      | Use                                                    | Upstream license                                             |
| ---------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------ |
| React, React DOM                               | UI                                                     | MIT                                                          |
| TanStack Start, Router, Query                  | SPA generation, routing, data fetching                 | MIT                                                          |
| FullCalendar core, React, daygrid v6           | Standard month view; no premium plugins                | MIT                                                          |
| Tailwind CSS                                   | Styling                                                | MIT                                                          |
| shadcn/ui, Radix UI                            | Adapted Button/Dialog source and accessible primitives | MIT                                                          |
| Lucide                                         | Bundled icon SVGs                                      | ISC                                                          |
| Zod                                            | Public/private validation                              | MIT                                                          |
| date-fns                                       | Date formatting/navigation                             | MIT                                                          |
| clsx, tailwind-merge, class-variance-authority | Component styling utilities                            | MIT                                                          |
| Inter via Fontsource                           | Locally bundled variable font                          | SIL Open Font License 1.1                                    |
| Node.js, Nginx                                 | Separate container runtimes                            | Node.js license / BSD-2-Clause (Nginx), plus bundled notices |
| TypeScript, Playwright                         | Development tooling                                    | Apache-2.0                                                   |
| Vite, Vitest, esbuild, ESLint, Prettier, pnpm  | Build/check tooling                                    | Primarily MIT; retain package notices                        |
| Gitleaks                                       | External scanner, not bundled with the app             | MIT                                                          |

The lockfile records exact direct/transitive versions. Installed packages and base images contain their detailed license files. [The generated dependency inventory](docs/dependency-licenses.json) records installed package names, versions, license declarations, and repository references without local paths. Regenerate with `node scripts/licenses.mjs` after dependency changes and review any missing declarations or license changes before distribution.

Inter's full license and the adapted UI component notices are included under `licenses/`. No remote font service, photos, posters, or proprietary assets are used. Synthetic demo titles were created for testing and are not exports from a media library.
