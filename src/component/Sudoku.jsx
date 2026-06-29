import React, { useCallback, useEffect, useMemo, useState } from "react";
import "./sudoku.css";

// Valid pre-generated puzzles. Each is 81 chars, row-major, "0" = empty cell.
// A completed grid with no row/column/box conflicts is, by definition, solved,
// so win detection does not need a stored solution.
const PUZZLES = [
  "530070000600195000098000060800060003400803001700020006060000280000419005000080079",
  "200080300060070084030500209000105408000000000402706000301007040720040060004010003",
  "000000907000420180000705026100904000050000040000507009920108000034059000507000000",
  "100489006730000040000001295007120600500703008006095700914600000020000037800512004",
];

const SIZE = 9;
const BOX = 3;

function boxIndex(row, col) {
  return Math.floor(row / BOX) * BOX + Math.floor(col / BOX);
}

// Parse an 81-char puzzle string into an array of cell objects.
function parsePuzzle(puzzle) {
  return puzzle.split("").map((ch) => {
    const value = ch === "0" ? "" : ch;
    return { value, given: value !== "" };
  });
}

function pickRandomPuzzle() {
  return PUZZLES[Math.floor(Math.random() * PUZZLES.length)];
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

function Sudoku() {
  const [cells, setCells] = useState(() => parsePuzzle(pickRandomPuzzle()));
  const [selected, setSelected] = useState(null);

  const conflicts = useMemo(() => findConflicts(cells), [cells]);

  const isComplete = useMemo(
    () => cells.every((cell) => cell.value !== ""),
    [cells]
  );
  const hasWon = isComplete && conflicts.size === 0;

  const setCellValue = useCallback((index, value) => {
    setCells((prev) => {
      if (prev[index].given) return prev;
      if (prev[index].value === value) return prev;
      const next = prev.slice();
      next[index] = { ...next[index], value };
      return next;
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

  const handleNewGame = () => {
    setCells(parsePuzzle(pickRandomPuzzle()));
    setSelected(null);
  };

  const padDisabled =
    selected === null || hasWon || cells[selected]?.given === true;

  return (
    <div className="sudoku">
      <h3 className="sudoku-title">Sudoku</h3>
      <p className="sudoku-instructions">
        Click a cell, then type 1–9. Press Backspace or Delete to clear.
      </p>

      <div className="sudoku-board" role="grid" aria-label="Sudoku board">
        {cells.map((cell, index) => {
          const row = Math.floor(index / SIZE);
          const col = index % SIZE;
          const classNames = [
            "sudoku-cell",
            `box-${boxIndex(row, col)}`,
            cell.given ? "given" : "",
            selected === index ? "selected" : "",
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

      <button type="button" className="sudoku-new-game" onClick={handleNewGame}>
        New Game
      </button>
    </div>
  );
}

export default Sudoku;
