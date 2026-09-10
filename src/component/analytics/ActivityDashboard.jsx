import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  buildContributionsUrl,
  parseContributions,
} from "../github/contributions.js";
import {
  RANGE_PRESETS,
  WEEKDAY_LABELS,
  applySelection,
  calendarGrid,
  clampRange,
  hasActiveFilter,
  heatThresholds,
  presetRange,
  rangeIncluding,
  seriesBounds,
  sortRows,
  summarizeSlice,
  tableRows,
  toCsv,
  toWeekBins,
  weekdayTotals,
  weekdayOf,
} from "./model.js";
import { PALETTE } from "./palette.js";
import {
  composeSvg,
  downloadBlob,
  downloadText,
  exportFileName,
  svgToPngBlob,
} from "./exportView.js";
import TimelineChart from "./TimelineChart.jsx";
import CalendarHeatmap from "./CalendarHeatmap.jsx";
import WeekdayChart from "./WeekdayChart.jsx";
import "./analytics.css";

const USERNAME = "greentea524";
const YEAR = "last";
const ROWS_PER_PAGE = [25, 50, 100];
const NUMBER = new Intl.NumberFormat();
const LONG_DATE = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
});

async function fetchContributions({ signal }) {
  const response = await fetch(buildContributionsUrl(USERNAME, YEAR), { signal });
  if (!response.ok) {
    throw new Error(`GitHub contributions request failed (${response.status})`);
  }
  return parseContributions(await response.json());
}

function formatDate(iso) {
  const [year, month, day] = iso.split("-").map(Number);
  return LONG_DATE.format(new Date(year, month - 1, day));
}

/**
 * One screen over one dataset, with views that know about each other.
 *
 * All coordination lives in `selection` — every chart renders from it and every
 * chart writes to it. The derivation lives in model.js; this component holds
 * state, lays panels out, and nothing else.
 */
function ActivityDashboard() {
  const palette = PALETTE;

  const { data, isPending, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["github-contributions", USERNAME, YEAR],
    queryFn: fetchContributions,
    staleTime: 60 * 60 * 1000,
    retry: 1,
  });

  const series = useMemo(() => data ?? [], [data]);
  const bounds = useMemo(() => seriesBounds(series), [series]);

  const [selection, setSelection] = useState({
    range: null,
    weekday: null,
    day: null,
  });
  const [sort, setSort] = useState({ key: "date", direction: "desc" });
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState(null);

  // The range only becomes meaningful once the series arrives.
  useEffect(() => {
    if (bounds && !selection.range) {
      setSelection((current) => ({ ...current, range: bounds }));
    }
  }, [bounds, selection.range]);

  const range = selection.range ?? bounds;
  const effective = useMemo(
    () => ({ ...selection, range }),
    [selection, range],
  );

  const timelineRef = useRef(null);
  const calendarRef = useRef(null);
  const weekdayRef = useRef(null);

  const weekBins = useMemo(() => toWeekBins(series), [series]);
  const grid = useMemo(() => calendarGrid(series), [series]);
  const thresholds = useMemo(() => heatThresholds(series), [series]);

  const filtered = useMemo(
    () => applySelection(series, effective),
    [series, effective],
  );
  // Cross-filtering: the weekday chart is scoped by the range and the drill-down
  // but never by its own selection.
  const weekdayScope = useMemo(
    () => applySelection(series, effective, "weekday"),
    [series, effective],
  );
  const weekdayRows = useMemo(
    () => weekdayTotals(weekdayScope),
    [weekdayScope],
  );

  const stats = useMemo(() => summarizeSlice(filtered), [filtered]);
  const rows = useMemo(() => tableRows(filtered), [filtered]);
  const sortedRows = useMemo(
    () => sortRows(rows, sort.key, sort.direction),
    [rows, sort],
  );

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / rowsPerPage));
  const safePage = Math.min(page, totalPages);
  const pageRows = sortedRows.slice(
    (safePage - 1) * rowsPerPage,
    safePage * rowsPerPage,
  );

  useEffect(() => {
    setPage(1);
  }, [effective, rowsPerPage]);

  const setRange = useCallback(
    (next) => {
      setSelection((current) => ({
        ...current,
        range: clampRange(next, bounds),
        // A new window supersedes a pinned day that may fall outside it.
        day: null,
      }));
    },
    [bounds],
  );

  const toggleWeekday = useCallback((weekday) => {
    setSelection((current) => ({
      ...current,
      weekday: current.weekday === weekday ? null : weekday,
      day: null,
    }));
  }, []);

  const toggleDay = useCallback(
    (day) => {
      setSelection((current) => {
        if (current.day === day) return { ...current, day: null };
        return {
          ...current,
          day,
          // Widen the window to reach the day, and drop a weekday filter that
          // would contradict it. Either left alone would select a day and then
          // filter it straight back out.
          range: clampRange(rangeIncluding(current.range ?? bounds, day), bounds),
          weekday:
            current.weekday !== null && current.weekday !== weekdayOf(day)
              ? null
              : current.weekday,
        };
      });
    },
    [bounds],
  );

  const reset = useCallback(() => {
    setSelection({ range: bounds, weekday: null, day: null });
  }, [bounds]);

  const handleSort = (key) => {
    setSort((current) => ({
      key,
      direction:
        current.key === key && current.direction === "desc" ? "asc" : "desc",
    }));
  };

  const selectionLabel = useMemo(() => {
    if (!range) return "";
    const parts = [`${formatDate(range.start)} – ${formatDate(range.end)}`];
    if (selection.weekday !== null) {
      parts.push(`${WEEKDAY_LABELS[selection.weekday]}s only`);
    }
    if (selection.day) parts.push(`pinned to ${formatDate(selection.day)}`);
    return parts.join(" · ");
  }, [range, selection.weekday, selection.day]);

  const exportCsv = () => {
    downloadText(
      toCsv(
        ["Date", "Weekday", "Contributions"],
        sortedRows.map((row) => [row.date, row.weekday, row.count]),
      ),
      exportFileName("csv", range),
    );
  };

  const exportPng = async () => {
    setExporting(true);
    setExportError(null);
    try {
      const { svg, width, height } = composeSvg(
        [timelineRef.current, calendarRef.current, weekdayRef.current],
        {
          background: palette.surface,
          caption: `GitHub activity — ${selectionLabel}`,
          captionColor: palette.textSecondary,
        },
      );
      const blob = await svgToPngBlob(svg, {
        width,
        height,
        background: palette.surface,
      });
      downloadBlob(blob, exportFileName("png", range));
    } catch (pngError) {
      setExportError(pngError.message);
    } finally {
      setExporting(false);
    }
  };

  const activePreset = useMemo(() => {
    if (!bounds || !range) return null;
    return (
      RANGE_PRESETS.find((preset) => {
        const candidate = presetRange(series, preset.days);
        return (
          candidate &&
          candidate.start === range.start &&
          candidate.end === range.end
        );
      })?.id ?? null
    );
  }, [bounds, range, series]);

  if (isPending) {
    return (
      <div className="viz-dashboard">
        <p className="viz-state" role="status">
          Loading contribution history…
        </p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="viz-dashboard">
        <div className="viz-state" role="alert">
          <p>
            Could not load contribution data
            {error?.message ? `: ${error.message}` : "."}
          </p>
          <button
            type="button"
            className="viz-button"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            {isFetching ? "Retrying…" : "Try again"}
          </button>
        </div>
      </div>
    );
  }

  if (series.length === 0 || !bounds) {
    return (
      <div className="viz-dashboard">
        <p className="viz-state" role="status">
          No contribution activity found for the last year.
        </p>
      </div>
    );
  }

  const filtersActive = hasActiveFilter(effective, bounds);

  return (
    <div className="viz-dashboard">
      <header className="viz-panel viz-header">
        <div>
          <h4 className="viz-title">GitHub Activity</h4>
          <p className="viz-copy">
            Every commit, pull request, issue and review by{" "}
            <a
              href={`https://github.com/${USERNAME}`}
              target="_blank"
              rel="noreferrer"
            >
              @{USERNAME}
            </a>{" "}
            over the last year. Drag the timeline, pick a weekday, or click a day
            — every view below follows the same selection.
          </p>
        </div>

        <div className="viz-figures">
          <div className="viz-hero">
            <span className="viz-hero-label">Contributions in view</span>
            <strong className="viz-hero-value">{NUMBER.format(stats.total)}</strong>
            <span className="viz-hero-note">{selectionLabel}</span>
          </div>

          <dl className="viz-stats">
            <div className="viz-stat">
              <dt>Active days</dt>
              <dd>
                {NUMBER.format(stats.activeDays)}
                <span className="viz-stat-sub">of {NUMBER.format(stats.days)}</span>
              </dd>
            </div>
            <div className="viz-stat">
              <dt>Per day</dt>
              <dd>{stats.perDay.toFixed(1)}</dd>
            </div>
            <div className="viz-stat">
              <dt>Busiest day</dt>
              <dd>
                {stats.busiest ? NUMBER.format(stats.busiest.count) : "—"}
                {stats.busiest ? (
                  <span className="viz-stat-sub">
                    {formatDate(stats.busiest.date)}
                  </span>
                ) : null}
              </dd>
            </div>
          </dl>
        </div>
      </header>

      <div className="viz-filters" role="group" aria-label="Filters">
        <div className="viz-presets">
          {RANGE_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className="viz-button"
              aria-pressed={activePreset === preset.id}
              onClick={() => setRange(presetRange(series, preset.days))}
            >
              {preset.label}
            </button>
          ))}
        </div>

        <div className="viz-custom-range">
          <label>
            <span>From</span>
            <input
              type="date"
              value={range.start}
              min={bounds.start}
              max={range.end}
              onChange={(event) =>
                event.target.value &&
                setRange({ start: event.target.value, end: range.end })
              }
            />
          </label>
          <label>
            <span>To</span>
            <input
              type="date"
              value={range.end}
              min={range.start}
              max={bounds.end}
              onChange={(event) =>
                event.target.value &&
                setRange({ start: range.start, end: event.target.value })
              }
            />
          </label>
        </div>

        <div className="viz-filter-actions">
          <button
            type="button"
            className="viz-button"
            onClick={reset}
            disabled={!filtersActive}
          >
            Reset
          </button>
          <button type="button" className="viz-button" onClick={exportCsv}>
            <i className="fa fa-download" aria-hidden="true" /> CSV
          </button>
          <button
            type="button"
            className="viz-button"
            onClick={exportPng}
            disabled={exporting}
          >
            <i className="fa fa-image" aria-hidden="true" />{" "}
            {exporting ? "Rendering…" : "PNG"}
          </button>
        </div>
      </div>

      {filtersActive ? (
        <p className="viz-selection-note" role="status">
          Showing <strong>{NUMBER.format(filtered.length)}</strong> of{" "}
          {NUMBER.format(series.length)} days — {selectionLabel}.
        </p>
      ) : null}

      {exportError ? (
        <p className="viz-selection-note viz-error" role="alert">
          {exportError}
        </p>
      ) : null}

      <section className="viz-panel">
        <h5 className="viz-panel-title">Weekly volume</h5>
        <p className="viz-panel-copy">
          Drag across the chart to select a range; click once to clear it.
        </p>
        <TimelineChart
          bins={weekBins}
          range={range}
          bounds={bounds}
          onRangeChange={setRange}
          palette={palette}
          svgRef={timelineRef}
        />
      </section>

      <section className="viz-panel">
        <div className="viz-panel-head">
          <div>
            <h5 className="viz-panel-title">Calendar</h5>
            <p className="viz-panel-copy">
              Click a day to pin the dashboard to it.
            </p>
          </div>
          <div className="viz-legend" aria-hidden="true">
            <span>Less</span>
            {palette.heat.map((color, index) => (
              <i
                key={color}
                style={{ background: color }}
                title={`Step ${index + 1}`}
              />
            ))}
            <span>More</span>
          </div>
        </div>
        <CalendarHeatmap
          grid={grid}
          thresholds={thresholds}
          selection={effective}
          onSelectDay={toggleDay}
          palette={palette}
          svgRef={calendarRef}
        />
        <p className="viz-panel-note">
          Steps are quantiles of this series, not fixed counts:{" "}
          {thresholds
            .map((edge, index) => {
              const next = thresholds[index + 1];
              return next ? `${edge}–${next - 1}` : `${edge}+`;
            })
            .join(", ")}{" "}
          contributions per day.
        </p>
      </section>

      <section className="viz-panel">
        <h5 className="viz-panel-title">By weekday</h5>
        <p className="viz-panel-copy">
          Totals within the selected range. Click a bar to filter.
        </p>
        <WeekdayChart
          rows={weekdayRows}
          selectedWeekday={selection.weekday}
          onSelectWeekday={toggleWeekday}
          palette={palette}
          svgRef={weekdayRef}
        />
      </section>

      <section className="viz-panel">
        <div className="viz-panel-head">
          <div>
            <h5 className="viz-panel-title">Days in view</h5>
            <p className="viz-panel-copy">
              Every number on this screen, one row per day.
            </p>
          </div>
          <label className="viz-page-size">
            <span>Rows per page</span>
            <select
              value={rowsPerPage}
              onChange={(event) => setRowsPerPage(Number(event.target.value))}
            >
              {ROWS_PER_PAGE.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="viz-table-wrap">
          <table className="table table-hover viz-table">
            <thead>
              <tr>
                {[
                  ["date", "Date"],
                  ["weekday", "Weekday"],
                  ["count", "Contributions"],
                ].map(([key, label]) => (
                  <th key={key} aria-sort={
                    sort.key === key
                      ? sort.direction === "asc"
                        ? "ascending"
                        : "descending"
                      : "none"
                  }>
                    <button type="button" onClick={() => handleSort(key)}>
                      {label}
                      {sort.key === key
                        ? sort.direction === "asc"
                          ? " ▲"
                          : " ▼"
                        : ""}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 ? (
                <tr>
                  <td colSpan={3} className="viz-table-empty">
                    No days match this selection.
                  </td>
                </tr>
              ) : (
                pageRows.map((row) => (
                  <tr key={row.date}>
                    <td>{formatDate(row.date)}</td>
                    <td>{row.weekday}</td>
                    <td>{NUMBER.format(row.count)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="viz-pagination">
          <button
            type="button"
            className="viz-button"
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            disabled={safePage === 1}
          >
            Previous
          </button>
          <span className="viz-page-status">
            Page {safePage} of {totalPages}
          </span>
          <button
            type="button"
            className="viz-button"
            onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
            disabled={safePage === totalPages}
          >
            Next
          </button>
        </div>
      </section>
    </div>
  );
}

export default ActivityDashboard;
