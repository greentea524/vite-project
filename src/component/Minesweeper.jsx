import React from "react";
import "./minesweeper/styles.css";
function Minesweeper() {
  return (
    <div className="minesweeper-container">
      <div className="title">
        Points: <span className="scoreboard odometer"></span>
      </div>
      <div className="gamestatus"></div>
      <div className="subtext"></div>
      <div className="somediv">
        <button type="button" className="newgame">
          Level <span className="level odometer"></span>
        </button>
      </div>

      <div className="board-wrapper">
        <div className="board"></div>
      </div>
      <div id="footertext">
        <p>
          Made by
          <a
            href="https://github.com/WebDevSimplified"
            target="_blank"
            rel="noreferrer"
          >
            {" "}
            WebDevSimplified{" "}
          </a>
        </p>
        {/* <p>
          Using{" "}
          <a
            href="https://github.hubspot.com/odometer/docs/welcome/"
            target="_blank"
          >
            {" "}
            Odometer{" "}
          </a>
        </p> */}
        <p>
          <a href="https://greentea524.github.io/">
            https://greentea524.github.io/
          </a>
        </p>
      </div>
    </div>
  );
}

export default Minesweeper;
