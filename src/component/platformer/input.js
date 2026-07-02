// Keyboard input with just-pressed / just-released edge tracking,
// standing in for Godot's Input action queries. Actions mirror
// project.godot: move_left/right (A/D + arrows), jump (Space/W/Up),
// pause (Escape).

const ACTION_KEYS = {
  move_left: ["ArrowLeft", "KeyA"],
  move_right: ["ArrowRight", "KeyD"],
  jump: ["Space", "KeyW", "ArrowUp"],
  pause: ["Escape"],
};

const KEY_ACTION = {};
for (const [action, codes] of Object.entries(ACTION_KEYS)) {
  for (const code of codes) KEY_ACTION[code] = action;
}

export class Input {
  constructor() {
    this.down = new Set();
    this.pressed = new Set(); // actions pressed since last endFrame
    this.released = new Set();
    this._onKeyDown = (e) => this._keyDown(e);
    this._onKeyUp = (e) => this._keyUp(e);
  }

  attach(target = window) {
    this._target = target;
    target.addEventListener("keydown", this._onKeyDown);
    target.addEventListener("keyup", this._onKeyUp);
  }

  detach() {
    if (!this._target) return;
    this._target.removeEventListener("keydown", this._onKeyDown);
    this._target.removeEventListener("keyup", this._onKeyUp);
    this._target = null;
  }

  _keyDown(e) {
    const action = KEY_ACTION[e.code];
    if (!action) return;
    // Keep arrows/space from scrolling the page while playing.
    e.preventDefault();
    if (e.repeat) return;
    this.down.add(action);
    this.pressed.add(action);
  }

  _keyUp(e) {
    const action = KEY_ACTION[e.code];
    if (!action) return;
    this.down.delete(action);
    this.released.add(action);
  }

  // Programmatic press/release for the on-screen touch controls
  // (PLAT-13). Mirrors keydown/keyup so buffering, variable jump
  // height, and double jump behave identically on touch.
  press(action) {
    if (this.down.has(action)) return;
    this.down.add(action);
    this.pressed.add(action);
  }

  release(action) {
    if (!this.down.has(action)) return;
    this.down.delete(action);
    this.released.add(action);
  }

  isDown(action) {
    return this.down.has(action);
  }

  justPressed(action) {
    return this.pressed.has(action);
  }

  justReleased(action) {
    return this.released.has(action);
  }

  // Godot's get_axis for the horizontal movement direction.
  axis() {
    return (this.isDown("move_right") ? 1 : 0) - (this.isDown("move_left") ? 1 : 0);
  }

  // Called once per simulation frame after entities consumed the edges.
  endFrame() {
    this.pressed.clear();
    this.released.clear();
  }

  clear() {
    this.down.clear();
    this.pressed.clear();
    this.released.clear();
  }
}
