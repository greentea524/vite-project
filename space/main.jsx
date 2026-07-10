// Standalone entry for Alien Invasion, served at /space/ as a second
// Vite page (see rollupOptions.input in vite.config.js). Mounts only
// the game — none of the main app's tab shell, themes, or vendor CSS —
// so it loads lean and can be linked/embedded directly. Mirrors the
// /platformer/ entry.

import React from "react";
import ReactDOM from "react-dom/client";
import AlienInvasion from "../src/component/invasion/AlienInvasion.jsx";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AlienInvasion />
  </React.StrictMode>,
);
