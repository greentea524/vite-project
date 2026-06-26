import React, { useMemo, useState } from "react";
import { Chart } from "react-google-charts";
import randomdata from "../assets/data.json";

const rowsPerPageOptions = [8, 12, 16];
const GROUP_START = 10;
const GROUP_END = 50;

function formatNumber(value, digits = 1) {
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  }).format(value);
}

function DataAnalytics({ theme }) {
  const [sortConfig, setSortConfig] = useState({
    key: "group",
    direction: "asc",
  });
  const [rowsPerPage, setRowsPerPage] = useState(8);
  const [page, setPage] = useState(1);

  const groupedRows = useMemo(() => {
    const prefixSets = new Map();

    for (let group = GROUP_START; group <= GROUP_END; group += 1) {
      prefixSets.set(group, new Set());
    }

    randomdata.forEach((value) => {
      const text = String(value);
      const prefix = text[0];
      const group = Number(text.slice(1));

      if (prefixSets.has(group)) {
        prefixSets.get(group).add(prefix);
      }
    });

    const totalPrefixes = new Set(randomdata.map((value) => String(value)[0])).size;
    let cumulative = 0;

    return Array.from(prefixSets.entries()).map(([group, prefixes]) => {
      const prefixCount = prefixes.size;
      const probability =
        totalPrefixes === 0 ? 0 : (prefixCount / totalPrefixes) * 100;
      cumulative += probability;

      return {
        group,
        prefixCount,
        prefixes: Array.from(prefixes).sort().join(", "),
        probability,
        cumulativeProbability: cumulative,
      };
    });
  }, []);

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
      ["Group Number", "Probability (%)"],
      ...groupedRows.map((row) => [
        String(row.group),
        Number(row.probability.toFixed(2)),
      ]),
    ],
    [groupedRows],
  );

  const chartOptions = useMemo(
    () => ({
      title: "Chance of Being Called In by Group",
      titleTextStyle: {
        fontSize: 18,
        bold: true,
      },
      legend: { position: "none" },
      colors: ["#0d6efd"],
      chartArea: {
        left: 70,
        top: 50,
        right: 24,
        bottom: 80,
        width: "88%",
        height: "72%",
      },
      hAxis: {
        title: "Group Number",
        slantedText: false,
        textStyle: { fontSize: 11 },
      },
      vAxis: {
        title: "Probability (%)",
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

  const totalPrefixes = new Set(randomdata.map((value) => String(value)[0])).size;
  const mostLikelyGroup =
    groupedRows.reduce(
      (best, row) => (row.probability > best.probability ? row : best),
      groupedRows[0],
    ) || groupedRows[0];

  return (
    <div className="data-analytics">
      <div className="data-analytics-hero">
        <div>
          <h4 className="data-analytics-title">Group Number Probability</h4>
          <p className="data-analytics-copy">
            Chance of a group being called in, based on how many distinct
            first-digit subsets include it.
          </p>
        </div>
        <div className="data-analytics-summary">
          <div className="data-summary-card">
            <span>First-digit subsets</span>
            <strong>{formatNumber(totalPrefixes, 0)}</strong>
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
            <h5 className="data-table-title">Probability table</h5>
            <p className="data-table-copy">
              Sort the groups and page through the distribution.
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
                    Group{sortIndicator("group")}
                  </button>
                </th>
                <th>
                  <button type="button" onClick={() => handleSort("prefixCount")}>
                    Subsets{sortIndicator("prefixCount")}
                  </button>
                </th>
                <th>
                  <button type="button" onClick={() => handleSort("probability")}>
                    Probability{sortIndicator("probability")}
                  </button>
                </th>
                <th>
                  <button
                    type="button"
                    onClick={() => handleSort("cumulativeProbability")}
                  >
                    Cumulative{sortIndicator("cumulativeProbability")}
                  </button>
                </th>
                <th>
                  <button type="button" onClick={() => handleSort("prefixes")}>
                    Prefixes{sortIndicator("prefixes")}
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {currentRows.map((row) => (
                <tr key={row.group}>
                  <td>{row.group}</td>
                  <td>
                    {formatNumber(row.prefixCount, 0)} / {formatNumber(totalPrefixes, 0)}
                  </td>
                  <td>{formatNumber(row.probability, 1)}%</td>
                  <td>{formatNumber(row.cumulativeProbability, 1)}%</td>
                  <td>{row.prefixes || "--"}</td>
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
