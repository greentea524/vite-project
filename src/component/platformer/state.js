// Game state ported from scripts/game_manager.gd: run state (coins,
// lives, current level, avatar choice) and all screen transitions.
// Screens replace Godot's scene changes:
//   menu | playing | paused | gameover | levelcomplete | worldmap | win
// Events: "coins", "lives", "screen", "level" (level = reload the
// current level scene).

import { WORLDS, LEVELS } from "./levels.js";
import { loadSave, writeSave } from "./save.js";
import { ACHIEVEMENTS_BY_ID, evaluate } from "./achievements.js";

export const START_LIVES = 3;

// Player avatars selectable from the main menu (PG-30). The choice
// persists for the whole session, including level restarts.
export const AVATAR_NAMES = ["Blue", "Green", "Orange", "Yellow", "Purple", "Pink"];

export class GameState {
  constructor() {
    this._listeners = new Map();
    this.screen = "menu";
    const save = loadSave();
    this.selectedAvatar = save.selectedAvatar;
    this.tutorialDoubleJumpShown = false;
    this.coins = 0;
    this.lives = START_LIVES;
    this.currentLevel = 0;
    this.respawn = { x: 0, y: 0 };
    // Number of consecutively completed levels; drives the world map.
    this.levelsCompleted = save.levelsCompleted;
    // Lifetime stats + unlocked achievements (#66). Unlike coins/lives
    // these never reset on a new run — they accrue across playthroughs
    // and survive resetProgress().
    this.stats = save.stats;
    this.achievements = save.achievements;
    // Ghost-race multiplayer (PLAT-19). runTimeMs accumulates playing
    // time across the whole run for the leaderboard.
    this.multiplayer = false;
    this.runTimeMs = 0;
    this.finished = false;
  }

  on(event, cb) {
    if (!this._listeners.has(event)) this._listeners.set(event, new Set());
    this._listeners.get(event).add(cb);
    return () => this._listeners.get(event).delete(cb);
  }

  _emit(event, payload) {
    for (const cb of this._listeners.get(event) ?? []) cb(payload);
  }

  _setScreen(screen) {
    this.screen = screen;
    this._emit("screen", screen);
  }

  _persist() {
    // Only persist if we aren't in a multiplayer race
    if (!this.multiplayer) {
      writeSave({
        levelsCompleted: this.levelsCompleted,
        selectedAvatar: this.selectedAvatar,
        stats: this.stats,
        achievements: this.achievements,
      });
    }
  }

  // The snapshot achievements are judged against: lifetime stats plus
  // the world-map frontier. Also what the panel reads for progress.
  achievementStats() {
    return { ...this.stats, levelsCompleted: this.levelsCompleted };
  }

  // Marks newly-crossed achievements unlocked and announces each one.
  // evaluate() only returns ids not yet in this.achievements, so a
  // given achievement fires its "achievement" event exactly once.
  _checkAchievements() {
    if (this.multiplayer) return;
    for (const id of evaluate(this.achievementStats(), this.achievements)) {
      this.achievements[id] = Date.now();
      this._emit("achievement", ACHIEVEMENTS_BY_ID.get(id));
    }
  }

  // Lifetime-stat bump + unlock check + save. Races don't count (#66):
  // stats would inflate from ghost-race runs, so gate like _persist.
  _bumpStat(key, n = 1) {
    if (this.multiplayer) return;
    this.stats[key] = (this.stats[key] || 0) + n;
    this._checkAchievements();
    this._persist();
  }

  // Fashionista tracking: remember each avatar the player has actually
  // started a level with (menu browsing alone doesn't count).
  _recordAvatarUse() {
    if (this.multiplayer) return;
    if (this.stats.avatarsUsed.includes(this.selectedAvatar)) return;
    this.stats.avatarsUsed.push(this.selectedAvatar);
    this._checkAchievements();
    this._persist();
  }

  markTutorialShown() {
    this.tutorialDoubleJumpShown = true;
  }

  // Set avatar and persist
  setAvatar(index) {
    this.selectedAvatar = index;
    this._persist();
  }

  // Wipes progress completely and starts from 1-1
  resetProgress() {
    this.multiplayer = false;
    this.levelsCompleted = 0;
    this._persist();
    this.coins = 0;
    this.lives = START_LIVES;
    this.runTimeMs = 0;
    this.finished = false;
    this._emit("coins", this.coins);
    this._emit("lives", this.lives);
    this.gotoLevel(0);
  }

  // Resumes the game from the furthest unlocked stage
  continueGame() {
    this.multiplayer = false;
    this.coins = 0;
    this.lives = START_LIVES;
    this.runTimeMs = 0;
    this.finished = false;
    this._emit("coins", this.coins);
    this._emit("lives", this.lives);
    this.gotoLevel(this.levelsCompleted);
  }

  // Plays a specific stage without wiping progress. `multiplayer` must
  // be set before gotoLevel() so loadLevel() sees it (it reads the flag
  // synchronously to apply each racer's spawn offset and to enable the
  // per-frame state broadcast that drives other players' ghosts).
  playStage(index, multiplayer = false) {
    this.multiplayer = multiplayer;
    this.coins = 0;
    this.lives = START_LIVES;
    this.runTimeMs = 0;
    this.finished = false;
    this._emit("coins", this.coins);
    this._emit("lives", this.lives);
    this.gotoLevel(index);
  }

  // Multiplayer race entry point: starts at level 0 with multiplayer on.
  startGame() {
    this.playStage(0, true);
  }

  // Multiplayer lobby (PLAT-23): choose create/join before starting.
  openLobby() {
    this._setScreen("lobby");
  }

  addRunTime(ms) {
    this.runTimeMs += ms;
  }

  gotoLevel(index) {
    this.currentLevel = Math.max(0, Math.min(index, LEVELS.length - 1));
    if (this.currentLevel === 0) this.tutorialDoubleJumpShown = false;
    this._recordAvatarUse();
    this._emit("level", this.currentLevel);
    this._setScreen("playing");
  }

  nextLevel() {
    this.gotoLevel(this.currentLevel + 1);
  }

  // Game-over Retry: lives reset, same level (GameManager.retry_level).
  retryLevel() {
    this.lives = START_LIVES;
    this._emit("lives", this.lives);
    this.gotoLevel(this.currentLevel);
  }

  // Pause-menu Restart keeps lives/coins (pause_menu.gd -> goto_level).
  restartLevel() {
    this.gotoLevel(this.currentLevel);
  }

  mainMenu() {
    this.multiplayer = false;
    this._setScreen("menu");
  }

  pause() {
    if (this.screen === "playing") this._setScreen("paused");
  }

  resume() {
    if (this.screen === "paused") this._setScreen("playing");
  }

  // World-stage label for the HUD, e.g. "1-2".
  levelLabel() {
    return LEVELS[this.currentLevel].label;
  }

  worldOf(index) {
    return LEVELS[index].world;
  }

  flatIndex(world, stage) {
    let index = 0;
    for (let w = 0; w < world; w++) index += WORLDS[w].length;
    return index + stage;
  }

  isCompleted(index) {
    return index < this.levelsCompleted;
  }

  isLastInWorld(index) {
    return index === LEVELS.length - 1 || LEVELS[index].world !== LEVELS[index + 1].world;
  }

  addCoin() {
    this.coins += 1;
    this._emit("coins", this.coins);
    this._bumpStat("totalCoins");
  }

  // Enemy stomped — engine's onStomp hook (#66, Stomper).
  addStomp() {
    this._bumpStat("stomps");
  }

  // Deducts a life. Returns true when the run is out of lives.
  loseLife() {
    this.lives -= 1;
    this._emit("lives", this.lives);
    this._bumpStat("deaths");
    return this.lives <= 0;
  }

  setCheckpoint(pos) {
    this.respawn = { x: pos.x, y: pos.y };
  }

  levelComplete() {
    this.levelsCompleted = Math.max(
      this.levelsCompleted,
      this.currentLevel + 1,
    );
    const finishedGame = this.currentLevel + 1 >= LEVELS.length;
    // Bump lifetime counters after levelsCompleted so the unlock check
    // sees the new frontier (First Steps, World Traveler, Champion...).
    this._bumpStat("levelsCleared");
    if (finishedGame) this._bumpStat("gamesCompleted");
    this._persist();

    if (finishedGame) {
      this.finished = true;
      this._setScreen("win");
    } else {
      this.gotoLevel(this.currentLevel + 1);
    }
  }

  // Continue from the world map: next unfinished level, or the win
  // screen once everything is done.
  continueFromWorldMap() {
    if (this.levelsCompleted >= LEVELS.length) {
      this.finished = true; // completing the last level ends the race
      this._setScreen("win");
    } else {
      this.gotoLevel(this.levelsCompleted);
    }
  }

  gameOver() {
    this._setScreen("gameover");
  }
}
