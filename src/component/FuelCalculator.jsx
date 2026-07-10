import React, { useMemo, useState } from "react";
import "bootstrap/dist/css/bootstrap.min.css";

const UNIT_SYSTEMS = {
  metric: {
    label: "Metric",
    distanceLabel: "Distance",
    distanceUnit: "km",
    efficiencyLabel: "Fuel efficiency",
    efficiencyUnit: "L/100km",
    priceLabel: "Fuel price",
    priceUnit: "per litre",
    fuelUnit: "litres",
    distancePerCostUnit: "km",
  },
  imperial: {
    label: "Imperial",
    distanceLabel: "Distance",
    distanceUnit: "miles",
    efficiencyLabel: "Fuel efficiency",
    efficiencyUnit: "MPG",
    priceLabel: "Fuel price",
    priceUnit: "per gallon",
    fuelUnit: "gallons",
    distancePerCostUnit: "mile",
  },
};

const METRIC_TO_IMPERIAL_DISTANCE = 0.621371;
const LITRES_PER_GALLON = 3.785411784;
const MPG_CONSTANT = 235.214583;
const NUMBER_FORMATTERS = {
  0: new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }),
  1: new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  }),
  2: new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }),
};

const INITIAL_STATE = {
  unitSystem: "imperial",
  distance: "",
  efficiency: "",
  price: "",
};

function parsePositiveNumber(value) {
  if (value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

function formatNumber(value, digits = 2) {
  const formatter = NUMBER_FORMATTERS[digits] || NUMBER_FORMATTERS[2];
  return formatter.format(value);
}

function formatCurrency(value) {
  return `$${formatNumber(value, 2)}`;
}

function convertStateForUnitSystem(state, nextUnitSystem) {
  if (state.unitSystem === nextUnitSystem) {
    return state;
  }

  const distance = parsePositiveNumber(state.distance);
  const efficiency = parsePositiveNumber(state.efficiency);
  const price = parsePositiveNumber(state.price);

  if (state.unitSystem === "metric" && nextUnitSystem === "imperial") {
    return {
      unitSystem: nextUnitSystem,
      distance:
        distance === null
          ? state.distance
          : formatNumber(distance * METRIC_TO_IMPERIAL_DISTANCE, 2),
      efficiency:
        efficiency === null
          ? state.efficiency
          : formatNumber(MPG_CONSTANT / efficiency, 2),
      price:
        price === null
          ? state.price
          : formatNumber(price * LITRES_PER_GALLON, 2),
    };
  }

  return {
    unitSystem: nextUnitSystem,
    distance:
      distance === null
        ? state.distance
        : formatNumber(distance / METRIC_TO_IMPERIAL_DISTANCE, 2),
    efficiency:
      efficiency === null
        ? state.efficiency
        : formatNumber(MPG_CONSTANT / efficiency, 2),
    price:
      price === null ? state.price : formatNumber(price / LITRES_PER_GALLON, 2),
  };
}

function getValidationErrors(state) {
  const errors = {};
  const distance = parsePositiveNumber(state.distance);
  const efficiency = parsePositiveNumber(state.efficiency);
  const price = parsePositiveNumber(state.price);

  if (state.distance !== "" && distance === null) {
    errors.distance = "Enter a distance greater than 0.";
  }

  if (state.efficiency !== "" && efficiency === null) {
    errors.efficiency = "Enter a fuel efficiency greater than 0.";
  }

  if (state.price !== "" && price === null) {
    errors.price = "Enter a fuel price greater than 0.";
  }

  return errors;
}

const FuelCalculator = () => {
  const [state, setState] = useState(INITIAL_STATE);

  const validationErrors = useMemo(() => getValidationErrors(state), [state]);
  const hasErrors = Object.keys(validationErrors).length > 0;

  const calculations = useMemo(() => {
    const distance = parsePositiveNumber(state.distance);
    const efficiency = parsePositiveNumber(state.efficiency);
    const price = parsePositiveNumber(state.price);

    if (distance === null || efficiency === null || price === null) {
      return null;
    }

    if (state.unitSystem === "metric") {
      const fuelNeeded = (distance * efficiency) / 100;
      const totalCost = fuelNeeded * price;

      return {
        fuelNeeded,
        totalCost,
        costPerDistance: totalCost / distance,
      };
    }

    const fuelNeeded = distance / efficiency;
    const totalCost = fuelNeeded * price;

    return {
      fuelNeeded,
      totalCost,
      costPerDistance: totalCost / distance,
    };
  }, [state]);

  const unitConfig = UNIT_SYSTEMS[state.unitSystem];

  const handleUnitChange = (nextUnitSystem) => {
    setState((current) => convertStateForUnitSystem(current, nextUnitSystem));
  };

  return (
    <div className="container mt-4">
      <div className="modern-calculator-card">
        <div className="fuel-calculator-header">
          <h2>Fuel Calculator</h2>
          <p className="fuel-calculator-intro">
            Estimate trip fuel consumption and cost with metric or imperial units.
          </p>
        </div>
        <div className="fuel-calculator-body">

          <div
            className="fuel-unit-toggle"
            role="radiogroup"
            aria-label="Unit system"
          >
            {Object.entries(UNIT_SYSTEMS).map(([key, config]) => (
              <button
                key={key}
                type="button"
                className={`fuel-unit-chip ${
                  state.unitSystem === key ? "is-active" : ""
                }`}
                onClick={() => handleUnitChange(key)}
                aria-pressed={state.unitSystem === key}
              >
                {config.label}
              </button>
            ))}
          </div>

          <div className="fuel-form-grid">
            <div className="form-group">
              <label htmlFor="fuel-distance">
                {unitConfig.distanceLabel} ({unitConfig.distanceUnit})
              </label>
              <input
                id="fuel-distance"
                type="number"
                className="form-control"
                value={state.distance}
                onChange={(event) =>
                  setState((current) => ({
                    ...current,
                    distance: event.target.value,
                  }))
                }
                min="0"
                step="any"
                placeholder={`Enter distance in ${unitConfig.distanceUnit}`}
              />
              {validationErrors.distance && (
                <div className="fuel-field-error" role="alert">
                  {validationErrors.distance}
                </div>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="fuel-efficiency">
                {unitConfig.efficiencyLabel} ({unitConfig.efficiencyUnit})
              </label>
              <input
                id="fuel-efficiency"
                type="number"
                className="form-control"
                value={state.efficiency}
                onChange={(event) =>
                  setState((current) => ({
                    ...current,
                    efficiency: event.target.value,
                  }))
                }
                min="0"
                step="any"
                placeholder={
                  state.unitSystem === "metric" ? "e.g. 7.5" : "e.g. 32.1"
                }
              />
              {validationErrors.efficiency && (
                <div className="fuel-field-error" role="alert">
                  {validationErrors.efficiency}
                </div>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="fuel-price">
                {unitConfig.priceLabel} ({unitConfig.priceUnit})
              </label>
              <input
                id="fuel-price"
                type="number"
                className="form-control"
                value={state.price}
                onChange={(event) =>
                  setState((current) => ({
                    ...current,
                    price: event.target.value,
                  }))
                }
                min="0"
                step="any"
                placeholder={`Enter price ${unitConfig.priceUnit}`}
              />
              {validationErrors.price && (
                <div className="fuel-field-error" role="alert">
                  {validationErrors.price}
                </div>
              )}
            </div>
          </div>

          <div className="fuel-results">
            <div className="fuel-result-card">
              <span className="fuel-result-label">Estimated fuel needed</span>
              <strong className="fuel-result-value">
                {calculations
                  ? `${formatNumber(calculations.fuelNeeded, 2)} ${unitConfig.fuelUnit}`
                  : "--"}
              </strong>
            </div>
            <div className="fuel-result-card">
              <span className="fuel-result-label">Total cost</span>
              <strong className="fuel-result-value">
                {calculations ? formatCurrency(calculations.totalCost) : "--"}
              </strong>
            </div>
            <div className="fuel-result-card">
              <span className="fuel-result-label">
                Cost per {unitConfig.distancePerCostUnit}
              </span>
              <strong className="fuel-result-value">
                {calculations
                  ? `${formatCurrency(calculations.costPerDistance)}/${unitConfig.distancePerCostUnit}`
                  : "--"}
              </strong>
            </div>
          </div>

          {hasErrors && (
            <p className="fuel-calculator-note" role="status">
              Fix the highlighted fields to see an updated estimate.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default FuelCalculator;
