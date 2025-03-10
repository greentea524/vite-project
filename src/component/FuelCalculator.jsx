import React, { useState } from "react";
import "bootstrap/dist/css/bootstrap.min.css";
/*
17.2 gal
Fuel & MPG
Range in miles (city/hwy)	447.2/602.0 mi.
Fuel tank capacity	17.2 gal.

First Fillup:
Gallons: 10.8
Gauge range: 396 - 84 = 312
312/10.8 = 28.89 mi/gal

Second Fillup:
Gallons: 10.1
Gauge range: 406 - 98 = 308
Third Fillup:
Gallons: 9.5
Gauge range: 394 - 110 = 284
Fourth Fillup:
Gallons: 9.5
Gauge range: 387 - 116 = 271
Fifth Fillup:
Gallons: 10.9
Gauge range: 401 - 83 = 318
Sixth Fillup:
Gallons: 10.5
Gauge range: 373 - 86 = 287

excluding 6th ratio. range 29.39 average

*/
const FuelCalculator = () => {
  const [gallons, setGallons] = useState("");
  const [range, setRange] = useState("");
  const [mpg, setMpg] = useState("29.39");
  const [calculatedRange, setCalculatedRange] = useState("");
  const [calculatedGallons, setCalculatedGallons] = useState("");

  const calculateRange = (gallons, mpg) => {
    if (gallons === "") {
      setCalculatedRange("Range: --");
      return;
    }
    const range = parseFloat(mpg) * parseFloat(gallons);
    setCalculatedRange(`Range: ${range.toFixed(2)} miles`);
  };

  const calculateGallons = (range, mpg) => {
    if (range === "") {
      setCalculatedGallons("Gallons needed: --");
      return;
    }
    const gallons = parseFloat(range) / parseFloat(mpg);
    setCalculatedGallons(`Gallons needed: ${gallons.toFixed(2)}`);
  };

  return (
    <div className="container mt-5">
      <div className="row justify-content-center col-md-6 window">
        <div className="title-bar">
          <div className="title-bar-text">Fuel Fill-Up Calculator</div>
          <div className="title-bar-controls">
            <button aria-label="Minimize"></button>
            <button aria-label="Maximize"></button>
            <button aria-label="Close"></button>
          </div>
        </div>
        <div className="window-body">
          <div className="form-group mb-3">
            <label>MPG:</label>
            <input
              type="number"
              className="form-control"
              value={mpg}
              onChange={(e) => {
                setMpg(e.target.value);
                calculateRange(gallons, e.target.value);
                calculateGallons(range, e.target.value);
              }}
              placeholder="Enter MPG"
              min="0"
              max="100"
            />
          </div>
          <div className="form-group mb-3">
            <label>Gallons:</label>
            <input
              type="number"
              className="form-control"
              value={gallons}
              onChange={(e) => {
                setGallons(e.target.value);
                calculateRange(e.target.value, mpg);
              }}
              placeholder="Enter gallons"
              min="0"
              max="100"
            />
          </div>
          {calculatedRange && (
            <p className="text-center">
              <strong>{calculatedRange}</strong>
            </p>
          )}
          <div className="form-group mb-3">
            <label>Range Increase:</label>
            <input
              type="number"
              className="form-control"
              value={range}
              onChange={(e) => {
                setRange(e.target.value);
                calculateGallons(e.target.value, mpg);
              }}
              placeholder="Enter range increase"
              min="0"
              max="3000"
            />
          </div>
          {calculatedGallons && (
            <p className="text-center">
              <strong>{calculatedGallons}</strong>
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default FuelCalculator;
