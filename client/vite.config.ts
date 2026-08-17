import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:3001",
      "/ws": {
        target: "ws://localhost:3001",
        ws: true,
      },
      // uploaded media lives in minio; /media/oda-media/<key> → bucket path.
      // prod: caddy proxies /media the same way.
      "/media": {
        target: "http://localhost:9000",
        rewrite: (p) => p.replace(/^\/media/, ""),
      },
    },
  },
});
