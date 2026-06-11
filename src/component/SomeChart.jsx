import React, { useEffect, useMemo, useState } from "react";
import { Chart } from "react-google-charts";
import randomdata from "../assets/data.json";

const tableOptions = {
  showRowNumber: true,
  width: "100%",
  height: "100%",
};

function SomeChart() {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.innerWidth <= 768;
  });

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
            width: "90%",
            height: "76%",
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
    [isMobile],
  );

  return (
    <div className="container mt-5 px-2 px-md-3">
      <div style={{ overflowX: "auto" }}>
        <div style={{ minWidth: isMobile ? "320px" : "auto" }}>
          <Chart
            chartType="ColumnChart"
            data={someData}
            options={someOptions}
            width="100%"
            height={isMobile ? "320px" : "540px"}
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
              height={isMobile ? "320px" : "360px"}
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
