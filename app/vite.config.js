/* global process */
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "fs";
import child_process from "child_process";
import path from "path";

const host = process.env.TAURI_DEV_HOST;

// Read package version and compute the current commit (short) if available
const pkg = JSON.parse(
  fs.readFileSync(path.resolve(process.cwd(), "package.json"), "utf8"),
);
let commit = process.env.GITHUB_SHA || process.env.APP_COMMIT || null;
if (!commit) {
  try {
    commit = child_process
      .execSync("git rev-parse --short HEAD")
      .toString()
      .trim();
  } catch {
    commit = null;
  }
}

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react()],

  // Build-time constants available to the client (version and commit)
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_COMMIT__: JSON.stringify(commit),
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Split React into its own chunk
          "react-vendor": ["react", "react-dom"],
          // Split Chart.js into its own chunk
          "chart-vendor": ["chart.js", "react-chartjs-2"],
          // Split file handling libraries into their own chunk
          "file-vendor": ["xlsx", "papaparse"],
          // Split Tauri APIs into their own chunk
          "tauri-vendor": [
            "@tauri-apps/api",
            "@tauri-apps/plugin-dialog",
            "@tauri-apps/plugin-fs",
          ],
          // Split UI icons into their own chunk
          "ui-vendor": ["lucide-react"],
        },
      },
    },
  },
}));
