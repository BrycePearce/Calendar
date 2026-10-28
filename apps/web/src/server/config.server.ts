import { z } from "zod";
const source = z
  .object({
    url: z.url().refine((s) => {
      const u = new URL(s);
      return (
        ["http:", "https:"].includes(u.protocol) &&
        !u.username &&
        !u.password &&
        !u.search &&
        !u.hash
      );
    }),
    apiKeyFile: z.string().min(1).optional(),
    apiKey: z.string().min(1).optional(),
    apiVersion: z.enum(["v3", "v5"]).default("v3"),
    allowIds: z.array(z.number().int().positive()).optional(),
    monitoredOnly: z.boolean().default(false),
  })
  .strict();
export const privateConfigSchema = z
  .object({
    sonarr: source.optional(),
    radarr: source
      .extend({ apiVersion: z.literal("v3").default("v3") })
      .optional(),
    intervalMinutes: z.number().min(1).max(1440).default(15),
    daysBack: z.number().int().min(0).max(365).default(30),
    daysAhead: z.number().int().min(1).max(730).default(180),
    timeoutMs: z.number().int().min(100).max(60000).default(10000),
    publicDir: z.string().default("./runtime/public"),
    stateDir: z.string().default("./runtime/private-state"),
  })
  .strict();
export type PrivateConfig = z.infer<typeof privateConfigSchema>;
export type SourceConfig = z.infer<typeof source>;
