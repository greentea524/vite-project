import React, { useMemo, useState } from "react";
import Tooltip from "./Tooltip.jsx";
import { useElementWidth } from "./useElementWidth.js";
import {
  WEEKDAY_SHORT,
  bucketOf,
  rampIndexOf,
  weekdayOf,
} from "./model.js";

const GUTTER = 30;
const TOP = 18;
const GAP = 2;
const MIN_CELL = 9;
const MAX_CELL = 15;

/**
 * Day grid for the whole series. Cells outside the current selection keep their
 * shape but lose their colour, so narrowing the range reads as focus rather
 * than as data disappearing.
 *
 * Clicking a day is the drill-down: it pins the dashboard to that one day, and
 * clicking it again releases it.
 */
function CalendarHeatmap({
  grid,
  thresholds,
  selection,
  onSelectDay,
  palette,
  svgRef,
}) {
  const [wrapRef, width] = useElementWidth(640);
  const [hover, setHover] = useState(null);

  const columns = grid.columns.length;
  const available = Math.max(120, width - GUTTER - 4);
  const cell = Math.min(
    MAX_CELL,
    Math.max(MIN_CELL, Math.floor(available / Math.max(1, columns)) - GAP),
  );
  const pitch = cell + GAP;

  // When the grid cannot fit even at the minimum cell size the SVG stays wide
  // and its wrapper scrolls — squeezing 53 weeks into a phone would render an
  // unreadable smear.
  const svgWidth = Math.max(width, GUTTER + columns * pitch + 4);
  const svgHeight = TOP + 7 * pitch + 6;

  const isDimmed = useMemo(() => {
    const { range, weekday, day } = selection;
    return (date) => {
      if (day) return date !== day;
      if (range && (date < range.start || date > range.end)) return true;
      if (weekday !== null && weekday !== undefined) {
        return weekdayOf(date) !== weekday;
      }
      return false;
    };
  }, [selection]);

  const fillFor = (count, dimmed) => {
    if (dimmed) return palette.empty;
    const bucket = bucketOf(count, thresholds);
    if (bucket === 0) return palette.empty;
    return palette.heat[rampIndexOf(bucket, thresholds.length)];
  };

  return (
    <div className="viz-plot viz-plot-scroll" ref={wrapRef}>
      <svg
        ref={svgRef}
        width={svgWidth}
        height={svgHeight}
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        role="img"
        aria-label="Contribution calendar. Each cell is one day; darker means more contributions."
      >
        <rect
          x="0"
          y="0"
          width={svgWidth}
          height={svgHeight}
          fill={palette.surface}
        />

        {grid.months.map((month) => (
          <text
            key={month.month}
            x={GUTTER + month.column * pitch}
            y={TOP - 6}
            fontSize="10"
            fill={palette.textMuted}
          >
            {month.label}
          </text>
        ))}

        {/* Mon / Wed / Fri only — labelling all seven crowds the gutter. */}
        {[1, 3, 5].map((weekday) => (
          <text
            key={weekday}
            x={GUTTER - 6}
            y={TOP + weekday * pitch + cell - 2}
            textAnchor="end"
            fontSize="10"
            fill={palette.textMuted}
          >
            {WEEKDAY_SHORT[weekday]}
          </text>
        ))}

        {grid.columns.map((column, columnIndex) =>
          column.cells.map((day, weekday) => {
            if (!day) return null;
            const dimmed = isDimmed(day.date);
            const pinned = selection.day === day.date;

            return (
              <rect
                key={day.date}
                x={GUTTER + columnIndex * pitch}
                y={TOP + weekday * pitch}
                width={cell}
                height={cell}
                rx="2"
                fill={fillFor(day.count, dimmed)}
                stroke={pinned ? palette.selection : "transparent"}
                strokeWidth={pinned ? 2 : 0}
                style={{ cursor: "pointer" }}
                onClick={() => onSelectDay(day.date)}
                onPointerEnter={(event) => {
                  const rect =
                    event.currentTarget.ownerSVGElement.getBoundingClientRect();
                  const box = event.currentTarget.getBoundingClientRect();
                  setHover({
                    x: box.left - rect.left + cell / 2,
                    y: box.top - rect.top - 4,
                    flip: box.left - rect.left > svgWidth * 0.6,
                    value: `${day.count} contribution${day.count === 1 ? "" : "s"}`,
                    label: day.date,
                    note: pinned ? "Click to clear" : "Click to pin this day",
                  });
                }}
                onPointerLeave={() => setHover(null)}
              />
            );
          }),
        )}
      </svg>
      <Tooltip point={hover} palette={palette} />
    </div>
  );
}

export default CalendarHeatmap;
