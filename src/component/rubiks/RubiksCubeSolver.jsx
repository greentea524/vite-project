import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  SOLVED,
  FACE_ORDER,
  FACE_COLORS,
  applyMoves,
  parseMoves,
  randomScramble,
} from "./cubeEngine.js";
import { validateCube, describeSolverError } from "./validateCube.js";
import "./rubiks.css";

// Facelet-string offset of each face (URFDLB convention).
const FACE_OFFSET = { U: 0, R: 9, F: 18, D: 27, L: 36, B: 45 };

// Unfolded-net placement of the six faces.
const NET_AREAS = { U: "u", L: "l", F: "f", R: "r", B: "b", D: "d" };

function Face({ face, facelets, changed, onPaint, disabled }) {
  const base = FACE_OFFSET[face];
  return (
    <div className="rk-face" style={{ gridArea: NET_AREAS[face] }}>
      {Array.from({ length: 9 }, (_, k) => {
        const index = base + k;
        const letter = facelets[index];
        const isCenter = k === 4;
        return (
          <button
            type="button"
            key={changed.has(index) ? `${index}-c` : index}
            className={`rk-sticker${isCenter ? " rk-center" : ""}${
              changed.has(index) ? " rk-changed" : ""
            }`}
            style={{ background: FACE_COLORS[letter].hex }}
            onClick={() => onPaint(index)}
            disabled={disabled || isCenter}
            data-idx={index}
            aria-label={`${face} face sticker ${k + 1}: ${FACE_COLORS[letter].name}${
              isCenter ? " (fixed center)" : ""
            }`}
          />
        );
      })}
    </div>
  );
}

function RubiksCubeSolver() {
  const [facelets, setFacelets] = useState(SOLVED);
  const [selectedColor, setSelectedColor] = useState("U");
  const [workerReady, setWorkerReady] = useState(false);
  const [solving, setSolving] = useState(false);
  const [solveError, setSolveError] = useState(null);
  const [solution, setSolution] = useState(null); // array of move tokens
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(600); // ms per move

  const workerRef = useRef(null);

  // Boot the solver worker once; table init happens off the main thread.
  useEffect(() => {
    const worker = new Worker(new URL("./solverWorker.js", import.meta.url), {
      type: "module",
    });
    workerRef.current = worker;
    worker.onmessage = (event) => {
      const { type, result } = event.data;
      if (type === "ready") setWorkerReady(true);
      if (type === "solution") {
        setSolving(false);
        if (/Error/.test(result)) {
          setSolveError(describeSolverError(result));
        } else {
          setSolution(parseMoves(result));
          setStep(0);
        }
      }
      if (type === "error") {
        setSolving(false);
        setSolveError(`Solver failed: ${event.data.error}`);
      }
    };
    worker.postMessage({ type: "init" });
    return () => worker.terminate();
  }, []);

  const validationErrors = useMemo(() => validateCube(facelets), [facelets]);

  // State currently shown on the net: input state + solution moves up to step.
  const displayed = useMemo(
    () => (solution ? applyMoves(facelets, solution.slice(0, step)) : facelets),
    [facelets, solution, step]
  );

  // Stickers that changed on the latest step, for the pulse animation.
  const changed = useMemo(() => {
    if (!solution || step === 0) return new Set();
    const prev = applyMoves(facelets, solution.slice(0, step - 1));
    const diff = new Set();
    for (let i = 0; i < 54; i++) if (prev[i] !== displayed[i]) diff.add(i);
    return diff;
  }, [facelets, solution, step, displayed]);

  // Auto-advance during playback.
  useEffect(() => {
    if (!playing || !solution) return undefined;
    if (step >= solution.length) {
      setPlaying(false);
      return undefined;
    }
    const timer = setTimeout(() => setStep((s) => s + 1), speed);
    return () => clearTimeout(timer);
  }, [playing, solution, step, speed]);

  const paint = useCallback(
    (index) => {
      setSolveError(null);
      setFacelets(
        (prev) => prev.slice(0, index) + selectedColor + prev.slice(index + 1)
      );
    },
    [selectedColor]
  );

  const clearSolution = () => {
    setSolution(null);
    setStep(0);
    setPlaying(false);
    setSolveError(null);
  };

  const handleSolve = () => {
    if (!workerReady || solving || validationErrors.length > 0) return;
    setSolveError(null);
    setSolving(true);
    workerRef.current.postMessage({ type: "solve", facelets });
  };

  const handleScramble = () => {
    clearSolution();
    setFacelets(applyMoves(SOLVED, randomScramble(25)));
  };

  const handleReset = () => {
    clearSolution();
    setFacelets(SOLVED);
  };

  const editing = solution === null;
  const finished = solution !== null && step === solution.length;
  const canSolve =
    editing &&
    workerReady &&
    !solving &&
    validationErrors.length === 0 &&
    facelets !== SOLVED;

  let status;
  if (!workerReady) status = "Preparing solver…";
  else if (solving) status = "Solving…";
  else if (solveError) status = null;
  else if (solution) {
    status = finished
      ? `Solved in ${solution.length} moves! 🎉`
      : `Move ${step} of ${solution.length}`;
  } else if (validationErrors.length > 0) status = null;
  else if (facelets === SOLVED)
    status = "Paint your cube's colors, or press Scramble to try the solver.";
  else status = "Ready to solve.";

  return (
    <div className="rubiks">
      <h4 className="rk-title">
        <i className="fa fa-cube" aria-hidden="true"></i> Rubik's Cube Solver
      </h4>

      <details className="rk-help">
        <summary>How to use</summary>
        <ol>
          <li>
            Hold your cube with the <strong>white center up</strong> and the{" "}
            <strong>green center facing you</strong>, then copy each sticker
            onto the net below (pick a color, click a sticker). Centers are
            fixed.
          </li>
          <li>
            Press <strong>Solve</strong>. Moves use standard notation — U D L R
            F B turn that face clockwise, <code>'</code> means
            counter-clockwise, <code>2</code> means twice.
          </li>
          <li>
            Step through the solution with the playback controls while turning
            your cube along.
          </li>
        </ol>
      </details>

      {editing && (
        <div className="rk-palette" role="group" aria-label="Color palette">
          {FACE_ORDER.map((face) => (
            <button
              type="button"
              key={face}
              className={`rk-swatch${selectedColor === face ? " rk-swatch-active" : ""}`}
              style={{ background: FACE_COLORS[face].hex }}
              onClick={() => setSelectedColor(face)}
              aria-label={`Paint with ${FACE_COLORS[face].name}`}
              title={FACE_COLORS[face].name}
            />
          ))}
        </div>
      )}

      <div className="rk-net" role="grid" aria-label="Unfolded cube">
        {FACE_ORDER.map((face) => (
          <Face
            key={face}
            face={face}
            facelets={displayed}
            changed={changed}
            onPaint={paint}
            disabled={!editing}
          />
        ))}
      </div>

      {validationErrors.length > 0 && editing && (
        <div className="rk-errors" role="alert">
          {validationErrors.map((e) => (
            <div key={e}>{e}</div>
          ))}
        </div>
      )}
      {solveError && (
        <div className="rk-errors" role="alert">
          {solveError}
        </div>
      )}
      {status && <p className={`rk-status${finished ? " rk-won" : ""}`}>{status}</p>}

      {editing ? (
        <div className="rk-actions">
          <button type="button" onClick={handleSolve} disabled={!canSolve}>
            Solve
          </button>
          <button type="button" onClick={handleScramble}>
            Scramble
          </button>
          <button
            type="button"
            onClick={handleReset}
            disabled={facelets === SOLVED}
          >
            Reset
          </button>
        </div>
      ) : (
        <>
          <div className="rk-moves" aria-label="Solution moves">
            {solution.map((token, i) => (
              <span
                key={`${i}-${token}`}
                className={`rk-move${i === step - 1 ? " rk-move-current" : ""}`}
              >
                {token}
              </span>
            ))}
          </div>
          <div className="rk-actions">
            <button type="button" onClick={() => { setPlaying(false); setStep(0); }} disabled={step === 0} aria-label="First move">
              ⏮
            </button>
            <button type="button" onClick={() => { setPlaying(false); setStep((s) => Math.max(0, s - 1)); }} disabled={step === 0} aria-label="Previous move">
              ◀
            </button>
            <button type="button" onClick={() => setPlaying((p) => !p)} disabled={finished} aria-label={playing ? "Pause" : "Play"}>
              {playing ? "⏸" : "▶"}
            </button>
            <button type="button" onClick={() => { setPlaying(false); setStep((s) => Math.min(solution.length, s + 1)); }} disabled={finished} aria-label="Next move">
              ▶|
            </button>
            <button type="button" onClick={() => { setPlaying(false); setStep(solution.length); }} disabled={finished} aria-label="Last move">
              ⏭
            </button>
            <select
              value={speed}
              onChange={(e) => setSpeed(Number(e.target.value))}
              aria-label="Playback speed"
            >
              <option value={1000}>Slow</option>
              <option value={600}>Normal</option>
              <option value={300}>Fast</option>
            </select>
          </div>
          <div className="rk-actions">
            <button type="button" onClick={clearSolution}>
              Back to editing
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default RubiksCubeSolver;
