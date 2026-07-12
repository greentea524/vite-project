// Standalone entry for Big 2, served at /big2/ as another Vite page
// (see rollupOptions.input in vite.config.js). Mounts only the game —
// none of the main app's tab shell, themes, or vendor CSS — so it
// loads lean and can be linked/embedded directly. Mirrors the
// /platformer/ and /space/ entries.

import React from "react";
import ReactDOM from "react-dom/client";
import Big2 from "../src/component/big2/Big2.jsx";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Big2 />
  </React.StrictMode>,
);
