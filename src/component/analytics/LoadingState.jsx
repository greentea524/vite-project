import React from "react";
import spinnerGif from "../../assets/spinner.gif";
import spinnerStillGif from "../../assets/spinner-static.gif";

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
 * ## The spinner
 *
 * An animated GIF, generated from the dashboard palette: a #eceff3 track with
 * a #2a78d6 arc, 12 frames at 60ms, 60px for a 30px box so it stays sharp on a
 * 2x display. The background is baked to #fcfcfc — the panel surface is a
 * fixed value (see palette.js), so painting it beats GIF's 1-bit transparency,
 * which would fringe every antialiased edge.
 *
 * `<picture>` handles reduced motion: `prefers-reduced-motion: reduce` selects
 * a single-frame copy, and the browser fetches only the one it picks, so the
 * still version costs nothing to the people who don't get it. Doing this in
 * CSS is not possible — a media query cannot swap an <img> src — and doing it
 * in JS would mean the animated file is already downloaded by the time you
 * decide.
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
        <picture>
          <source
            srcSet={spinnerStillGif}
            media="(prefers-reduced-motion: reduce)"
          />
          <img
            className="viz-spinner"
            src={spinnerGif}
            width="30"
            height="30"
            alt=""
            aria-hidden="true"
            decoding="async"
          />
        </picture>
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
