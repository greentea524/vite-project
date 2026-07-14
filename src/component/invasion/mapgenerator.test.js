// Rogue-lite map generation: node ids must be unique across every
// sector in a run, or a later sector renders as already-cleared
// (its ids collide with an earlier sector's completedNodeIds).

import { describe, it, expect } from "vitest";
import { generateGalaxyMap, activeTierIndex, tierIsDone } from "./MapGenerator.js";

const ids = (map) => map.flat().map((n) => n.id);

describe("generateGalaxyMap", () => {
  it("builds the [1,2,3,2,1] tier structure with a boss last", () => {
    const map = generateGalaxyMap(0);
    expect(map.map((tier) => tier.length)).toEqual([1, 2, 3, 2, 1]);
    // Only the final tier is the boss.
    expect(map[4][0].type).toBe("boss");
    expect(map.slice(0, 4).flat().every((n) => n.type !== "boss")).toBe(true);
  });

  it("gives unique node ids within a single map", () => {
    const list = ids(generateGalaxyMap(0));
    expect(new Set(list).size).toBe(list.length);
  });

  it("gives disjoint node ids across sectors so later sectors stay playable", () => {
    // Sectors are generated with increasing loopCount (0, 1, 2, ...).
    const sector1 = ids(generateGalaxyMap(0));
    const sector2 = ids(generateGalaxyMap(1));
    const sector3 = ids(generateGalaxyMap(2));
    const all = [...sector1, ...sector2, ...sector3];
    expect(new Set(all).size).toBe(all.length); // no collisions

    // Concretely: nothing in sector 2 is already in sector 1's cleared set.
    const clearedAfterSector1 = new Set(sector1);
    expect(sector2.some((id) => clearedAfterSector1.has(id))).toBe(false);
  });
});

describe("path progression (one node per row)", () => {
  it("starts on row 0 and advances a row per cleared node", () => {
    const map = generateGalaxyMap(0);
    expect(activeTierIndex(map, [])).toBe(0);

    // Clear the single row-0 node -> row 1 becomes active.
    const done = [map[0][0].id];
    expect(activeTierIndex(map, done)).toBe(1);

    // Clear ONE of row 1's two nodes -> row 2 active (sibling bypassed).
    done.push(map[1][1].id);
    expect(activeTierIndex(map, done)).toBe(2);
    expect(tierIsDone(map[1], done)).toBe(true);
    expect(done.includes(map[1][0].id)).toBe(false); // never cleared, just bypassed
  });

  it("reaches the boss after one pick per row — 5 fights, not 9", () => {
    const map = generateGalaxyMap(0);
    const done = [];
    // One node from each of the four non-boss rows.
    for (let t = 0; t < 4; t++) {
      expect(activeTierIndex(map, done)).toBe(t);
      done.push(map[t][0].id);
    }
    // Boss row is now the active one.
    const bossTier = activeTierIndex(map, done);
    expect(bossTier).toBe(4);
    expect(map[bossTier][0].type).toBe("boss");
    expect(done.length).toBe(4); // + boss = 5 total fights

    // Clearing the boss finishes the page.
    done.push(map[4][0].id);
    expect(activeTierIndex(map, done)).toBe(-1);
  });
});
