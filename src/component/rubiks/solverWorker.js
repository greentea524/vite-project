// Web worker wrapping the min2phase Kociemba solver. Table initialization
// takes a couple of seconds, so both init and solving happen off the main
// thread; the UI just exchanges messages.
import min2phase from "./vendor/min2phase.js";

let initialized = false;

function ensureInit() {
  if (!initialized) {
    min2phase.initFull();
    initialized = true;
  }
}

self.onmessage = (event) => {
  const { id, type, facelets } = event.data;
  try {
    switch (type) {
      case "init": {
        ensureInit();
        self.postMessage({ id, type: "ready" });
        break;
      }
      case "solve": {
        ensureInit();
        const result = min2phase.solve(facelets);
        self.postMessage({ id, type: "solution", result });
        break;
      }
      case "randomCube": {
        ensureInit();
        self.postMessage({ id, type: "randomCube", result: min2phase.randomCube() });
        break;
      }
      default:
        self.postMessage({ id, type: "error", error: `Unknown message type: ${type}` });
    }
  } catch (err) {
    self.postMessage({ id, type: "error", error: String(err && err.message ? err.message : err) });
  }
};
