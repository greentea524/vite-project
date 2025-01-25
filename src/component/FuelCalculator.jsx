import React, { useState } from "react";
import "bootstrap/dist/css/bootstrap.min.css";

const FuelCalculator = () => {
  const [gallons, setGallons] = useState("0");
  const [range, setRange] = useState("0");
  const [calculatedRange, setCalculatedRange] = useState("");
  const [calculatedGallons, setCalculatedGallons] = useState("");

  const calculateRange = (gallons) => {
    const range = 29.39 * parseFloat(gallons);
    setCalculatedRange(`Range: ${range.toFixed(2)} miles`);
  };

  const calculateGallons = (range) => {
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
