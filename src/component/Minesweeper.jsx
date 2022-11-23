import React from "react";
import "./minesweeper/styles.css";
import { newGame, setListeners } from "./minesweeper/script.js";

export function newMineGame() {
  newGame();
  setListeners();
}

export function Minesweeper() {
  return (
    <div>
      <div className="title">
        Points: <span className="scoreboard odometer"></span>
      </div>
      <div className="gamestatus"></div>
      <div className="subtext"></div>
      <div className="somediv">
        <button className="newgame">
          Level <span className="level odometer"></span>
        </button>
      </div>

      <div className="board"></div>
      <div id="footertext">
        <p>
          Made by
          <a href="https://github.com/WebDevSimplified" target="_blank">
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
