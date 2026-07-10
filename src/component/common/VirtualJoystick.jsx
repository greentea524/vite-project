import React, { useEffect, useRef } from "react";

// Virtual joystick shared by the platformer (PLAT-18) and Alien
// Invasion (#93). The knob follows the pointer, clamped to the base
// radius, and springs back on release. Pointer Events + pointer
// capture, so sliding off the base can't stick the input and a mouse
// works for desktop testing. The knob moves via direct style updates —
// no React re-render per pointermove.
//
// Two output modes, both optional:
//   onDirection(-1 | 0 | 1) — digital, past the dead zone (platformer)
//   onAxis(-1..1)           — analog horizontal deflection (invasion)

// Horizontal displacement -> analog axis. Dead zone is re-mapped away
// so the axis leaves 0 smoothly instead of jumping to the dead-zone
// edge value. Pure — unit tested in VirtualJoystick.test.js.
export function joystickAxis(dx, travel, deadFrac = 0.24) {
  if (travel <= 0) return 0;
  const norm = Math.max(-1, Math.min(1, dx / travel));
  const dead = deadFrac;
  if (Math.abs(norm) <= dead) return 0;
  const sign = norm < 0 ? -1 : 1;
  return sign * ((Math.abs(norm) - dead) / (1 - dead));
}

export function VirtualJoystick({
  onDirection,
  onAxis,
  className = "vjoystick",
  knobClassName = "vjoystick-knob",
}) {
  const baseRef = useRef(null);
  const knobRef = useRef(null);
  // Latest callbacks in a ref so the effect binds once — a parent
  // re-render mid-drag must not rebind listeners and drop the pointer.
  const cbRef = useRef({ onDirection, onAxis });
  cbRef.current = { onDirection, onAxis };

  useEffect(() => {
    const base = baseRef.current;
    const knob = knobRef.current;
    // Non-passive: block the browser's long-press selection gesture.
    const block = (e) => e.preventDefault();
    base.addEventListener("touchstart", block, { passive: false });

    let activePointer = null;
    let dir = 0;
    let axis = 0;
    const setDir = (d) => {
      if (dir === d) return;
      dir = d;
      cbRef.current.onDirection?.(d);
    };
    const setAxis = (v) => {
      if (axis === v) return;
      axis = v;
      cbRef.current.onAxis?.(v);
    };

    const track = (e) => {
      const rect = base.getBoundingClientRect();
      let dx = e.clientX - (rect.left + rect.width / 2);
      let dy = e.clientY - (rect.top + rect.height / 2);
      const travel = rect.width / 2 - 14; // keep the knob inside the base
      const len = Math.hypot(dx, dy);
      if (len > travel) {
        dx = (dx / len) * travel;
        dy = (dy / len) * travel;
      }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      const dead = rect.width * 0.12;
      setDir(dx < -dead ? -1 : dx > dead ? 1 : 0);
      setAxis(joystickAxis(dx, travel));
    };
    const down = (e) => {
      activePointer = e.pointerId;
      try {
        base.setPointerCapture(e.pointerId);
      } catch {
        // synthetic events have no active pointer to capture
      }
      track(e);
    };
    const move = (e) => {
      if (e.pointerId === activePointer) track(e);
    };
    const up = (e) => {
      if (e.pointerId !== activePointer) return;
      activePointer = null;
      knob.style.transform = "translate(0px, 0px)";
      setDir(0);
      setAxis(0);
    };

    base.addEventListener("pointerdown", down);
    base.addEventListener("pointermove", move);
    base.addEventListener("pointerup", up);
    base.addEventListener("pointercancel", up);
    return () => {
      base.removeEventListener("touchstart", block);
      base.removeEventListener("pointerdown", down);
      base.removeEventListener("pointermove", move);
      base.removeEventListener("pointerup", up);
      base.removeEventListener("pointercancel", up);
      setDir(0);
      setAxis(0);
    };
  }, []);

  return (
    <div className={className} ref={baseRef} aria-label="Move joystick">
      <div className={knobClassName} ref={knobRef} />
    </div>
  );
}
