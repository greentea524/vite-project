// Rogue-lite map generation: node ids must be unique across every
// sector in a run, or a later sector renders as already-cleared
// (its ids collide with an earlier sector's completedNodeIds).

import { describe, it, expect } from "vitest";
import { generateGalaxyMap } from "./MapGenerator.js";

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
