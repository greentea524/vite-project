// Level data ported from godot-game scripts/levels/level_*.gd.
// Levels are ASCII layouts built onto a 16px tile grid. Legend:
//   G  grass ground tile (dirt is auto-backfilled two rows below)
//   D  dirt tile           B  block/platform tile
//   P  player start        C  coin
//   E  enemy               S  spikes
//   K  checkpoint          F  goal flag
//   .  empty
//
// Colors are [r, g, b] floats (0..1) matching Godot's Color values.

const r = (s, n) => s.repeat(n);

const DEFAULT_SKY = [0.43, 0.72, 0.91];
const WHITE = [1, 1, 1];

// World 2 dusk theme (levels 2-1, 2-2)
const DUSK_SKY = [0.18, 0.16, 0.28];
const DUSK_TILE = [0.72, 0.7, 0.95];
const DUSK_CLOUD = [0.62, 0.6, 0.78];

// Level 1 — tutorial. Flat ground, two gentle platform steps, coins,
// a goal flag. No enemies, no hazards.
const LEVEL_1 = [
  r(".", 29) + "CCC" + r(".", 32),                                 // coins on high platform
  r(".", 28) + "BBBBB" + r(".", 31),                               // high platform
  "",
  r(".", 23) + "CC" + r(".", 21) + "CC" + r(".", 16),              // coins on low platforms
  r(".", 22) + "BBBB" + r(".", 19) + "BBBB" + r(".", 15),
  "",
  "..P" + r(".", 8) + "C.C.C" + r(".", 21) + "C.C" + r(".", 14) + "CC" + r(".", 4) + "F" + r(".", 3),
  r("G", 64),
].join("\n");

// Level 2 — enemies, gaps between platforms, more coins, and a
// mid-level checkpoint. Block fences keep enemies away from the
// checkpoint and the gap landing zones.
// 80 columns. Ground segments 0-17, 21-37, 41-59, 63-79 (gaps between).
const LEVEL_2 = [
  r(".", 31) + "CC" + r(".", 47),                // bonus coins, high platform
  r(".", 30) + "BBBB" + r(".", 46),              // high platform
  "",
  // coins over the low platforms
  ".........." + "....CC...C" + ".........." + ".........." + ".....CC..." + ".........." + ".C........" + "..........",
  // low platforms (incl. spans over the gaps)
  ".........." + "...BBBB.BB" + "B........." + ".........." + "....BBBB.." + ".........." + "BBB......." + "..........",
  "",
  // ground row: player, coins, enemies (E), checkpoint (K), fences (B), flag (F)
  "..P.....CC" + "C........." + "........E." + "...CCC...." + "..K...B..." + "E....CC..." + "......B.E." + "..C...F...",
  r("G", 18) + "..." + r("G", 17) + "..." + r("G", 19) + "..." + r("G", 17),
].join("\n");

// Level 3 — final challenge of world 1. Spikes, more enemies, wider
// gaps with single-tile stepping stones, and a longer run to the flag.
// 96 columns. Ground segments 0-13, 18-29, 35-49, 54-69, 76-95.
const LEVEL_3 = [
  // coins over stepping stones and floating over the third gap
  ".........." + ".....CC..." + ".........." + "..C......." + ".........." + ".CC......." + ".........." + "..CC......" + ".........." + "......",
  // stepping stones over the gaps
  ".........." + ".....BB..." + ".........." + "..B......." + ".........." + ".........." + ".........." + "..BB......" + ".........." + "......",
  "",
  // ground row: spikes (S), enemies (E) behind block fences (B), checkpoint (K), flag (F)
  "..P......." + ".........." + "..SSS..C.." + "......K..C" + "B.E...E..." + "........SS" + "S.C.SS...." + ".........." + "B.E..CC.E." + "...F..",
  r("G", 14) + "...." + r("G", 12) + "....." + r("G", 15) + "...." + r("G", 16) + "......" + r("G", 20),
].join("\n");

// Level 2-1 — World 2 opener. New dusk theme via tints, platforms at
// varied heights, two enemies, and a 6-wide gap that teaches the
// double jump (with an optional stepping-stone path).
// 80 columns. Ground segments 0-19, 24-47, 54-79 (gaps of 4 and 6).
const LEVEL_2_1 = [
  r(".", 35) + "CC" + r(".", 43),               // coins on high platform
  r(".", 34) + "BBBB" + r(".", 42),             // high platform
  "",
  // coins over the low platforms and stepping stone
  ".........." + "...CC....." + ".........." + "CC........" + ".........." + "CC........" + ".....CC..." + "..........",
  // low platforms; stone over the 6-wide double-jump gap
  ".........." + "..BBBB...." + ".........B" + "BBB......." + ".........." + "BB........" + "....BBBB.." + "..........",
  "",
  // ground row: player, coins, enemies (E) behind a fence (B), flag (F)
  "..P.....CC" + "C........." + ".......B.." + "..E...CC.." + "E........." + "........CC" + "C........." + ".....F....",
  r("G", 20) + "...." + r("G", 24) + "......" + r("G", 26),
].join("\n");

// Level 2-2 — World 2 mid-stage. More enemies, spikes, tighter jumps
// including a 7-wide and an 8-wide gap that reward the double jump,
// and a mid-level checkpoint.
// 90 columns. Ground segments 0-13, 21-39, 45-64, 73-89 (gaps of 7, 5 and 8).
const LEVEL_2_2 = [
  r(".", 30) + "...CC....." + r(".", 50),       // coins on high platform
  r(".", 30) + "..BBBB...." + r(".", 50),       // high platform
  "",
  // coins over stones and platforms
  ".........." + ".......C.." + ".........." + ".CC......." + ".........." + "......CC.." + ".......CC." + ".........." + "..........",
  // single stone over gap 1, platforms, stones over gap 3
  ".........." + ".......B.." + ".........." + "BBBB......" + ".........." + ".....BBBB." + ".......BB." + ".........." + "..........",
  "",
  // ground row: spikes (S), enemies (E) behind fences (B),
  // checkpoint (K), coins, flag (F)
  "..P......." + ".........." + ".....SSS.B" + "...E...E.." + "......K..B" + "....E....E" + "..CC......" + "......SS.." + "B.E...F...",
  r("G", 14) + r(".", 7) + r("G", 19) + r(".", 5) + r("G", 20) + r(".", 8) + r("G", 17),
].join("\n");

// Level 2-3 — World 2 finale and the hardest level: longest run,
// three spike fields, five enemies, four gaps with tight
// stepping-stone chains or double jumps, and two checkpoints.
// Completing it triggers the You Win screen (it is the last level).
// 112 columns. Ground segments 0-11, 20-33, 40-55, 64-79, 87-111
// (gaps of 8, 6, 8 and 7).
const LEVEL_2_3 = [
  r(".", 21) + "CC" + r(".", 89),               // bonus coins, high platform
  r(".", 20) + "BBBB" + r(".", 88),             // high platform
  "",
  // coins over the stepping stones and platforms
  ".........." + "....C..C.." + ".........." + "......CC.." + ".........." + ".........C" + "C....CC..." + ".........." + "..CC......" + ".........." + ".........." + "..",
  // stepping stones over each gap + mid platforms
  ".........." + "....BB.BB." + ".........." + "......BB.." + ".........." + ".........B" + "B....BBB.." + ".........." + "..BB......" + ".........." + ".........." + "..",
  "",
  // ground row: player, spikes (S), checkpoints (K), enemies (E)
  // behind fences (B), flag (F) guarded by the last enemies
  "..P......." + ".........." + "....SSSS.." + ".........." + ".K..B..E.." + ".E........" + "........SS" + "S..B.E...." + "........K." + "..SSS..B.." + ".E....E.F." + "..",
  r("G", 12) + r(".", 8) + r("G", 14) + r(".", 6) + r("G", 16) + r(".", 8) + r("G", 16) + r(".", 7) + r("G", 25),
].join("\n");

// World 3 Underworld/Cave theme (PG-38). Dark rock, no sky clouds; a
// procedural cave-crystal backdrop is drawn by the engine (decor: cave).
const CAVE_SKY = [0.05, 0.03, 0.08];
const CAVE_TILE = [0.46, 0.4, 0.56];

// World 4 Space theme (PG-39). Near-black sky with a starfield/planets
// backdrop (decor: space), low gravity, and (later stages) meteors.
const SPACE_SKY = [0.02, 0.02, 0.06];
const SPACE_TILE = [0.62, 0.64, 0.74];

// Legend recap for the new mechanics: L lava · V bat · A alien ·
// T stalactite (falls when passed beneath) · X crumbling platform.

// Level 3-1 — Cave intro (PG-40). Lava pools to jump and bats patrolling
// mid-air. Moderate difficulty as a transition from World 2.
// 64 columns. Ground segments 0-15, 19-38, 42-63 (two 3-wide lava pits).
const LEVEL_3_1 = [
  r(".", 28) + "CCC" + r(".", 33),
  r(".", 27) + "BBBBB" + r(".", 32),
  "",
  r(".", 22) + "CC" + r(".", 18) + "CC" + r(".", 20),
  r(".", 21) + "BBBB" + r(".", 16) + "BBBB" + r(".", 19),
  r(".", 10) + "V" + r(".", 25) + "V" + r(".", 27),
  "..P....C...E...." + "..." + ".....C....E......C.." + "..." + "....C.......C....F....",
  r("G", 16) + "LLL" + r("G", 20) + "LLL" + r("G", 22),
].join("\n");

// Level 3-2 — Deeper cave (PG-41). Wider lava (with a stepping stone),
// more bats, falling stalactites that drop when the player passes under,
// an erupting volcano (PG-58), and a mid-level checkpoint.
// 80 columns. Ground segments 0-19, 24-45, 49-79 (lava pits 4 and 3 wide).
const LEVEL_3_2 = [
  r(".", 34) + "CCC" + r(".", 43),
  r(".", 33) + "BBBBB" + r(".", 42),
  r(".", 30) + "T" + r(".", 24) + "T" + r(".", 10) + "T" + r(".", 13),
  r(".", 21) + "CC" + r(".", 57),
  r(".", 21) + "BB" + r(".", 57),
  r(".", 14) + "V" + r(".", 30) + "V" + r(".", 34),
  "..P.....C....E......" + "...." + ".....C....K.....E....." + "..." + ".....C..O....E........F........",
  r("G", 20) + "LLLL" + r("G", 22) + "LLL" + r("G", 31),
].join("\n");

// Level 3-3 — Underworld finale (PG-42). Lava everywhere, a swarm of
// bats, stalactites, an erupting volcano (PG-58), and a
// crumbling-platform bridge over a wide lava pit. Two checkpoints.
// 96 columns. Ground segments 0-15, 19-34, 40-59, 63-95 (lava 3,5,3 wide;
// the 5-wide pit is crossed by crumbling platforms one row up).
const LEVEL_3_3 = [
  r(".", 44) + "CCC" + r(".", 49),
  r(".", 43) + "BBBBB" + r(".", 48),
  r(".", 24) + "T" + r(".", 21) + "T" + r(".", 23) + "T" + r(".", 14) + "T" + r(".", 10),
  r(".", 20) + "CC" + r(".", 74),
  r(".", 20) + "BB" + r(".", 74),
  r(".", 35) + "XXXXX" + r(".", 8) + "V" + r(".", 20) + "V" + r(".", 26),
  "..P....C....E..." + "..." + "...K....C....E.." + "....." + ".....C......E..O...." + "..." + "....K.....C.......E......F.......",
  r("G", 16) + "LLL" + r("G", 16) + "LLLLL" + r("G", 20) + "LLL" + r("G", 33),
].join("\n");

// Level 4-1 — Space intro (PG-43). Low gravity makes jumps floaty;
// alien enemies patrol the station floor; void gaps replace pits.
// 72 columns. Ground segments 0-23, 28-49, 53-71 (4- and 3-wide voids).
const LEVEL_4_1 = [
  r(".", 30) + "CCC" + r(".", 39),
  r(".", 29) + "BBBBB" + r(".", 38),
  "",
  r(".", 24) + "CC" + r(".", 46),
  r(".", 24) + "BBB" + r(".", 23) + "BBB" + r(".", 19),
  "",
  "..P......C.....A........" + "...." + "....C......A........." + "..." + "...C.....A....F....",
  r("G", 24) + r(".", 4) + r("G", 22) + r(".", 3) + r("G", 19),
].join("\n");

// Level 4-2 — Meteor belt (PG-44). Meteors rain from above at random
// intervals; static asteroid platforms bridge the voids; more aliens and
// a checkpoint.
// 88 columns. Ground segments 0-19, 25-48, 53-87 (5- and 4-wide voids).
const LEVEL_4_2 = [
  r(".", 40) + "CCC" + r(".", 45),
  r(".", 39) + "BBBBB" + r(".", 44),
  "",
  r(".", 20) + "CC" + r(".", 66),
  r(".", 20) + "BBBB" + r(".", 25) + "BBB" + r(".", 36),
  "",
  "..P.....C.....A....." + "....." + "...K....C......A........" + "...." + "....C.......A.......C......F.......",
  r("G", 20) + r(".", 5) + r("G", 24) + r(".", 4) + r("G", 35),
].join("\n");

// Level 4-3 — Ultimate finale (PG-45). Every Space mechanic together:
// low gravity, asteroid platforms, meteors, and aliens across a long
// run with two checkpoints. It's the last level, so the goal triggers
// the You-Win screen.
// 108 columns. Ground segments 0-15, 20-43, 49-76, 81-107 (voids 4,5,4).
const LEVEL_4_3 = [
  r(".", 52) + "CCC" + r(".", 53),
  r(".", 51) + "BBBBB" + r(".", 52),
  "",
  r(".", 30) + "CCC" + r(".", 75),
  r(".", 16) + "BBB" + r(".", 25) + "BBBB" + r(".", 24) + "BBB" + r(".", 33),
  "",
  "..P....C....A..." + "...." + "...K...C.....A.......C.." + "....." + "....C......A........C......." + "...." + "...K....C......A......F....",
  r("G", 16) + r(".", 4) + r("G", 24) + r(".", 5) + r("G", 28) + r(".", 4) + r("G", 27),
].join("\n");

// World 5 Frozen Peaks theme (issue #54). Pale blue sky, icy tiles.
const ICE_SKY = [0.72, 0.85, 0.95];
const ICE_TILE = [0.78, 0.88, 0.96];

// World 6 Neon Factory theme (issue #55). Dark industrial with neon.
const FACTORY_SKY = [0.06, 0.04, 0.1];
const FACTORY_TILE = [0.55, 0.55, 0.65];

// Legend additions for World 5/6:
// I  ice ground tile       Y  yeti enemy
// W  freezing water        >  conveyor right
// <  conveyor left         Z  laser
// R  drone

// Level 5-1 — Ice intro (issue #54). Gentle sliding platforms on full
// ice ground. No death hazards, just coins and a single yeti.
// 64 columns. Ground segment 0-63 (continuous ice).
const LEVEL_5_1 = [
  r(".", 28) + "CCC" + r(".", 33),
  r(".", 27) + "BBBBB" + r(".", 32),
  "",
  r(".", 18) + "CC" + r(".", 22) + "CC" + r(".", 20),
  r(".", 17) + "BBBB" + r(".", 20) + "BBBB" + r(".", 19),
  "",
  "..P.....C...C.C..." + ".........." + "..Y......." + "....C.C......F....",
  r("I", 64),
].join("\n");

// Level 5-2 — Deeper ice (issue #54). Freezing water pools (3-wide),
// falling icicles, crumbling platforms over one water gap, 2 yetis.
// 80 columns. Ground segments 0-19, 23-44, 48-79 (water gaps 3-wide).
const LEVEL_5_2 = [
  r(".", 35) + "CCC" + r(".", 42),
  r(".", 34) + "BBBBB" + r(".", 41),
  r(".", 25) + "T" + r(".", 24) + "T" + r(".", 14) + "T" + r(".", 14),
  r(".", 21) + "CC" + r(".", 57),
  r(".", 20) + "BBBB" + r(".", 56),
  r(".", 18) + "XXX" + r(".", 34) + "V" + r(".", 24),
  "..P.....C....Y......" + "..." + "...K....C.....Y.........." + "..." + "....C........C......F...........",
  r("I", 20) + "WWW" + r("I", 22) + "WWW" + r("I", 32),
].join("\n");

// Level 5-3 — Blizzard finale (issue #54). Multiple freezing water
// gaps, icicles, crumbling ice bridges, yetis, and two checkpoints.
// 96 columns. Ground segments 0-15, 19-38, 43-63, 67-95 (water 3,4,3 wide).
const LEVEL_5_3 = [
  r(".", 44) + "CCC" + r(".", 49),
  r(".", 43) + "BBBBB" + r(".", 48),
  r(".", 22) + "T" + r(".", 18) + "T" + r(".", 25) + "T" + r(".", 15) + "T" + r(".", 12),
  r(".", 20) + "CC" + r(".", 74),
  r(".", 20) + "BB" + r(".", 74),
  r(".", 16) + "XXX" + r(".", 23) + "XXXX" + r(".", 15) + "V" + r(".", 18) + "V" + r(".", 16),
  "..P....C....Y..." + "..." + "...K....C....Y......." + "...." + ".....C......Y..K...." + "..." + "....C.........Y.......F........",
  r("I", 16) + "WWW" + r("I", 20) + "WWWW" + r("I", 21) + "WWW" + r("I", 29),
].join("\n");

// Level 6-1 — Factory intro (issue #55). Normal ground with conveyor
// belts, drones patrolling, coins. No death hazards except gaps.
// 72 columns. Ground segments 0-23, 28-49, 53-71 (4- and 3-wide voids).
const LEVEL_6_1 = [
  r(".", 30) + "CCC" + r(".", 39),
  r(".", 29) + "BBBBB" + r(".", 38),
  "",
  r(".", 22) + "CC" + r(".", 48),
  r(".", 22) + "BBB" + r(".", 22) + "BBB" + r(".", 22),
  r(".", 15) + "R" + r(".", 30) + "R" + r(".", 25),
  "..P......C..E.." + r(">", 4) + r("<", 4) + "." + "...." + ".C.." + r(">", 3) + "..E......C.." + "..." + "...C..." + r("<", 4) + "...E..F....",
  r("G", 10) + r(">", 6) + r("<", 4) + r("G", 4) + r(".", 4) + r("G", 8) + r(">", 6) + r("G", 8) + r(".", 3) + r("G", 6) + r("<", 4) + r("G", 9),
].join("\n");

// Level 6-2 — Laser gauntlet (issue #55). Ground with conveyors,
// lasers across paths, drones, and a checkpoint. Conveyor puzzles.
// 88 columns. Ground segments 0-19, 24-51, 56-87 (4- and 4-wide voids).
const LEVEL_6_2 = [
  r(".", 40) + "CCC" + r(".", 45),
  r(".", 39) + "BBBBB" + r(".", 44),
  "",
  r(".", 22) + "CC" + r(".", 64),
  r(".", 22) + "BBBB" + r(".", 25) + "BBB" + r(".", 34),
  r(".", 12) + "R" + r(".", 28) + "R" + r(".", 22) + "R" + r(".", 23),
  "..P.....C..Z..E....." + "...." + "..K...C.." + r(">", 4) + "..Z..E.......C.." + "...." + "...C." + r("<", 4) + "..Z...E.........F.........",
  r("G", 8) + r(">", 6) + r("G", 6) + r(".", 4) + r("G", 10) + r(">", 6) + r("<", 4) + r("G", 8) + r(".", 4) + r("G", 8) + r("<", 6) + r("G", 18),
].join("\n");

// Level 6-3 — Ultimate finale (issue #55). Everything combined:
// conveyors, lasers, drones, two checkpoints. The final level of the
// game; completing it triggers the You-Win screen.
// 108 columns. Ground segments 0-17, 22-47, 53-78, 83-107 (voids 4,5,4).
const LEVEL_6_3 = [
  r(".", 52) + "CCC" + r(".", 53),
  r(".", 51) + "BBBBB" + r(".", 52),
  "",
  r(".", 28) + "CCC" + r(".", 77),
  r(".", 16) + "BBB" + r(".", 24) + "BBBB" + r(".", 24) + "BBB" + r(".", 34),
  r(".", 10) + "R" + r(".", 28) + "R" + r(".", 28) + "R" + r(".", 25) + "R" + r(".", 13),
  "..P....C..Z..E.." + "...." + "..K..C." + r(">", 4) + ".Z..E........C.." + "....." + "..C." + r("<", 4) + "..Z...E.......C." + "...." + "..K..C." + r(">", 4) + "..Z..E.....F....",
  r("G", 6) + r(">", 6) + r("G", 6) + r(".", 4) + r("G", 8) + r(">", 6) + r("<", 4) + r("G", 8) + r(".", 5) + r("G", 8) + r("<", 6) + r("G", 12) + r(".", 4) + r("G", 6) + r(">", 6) + r("<", 4) + r("G", 9),
].join("\n");


// Levels grouped by world, mirroring GameManager.WORLDS. The HUD
// shows the level as "world-stage" (1-1 ... 4-3).
export const WORLDS = [
  [
    // World 1 — grassland decor (PG-46): trees, bushes, flowers, fences.
    { layout: LEVEL_1, sky: DEFAULT_SKY, tileTint: WHITE, cloudTint: WHITE, decor: "grassland" },
    { layout: LEVEL_2, sky: DEFAULT_SKY, tileTint: WHITE, cloudTint: WHITE, decor: "grassland" },
    { layout: LEVEL_3, sky: DEFAULT_SKY, tileTint: WHITE, cloudTint: WHITE, decor: "grassland" },
  ],
  // World 2 — dusk-forest decor (PG-46): tall dark trees, mushrooms,
  // hanging vines, and fallen logs.
  [
    { layout: LEVEL_2_1, sky: DUSK_SKY, tileTint: DUSK_TILE, cloudTint: DUSK_CLOUD, decor: "forest" },
    { layout: LEVEL_2_2, sky: DUSK_SKY, tileTint: DUSK_TILE, cloudTint: DUSK_CLOUD, decor: "forest" },
    {
      layout: LEVEL_2_3,
      sky: [0.13, 0.11, 0.2],
      tileTint: [0.68, 0.65, 0.9],
      cloudTint: [0.55, 0.52, 0.7],
      decor: "forest",
    },
  ],
  // World 3 — Underworld/Cave (PG-38): dark, no clouds, crystal backdrop.
  [
    { layout: LEVEL_3_1, sky: CAVE_SKY, tileTint: CAVE_TILE, cloudTint: WHITE, clouds: false, decor: "cave" },
    { layout: LEVEL_3_2, sky: CAVE_SKY, tileTint: CAVE_TILE, cloudTint: WHITE, clouds: false, decor: "cave" },
    { layout: LEVEL_3_3, sky: [0.03, 0.02, 0.05], tileTint: [0.5, 0.36, 0.42], cloudTint: WHITE, clouds: false, decor: "cave" },
  ],
  // World 4 — Space (PG-39): starfield backdrop, low gravity, meteors on
  // the later stages.
  [
    { layout: LEVEL_4_1, sky: SPACE_SKY, tileTint: SPACE_TILE, cloudTint: WHITE, clouds: false, decor: "space", gravity: 0.55 },
    { layout: LEVEL_4_2, sky: SPACE_SKY, tileTint: SPACE_TILE, cloudTint: WHITE, clouds: false, decor: "space", gravity: 0.55, meteors: true },
    { layout: LEVEL_4_3, sky: [0.03, 0.01, 0.08], tileTint: [0.6, 0.55, 0.72], cloudTint: WHITE, clouds: false, decor: "space", gravity: 0.55, meteors: true },
  ],
  // World 5 — Frozen Peaks (issue #54): ice physics, icicles, yetis.
  [
    { layout: LEVEL_5_1, sky: ICE_SKY, tileTint: ICE_TILE, cloudTint: WHITE, decor: "ice", ice: true },
    { layout: LEVEL_5_2, sky: ICE_SKY, tileTint: ICE_TILE, cloudTint: WHITE, decor: "ice", ice: true },
    { layout: LEVEL_5_3, sky: [0.6, 0.75, 0.88], tileTint: [0.7, 0.82, 0.92], cloudTint: WHITE, decor: "ice", ice: true },
  ],
  // World 6 — Neon Factory (issue #55): conveyors, lasers, drones.
  [
    { layout: LEVEL_6_1, sky: FACTORY_SKY, tileTint: FACTORY_TILE, cloudTint: WHITE, clouds: false, decor: "factory" },
    { layout: LEVEL_6_2, sky: FACTORY_SKY, tileTint: FACTORY_TILE, cloudTint: WHITE, clouds: false, decor: "factory" },
    { layout: LEVEL_6_3, sky: [0.08, 0.05, 0.12], tileTint: [0.5, 0.48, 0.6], cloudTint: WHITE, clouds: false, decor: "factory" },
  ],
];

// Flat list with "world-stage" labels, like GameManager._level_paths.
export const LEVELS = WORLDS.flatMap((world, w) =>
  world.map((level, s) => ({ ...level, world: w, stage: s, label: `${w + 1}-${s + 1}` })),
);
