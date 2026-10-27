import { readFile, writeFile, copyFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
const dir = resolve("dist/client");
const html = await readFile(resolve(dir, "_shell.html"), "utf8");
await copyFile(resolve(dir, "_shell.html"), resolve(dir, "index.html"));
// Start's static bootstrap uses inline scripts. Hash the exact build output for CSP.
const hashes = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
  .filter((m) => m[1])
  .map((m) => `'sha256-${createHash("sha256").update(m[1]).digest("base64")}'`);
const csp = `default-src 'none'; script-src 'self' ${hashes.join(" ")}; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'; object-src 'none'`;
await writeFile(
  resolve("dist/csp.conf"),
  `add_header Content-Security-Policy "${csp}" always;\n`,
);
await writeFile(resolve("dist/csp.json"), JSON.stringify(csp));
if (!(await readdir(dir)).includes("index.html"))
  throw new Error("Static shell missing");
console.log("Static SPA shell and exact bootstrap CSP hashes generated.");
