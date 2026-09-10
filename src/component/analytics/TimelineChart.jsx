import React, { useCallback, useMemo, useRef, useState } from "react";
import Tooltip from "./Tooltip.jsx";
import { useElementWidth } from "./useElementWidth.js";
import { MONTH_SHORT, isFullRange, orderRange } from "./model.js";

const HEIGHT = 168;
const PAD = { top: 16, right: 14, bottom: 26, left: 46 };
const DRAG_THRESHOLD = 3;

function niceCeiling(value) {
  if (value <= 5) return Math.max(1, value);
  const magnitude = 10 ** Math.floor(Math.log10(value));
  return Math.ceil(value / magnitude) * magnitude;
}

/**
 * Weekly totals across the whole series, with the selected window kept bright
 * and everything outside it washed back.
 *
 * This is the dashboard's coordinating control: dragging across it sets the
 * range every other view reads. It always draws the *full* series — a timeline
 * that filtered itself would leave nothing to drag back out to.
 */
function TimelineChart({
  bins,
  range,
  bounds,
  onRangeChange,
  palette,
  svgRef,
}) {
  const [wrapRef, width] = useElementWidth(640);
  const [hover, setHover] = useState(null);
  const [drag, setDrag] = useState(null);
  const plotRef = useRef(null);
  const originRef = useRef(null);

  const plotWidth = Math.max(120, width - PAD.left - PAD.right);
  const plotHeight = HEIGHT - PAD.top - PAD.bottom;

  const max = useMemo(
    () => niceCeiling(bins.reduce((best, bin) => Math.max(best, bin.total), 0)),
    [bins],
  );

  const step = bins.length > 0 ? plotWidth / bins.length : plotWidth;
  const xOf = useCallback(
    (index) => PAD.left + index * step + step / 2,
    [step],
  );
  const yOf = useCallback(
    (value) => PAD.top + plotHeight - (value / max) * plotHeight,
    [max, plotHeight],
  );

  const linePath = useMemo(() => {
    if (bins.length === 0) return "";
    return bins
      .map((bin, index) => `${index === 0 ? "M" : "L"}${xOf(index)} ${yOf(bin.total)}`)
      .join(" ");
  }, [bins, xOf, yOf]);

  const areaPath = useMemo(() => {
    if (bins.length === 0) return "";
    const baseline = PAD.top + plotHeight;
    return `${linePath} L${xOf(bins.length - 1)} ${baseline} L${xOf(0)} ${baseline} Z`;
  }, [bins.length, linePath, xOf, plotHeight]);

  const monthTicks = useMemo(() => {
    const ticks = [];
    let lastMonth = null;
    bins.forEach((bin, index) => {
      const month = bin.weekStart.slice(0, 7);
      if (month !== lastMonth) {
        lastMonth = month;
        ticks.push({
          index,
          label: MONTH_SHORT[Number(month.slice(5, 7)) - 1],
        });
      }
    });
    // Thin the ticks out until they stop colliding at narrow widths.
    const every = Math.ceil((ticks.length * 34) / Math.max(1, plotWidth));
    return ticks.filter((_, index) => index % Math.max(1, every) === 0);
  }, [bins, plotWidth]);

  const indexAt = useCallback(
    (clientX) => {
      const rect = plotRef.current?.getBoundingClientRect();
      if (!rect || bins.length === 0) return 0;
      const offset = clientX - rect.left;
      return Math.min(
        bins.length - 1,
        Math.max(0, Math.floor(offset / step)),
      );
    },
    [bins.length, step],
  );

  const commit = useCallback(
    (fromIndex, toIndex) => {
      if (bins.length === 0) return;
      const low = Math.min(fromIndex, toIndex);
      const high = Math.max(fromIndex, toIndex);
      const next = orderRange(bins[low].weekStart, bins[high].weekEnd);
      onRangeChange({
        start: next.start < bounds.start ? bounds.start : next.start,
        end: next.end > bounds.end ? bounds.end : next.end,
      });
    },
    [bins, bounds, onRangeChange],
  );

  const handlePointerDown = (event) => {
    if (bins.length === 0 || event.button !== 0) return;
    const index = indexAt(event.clientX);
    originRef.current = { index, clientX: event.clientX, moved: false };
    setDrag({ from: index, to: index });
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handlePointerMove = (event) => {
    if (bins.length === 0) return;
    const index = indexAt(event.clientX);

    if (originRef.current) {
      if (Math.abs(event.clientX - originRef.current.clientX) > DRAG_THRESHOLD) {
        originRef.current.moved = true;
      }
      setDrag({ from: originRef.current.index, to: index });
      return;
    }

    const bin = bins[index];
    setHover({
      index,
      x: xOf(index),
      y: yOf(bin.total) - 10,
      flip: xOf(index) > width * 0.6,
      value: `${bin.total} contribution${bin.total === 1 ? "" : "s"}`,
      label: `Week of ${bin.weekStart}`,
      note: "Drag to select a range",
    });
  };

  const handlePointerUp = (event) => {
    const origin = originRef.current;
    originRef.current = null;
    setDrag(null);
    if (!origin) return;

    event.currentTarget.releasePointerCapture?.(event.pointerId);

    if (origin.moved) {
      commit(origin.index, indexAt(event.clientX));
    } else {
      // A click with no drag means "show me everything again".
      onRangeChange(bounds);
    }
  };

  const handlePointerLeave = () => {
    setHover(null);
  };

  const selectionBand = useMemo(() => {
    if (!range || bins.length === 0) return null;
    // Nothing is filtered, so there is no band to draw — outlining the whole
    // plot would claim a selection the reader never made.
    if (isFullRange(range, bounds)) return null;
    const first = bins.findIndex((bin) => bin.weekEnd >= range.start);
    let last = -1;
    bins.forEach((bin, index) => {
      if (bin.weekStart <= range.end) last = index;
    });
    if (first === -1 || last === -1 || last < first) return null;
    return {
      x: PAD.left + first * step,
      width: Math.max(step, (last - first + 1) * step),
    };
  }, [bins, bounds, range, step]);

  const dragBand = useMemo(() => {
    if (!drag) return null;
    const low = Math.min(drag.from, drag.to);
    const high = Math.max(drag.from, drag.to);
    return { x: PAD.left + low * step, width: (high - low + 1) * step };
  }, [drag, step]);

  const band = dragBand ?? selectionBand;

  return (
    <div className="viz-plot" ref={wrapRef}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${HEIGHT}`}
        width={width}
        height={HEIGHT}
        role="img"
        aria-label={`Weekly contributions from ${bounds.start} to ${bounds.end}. Drag across the chart to select a date range.`}
      >
        <rect x="0" y="0" width={width} height={HEIGHT} fill={palette.surface} />

        {[0, 0.5, 1].map((fraction) => {
          const value = max * fraction;
          return (
            <g key={fraction}>
              <line
                x1={PAD.left}
                x2={PAD.left + plotWidth}
                y1={yOf(value)}
                y2={yOf(value)}
                stroke={palette.grid}
                strokeWidth="1"
              />
              <text
                x={PAD.left - 8}
                y={yOf(value) + 4}
                textAnchor="end"
                fontSize="11"
                fill={palette.textMuted}
              >
                {Math.round(value)}
              </text>
            </g>
          );
        })}

        <path d={areaPath} fill={palette.accent} fillOpacity="0.1" />
        <path
          d={linePath}
          fill="none"
          stroke={palette.accent}
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* Wash back what is outside the selection rather than hiding it, so
            the reader keeps the whole year as context for the slice. */}
        {band ? (
          <>
            <rect
              x={PAD.left}
              y={PAD.top}
              width={Math.max(0, band.x - PAD.left)}
              height={plotHeight}
              fill={palette.outOfRange}
            />
            <rect
              x={band.x + band.width}
              y={PAD.top}
              width={Math.max(0, PAD.left + plotWidth - band.x - band.width)}
              height={plotHeight}
              fill={palette.outOfRange}
            />
            <rect
              x={band.x}
              y={PAD.top}
              width={band.width}
              height={plotHeight}
              fill={palette.brushFill}
              stroke={palette.selection}
              strokeWidth="1.5"
            />
          </>
        ) : null}

        {monthTicks.map((tick) => (
          <text
            key={`${tick.index}-${tick.label}`}
            x={xOf(tick.index)}
            y={HEIGHT - 8}
            textAnchor="middle"
            fontSize="11"
            fill={palette.textMuted}
          >
            {tick.label}
          </text>
        ))}

        {hover && !drag ? (
          <>
            <line
              x1={xOf(hover.index)}
              x2={xOf(hover.index)}
              y1={PAD.top}
              y2={PAD.top + plotHeight}
              stroke={palette.axis}
              strokeWidth="1"
            />
            <circle
              cx={xOf(hover.index)}
              cy={yOf(bins[hover.index].total)}
              r="4.5"
              fill={palette.accent}
              stroke={palette.surface}
              strokeWidth="2"
            />
          </>
        ) : null}

        <rect
          ref={plotRef}
          x={PAD.left}
          y={PAD.top}
          width={plotWidth}
          height={plotHeight}
          fill="transparent"
          style={{ cursor: "ew-resize", touchAction: "none" }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerLeave}
          onPointerCancel={handlePointerUp}
        />
      </svg>
      <Tooltip point={drag ? null : hover} palette={palette} />
    </div>
  );
}

export default TimelineChart;
