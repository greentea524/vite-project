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
      <h1 className="title">Minesweeper</h1>
      <div className="scoreboard odometer"></div>
      <div className="gamestatus"></div>
      <div className="subtext"></div>
      <div className="a">
        {" "}
        <button className="newgame">
          Level <div className="level odometer"></div>
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
