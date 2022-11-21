import React, { useState, useEffect } from 'react';

function mychart() {
  useEffect(() => {
    // call api or anything
    console.log("loaded");
    drawChart();
 });
  return (
    <div className="row">
      <div className="col-md-12">
        <div id="donutchart"></div>
      </div>
    </div>
  );
}

export default mychart;
