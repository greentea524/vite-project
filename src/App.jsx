import "./App.css";
import ReactTabHeader from "./component/ReactTabHeader.jsx";
import React, { useState, useEffect } from "react";

function App() {
  const [theme, setTheme] = useState("98.css");

  useEffect(() => {
    // Dynamically import the selected theme CSS file from node_modules
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = `https://unpkg.com/${theme}`;
    document.head.appendChild(link);

    return () => {
      document.head.removeChild(link);
    };
  }, [theme]);

  const handleThemeChange = (event) => {
    setTheme(event.target.value);
  };

  return (
    <div className="App">
      <div className="theme-switcher">
        <section className="field-row">
          <label>Select a theme</label>
          <select id="theme-switcher-select" onChange={handleThemeChange}>
            <option value="xp.css">Windows XP</option>
            <option value="98.css" selected>
              Windows 98
            </option>
            <option value="7.css">Windows 7</option>
          </select>
        </section>
      </div>
      <div className="window">
        <div className="title-bar">
          <div className="title-bar-text">
            {"C:\\Windows\\User\\¯|_(ツ)_/¯.exe"}
          </div>
          <div className="title-bar-controls">
            <button aria-label="Minimize"></button>
            <button aria-label="Maximize"></button>
            <button aria-label="Close"></button>
          </div>
        </div>
        <div className="window-body">
          <ReactTabHeader />
        </div>
      </div>
    </div>
  );
}

export default App;
