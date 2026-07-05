// Standalone entry for the platformer, served at /platformer/ as a
// second Vite page (see rollupOptions.input in vite.config.js). Mounts
// only the game — none of the main app's tab shell, themes, or vendor
// CSS — so it loads lean and can be linked/embedded directly.

import React from "react";
import ReactDOM from "react-dom/client";
import Platformer from "../src/component/platformer/Platformer.jsx";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Platformer />
  </React.StrictMode>,
);
