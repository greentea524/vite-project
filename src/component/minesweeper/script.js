import {
  TILE_STATUSES,
  createBoard,
  markTile,
  revealTile,
  checkWin,
  checkLose,
  positionMatch,
  markedTilesCount,
} from "./minesweeper.js"

const BOARD_SIZE = 10
const NUMBER_OF_MINES = 3

let board = [];
let difficulty = 0;
let score = 0;
let scoreAdded = false;

export function newGame() {

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
      console.log('createboardx', board);
    renderBoard();
    
}

export function renderBoard() {
  document.querySelector(".board").innerHTML = ""

  if(board){
    console.log('trying to render',board)
      checkGameEnd()

      getTileElements().forEach(element => {
        document.querySelector(".board").append(element)
      })

      listMinesLeft()
  }

}

export function setListeners() {
  var boardElement = document.querySelector(".board");
  boardElement.style.setProperty("--size", BOARD_SIZE);
  boardElement.addEventListener("click", (e) => {

    if (!e.target.matches("[data-status]")) return;
    console.log(
      board[e.target.dataset.x][e.target.dataset.y],
      "e.target.dataset.x"
    );
    board = revealTile(board, {
      x: parseInt(e.target.dataset.x),
      y: parseInt(e.target.dataset.y),
    });

    renderBoard();

  });

  boardElement.addEventListener("contextmenu", (e) => {
    if (!e.target.matches("[data-status]")) return;

    e.preventDefault();
    board = markTile(board, {
      x: parseInt(e.target.dataset.x),
      y: parseInt(e.target.dataset.y),
    });

    console.log("markTile");
  });

  document.querySelector(".newgame").addEventListener("click", e => {
    newGame()
})
}

export function refreshScore() {
  document.querySelector(".scoreboard").innerHTML = score;
}

export function refreshLevel() {
  document.querySelector(".level").innerHTML = difficulty;
}

export function displayMinesLeft() {
  document.querySelector(".subtext").innerHTML = "Mines Left: <span data-mine-count></span>"
}

export function getTileElements() {
  return board.flatMap(row => {
    return row.map(tileToElement)
  })
}

export function tileToElement(tile) {
  const element = document.createElement("div")
  element.dataset.status = tile.status
  element.dataset.x = tile.x
  element.dataset.y = tile.y
  element.textContent = tile.adjacentMinesCount || ""
  return element
}



export function listMinesLeft() {
    let minesLeftText = document.querySelector("[data-mine-count]")
    if(minesLeftText !== null){
        minesLeftText.innerHTML = NUMBER_OF_MINES + difficulty - markedTilesCount(board)
    }
}

function checkGameEnd() {
  const win = checkWin(board)
  const lose = checkLose(board)
  var messageText = document.querySelector(".subtext")
  var newGameButton = document.querySelector(".newgame")
  // if (win || lose) {
  //   boardElement.addEventListener("click", stopProp, { capture: true })
  //   boardElement.addEventListener("contextmenu", stopProp, { capture: true })
  // }

  if (win) {

    if(!scoreAdded){
        difficulty++;
        let thisRoundScore = (difficulty * 1.5) * 1000;
        score = score + Math.round(thisRoundScore);
        scoreAdded = true;
        refreshScore();
        refreshLevel();
        messageText.textContent = "You Win" + " +" + thisRoundScore;
        setTimeout(function(){ newGameButton.click(); }, 2000);

    }

  }
  if (lose) {
    messageText.textContent = "You Lose"
    if(difficulty > 0) difficulty--;
    board.forEach(row => {
      row.forEach(tile => {
        if (tile.status === TILE_STATUSES.MARKED) board = markTile(board, tile)
        if (tile.mine) board = revealTile(board, tile)
      })
    })
    setTimeout(function(){ newGameButton.click(); }, 2000);
  }
}

function stopProp(e) {
  e.stopImmediatePropagation()
}

export function getMinePositions(boardSize, numberOfMines) {
  const positions = []

  while (positions.length < numberOfMines) {
    const position = {
      x: randomNumber(boardSize),
      y: randomNumber(boardSize),
    }

    if (!positions.some(positionMatch.bind(null, position))) {
      positions.push(position)
    }
  }

  return positions
}

function randomNumber(size) {
  return Math.floor(Math.random() * size)
}
