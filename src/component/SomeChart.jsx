import React, { useEffect, useMemo, useState } from "react";
import { Chart } from "react-google-charts";
import randomdata from "../assets/data.json";

const tableOptions = {
  showRowNumber: true,
  width: "100%",
  height: "100%",
};

function SomeChart({ theme }) {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.innerWidth <= 768;
  });
  const [chartType, setChartType] = useState("AreaChart");
  const isWindows7Theme = theme === "7.css";

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const someData = useMemo(() => {
    const baseData = [["Element", "Percentage"]];
    const groupLabel = numberRange(10, 50);

    const randoObject = groupLabel.reduce((acc, curr) => {
      acc[curr] = 0;
      return acc;
    }, {});

    randomdata.forEach((curr) => {
      const key = curr.toString().substring(1);
      if (randoObject[key] !== undefined) {
        randoObject[key] += 1;
      }
    });

    const someResult = Object.keys(randoObject).map((key) => [
      Number(key),
      randoObject[key],
    ]);

    const weeks = randoObject[10] || 1;
    someResult.forEach((value) => {
      if (!isNaN(value[0])) {
        const percentage = (value[1] / weeks) * 100;
        baseData.push([value[0], Math.round(percentage)]);
      }
    });

    return baseData;
  }, []);

  const someOptions = useMemo(
    () => ({
      title: isMobile ? "Performance" : "Company Performances",
      legend: { position: "none" },
      curveType: "function",
      pointSize: isMobile ? 4 : 6,
      chartArea: isMobile
        ? {
            left: 46,
            right: 12,
            top: 40,
            bottom: 72,
            width: "84%",
            height: "66%",
          }
        : {
            left: 60,
            right: 20,
            top: 50,
            bottom: 70,
            width: "92%",
            height: isWindows7Theme ? "75%" : "79%",
          },
      hAxis: {
        gridlines: { count: isMobile ? 8 : 25 },
        slantedText: isMobile,
        slantedTextAngle: isMobile ? 35 : 0,
        textStyle: { fontSize: isMobile ? 10 : 12 },
      },
      vAxis: {
        textStyle: { fontSize: isMobile ? 10 : 12 },
      },
    }),
    [isMobile, isWindows7Theme],
  );

  const chartTypeOptions = [
    { value: "LineChart", label: "Line" },
    { value: "ColumnChart", label: "Column" },
    { value: "AreaChart", label: "Area" },
  ];

  return (
    <div
      className="container-fluid mt-2 px-2 px-md-4"
      style={{ maxWidth: "1280px" }}
    >
      <div
        className="d-flex justify-content-end align-items-center mb-2"
        style={{ gap: "0.5rem" }}
      >
        <label htmlFor="chart-type-select" style={{ marginBottom: 0 }}>
          Chart Type:
        </label>
        <select
          id="chart-type-select"
          value={chartType}
          onChange={(e) => setChartType(e.target.value)}
        >
          {chartTypeOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
      <div style={{ overflowX: "auto" }}>
        <div style={{ minWidth: isMobile ? "320px" : "auto" }}>
          <Chart
            chartType={chartType}
            data={someData}
            options={someOptions}
            width="100%"
            height={isMobile ? "320px" : isWindows7Theme ? "540px" : "620px"}
          />
        </div>
      </div>
      <hr></hr>

      <div className="row">
        <div className="col-12">
          <div style={{ overflowX: "auto" }}>
            <Chart
              chartType="Table"
              data={someData}
              options={tableOptions}
              width="100%"
              height={isMobile ? "320px" : isWindows7Theme ? "250px" : "300px"}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
function numberRange(start, end) {
  return new Array(end + 1 - start).fill().map((d, i) => i + start);
}
export default SomeChart;
