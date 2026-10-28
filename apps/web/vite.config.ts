import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";
export default defineConfig({
  // All public assets are imported by the app. Never copy old demo snapshots.
  publicDir: false,
  plugins: [
    tanstackStart(),
    nitro({
      preset: "node-server",
      plugins: ["./src/server/plugin.ts"],
      // Nitro also discovers public/ independently of Vite. Only allow Vite's
      // generated assets, added after module setup, in both dev and production.
      modules: [
        {
          setup(nitro) {
            nitro.options.publicAssets = [];
          },
        },
      ],
    }),
    react(),
    tailwindcss(),
  ],
  server: { port: 5173 },
  build: { sourcemap: false },
});
