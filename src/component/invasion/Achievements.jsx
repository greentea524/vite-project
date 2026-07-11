import React from "react";
import { ACHIEVEMENTS } from "./achievements.js";
import styles from "./AlienInvasion.module.css";

// Achievements panel (#94), opened from the main menu — the invasion
// port of the platformer's AchievementsPanel. Unlocked cards show the
// unlock date; locked ones show a progress bar toward the target.
export function AchievementsPanel({ stats, unlocked, onClose }) {
  const count = ACHIEVEMENTS.filter((a) => unlocked[a.id]).length;

  return (
    <div className={styles.achPanel}>
      <h3>Achievements</h3>
      <div className={styles.achCount}>
        {count} / {ACHIEVEMENTS.length} unlocked
      </div>
      <div className={styles.achGrid}>
        {ACHIEVEMENTS.map((a) => {
          const unlockedAt = unlocked[a.id];
          const value = Math.min(a.goal(stats), a.target);
          return (
            <div
              key={a.id}
              className={`${styles.achCard} ${unlockedAt ? styles.achUnlocked : styles.achLocked}`}
            >
              <span className={styles.achIcon}>{a.icon}</span>
              <div className={styles.achBody}>
                <div className={styles.achName}>{a.name}</div>
                <div className={styles.achDesc}>{a.desc}</div>
                {unlockedAt ? (
                  <div className={styles.achDate}>
                    Unlocked {new Date(unlockedAt).toLocaleDateString()}
                  </div>
                ) : (
                  <div className={styles.achProgress}>
                    <div className={styles.achBar}>
                      <div
                        className={styles.achFill}
                        style={{ width: `${Math.round((value / a.target) * 100)}%` }}
                      />
                    </div>
                    <span className={styles.achFrac}>
                      {value} / {a.target}
                    </span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <button type="button" className={styles.barBtn} onClick={onClose}>
        Close
      </button>
    </div>
  );
}
