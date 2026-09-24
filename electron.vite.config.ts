import { defineConfig } from "electron-vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  main: {},
  preload: {
    build: {
      rollupOptions: {
        input: "src/preload.ts",
        output: { format: "cjs", entryFileNames: "preload.cjs" },
      },
    },
  },
  renderer: { plugins: [react()] },
});
