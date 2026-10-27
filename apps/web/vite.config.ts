import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
export default defineConfig({
  plugins: [tanstackStart({ spa: { enabled: true } }), react(), tailwindcss()],
  server: { port: 5173 },
  build: { sourcemap: false },
});
