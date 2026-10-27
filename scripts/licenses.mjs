import {
  readdir,
  readFile,
  writeFile,
  mkdir,
  copyFile,
} from "node:fs/promises";
import { join } from "node:path";
const found = new Map();
for (const entry of await readdir("node_modules/.pnpm")) {
  const dir = join("node_modules/.pnpm", entry, "node_modules");
  let names;
  try {
    names = await readdir(dir);
  } catch {
    continue;
  }
  for (const name of names) {
    const paths = name.startsWith("@")
      ? (await readdir(join(dir, name))).map((n) => join(dir, name, n))
      : [join(dir, name)];
    for (const p of paths)
      try {
        const j = JSON.parse(await readFile(join(p, "package.json"), "utf8"));
        if (j.name?.startsWith("@calendar/")) continue;
        found.set(`${j.name}@${j.version}`, {
          name: j.name,
          version: j.version,
          license: j.license ?? "UNDECLARED",
          repository:
            typeof j.repository === "string"
              ? j.repository
              : (j.repository?.url ?? null),
        });
        if (j.name === "@fontsource-variable/inter") {
          await mkdir("licenses", { recursive: true });
          await copyFile(join(p, "LICENSE"), "licenses/Inter-OFL.txt");
        }
      } catch {
        /* non-package entries */
      }
  }
}
await mkdir("docs", { recursive: true });
await writeFile(
  "docs/dependency-licenses.json",
  JSON.stringify(
    [...found.values()].sort(
      (a, b) =>
        a.name.localeCompare(b.name) || a.version.localeCompare(b.version),
    ),
    null,
    2,
  ) + "\n",
);
console.log(
  `Inventoried ${found.size} installed package versions without local paths.`,
);
