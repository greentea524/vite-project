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
  const [gallons, setGallons] = useState("0");
  const [range, setRange] = useState("0");
  const [calculatedRange, setCalculatedRange] = useState("");
  const [calculatedGallons, setCalculatedGallons] = useState("");

  const calculateRange = (gallons) => {
    if (gallons === "") {
      setCalculatedRange("");
      return;
    }
    const range = 29.39 * parseFloat(gallons);
    setCalculatedRange(`Range: ${range.toFixed(2)} miles`);
  };

  const calculateGallons = (range) => {
    if (range === "") {
      setCalculatedGallons("");
      return;
    }
    const gallons = parseFloat(range) / 29.39;
    setCalculatedGallons(`Gallons needed: ${gallons.toFixed(2)}`);
  };

  return (
    <div className="container mt-5">
      <div className="row justify-content-center">
        <div className="col-md-6">
          <h2 className="text-center mb-4">Fuel Fill-Up Calculator</h2>
          <div className="form-group mb-3">
            <label>Gallons:</label>
            <input
              type="number"
              className="form-control"
              value={gallons}
              onChange={(e) => {
                setGallons(e.target.value);
                calculateRange(e.target.value);
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
                calculateGallons(e.target.value);
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
