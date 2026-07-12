import React, { useState, useEffect } from "react";
import { getStats } from "./stats.js";
import "./big2.css";

export function StatsOverlay({ onClose }) {
  const [stats, setStats] = useState({ gamesPlayed: 0, gamesWon: 0, winRate: 0 });

  useEffect(() => {
    setStats(getStats());
  }, []);

  return (
    <div className="big2-results-overlay">
      <div className="big2-results big2-stats">
        <h2 className="big2-results-title">Player Statistics</h2>
        <div className="big2-stats-content" style={{ textAlign: "center", margin: "2rem 0" }}>
          <p style={{ fontSize: "1.2rem", margin: "0.5rem 0" }}>
            <strong>Games Played:</strong> {stats.gamesPlayed}
          </p>
          <p style={{ fontSize: "1.2rem", margin: "0.5rem 0" }}>
            <strong>Games Won:</strong> {stats.gamesWon}
          </p>
          <p style={{ fontSize: "1.2rem", margin: "0.5rem 0" }}>
            <strong>Win Rate:</strong> {stats.winRate}%
          </p>
        </div>
        <div className="big2-pause-actions">
          <button type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
