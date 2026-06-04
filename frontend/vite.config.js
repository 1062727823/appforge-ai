import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  publicDir: path.resolve(rootDir, "public"),
  build: {
    emptyOutDir: true,
    outDir: path.resolve(rootDir, "dist"),
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      "/api": {
        changeOrigin: true,
        target: "http://127.0.0.1:4173",
      },
      "/ide": {
        changeOrigin: true,
        target: "http://127.0.0.1:4173",
        ws: true,
      },
    },
  },
});
