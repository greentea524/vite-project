import React from "react";
import { PALETTE } from "./palette.js";

/**
 * Placeholder shown while the contribution history is in flight.
 *
 * Shaped like the dashboard rather than a bare line of text, so the wait shows
 * what is coming and that something is happening. It does not pretend to
 * reserve the final height — measured, the placeholder stands about 1350px
 * tall against roughly 3040px loaded. It does not need to: the dashboard is
 * the last thing on the home page, so the page grows downward when the data
 * lands and nothing above it moves.
 *
 * The spinner is drawn rather than shipped as a GIF — one element, no extra
 * request, sharp at any density, recoloured from the same palette as the
 * charts, and it can honour prefers-reduced-motion (see analytics.css), which
 * an animated GIF cannot.
 */
function LoadingState() {
  return (
    <div className="viz-dashboard">
      {/* One live region for the whole placeholder: a screen reader should
          hear "loading" once, not once per skeleton block. */}
      <div className="viz-panel viz-loading-head" role="status">
        <div>
          <h4 className="viz-title">GitHub Activity</h4>
          <p className="viz-copy">Loading a year of contributions…</p>
        </div>
        <svg
          className="viz-spinner"
          viewBox="0 0 32 32"
          width="30"
          height="30"
          aria-hidden="true"
          focusable="false"
        >
          <circle
            cx="16"
            cy="16"
            r="13"
            fill="none"
            stroke={PALETTE.empty}
            strokeWidth="3.5"
          />
          <circle
            className="viz-spinner-arc"
            cx="16"
            cy="16"
            r="13"
            fill="none"
            stroke={PALETTE.accent}
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeDasharray="28 54"
          />
        </svg>
      </div>

      <div className="viz-panel" aria-hidden="true">
        <span className="viz-skeleton viz-skeleton-label" />
        <span className="viz-skeleton viz-skeleton-timeline" />
      </div>

      <div className="viz-panel" aria-hidden="true">
        <span className="viz-skeleton viz-skeleton-label" />
        <span className="viz-skeleton viz-skeleton-calendar" />
      </div>
    </div>
  );
}

export default LoadingState;
