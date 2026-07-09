import React from "react";
import { ACHIEVEMENTS } from "./achievements.js";

// Achievements panel (#66), shared by the main menu and the pause menu
// the same way WorldMap is. Unlocked cards show the unlock date;
// locked ones show a progress bar toward the target.
export function AchievementsPanel({ state }) {
  const stats = state.achievementStats();
  const unlocked = state.achievements;
  const count = ACHIEVEMENTS.filter((a) => unlocked[a.id]).length;

  return (
    <div className="plat-ach">
      <div className="plat-ach-count">
        {count} / {ACHIEVEMENTS.length} unlocked
      </div>
      <div className="plat-ach-grid">
        {ACHIEVEMENTS.map((a) => {
          const unlockedAt = unlocked[a.id];
          const value = Math.min(a.goal(stats), a.target);
          return (
            <div
              key={a.id}
              className={`plat-ach-card ${unlockedAt ? "plat-ach-unlocked" : "plat-ach-locked"}`}
            >
              <span className="plat-ach-icon">{a.icon}</span>
              <div className="plat-ach-body">
                <div className="plat-ach-name">{a.name}</div>
                <div className="plat-ach-desc">{a.desc}</div>
                {unlockedAt ? (
                  <div className="plat-ach-date">
                    Unlocked {new Date(unlockedAt).toLocaleDateString()}
                  </div>
                ) : (
                  <div className="plat-ach-progress">
                    <div className="plat-ach-bar">
                      <div
                        className="plat-ach-fill"
                        style={{ width: `${Math.round((value / a.target) * 100)}%` }}
                      />
                    </div>
                    <span className="plat-ach-frac">
                      {value} / {a.target}
                    </span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
