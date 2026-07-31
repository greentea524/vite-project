import { describe, it, expect } from "vitest";
import {
  TILE_STATUSES,
  checkLose,
  checkWin,
  createBoard,
  markTile,
  markedTilesCount,
  positionMatch,
  revealTile,
} from "./minesweeper.js";

describe("createBoard", () => {
  it("builds a square board of hidden tiles", () => {
    const board = createBoard(3, []);

    expect(board).toHaveLength(3);
    board.forEach((row) => expect(row).toHaveLength(3));
    expect(board.flat().every((t) => t.status === TILE_STATUSES.HIDDEN)).toBe(
      true,
    );
  });

  it("assigns each tile its own coordinates", () => {
    const board = createBoard(2, []);

    expect(board[0][0]).toMatchObject({ x: 0, y: 0 });
    expect(board[0][1]).toMatchObject({ x: 0, y: 1 });
    expect(board[1][0]).toMatchObject({ x: 1, y: 0 });
    expect(board[1][1]).toMatchObject({ x: 1, y: 1 });
  });

  it("marks only the given mine positions", () => {
    const board = createBoard(3, [{ x: 1, y: 2 }]);

    expect(board[1][2].mine).toBe(true);
    expect(board.flat().filter((t) => t.mine)).toHaveLength(1);
  });

  it("returns an empty board for size zero", () => {
    expect(createBoard(0, [])).toEqual([]);
  });
});

describe("positionMatch", () => {
  it("compares both coordinates", () => {
    expect(positionMatch({ x: 1, y: 2 }, { x: 1, y: 2 })).toBe(true);
    expect(positionMatch({ x: 1, y: 2 }, { x: 2, y: 1 })).toBe(false);
  });
});

describe("markTile", () => {
  it("marks a hidden tile and unmarks a marked one", () => {
    const board = createBoard(2, []);

    const marked = markTile(board, { x: 0, y: 0 });
    expect(marked[0][0].status).toBe(TILE_STATUSES.MARKED);

    const unmarked = markTile(marked, { x: 0, y: 0 });
    expect(unmarked[0][0].status).toBe(TILE_STATUSES.HIDDEN);
  });

  it("leaves revealed tiles alone", () => {
    const board = revealTile(createBoard(2, []), { x: 0, y: 0 });

    expect(markTile(board, { x: 0, y: 0 })).toBe(board);
  });

  it("does not mutate the board it is given", () => {
    const board = createBoard(2, []);
    markTile(board, { x: 0, y: 0 });

    expect(board[0][0].status).toBe(TILE_STATUSES.HIDDEN);
  });
});

describe("markedTilesCount", () => {
  it("counts marked tiles across rows", () => {
    let board = createBoard(3, []);
    board = markTile(board, { x: 0, y: 0 });
    board = markTile(board, { x: 2, y: 1 });

    expect(markedTilesCount(board)).toBe(2);
  });
});

describe("revealTile", () => {
  it("exposes a mine as MINE", () => {
    const board = createBoard(2, [{ x: 0, y: 0 }]);

    expect(revealTile(board, { x: 0, y: 0 })[0][0].status).toBe(
      TILE_STATUSES.MINE,
    );
  });

  it("counts adjacent mines, which exercises the range() helper", () => {
    // Mine at the centre; every surrounding tile should report exactly 1.
    const board = createBoard(3, [{ x: 1, y: 1 }]);

    const revealed = revealTile(board, { x: 0, y: 0 });

    expect(revealed[0][0].status).toBe(TILE_STATUSES.NUMBER);
    expect(revealed[0][0].adjacentMinesCount).toBe(1);
  });

  it("flood-fills through tiles with no adjacent mines", () => {
    const board = createBoard(3, []);

    const revealed = revealTile(board, { x: 0, y: 0 });

    expect(
      revealed.flat().every((t) => t.status === TILE_STATUSES.NUMBER),
    ).toBe(true);
  });

  it("stops the flood fill at tiles touching a mine", () => {
    const board = createBoard(3, [{ x: 2, y: 2 }]);

    const revealed = revealTile(board, { x: 0, y: 0 });

    expect(revealed[2][2].status).toBe(TILE_STATUSES.HIDDEN);
  });

  it("leaves an already-revealed tile untouched", () => {
    const board = revealTile(createBoard(2, [{ x: 1, y: 1 }]), { x: 0, y: 0 });

    expect(revealTile(board, { x: 0, y: 0 })).toBe(board);
  });
});

describe("checkWin / checkLose", () => {
  it("wins once every safe tile is revealed", () => {
    const board = createBoard(3, [{ x: 2, y: 2 }]);

    expect(checkWin(board)).toBe(false);

    // (0,0) touches no mine, so the flood fill clears every safe tile at once
    // and leaves only the mine hidden.
    const revealed = revealTile(board, { x: 0, y: 0 });

    expect(revealed[2][2].status).toBe(TILE_STATUSES.HIDDEN);
    expect(checkWin(revealed)).toBe(true);
  });

  it("is not a win while safe tiles are still hidden", () => {
    const board = createBoard(3, [{ x: 1, y: 1 }]);

    // Every corner touches the centre mine, so this reveals one tile only.
    expect(checkWin(revealTile(board, { x: 0, y: 0 }))).toBe(false);
  });

  it("loses when a mine is revealed", () => {
    const board = createBoard(2, [{ x: 0, y: 0 }]);

    expect(checkLose(board)).toBe(false);
    expect(checkLose(revealTile(board, { x: 0, y: 0 }))).toBe(true);
  });
});
