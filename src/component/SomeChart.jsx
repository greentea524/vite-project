import React from "react";
import { Chart } from "react-google-charts";
//import textFile from "../assets/data.txt";

var someData = [
  ["Element", "Percentage"]
];

var someOptions = {
  title: "Company Performances",
  width: 900,
  hAxis: { gridlines: { count: 25 } },
  //vAxis: { viewWindow: { max: 1 }},
  legend: {position: 'none'}
};

var randosum = [
  110,111,112,113,114,115,116,117,126,127,128,130,131,132,137,138,310,311,312,313,315,316,317,320,321,410,411,412,413,416,417,418,419,424,425,
  110,111,112,113,114,117,118,119,120,124
]

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
    return acc[curr] ? ++acc[curr] : acc[curr] = 0, acc
  }, {});
  
  // occurrences
  randosum.reduce(function (acc, curr) {
    curr = curr.toString().substring(1);
    return randoObject[curr] ? ++randoObject[curr] : randoObject[curr] = 1, acc
  }, {});

  var someResult = Object.keys(randoObject).map((key) => [Number(key), randoObject[key]]);

  var weeks = randoObject[10];
  someResult.forEach(function(value, index, array){
    if(!isNaN(value[0])){
      // [ the pattern, the count ]
      var percentage = (value[1] / weeks) * 100;
      var this_value = [value[0], Math.round(percentage)];
      someData.push(this_value);
    }
  });

  return (
    <div>
      <Chart
        chartType="ColumnChart"
        data={someData}
        options={someOptions}
      />
      <hr></hr>
      <Chart
        chartType="Table"
        data={someData}
      />
    </div>

  );
}
function numberRange (start, end) {
  return new Array(end+1 - start).fill().map((d, i) => i + start);
}
export default SomeChart;
