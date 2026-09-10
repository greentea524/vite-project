import React from "react";

/**
 * Chart tooltip. HTML rather than SVG so it inherits the page's type, and
 * deliberately outside the <svg> so it never lands in the PNG export.
 *
 * Values lead and labels follow, per the dataviz interaction spec: the reader
 * already knows what they pointed at and wants the number.
 */
function Tooltip({ point, palette }) {
  if (!point) return null;

  const flip = point.flip ?? false;

  return (
    <div
      className="viz-tooltip"
      role="presentation"
      style={{
        left: `${point.x}px`,
        top: `${point.y}px`,
        transform: `translate(${flip ? "-100%" : "0"}, -100%)`,
        background: palette.surface,
        borderColor: palette.axis,
        color: palette.textPrimary,
      }}
    >
      <strong className="viz-tooltip-value">{point.value}</strong>
      <span className="viz-tooltip-label" style={{ color: palette.textSecondary }}>
        {point.label}
      </span>
      {point.note ? (
        <span className="viz-tooltip-note" style={{ color: palette.textMuted }}>
          {point.note}
        </span>
      ) : null}
    </div>
  );
}

export default Tooltip;
