import React from "react";
import { Chart } from "react-google-charts";
//import textFile from "../assets/data.txt";

var juridatax = [
  ["Element", "Percentage"]
];

var juri_options = {
  title: "Company Performances",
  width: 900,
  hAxis: { gridlines: { count: 25 } },
  //vAxis: { viewWindow: { max: 1 }},
  legend: {position: 'none'}
};

var jurisum = [
  // 32023
  110,111,112,113,114,115,116,117,126,127,128,130,131,132,137,138,310,311,312,313,315,316,317,320,321,410,411,412,413,416,417,418,419,424,425,
  110,111,112,113,114,117,118,119,120,124,210,310,410
]

function JuriChart() {
  var groupLabel = numberRange(10, 50);
  // const [text, setText] = React.useState();
  // fetch(textFile)
  //   .then((response) => response.text())
  //   .then((textContent) => {
  //     setText(textContent);
  //   });
  // console.log(text);

  var juriObject = groupLabel.reduce(function (acc, curr) {
    return acc[curr] ? ++acc[curr] : acc[curr] = 0, acc
  }, {});
  
  var occurrences = jurisum.reduce(function (acc, curr) {
    curr = curr.toString().substring(1);
    return juriObject[curr] ? ++juriObject[curr] : juriObject[curr] = 1, acc
  }, {});

  var juriResult = Object.keys(juriObject).map((key) => [Number(key), juriObject[key]]);
  // since 10 is guaranteed
  var collected_weeks = juriObject[10];
  juriResult.forEach(function(value, index, array){
    if(!isNaN(value[0])){
      // [ the group pattern, the total week of data ]
      var percentage = (value[1] / collected_weeks) * 100;
      var this_value = [value[0], Math.round(percentage)];
      juridatax.push(this_value);
    }
  });

  return (
    <div>
      <Chart
        chartType="ColumnChart"
        data={juridatax}
        options={juri_options}
      />
      <hr></hr>
      <Chart
        chartType="Table"
        data={juridatax}
      />
    </div>

  );
}
function numberRange (start, end) {
  return new Array(end+1 - start).fill().map((d, i) => i + start);
}
export default JuriChart;
