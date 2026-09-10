import React, { useState } from "react";
import Tooltip from "./Tooltip.jsx";
import { useElementWidth } from "./useElementWidth.js";

const ROW = 26;
const BAR = 16;
const LABEL_WIDTH = 42;
const RIGHT = 44;
const TOP = 6;

/**
 * Contributions by weekday, as horizontal bars. Clicking one filters the whole
 * dashboard to that weekday; clicking it again clears the filter.
 *
 * Scoped by the date range but never by its own weekday selection — otherwise
 * picking Tuesday would leave a single bar and nothing to click back out to.
 */
function WeekdayChart({ rows, selectedWeekday, onSelectWeekday, palette, svgRef }) {
  const [wrapRef, width] = useElementWidth(380);
  const [hover, setHover] = useState(null);

  const max = rows.reduce((best, row) => Math.max(best, row.total), 0) || 1;
  const trackWidth = Math.max(60, width - LABEL_WIDTH - RIGHT);
  const height = TOP * 2 + rows.length * ROW;

  return (
    <div className="viz-plot viz-plot-narrow" ref={wrapRef}>
      <svg
        ref={svgRef}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Contributions by weekday. Select a weekday to filter the dashboard."
      >
        <rect x="0" y="0" width={width} height={height} fill={palette.surface} />

        {rows.map((row, index) => {
          const selected = selectedWeekday === row.weekday;
          const dimmed = selectedWeekday !== null && !selected;
          const barWidth = Math.max(row.total === 0 ? 0 : 2, (row.total / max) * trackWidth);
          const y = TOP + index * ROW + (ROW - BAR) / 2;

          return (
            <g
              key={row.weekday}
              style={{ cursor: "pointer" }}
              onClick={() => onSelectWeekday(row.weekday)}
              onPointerEnter={() =>
                setHover({
                  x: LABEL_WIDTH + barWidth + 8,
                  y: y + BAR,
                  flip: LABEL_WIDTH + barWidth > width * 0.6,
                  value: `${row.total} contribution${row.total === 1 ? "" : "s"}`,
                  label: row.name,
                  note: `${row.average.toFixed(1)} per ${row.label}`,
                })
              }
              onPointerLeave={() => setHover(null)}
            >
              <text
                x={LABEL_WIDTH - 8}
                y={y + BAR - 3}
                textAnchor="end"
                fontSize="11"
                fontWeight={selected ? 700 : 400}
                fill={selected ? palette.textPrimary : palette.textSecondary}
              >
                {row.label}
              </text>

              {/* Full-width hit target: the bar alone is a thin thing to aim at,
                  and a zero-value weekday has no bar at all. */}
              <rect
                x={LABEL_WIDTH}
                y={TOP + index * ROW}
                width={Math.max(0, width - LABEL_WIDTH)}
                height={ROW}
                fill="transparent"
              />

              <rect
                x={LABEL_WIDTH}
                y={y}
                width={barWidth}
                height={BAR}
                rx="4"
                fill={selected ? palette.selection : palette.accent}
                fillOpacity={dimmed ? 0.35 : 1}
              />
              {/* Square off the baseline end: only the data end is rounded. */}
              {barWidth > 4 ? (
                <rect
                  x={LABEL_WIDTH}
                  y={y}
                  width={4}
                  height={BAR}
                  fill={selected ? palette.selection : palette.accent}
                  fillOpacity={dimmed ? 0.35 : 1}
                />
              ) : null}

              <text
                x={LABEL_WIDTH + barWidth + 6}
                y={y + BAR - 3}
                fontSize="11"
                fill={dimmed ? palette.textMuted : palette.textSecondary}
              >
                {row.total}
              </text>
            </g>
          );
        })}
      </svg>
      <Tooltip point={hover} palette={palette} />
    </div>
  );
}

export default WeekdayChart;
