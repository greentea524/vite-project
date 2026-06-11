import React, { useEffect, useMemo, useState } from "react";
import { Chart } from "react-google-charts";

const data = [
  ["Year", "Sales", "Expenses"],
  ["2004", 1000, 400],
  ["2005", 1170, 460],
  ["2006", 660, 1120],
  ["2008", 1030, 540],
  ["2009", 1000, 400],
  ["2010", 1170, 460],
  ["2011", 660, 1120],
  ["2012", 1030, 540],
];

const options = {
  title: "Company Performance",
  curveType: "function",
  legend: { position: "bottom" },
};

function MyChart() {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.innerWidth <= 768;
  });

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const chartOptions = useMemo(
    () => ({
      ...options,
      title: isMobile ? "Performance" : options.title,
      chartArea: isMobile
        ? {
            left: 46,
            right: 12,
            top: 36,
            bottom: 72,
            width: "84%",
            height: "68%",
          }
        : {
            left: 60,
            right: 20,
            top: 50,
            bottom: 70,
            width: "85%",
            height: "70%",
          },
      legend: {
        position: "bottom",
        alignment: "center",
        textStyle: { fontSize: isMobile ? 11 : 13 },
      },
      hAxis: {
        slantedText: isMobile,
        slantedTextAngle: isMobile ? 35 : 0,
        textStyle: { fontSize: isMobile ? 10 : 12 },
      },
      vAxis: {
        textStyle: { fontSize: isMobile ? 10 : 12 },
      },
      pointSize: isMobile ? 5 : 7,
    }),
    [isMobile],
  );

  return (
    <div
      style={{
        width: "100%",
        maxWidth: "960px",
        margin: "0 auto",
        padding: isMobile ? "0 0.25rem" : "0 0.75rem",
        overflowX: "auto",
      }}
    >
      <div style={{ minWidth: isMobile ? "320px" : "auto" }}>
        <Chart
          chartType="LineChart"
          data={data}
          options={chartOptions}
          width="100%"
          height={isMobile ? "300px" : "420px"}
          loader={<div>Loading chart...</div>}
        />
      </div>
    </div>
  );
}

export default MyChart;
