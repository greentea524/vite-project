import "./App.css";
import ReactTabHeader from "./component/ReactTabHeader.jsx";
import React, { useReducer, useEffect } from "react";

const ACTIONS = {
  START_THEME_LOAD: "START_THEME_LOAD",
  FINISH_THEME_LOAD: "FINISH_THEME_LOAD",
  CHANGE_THEME: "CHANGE_THEME",
};

function reducer(state, action) {
  switch (action.type) {
    case ACTIONS.START_THEME_LOAD:
      return { ...state, loading: true, hidden: true };
    case ACTIONS.FINISH_THEME_LOAD:
      return { ...state, loading: false, hidden: false };
    case ACTIONS.CHANGE_THEME:
      return { ...state, theme: action.payload.theme, hidden: true };
    default:
      return state;
  }
}

function App() {
  const [state, dispatch] = useReducer(reducer, {
    theme: "7.css",
    loading: false,
    hidden: false,
  });

  useEffect(() => {
    dispatch({ type: ACTIONS.START_THEME_LOAD });
    // Dynamically import the selected theme CSS file from node_modules
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = `https://unpkg.com/${state.theme}`;
    link.onload = () => {
      dispatch({ type: ACTIONS.FINISH_THEME_LOAD });
    };
    document.head.appendChild(link);

    return () => {
      document.head.removeChild(link);
    };
  }, [state.theme]);

  const handleThemeChange = (event) => {
    dispatch({
      type: ACTIONS.CHANGE_THEME,
      payload: { theme: event.target.value },
    });
  };

  return (
    <>
      {state.loading && (
        <div className="loading-screen">
          <div className="loading-spinner"></div>
        </div>
      )}
      <div className="App" hidden={state.hidden}>
        <div className="theme-switcher">
          <section className="field-row">
            <label htmlFor="theme-switcher-select">Select a theme</label>
            <select id="theme-switcher-select" onChange={handleThemeChange}>
              <option value="98.css">Windows 98</option>
              <option value="xp.css">Windows XP</option>
              <option value="7.css" selected>
                Windows 7
              </option>
            </select>
          </section>
        </div>
        <div className="window">
          <div className="title-bar">
            <div className="title-bar-text">
              {"C:\\Windows\\User\\¯|_(ツ)_/¯.exe"}
            </div>
            <div className="title-bar-controls">
              <button type="button" aria-label="Minimize"></button>
              <button type="button" aria-label="Maximize"></button>
              <button type="button" aria-label="Close"></button>
            </div>
          </div>
          <div className="window-body">
            <ReactTabHeader />
          </div>
        </div>
      </div>
    </>
  );
}

export default App;
