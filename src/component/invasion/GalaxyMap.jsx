import React from "react";
import styles from "./GalaxyMap.module.css";
import { NODE_TYPES, activeTierIndex, tierIsDone } from "./MapGenerator";

export function GalaxyMap({ mapPage, currentPageIndex, totalPages, onPrevPage, onNextPage, completedNodeIds, onNodeClick }) {
  if (!mapPage || mapPage.length === 0) return null;

  // Path progression: one node per row. Only the active row (the first
  // with nothing cleared) is clickable; clearing any node in it moves
  // the fight up a row, until the boss row at the top.
  const activeTier = activeTierIndex(mapPage, completedNodeIds);

  return (
    <div className={styles.container}>
      <h2 className={styles.title}>Galaxy Sector Map</h2>
      
      {totalPages > 1 && (
        <div className={styles.carouselNav}>
          <button 
            type="button" 
            className={styles.carouselBtn} 
            disabled={currentPageIndex === 0} 
            onClick={onPrevPage}
          >
            &lt;
          </button>
          <span>Sector {currentPageIndex + 1} of {totalPages}</span>
          <button 
            type="button" 
            className={styles.carouselBtn} 
            disabled={currentPageIndex === totalPages - 1} 
            onClick={onNextPage}
          >
            &gt;
          </button>
        </div>
      )}

      <div className={styles.mapArea}>
        {mapPage.map((tier, tierIndex) => (
          <div key={tierIndex} className={styles.tier}>
            {tier.map((node) => {
              const isDone = completedNodeIds.includes(node.id);
              const isBoss = node.type === "boss";
              // Clickable only on the active row; picking one node there
              // finishes the row — its siblings become bypassed.
              const isClickable = !isDone && tierIndex === activeTier;
              const isBypassed = !isDone && tierIsDone(tier, completedNodeIds);

              let nodeTypeInfo = NODE_TYPES.find(n => n.id === node.type);
              if (!nodeTypeInfo || isBoss) {
                nodeTypeInfo = { icon: "👽", color: "#ff3333", name: "Sector Boss", desc: "Defeat to clear sector!" };
              }

              return (
                <div
                  key={node.id}
                  className={`${styles.node} ${isClickable ? styles.unlocked : ""} ${isDone ? styles.done : ""} ${isBoss && !isClickable && !isDone ? styles.lockedBoss : ""}`}
                  style={{ borderColor: nodeTypeInfo.color, color: nodeTypeInfo.color }}
                  onClick={() => {
                    if (isClickable) onNodeClick(node);
                  }}
                >
                  <div className={styles.nodeIcon}>{nodeTypeInfo.icon}</div>
                  <div className={styles.nodeTooltip}>
                    <div className={styles.nodeName}>
                      {isBoss && !isClickable && !isDone ? "LOCKED" : nodeTypeInfo.name}
                    </div>
                    <div style={{color: "#aaa", fontSize: "10px", marginTop: "2px"}}>
                      {isDone
                        ? "Cleared"
                        : isBypassed
                          ? "Bypassed"
                          : isBoss && !isClickable
                            ? "Fight up the rows to reach the boss"
                            : isClickable
                              ? nodeTypeInfo.desc
                              : "Locked — clear the row below first"}
                    </div>
                  </div>
                  {isDone && <div className={styles.doneCheck}>✓</div>}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
