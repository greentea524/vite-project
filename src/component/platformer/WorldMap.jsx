import React from "react";
import { WORLDS } from "./levels.js";
import { AVATAR_SHEETS, IMAGE_URLS } from "./assets.js";

// A reusable sprite icon component, originally from Platformer.jsx
function SpriteIcon({ sheet, frames, size }) {
  if (!sheet) return <span className="plat-icon-blank" style={{ width: size, height: size }} />;
  const src = sheet.split("#")[0];
  const aspect = sheet.split("#")[1];
  let w = size;
  let h = size;
  if (aspect === "wide") w *= 2;
  if (aspect === "tall") h *= 2;
  return (
    <div
      className="plat-icon"
      style={{
        width: w,
        height: h,
        backgroundImage: `url(${src})`,
        backgroundSize: `${w * frames}px ${h}px`,
      }}
    />
  );
}

export function WorldMap({ state, avatar, onSelectStage }) {
  return (
    <div className="plat-map">
      {WORLDS.map((world, w) => (
        <div className="plat-map-row" key={w}>
          <span className="plat-map-world">World {w + 1}</span>
          {world.map((_, s) => {
            const index = state.flatIndex(w, s);
            const done = state.isCompleted(index);
            const next = index === state.levelsCompleted;
            const isUnlocked = done || next;

            const content = (
              <>
                {done && (
                  <SpriteIcon sheet={IMAGE_URLS.coin} frames={2} size={20} />
                )}
                {next && (
                  <SpriteIcon sheet={AVATAR_SHEETS[avatar]} frames={8} size={20} />
                )}
                {!done && !next && <span className="plat-icon-blank" />}
                {w + 1}-{s + 1}
              </>
            );

            if (isUnlocked && onSelectStage) {
              return (
                <button
                  type="button"
                  key={s}
                  onClick={() => onSelectStage(index)}
                  className={`plat-map-cell plat-map-clickable ${
                    done ? "plat-map-done" : ""
                  }`}
                >
                  {content}
                </button>
              );
            }

            return (
              <span
                key={s}
                className={`plat-map-cell ${done ? "plat-map-done" : ""} ${
                  !done && !next ? "plat-map-locked" : ""
                }`}
              >
                {content}
              </span>
            );
          })}
        </div>
      ))}
      <div style={{ textAlign: "center", marginTop: "24px" }}>
        <button
          type="button"
          onClick={() => state.unlockAllStages()}
          className="plat-btn"
          style={{ fontSize: "0.8rem", padding: "4px 8px", opacity: 0.7 }}
        >
          Unlock all stages
        </button>
      </div>
    </div>
  );
}
