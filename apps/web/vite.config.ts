import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
export default defineConfig({
  plugins: [tanstackStart({ spa: { enabled: true } }), react(), tailwindcss()],
  server: { port: 5173 },
  // Start uses Vite preview to prerender the static shell. An explicit IPv4
  // loopback avoids localhost resolving differently for the listener and fetch
  // client inside Linux containers. Production hosting remains Nginx.
  preview: { host: "127.0.0.1" },
  build: { sourcemap: false },
});
