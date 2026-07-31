/**
 * These replace the two lodash/fp helpers this module used to pull off the
 * global `_` supplied by a CDN script tag. That made the CDN a hard dependency
 * of app startup: this module is in the main bundle, so a failed request threw
 * "_ is not defined" during evaluation and no part of the app mounted.
 *
 * Signatures match the previous fp-curried call sites: iteratee first for
 * `times`, half-open interval for `range`.
 */
function times(iteratee, count) {
  return Array.from({ length: count }, (_value, index) => iteratee(index));
}

function range(start, end) {
  return Array.from({ length: end - start }, (_value, index) => start + index);
}

export const TILE_STATUSES = {
  HIDDEN: "hidden",
  MINE: "mine",
  NUMBER: "number",
  MARKED: "marked",
};

export function createBoard(boardSize, minePositions) {
  return times((x) => {
    return times((y) => {
      return {
        x,
        y,
        mine: minePositions.some(positionMatch.bind(null, { x, y })),
        status: TILE_STATUSES.HIDDEN,
      };
    }, boardSize);
  }, boardSize);
}

export function markedTilesCount(board) {
  return board.reduce((count, row) => {
    return (
      count + row.filter((tile) => tile.status === TILE_STATUSES.MARKED).length
    );
  }, 0);
}

export function markTile(board, { x, y }) {
  const tile = board[x][y];
  if (
    tile.status !== TILE_STATUSES.HIDDEN &&
    tile.status !== TILE_STATUSES.MARKED
  ) {
    return board;
  }

  if (tile.status === TILE_STATUSES.MARKED) {
    return replaceTile(
      board,
      { x, y },
      { ...tile, status: TILE_STATUSES.HIDDEN },
    );
  } else {
    return replaceTile(
      board,
      { x, y },
      { ...tile, status: TILE_STATUSES.MARKED },
    );
  }
}

function replaceTile(board, position, newTile) {
  return board.map((row, x) => {
    return row.map((tile, y) => {
      if (positionMatch(position, { x, y })) {
        return newTile;
      }
      return tile;
    });
  });
}

export function revealTile(board, { x, y }) {
  var tile = board[x][y];

  if (tile.status !== TILE_STATUSES.HIDDEN) {
    return board;
  }

  if (tile.mine) {
    return replaceTile(
      board,
      { x, y },
      { ...tile, status: TILE_STATUSES.MINE },
    );
  }

  const adjacentTiles = nearbyTiles(board, tile);
  const mines = adjacentTiles.filter((t) => t.mine);
  const newBoard = replaceTile(
    board,
    { x, y },
    { ...tile, status: TILE_STATUSES.NUMBER, adjacentMinesCount: mines.length },
  );
  if (mines.length === 0) {
    return adjacentTiles.reduce((b, t) => {
      return revealTile(b, t);
    }, newBoard);
  }
  return newBoard;
}

export function checkWin(board) {
  return board.every((row) => {
    return row.every((tile) => {
      return (
        tile.status === TILE_STATUSES.NUMBER ||
        (tile.mine &&
          (tile.status === TILE_STATUSES.HIDDEN ||
            tile.status === TILE_STATUSES.MARKED))
      );
    });
  });
}

export function checkLose(board) {
  return board.some((row) => {
    return row.some((tile) => {
      return tile.status === TILE_STATUSES.MINE;
    });
  });
}

export function positionMatch(a, b) {
  return a.x === b.x && a.y === b.y;
}

function nearbyTiles(board, { x, y }) {
  const offsets = range(-1, 2);
  const tiles = [];

  for (const xOffset of offsets) {
    for (const yOffset of offsets) {
      const tile = board[x + xOffset]?.[y + yOffset];
      if (tile != null) {
        tiles.push(tile);
      }
    }
  }

  return tiles;
}
