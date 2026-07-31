import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Chart } from "react-google-charts";
import {
  buildContributionsUrl,
  parseContributions,
  summarize,
  toCalendarRows,
  toLocalDate,
  toTrendRows,
  TREND_WINDOW_DAYS,
} from "./github/contributions.js";

const USERNAME = "greentea524";
const YEAR = "last";
const NUMBER_FORMAT = new Intl.NumberFormat();
const DATE_FORMAT = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
});

async function fetchContributions({ signal }) {
  const response = await fetch(buildContributionsUrl(USERNAME, YEAR), {
    signal,
  });

  if (!response.ok) {
    throw new Error(
      `GitHub contributions request failed (${response.status})`,
    );
  }

  return parseContributions(await response.json());
}

function GitHubCommitsChart({ theme }) {
  const [view, setView] = useState("calendar");

  const { data, isPending, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["github-contributions", USERNAME, YEAR],
    queryFn: fetchContributions,
    staleTime: 60 * 60 * 1000,
    retry: 1,
  });

  const series = data ?? [];
  const stats = useMemo(() => summarize(series), [series]);
  const calendarRows = useMemo(() => toCalendarRows(series), [series]);
  const trendRows = useMemo(() => toTrendRows(series), [series]);

  const calendarOptions = useMemo(
    () => ({
      title: "Daily contributions",
      calendar: {
        cellSize: 13,
        cellColor: {
          stroke: "rgba(127, 127, 127, 0.25)",
          strokeOpacity: 0.5,
          strokeWidth: 1,
        },
        monthOutlineColor: { stroke: "transparent" },
      },
      colorAxis: {
        minValue: 0,
        colors: ["#e9eef5", "#9be9a8", "#30a14e", "#216e39"],
      },
      noDataPattern: {
        backgroundColor: "#e9eef5",
        color: "#e9eef5",
      },
      backgroundColor: "transparent",
    }),
    [],
  );

  const trendOptions = useMemo(
    () => ({
      title: `${TREND_WINDOW_DAYS}-day rolling average`,
      titleTextStyle: { fontSize: 18, bold: true },
      legend: { position: "none" },
      colors: ["#0d6efd"],
      chartArea: { left: 60, top: 50, right: 30, bottom: 60 },
      hAxis: { format: "MMM yyyy", textStyle: { fontSize: 11 } },
      vAxis: {
        title: "Contributions / day",
        minValue: 0,
        textStyle: { fontSize: 11 },
      },
      backgroundColor: "transparent",
      height: theme === "7.css" ? 520 : 480,
    }),
    [theme],
  );

  const bestDayLabel = stats.bestDay
    ? `${NUMBER_FORMAT.format(stats.bestDay.count)} on ${DATE_FORMAT.format(
        toLocalDate(stats.bestDay.date),
      )}`
    : "—";

  const renderChart = () => {
    if (isPending) {
      return (
        <p className="data-chart-state" role="status">
          Loading contribution history…
        </p>
      );
    }

    if (isError) {
      return (
        <div className="data-chart-state" role="alert">
          <p>
            Could not load contribution data
            {error?.message ? `: ${error.message}` : "."}
          </p>
          <button
            type="button"
            className="data-page-button"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            {isFetching ? "Retrying…" : "Try again"}
          </button>
        </div>
      );
    }

    if (series.length === 0) {
      return (
        <p className="data-chart-state" role="status">
          No contribution activity found for the last year.
        </p>
      );
    }

    if (view === "calendar") {
      return (
        <Chart
          chartType="Calendar"
          data={calendarRows}
          options={calendarOptions}
          width="100%"
          height="260px"
        />
      );
    }

    return (
      <Chart
        chartType="LineChart"
        data={trendRows}
        options={trendOptions}
        width="100%"
        height={theme === "7.css" ? "520px" : "480px"}
      />
    );
  };

  return (
    <div className="data-analytics">
      <div className="data-analytics-hero">
        <div>
          <h4 className="data-analytics-title">GitHub Activity</h4>
          <p className="data-analytics-copy">
            Daily contributions for{" "}
            <a
              href={`https://github.com/${USERNAME}`}
              target="_blank"
              rel="noreferrer"
            >
              @{USERNAME}
            </a>{" "}
            over the last year. Counts include commits, pull requests, issues,
            and reviews.
          </p>
        </div>
        <div className="data-analytics-summary data-analytics-summary-quad">
          <div className="data-summary-card">
            <span>Total</span>
            <strong>{NUMBER_FORMAT.format(stats.total)}</strong>
          </div>
          <div className="data-summary-card">
            <span>Active days</span>
            <strong>{NUMBER_FORMAT.format(stats.activeDays)}</strong>
          </div>
          <div className="data-summary-card">
            <span>Current streak</span>
            <strong>{NUMBER_FORMAT.format(stats.currentStreak)}</strong>
          </div>
          <div className="data-summary-card">
            <span>Best day</span>
            <strong>{bestDayLabel}</strong>
          </div>
        </div>
      </div>

      <div className="data-chart-panel data-chart-panel-github">
        <div className="data-chart-toggle" role="group" aria-label="Chart view">
          <button
            type="button"
            className="data-page-button"
            aria-pressed={view === "calendar"}
            onClick={() => setView("calendar")}
          >
            Calendar
          </button>
          <button
            type="button"
            className="data-page-button"
            aria-pressed={view === "trend"}
            onClick={() => setView("trend")}
          >
            Trend
          </button>
        </div>
        {renderChart()}
      </div>
    </div>
  );
}

export default GitHubCommitsChart;
