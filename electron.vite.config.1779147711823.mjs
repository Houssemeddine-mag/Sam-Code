// electron.vite.config.mjs
import { resolve } from "path";
import { defineConfig } from "electron-vite";
import react from "@vitejs/plugin-react";
import tailwindcjs from "@tailwindcss/vite";
var electron_vite_config_default = defineConfig({
  main: {},
  preload: {},
  renderer: {
    resolve: {
      alias: {
        "@renderer": resolve("src/renderer/src")
      }
    },
    optimizeDeps: {
      exclude: ["monaco-editor"]
    },
    plugins: [react(), tailwindcjs()]
  }
});
export {
  electron_vite_config_default as default
};
