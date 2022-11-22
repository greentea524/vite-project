import React, { useState, useEffect } from "react";
import "./minesweeper/styles.css";
import "./minesweeper/odometer-theme-default.css";
import { newGame, renderBoard } from "./minesweeper/script.js";
import {
  markTile,
  revealTile,
  createBoard
} from "./minesweeper/minesweeper.js";

const BOARD_SIZE = 10

function newMineGame() {

  board = [];
  scoreAdded = false;

  var boardSizeChoice = BOARD_SIZE;
  var numberOfMines = NUMBER_OF_MINES + difficulty;

  displayMinesLeft();
  refreshScore();
  refreshLevel();

  board = createBoard(
    boardSizeChoice,
    getMinePositions(boardSizeChoice, numberOfMines)
  )
    console.log('createboard', board);
  renderBoard();
}

function Minesweeper() {
  const [board, setBoard] = useState([]);

  useEffect(() => {
    var boardElement = document.querySelector(".board");
    boardElement.addEventListener("click", (e) => {
      boardElement.style.setProperty("--size", BOARD_SIZE);
      newMineGame();
      if (!e.target.matches("[data-status]")) return;
      console.log(e.target.dataset.x,'e');
      var updateboard = revealTile({board},e.target.dataset.x,e.target.dataset.y, {
        x: parseInt(e.target.dataset.x),
        y: parseInt(e.target.dataset.y),
      });
      setBoard(updateboard);
      console.log(updateboard,'updateboard');
      renderBoard();
    });

    boardElement.addEventListener("contextmenu", (e) => {
      if (!e.target.matches("[data-status]")) return;

      e.preventDefault();
      var updateboard  = markTile({board}, {
        x: parseInt(e.target.dataset.x),
        y: parseInt(e.target.dataset.y),
      });
      setBoard(updateboard);
      renderBoard();
    });


    console.log("hello");
  });
  return (
    <div>
      <h1 className="title">Minesweeper</h1>
      <div className="scoreboard odometer"></div>
      <div className="gamestatus"></div>
      <div className="subtext"></div>
      <button className="newgame">
        Level <div className="level odometer"></div>
      </button>
      <div className="board"></div>
      <div id="footertext">
        <p>
          Made by
          <a href="https://github.com/WebDevSimplified" target="_blank">
            {" "}
            WebDevSimplified{" "}
          </a>
        </p>
        <p>
          Using{" "}
          <a
            href="https://github.hubspot.com/odometer/docs/welcome/"
            target="_blank"
          >
            {" "}
            Odometer{" "}
          </a>
        </p>
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
