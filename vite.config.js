import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  // Bind the dev server to all network interfaces so it's reachable
  // from other devices on the LAN (e.g. a phone) for multiplayer
  // testing. Equivalent to `vite --host`.
  server: {
    host: true,
  },
  // Multi-page build: the main app plus standalone game pages served
  // at /platformer/, /space/, /big2/, and /treasure/ (deploying to
  // .../vite-project/platformer/, .../vite-project/space/,
  // .../vite-project/big2/, and .../vite-project/treasure/).
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL("./index.html", import.meta.url)),
        platformer: fileURLToPath(
          new URL("./platformer/index.html", import.meta.url),
        ),
        space: fileURLToPath(new URL("./space/index.html", import.meta.url)),
        big2: fileURLToPath(new URL("./big2/index.html", import.meta.url)),
        treasure: fileURLToPath(
          new URL("./treasure/index.html", import.meta.url),
        ),
      },
    },
  },
  plugins: [
    react({
      include: "**/*.jsx",
    }),
  ],
  css: {
    preprocessorOptions: {
      scss: {
        api: "modern-compiler", // or "modern"
      },
    },
  },
});
