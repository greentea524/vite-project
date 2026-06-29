import React, { useCallback, useEffect, useMemo, useState } from "react";
import "./sudoku.css";

const SIZE = 9;
const BOX = 3;
const CELL_COUNT = SIZE * SIZE;

// Difficulty -> number of clues to keep in the generated puzzle. Fewer clues
// is harder. The digger may stop short of the target if going further would
// break the puzzle's unique solution.
const DIFFICULTIES = {
  easy: 40,
  medium: 32,
  hard: 26,
};

function boxIndex(row, col) {
  return Math.floor(row / BOX) * BOX + Math.floor(col / BOX);
}

// Fisher–Yates in-place shuffle.
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Can `value` (1–9) be placed at flat `index` without violating Sudoku rules?
function canPlace(grid, index, value) {
  const r = Math.floor(index / SIZE);
  const c = index % SIZE;
  for (let k = 0; k < SIZE; k++) {
    if (grid[r * SIZE + k] === value) return false;
    if (grid[k * SIZE + c] === value) return false;
    const br = Math.floor(r / BOX) * BOX + Math.floor(k / BOX);
    const bc = Math.floor(c / BOX) * BOX + (k % BOX);
    if (grid[br * SIZE + bc] === value) return false;
  }
  return true;
}

// Fill empty cells (0) with a complete valid solution using randomized
// backtracking. Mutates and returns true on success.
function fillGrid(grid) {
  const index = grid.indexOf(0);
  if (index === -1) return true;
  for (const value of shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9])) {
    if (canPlace(grid, index, value)) {
      grid[index] = value;
      if (fillGrid(grid)) return true;
      grid[index] = 0;
    }
  }
  return false;
}

function generateSolvedGrid() {
  const grid = new Array(CELL_COUNT).fill(0);
  fillGrid(grid);
  return grid;
}

// Count solutions of `grid`, stopping early once `limit` is reached. Used to
// confirm a dug-out puzzle still has exactly one solution.
function countSolutions(grid, limit) {
  const index = grid.indexOf(0);
  if (index === -1) return 1;
  let count = 0;
  for (let value = 1; value <= 9 && count < limit; value++) {
    if (canPlace(grid, index, value)) {
      grid[index] = value;
      count += countSolutions(grid, limit - count);
      grid[index] = 0;
    }
  }
  return count;
}

// Build a fresh puzzle: start from a full solution, then remove cells one at a
// time, keeping a removal only if the puzzle still has a unique solution.
// Returns both the dug-out puzzle and the full solution (used for hints).
function generatePuzzle(targetClues) {
  const solution = generateSolvedGrid();
  const puzzle = solution.slice();
  let clues = CELL_COUNT;
  for (const index of shuffle([...Array(CELL_COUNT).keys()])) {
    if (clues <= targetClues) break;
    const backup = puzzle[index];
    puzzle[index] = 0;
    if (countSolutions(puzzle.slice(), 2) === 1) {
      clues--;
    } else {
      puzzle[index] = backup; // removal made the solution ambiguous; keep it
    }
  }
  return { puzzle, solution };
}

// Turn a numeric puzzle grid (0 = empty) into the cell objects used by the UI.
function buildCells(grid) {
  return grid.map((value) => ({
    value: value === 0 ? "" : String(value),
    given: value !== 0,
  }));
}

// Create a fresh game: cells to display plus the matching solution. Returned as
// one object so the two always stay paired (important under StrictMode, which
// double-invokes state initializers).
function createGame(level) {
  const { puzzle, solution } = generatePuzzle(DIFFICULTIES[level]);
  return { cells: buildCells(puzzle), solution };
}

// Returns a Set of cell indices that conflict with another cell sharing the
// same row, column, or 3×3 box. Empty cells never conflict.
function findConflicts(cells) {
  const conflicts = new Set();

  const check = (group) => {
    const seen = new Map();
    for (const idx of group) {
      const value = cells[idx].value;
      if (!value) continue;
      if (seen.has(value)) {
        conflicts.add(idx);
        conflicts.add(seen.get(value));
      } else {
        seen.set(value, idx);
      }
    }
  };

  for (let i = 0; i < SIZE; i++) {
    const row = [];
    const col = [];
    const box = [];
    for (let j = 0; j < SIZE; j++) {
      row.push(i * SIZE + j);
      col.push(j * SIZE + i);
      // i-th box, j-th cell within that box
      const r = Math.floor(i / BOX) * BOX + Math.floor(j / BOX);
      const c = (i % BOX) * BOX + (j % BOX);
      box.push(r * SIZE + c);
    }
    check(row);
    check(col);
    check(box);
  }

  return conflicts;
}

// Returns a Set of cell indices belonging to a row, column, or 3×3 box that is
// fully filled and correct (its nine cells contain 1–9 with no repeats).
function findCompletedCells(cells) {
  const completed = new Set();

  const markIfComplete = (group) => {
    const values = new Set();
    for (const idx of group) {
      const value = cells[idx].value;
      if (!value) return; // not fully filled
      values.add(value);
    }
    if (values.size === SIZE) {
      for (const idx of group) completed.add(idx);
    }
  };

  for (let i = 0; i < SIZE; i++) {
    const row = [];
    const col = [];
    const box = [];
    for (let j = 0; j < SIZE; j++) {
      row.push(i * SIZE + j);
      col.push(j * SIZE + i);
      const r = Math.floor(i / BOX) * BOX + Math.floor(j / BOX);
      const c = (i % BOX) * BOX + (j % BOX);
      box.push(r * SIZE + c);
    }
    markIfComplete(row);
    markIfComplete(col);
    markIfComplete(box);
  }

  return completed;
}

function Sudoku() {
  const [difficulty, setDifficulty] = useState("medium");
  // cells + solution kept together so they're always from the same puzzle.
  const [game, setGame] = useState(() => createGame("medium"));
  const { cells } = game;
  const [selected, setSelected] = useState(null);

  const conflicts = useMemo(() => findConflicts(cells), [cells]);
  const completed = useMemo(() => findCompletedCells(cells), [cells]);

  const isComplete = useMemo(
    () => cells.every((cell) => cell.value !== ""),
    [cells]
  );
  const hasWon = isComplete && conflicts.size === 0;

  const setCellValue = useCallback((index, value) => {
    setGame((prev) => {
      if (prev.cells[index].given) return prev;
      if (prev.cells[index].value === value) return prev;
      const next = prev.cells.slice();
      next[index] = { ...next[index], value };
      return { ...prev, cells: next };
    });
  }, []);

  // Keyboard input for the currently selected cell.
  useEffect(() => {
    if (selected === null || hasWon) return undefined;

    const handleKeyDown = (event) => {
      if (cells[selected].given) return;

      if (event.key >= "1" && event.key <= "9") {
        setCellValue(selected, event.key);
        event.preventDefault();
      } else if (
        event.key === "Backspace" ||
        event.key === "Delete" ||
        event.key === "0"
      ) {
        setCellValue(selected, "");
        event.preventDefault();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selected, cells, hasWon, setCellValue]);

  const handleCellClick = (index) => {
    setSelected(index);
  };

  const handlePadInput = (value) => {
    if (selected === null || hasWon) return;
    setCellValue(selected, value);
  };

  const startNewGame = useCallback((level) => {
    setGame(createGame(level));
    setSelected(null);
  }, []);

  const handleNewGame = () => {
    startNewGame(difficulty);
  };

  // Fill one randomly chosen empty-or-incorrect cell with its solution value.
  const handleHint = () => {
    setGame((prev) => {
      const candidates = [];
      for (let i = 0; i < prev.cells.length; i++) {
        if (
          !prev.cells[i].given &&
          prev.cells[i].value !== String(prev.solution[i])
        ) {
          candidates.push(i);
        }
      }
      if (candidates.length === 0) return prev;
      const index = candidates[Math.floor(Math.random() * candidates.length)];
      const next = prev.cells.slice();
      next[index] = { ...next[index], value: String(prev.solution[index]) };
      return { ...prev, cells: next };
    });
  };

  const handleDifficultyChange = (event) => {
    const level = event.target.value;
    setDifficulty(level);
    startNewGame(level);
  };

  const padDisabled =
    selected === null || hasWon || cells[selected]?.given === true;

  return (
    <div className="sudoku">
      <h3 className="sudoku-title">Sudoku</h3>
      <p className="sudoku-instructions">
        Click a cell, then type 1–9. Press Backspace or Delete to clear.
      </p>

      <div className="sudoku-difficulty">
        <label htmlFor="sudoku-difficulty-select">Difficulty</label>
        <select
          id="sudoku-difficulty-select"
          value={difficulty}
          onChange={handleDifficultyChange}
        >
          <option value="easy">Easy</option>
          <option value="medium">Medium</option>
          <option value="hard">Hard</option>
        </select>
      </div>

      <div className="sudoku-board" role="grid" aria-label="Sudoku board">
        {cells.map((cell, index) => {
          const row = Math.floor(index / SIZE);
          const col = index % SIZE;
          const classNames = [
            "sudoku-cell",
            `box-${boxIndex(row, col)}`,
            cell.given ? "given" : "",
            selected === index ? "selected" : "",
            completed.has(index) && !conflicts.has(index) ? "correct" : "",
            conflicts.has(index) ? "conflict" : "",
            col % BOX === 0 ? "box-left" : "",
            row % BOX === 0 ? "box-top" : "",
            col === SIZE - 1 ? "board-right" : "",
            row === SIZE - 1 ? "board-bottom" : "",
          ]
            .filter(Boolean)
            .join(" ");

          return (
            <button
              type="button"
              key={index}
              className={classNames}
              onClick={() => handleCellClick(index)}
              disabled={hasWon}
              aria-label={`Row ${row + 1}, column ${col + 1}${
                cell.value ? `, value ${cell.value}` : ", empty"
              }`}
            >
              {cell.value}
            </button>
          );
        })}
      </div>

      <div className="sudoku-pad" aria-label="Number pad">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => (
          <button
            type="button"
            key={digit}
            className="sudoku-pad-btn"
            onClick={() => handlePadInput(digit)}
            disabled={padDisabled}
          >
            {digit}
          </button>
        ))}
        <button
          type="button"
          className="sudoku-pad-btn sudoku-pad-erase"
          onClick={() => handlePadInput("")}
          disabled={padDisabled}
          aria-label="Erase cell"
        >
          ⌫
        </button>
      </div>

      {hasWon && (
        <div className="sudoku-win" role="status">
          🎉 You Win! 🎉
        </div>
      )}

      <div className="sudoku-actions">
        <button
          type="button"
          className="sudoku-hint"
          onClick={handleHint}
          disabled={hasWon}
        >
          Hint
        </button>
        <button
          type="button"
          className="sudoku-new-game"
          onClick={handleNewGame}
        >
          New Game
        </button>
      </div>
    </div>
  );
}

export default Sudoku;
