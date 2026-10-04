import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

const server = process.env.CROWNFALL_SERVER ?? "http://localhost:5080";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    fs: { allow: [".."] },
    proxy: {
      "/api": server,
      "/ws": { target: server, ws: true },
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    chunkSizeWarningLimit: 4000,
  },
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
  },
});
