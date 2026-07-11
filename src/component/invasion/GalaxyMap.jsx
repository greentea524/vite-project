import React from "react";
import styles from "./GalaxyMap.module.css";
import { NODE_TYPES } from "./MapGenerator";

export function GalaxyMap({ mapData, currentNodeId, unlockedNodeIds, onNodeClick }) {
  if (!mapData || mapData.length === 0) return null;

  return (
    <div className={styles.container}>
      <h2 className={styles.title}>Galaxy Sector Map</h2>
      <div className={styles.mapArea}>
        {mapData.map((tier, tierIndex) => (
          <div key={tierIndex} className={styles.tier}>
            {tier.map((node) => {
              const isUnlocked = unlockedNodeIds.includes(node.id);
              const isCurrent = currentNodeId === node.id;
              
              let nodeTypeInfo = NODE_TYPES.find(n => n.id === node.type);
              if (!nodeTypeInfo || node.type === "boss") {
                nodeTypeInfo = { icon: "👽", color: "#ff3333", name: "Sector Boss", desc: "Defeat to clear map!" };
              }

              return (
                <div
                  key={node.id}
                  className={`${styles.node} ${isUnlocked ? styles.unlocked : ""} ${isCurrent ? styles.current : ""}`}
                  style={{ borderColor: nodeTypeInfo.color, color: nodeTypeInfo.color }}
                  onClick={() => {
                    if (isUnlocked && !isCurrent) onNodeClick(node);
                  }}
                >
                  <div className={styles.nodeIcon}>{nodeTypeInfo.icon}</div>
                  <div className={styles.nodeTooltip}>
                    <div className={styles.nodeName}>{nodeTypeInfo.name}</div>
                    <div style={{color: "#aaa", fontSize: "10px", marginTop: "2px"}}>{nodeTypeInfo.desc}</div>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
