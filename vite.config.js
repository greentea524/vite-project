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
