import React from "react";
import styles from "./GalaxyMap.module.css";
import { NODE_TYPES } from "./MapGenerator";

export function GalaxyMap({ mapPage, currentPageIndex, totalPages, onPrevPage, onNextPage, completedNodeIds, onNodeClick }) {
  if (!mapPage || mapPage.length === 0) return null;

  const nonBossNodes = mapPage.flat().filter(n => n.type !== "boss");
  const allOthersDone = nonBossNodes.every(n => completedNodeIds.includes(n.id));

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
              const isClickable = !isDone && (!isBoss || allOthersDone);
              
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
                      {isDone ? "Cleared" : (isBoss && !isClickable ? "Clear all other sectors first" : nodeTypeInfo.desc)}
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
