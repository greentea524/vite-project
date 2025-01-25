import React from "react";
import { Chart } from "react-google-charts";
import randomdata from "../assets/data.json";

var someData = [["Element", "Percentage"]];

var someOptions = {
  title: "Company Performances",
  width: 900,
  hAxis: { gridlines: { count: 25 } },
  //vAxis: { viewWindow: { max: 1 }},
  legend: { position: "none" },
};
const tableOptions = {
  showRowNumber: true,
  width: "100%",
  height: "100%",
};

var randosum = randomdata;

function SomeChart() {
  var groupLabel = numberRange(10, 50);
  // const [text, setText] = React.useState();
  // fetch(textFile)
  //   .then((response) => response.text())
  //   .then((textContent) => {
  //     setText(textContent);
  //   });
  // console.log(text);

  var randoObject = groupLabel.reduce(function (acc, curr) {
    return acc[curr] ? ++acc[curr] : (acc[curr] = 0), acc;
  }, {});

  // occurrences
  randosum.reduce(function (acc, curr) {
    curr = curr.toString().substring(1);
    return (
      randoObject[curr] ? ++randoObject[curr] : (randoObject[curr] = 1), acc
    );
  }, {});

  var someResult = Object.keys(randoObject).map((key) => [
    Number(key),
    randoObject[key],
  ]);

  var weeks = randoObject[10];
  someResult.forEach(function (value, index, array) {
    if (!isNaN(value[0])) {
      // [ the pattern, the count ]
      var percentage = (value[1] / weeks) * 100;
      var this_value = [value[0], Math.round(percentage)];
      someData.push(this_value);
    }
  });

  return (
    <div className="container mt-5">
      <Chart chartType="ColumnChart" data={someData} options={someOptions} />
      <hr></hr>

      <div className="row">
        <div className="col-md-6">
          <Chart
            chartType="Table"
            data={[
              someData[0],
              ...someData.slice(1, Math.ceil(someData.length / 2)),
            ]} // Include header row
            options={tableOptions}
          />
        </div>
        <div className="col-md-6">
          <Chart
            chartType="Table"
            data={[
              someData[0],
              ...someData.slice(Math.ceil(someData.length / 2)),
            ]} // Include header row
            options={tableOptions}
          />
        </div>
      </div>
    </div>
  );
}
function numberRange(start, end) {
  return new Array(end + 1 - start).fill().map((d, i) => i + start);
}
export default SomeChart;
