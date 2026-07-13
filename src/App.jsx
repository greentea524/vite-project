import "./App.css";
import ReactTabHeader from "./component/ReactTabHeader.jsx";
import React, { useReducer, useEffect } from "react";

const ACTIONS = {
  CHANGE_THEME: "CHANGE_THEME",
};

// Self-hosted theme stylesheets (see public/themes/README.md); the keys are
// the radio-button values, kept as the historical package names
const THEME_FILES = {
  "98.css": "themes/98/98.css",
  "xp.css": "themes/xp/XP.css",
  "7.css": "themes/7/7.css",
};

function reducer(state, action) {
  switch (action.type) {
    case ACTIONS.CHANGE_THEME:
      return { ...state, theme: action.payload.theme };
    default:
      return state;
  }
}

function App() {
  const [state, dispatch] = useReducer(reducer, {
    theme: "xp.css",
  });
  const [showCredits, setShowCredits] = React.useState(false);

  useEffect(() => {
    // The default theme is a static <link id="theme-css"> in index.html so
    // the first paint is already styled; switching just retargets its href
    const link = document.getElementById("theme-css");
    link.href = `${import.meta.env.BASE_URL}${THEME_FILES[state.theme]}`;
  }, [state.theme]);

  const handleThemeChange = (event) => {
    dispatch({
      type: ACTIONS.CHANGE_THEME,
      payload: { theme: event.target.value },
    });
  };

  return (
    <>
      <div className="App" data-theme={state.theme}>
        <div className="theme-switcher">
          <section className="field-row" style={{ gap: '12px' }}>
            <div className="field-row" style={{ gap: '4px', margin: 0 }}>
              <input 
                type="radio" 
                id="theme-98" 
                name="theme" 
                value="98.css" 
                checked={state.theme === "98.css"} 
                onChange={handleThemeChange} 
              />
              <label htmlFor="theme-98">Windows 98</label>
            </div>
            <div className="field-row" style={{ gap: '4px', margin: 0 }}>
              <input 
                type="radio" 
                id="theme-xp" 
                name="theme" 
                value="xp.css" 
                checked={state.theme === "xp.css"} 
                onChange={handleThemeChange} 
              />
              <label htmlFor="theme-xp">Windows XP</label>
            </div>
            <div className="field-row" style={{ gap: '4px', margin: 0 }}>
              <input 
                type="radio" 
                id="theme-7" 
                name="theme" 
                value="7.css" 
                checked={state.theme === "7.css"} 
                onChange={handleThemeChange} 
              />
              <label htmlFor="theme-7">Windows 7</label>
            </div>
            <span 
              onClick={() => setShowCredits(true)}
              style={{ marginLeft: 'auto', cursor: 'pointer', fontSize: '1.1rem' }}
              aria-label="Theme Credits"
              title="Theme Credits"
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && setShowCredits(true)}
            >
              ℹ️
            </span>
          </section>
        </div>

        {showCredits && (
          <div className="modal-overlay" style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <div className="window" style={{ width: '400px', maxWidth: '90%' }}>
              <div className="title-bar">
                <div className="title-bar-text">Theme Credits</div>
                <div className="title-bar-controls">
                  <button aria-label="Close" onClick={() => setShowCredits(false)}></button>
                </div>
              </div>
              <div className="window-body" style={{ padding: '16px' }}>
                <p>These awesome CSS themes are open-source projects created by the community:</p>
                <ul style={{ margin: '16px 0', paddingLeft: '24px' }}>
                  <li style={{ marginBottom: '8px' }}>
                    <strong>Windows 98</strong> (`98.css`) by Jordan Scales (<a href="https://github.com/jdan" target="_blank" rel="noreferrer">@jdan</a>)
                  </li>
                  <li style={{ marginBottom: '8px' }}>
                    <strong>Windows XP</strong> (`xp.css`) by <a href="https://github.com/botoxparty" target="_blank" rel="noreferrer">@botoxparty</a>
                  </li>
                  <li>
                    <strong>Windows 7</strong> (`7.css`) by Khang Nguyen (<a href="https://github.com/khang-nd" target="_blank" rel="noreferrer">@khang-nd</a>)
                  </li>
                </ul>
                <div style={{ textAlign: 'center', marginTop: '24px' }}>
                  <button onClick={() => setShowCredits(false)}>Awesome!</button>
                </div>
              </div>
            </div>
          </div>
        )}

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
            <ReactTabHeader theme={state.theme} />
          </div>
        </div>
      </div>
    </>
  );
}

export default App;
