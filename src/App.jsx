import "./App.css";
import ReactTabHeader from "./component/ReactTabHeader.jsx";

function App() {
  return (
    <div className="App">
      <div className="window">
        <div className="title-bar">
          <div className="title-bar-text">
            {"C:\\Windows\\User\\¯|_(ツ)_/¯.exe"}
          </div>
          <div class="title-bar-controls">
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
