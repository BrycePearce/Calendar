import { readFile } from "node:fs/promises";
import { privateConfigSchema } from "./config.server";

// Called at runtime only. Never expose this object through a route or loader.
export async function loadSettings(env: NodeJS.ProcessEnv = process.env) {
  const file = env.CALENDAR_CONFIG ?? env.EXPORTER_CONFIG;
  const base = file ? JSON.parse(await readFile(file, "utf8")) : {};
  const config = privateConfigSchema.parse(base);
  for (const name of ["sonarr", "radarr"] as const) {
    const prefix = name.toUpperCase();
    if (env[`${prefix}_URL`]) {
      const source = {
        url: env[`${prefix}_URL`]!,
        apiVersion: "v3" as const,
        monitoredOnly: true,
        ...config[name],
      };
      source.url = env[`${prefix}_URL`]!;
      if (name === "radarr") config.radarr = { ...source, apiVersion: "v3" };
      else config.sonarr = source;
    }
    const source = config[name];
    if (!source) continue;
    if (env[`${prefix}_API_KEY_FILE`]) {
      source.apiKeyFile = env[`${prefix}_API_KEY_FILE`];
      delete source.apiKey;
    } else if (env[`${prefix}_API_KEY`]) {
      source.apiKey = env[`${prefix}_API_KEY`];
      delete source.apiKeyFile;
    }
    if (env[`${prefix}_MONITORED_ONLY`] !== undefined) {
      const value = env[`${prefix}_MONITORED_ONLY`];
      if (value !== "true" && value !== "false")
        throw new Error("Invalid settings");
      source.monitoredOnly = value === "true";
    }
    if (env[`${prefix}_ALLOW_IDS`] !== undefined)
      source.allowIds =
        env[`${prefix}_ALLOW_IDS`]!.trim() === ""
          ? []
          : env[`${prefix}_ALLOW_IDS`]!.split(",").map(Number);
    if (!source.apiKey && !source.apiKeyFile)
      throw new Error("Missing credential");
  }
  for (const [key, variable] of [
    ["intervalMinutes", "REFRESH_INTERVAL_MINUTES"],
    ["daysBack", "DAYS_BACK"],
    ["daysAhead", "DAYS_AHEAD"],
    ["timeoutMs", "REQUEST_TIMEOUT_MS"],
  ] as const)
    if (env[variable] !== undefined) config[key] = Number(env[variable]);
  config.publicDir = env.CALENDAR_PUBLIC_DIR ?? config.publicDir;
  config.stateDir = env.CALENDAR_STATE_DIR ?? config.stateDir;
  return privateConfigSchema.parse(config);
}
