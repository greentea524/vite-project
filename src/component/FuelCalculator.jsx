import React, { useReducer } from "react";
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
const ACTIONS = {
  SET_MPG: "SET_MPG",
  SET_GALLONS: "SET_GALLONS",
  SET_RANGE: "SET_RANGE",
};

const INITIAL_STATE = {
  gallons: "",
  range: "",
  mpg: "29.39",
  calculatedRange: "",
  calculatedGallons: "",
};

function getCalculatedRange(gallons, mpg) {
  if (gallons === "") return "Range: --";
  const range = parseFloat(mpg) * parseFloat(gallons);
  return `Range: ${range.toFixed(2)} miles`;
}

function getCalculatedGallons(range, mpg) {
  if (range === "") return "Gallons needed: --";
  const gallons = parseFloat(range) / parseFloat(mpg);
  return `Gallons needed: ${gallons.toFixed(2)}`;
}

function reducer(state, action) {
  switch (action.type) {
    case ACTIONS.SET_MPG: {
      const mpg = action.payload.value;
      return {
        ...state,
        mpg,
        calculatedRange: getCalculatedRange(state.gallons, mpg),
        calculatedGallons: getCalculatedGallons(state.range, mpg),
      };
    }
    case ACTIONS.SET_GALLONS: {
      const gallons = action.payload.value;
      return {
        ...state,
        gallons,
        calculatedRange: getCalculatedRange(gallons, state.mpg),
      };
    }
    case ACTIONS.SET_RANGE: {
      const range = action.payload.value;
      return {
        ...state,
        range,
        calculatedGallons: getCalculatedGallons(range, state.mpg),
      };
    }
    default:
      return state;
  }
}

const FuelCalculator = () => {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);

  return (
    <div className="container mt-5">
      <div className="row justify-content-center col-md-6 window">
        <div className="title-bar">
          <div className="title-bar-text">Fuel Fill-Up Calculator</div>
          <div className="title-bar-controls">
            <button type="button" aria-label="Minimize"></button>
            <button type="button" aria-label="Maximize"></button>
            <button type="button" aria-label="Close"></button>
          </div>
        </div>
        <div className="window-body">
          <div className="form-group mb-3">
            <label htmlFor="fuel-mpg">MPG:</label>
            <input
              id="fuel-mpg"
              type="number"
              className="form-control"
              value={state.mpg}
              onChange={(e) =>
                dispatch({
                  type: ACTIONS.SET_MPG,
                  payload: { value: e.target.value },
                })
              }
              placeholder="Enter MPG"
              min="0"
              max="100"
            />
          </div>
          <div className="form-group mb-3">
            <label htmlFor="fuel-gallons">Gallons:</label>
            <input
              id="fuel-gallons"
              type="number"
              className="form-control"
              value={state.gallons}
              onChange={(e) =>
                dispatch({
                  type: ACTIONS.SET_GALLONS,
                  payload: { value: e.target.value },
                })
              }
              placeholder="Enter gallons"
              min="0"
              max="100"
            />
          </div>
          {state.calculatedRange && (
            <p className="text-center">
              <strong>{state.calculatedRange}</strong>
            </p>
          )}
          <div className="form-group mb-3">
            <label htmlFor="fuel-range">Range Increase:</label>
            <input
              id="fuel-range"
              type="number"
              className="form-control"
              value={state.range}
              onChange={(e) =>
                dispatch({
                  type: ACTIONS.SET_RANGE,
                  payload: { value: e.target.value },
                })
              }
              placeholder="Enter range increase"
              min="0"
              max="3000"
            />
          </div>
          {state.calculatedGallons && (
            <p className="text-center">
              <strong>{state.calculatedGallons}</strong>
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default FuelCalculator;
