// Axis math for the shared virtual joystick (#93). The DOM behavior
// (pointer capture, knob tracking) is exercised in the browser; the
// deflection -> axis mapping is the pure part worth pinning down.

import { describe, it, expect } from "vitest";
import { joystickAxis } from "./VirtualJoystick.jsx";

const TRAVEL = 30; // px of knob travel, as in an ~88px base

describe("joystickAxis", () => {
  it("is zero at rest and inside the dead zone", () => {
    expect(joystickAxis(0, TRAVEL)).toBe(0);
    expect(joystickAxis(TRAVEL * 0.2, TRAVEL)).toBe(0); // under 24% dead zone
    expect(joystickAxis(-TRAVEL * 0.2, TRAVEL)).toBe(0);
  });

  it("leaves the dead zone smoothly instead of jumping", () => {
    const justOutside = joystickAxis(TRAVEL * 0.26, TRAVEL);
    expect(justOutside).toBeGreaterThan(0);
    expect(justOutside).toBeLessThan(0.05); // remapped, not a 0.26 jump
  });

  it("reaches full deflection at the travel limit", () => {
    expect(joystickAxis(TRAVEL, TRAVEL)).toBe(1);
    expect(joystickAxis(-TRAVEL, TRAVEL)).toBe(-1);
  });

  it("clamps past the travel limit", () => {
    expect(joystickAxis(TRAVEL * 3, TRAVEL)).toBe(1);
    expect(joystickAxis(-TRAVEL * 3, TRAVEL)).toBe(-1);
  });

  it("is symmetric and monotonic", () => {
    const points = [0.3, 0.5, 0.7, 0.9].map((f) => joystickAxis(TRAVEL * f, TRAVEL));
    for (let i = 1; i < points.length; i++) {
      expect(points[i]).toBeGreaterThan(points[i - 1]);
    }
    expect(joystickAxis(-TRAVEL * 0.6, TRAVEL)).toBeCloseTo(
      -joystickAxis(TRAVEL * 0.6, TRAVEL),
    );
  });

  it("returns 0 for a degenerate travel radius", () => {
    expect(joystickAxis(10, 0)).toBe(0);
  });
});
