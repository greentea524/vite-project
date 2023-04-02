import React from "react";
import { Chart } from "react-google-charts";
//import textFile from "../assets/data.txt";

var juridatax = [
  ["Element", "Density"]
];

/**
 * 
137,138 friday

229,230 thursday
233,234 friday

310,311,312,313 monday
315,316,317 tuesday
320,321 wednesday

410, 411, 412, 413, mon
416, 417, 418, 419 tues
424, 425 thurs
 * 
 */
var juri_options = {
  title: "Company Performances",
  width: 900,
  hAxis: { gridlines: { count: 25 } },
  //vAxis: { viewWindow: { max: 1 }},
  legend: {position: 'none'}
};

var collected_weeks = 4;

var jurisum = [
  // 32023
  137, 138, 229, 230, 233, 234, 310, 311, 312, 313, 315, 316, 317, 320, 321, 410, 411, 412, 413, 416, 417, 418, 419, 424, 425
]

function JuriChart() {
  // var setOne = numberRange(110, 150);
  // var setTwo = numberRange(210, 250);
  // var setThree = numberRange(310, 350);
  // var setFour = numberRange(410, 450);
  // var juriSet = juridatax.concat(setOne, setTwo, setThree, setFour);
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

  juriResult.forEach(function(value, index, array){
    if(!isNaN(value[0])){
      // [ the group pattern, the total week of data ]
      var percentage = (value[1] / collected_weeks);
      var this_value = [value[0], percentage];
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
