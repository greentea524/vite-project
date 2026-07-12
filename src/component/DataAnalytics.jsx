import React, { useMemo, useState } from "react";
import { Chart } from "react-google-charts";
import randomdata from "../assets/data.json";

const rowsPerPageOptions = [25, 50, 100];
const GROUP_START = 10;
const GROUP_END = 50;
const NUMBER_FORMATTERS = {
  0: new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }),
  1: new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  }),
};

function formatNumber(value, digits = 1) {
  const formatter = NUMBER_FORMATTERS[digits] || NUMBER_FORMATTERS[1];
  return formatter.format(value);
}

function DataAnalytics({ theme }) {
  const [sortConfig, setSortConfig] = useState({
    key: "group",
    direction: "asc",
  });
  const [rowsPerPage, setRowsPerPage] = useState(100);
  const [page, setPage] = useState(1);

  const groupedData = useMemo(() => {
    const groupWeekCounts = new Map();

    for (let group = GROUP_START; group <= GROUP_END; group += 1) {
      groupWeekCounts.set(group, 0);
    }

    let totalWeeks = 0;
    let currentWeekPrefix = null;
    let currentWeekGroups = new Set();

    const flushWeek = () => {
      if (currentWeekPrefix === null) {
        return;
      }

      totalWeeks += 1;
      currentWeekGroups.forEach((group) => {
        groupWeekCounts.set(group, groupWeekCounts.get(group) + 1);
      });
    };

    randomdata.forEach((value) => {
      const text = String(value);
      const weekPrefix = text[0];
      const group = Number(text.slice(1));

      if (currentWeekPrefix === null) {
        currentWeekPrefix = weekPrefix;
      } else if (weekPrefix !== currentWeekPrefix) {
        flushWeek();
        currentWeekPrefix = weekPrefix;
        currentWeekGroups = new Set();
      }

      if (groupWeekCounts.has(group)) {
        currentWeekGroups.add(group);
      }
    });

    flushWeek();

    return {
      totalWeeks,
      rows: Array.from(groupWeekCounts.entries()).map(([group, weekCount]) => {
        const probability =
          totalWeeks === 0 ? 0 : (weekCount / totalWeeks) * 100;

        return {
          group,
          weekCount,
          probability,
        };
      }),
    };
  }, []);

  const groupedRows = groupedData.rows;
  const totalWeeks = groupedData.totalWeeks;

  const sortedRows = useMemo(() => {
    const rows = [...groupedRows];

    rows.sort((a, b) => {
      const aValue = a[sortConfig.key];
      const bValue = b[sortConfig.key];

      if (aValue < bValue) return sortConfig.direction === "asc" ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === "asc" ? 1 : -1;
      return 0;
    });

    return rows;
  }, [groupedRows, sortConfig]);

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / rowsPerPage));
  const currentRows = sortedRows.slice(
    (page - 1) * rowsPerPage,
    page * rowsPerPage,
  );

  const chartData = useMemo(
    () => [
      ["Index", "Rate (%)"],
      ...groupedRows.map((row) => [
        String(row.group),
        Number(row.probability.toFixed(2)),
      ]),
    ],
    [groupedRows],
  );

  const chartOptions = useMemo(
    () => ({
      title: "Weekly Pattern Overview",
      titleTextStyle: {
        fontSize: 18,
        bold: true,
      },
      legend: { position: "none" },
      colors: ["#0d6efd"],
      chartArea: {
        left: 60,
        top: 50,
        right: 30,
        bottom: 60,
      },
      hAxis: {
        title: "Index",
        slantedText: false,
        textStyle: { fontSize: 11 },
      },
      vAxis: {
        title: "Rate (%)",
        format: "0.0'%'",
        textStyle: { fontSize: 11 },
      },
      backgroundColor: "transparent",
      height: theme === "7.css" ? 520 : 480,
      bar: { groupWidth: "70%" },
    }),
    [theme],
  );

  const handleSort = (key) => {
    setSortConfig((current) => ({
      key,
      direction:
        current.key === key && current.direction === "asc" ? "desc" : "asc",
    }));
    setPage(1);
  };

  const handleRowsPerPageChange = (event) => {
    setRowsPerPage(Number(event.target.value));
    setPage(1);
  };

  const sortIndicator = (key) => {
    if (sortConfig.key !== key) return "";
    return sortConfig.direction === "asc" ? " ▲" : " ▼";
  };

  const mostLikelyGroup =
    groupedRows.reduce(
      (best, row) => (row.probability > best.probability ? row : best),
      groupedRows[0],
    ) || groupedRows[0];

  return (
    <div className="data-analytics">
      <div className="data-analytics-hero">
        <div>
          <h4 className="data-analytics-title">Weekly Pattern Summary</h4>
          <p className="data-analytics-copy">
            Chance of a group being called in, based on how many weeks it
            appears in.
          </p>
        </div>
        <div className="data-analytics-summary">
          <div className="data-summary-card">
            <span>Total weeks</span>
            <strong>{formatNumber(totalWeeks, 0)}</strong>
          </div>
          <div className="data-summary-card">
            <span>Most likely group</span>
            <strong>{mostLikelyGroup.group}</strong>
          </div>
          <div className="data-summary-card">
            <span>Highest probability</span>
            <strong>{formatNumber(mostLikelyGroup.probability, 1)}%</strong>
          </div>
        </div>
      </div>

      <div className="data-chart-panel">
        <Chart
          chartType="ColumnChart"
          data={chartData}
          options={chartOptions}
          width="100%"
          height={theme === "7.css" ? "520px" : "480px"}
        />
      </div>

      <div className="data-table-panel">
        <div className="data-table-toolbar">
          <div>
            <h5 className="data-table-title">Pattern table</h5>
            <p className="data-table-copy">
              Sort the groups and page through the week distribution.
            </p>
          </div>
          <label className="data-page-size">
            Rows per page
            <select value={rowsPerPage} onChange={handleRowsPerPageChange}>
              {rowsPerPageOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="data-table-wrap">
          <table className="table table-hover data-analytics-table">
            <thead>
              <tr>
                <th>
                  <button type="button" onClick={() => handleSort("group")}>
                    Index{sortIndicator("group")}
                  </button>
                </th>
                <th>
                  <button type="button" onClick={() => handleSort("weekCount")}>
                    Weeks{sortIndicator("weekCount")}
                  </button>
                </th>
                <th>
                  <button type="button" onClick={() => handleSort("probability")}>
                    Rate{sortIndicator("probability")}
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {currentRows.map((row) => (
                <tr key={row.group}>
                  <td>{row.group}</td>
                  <td>{formatNumber(row.weekCount, 0)}</td>
                  <td>{formatNumber(row.probability, 1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="data-table-pagination">
          <button
            type="button"
            className="data-page-button"
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            disabled={page === 1}
          >
            Previous
          </button>
          <span className="data-page-status">
            Page {page} of {totalPages}
          </span>
          <button
            type="button"
            className="data-page-button"
            onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
            disabled={page === totalPages}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}

export default DataAnalytics;
