export const NODE_TYPES = [
  { id: "nebula", name: "Crimson Nebula", icon: "🌌", color: "#ff3355", desc: "A dense, volatile star-forming region" },
  { id: "asteroid", name: "Asteroid Field", icon: "☄️", color: "#aa8866", desc: "Navigate through dangerous debris" },
  { id: "void", name: "The Void Cluster", icon: "🌀", color: "#6600cc", desc: "Dark sector with strange anomalies" },
  { id: "forge", name: "Star Forge", icon: "✨", color: "#ffcc00", desc: "Blistering heat from newborn stars" },
  { id: "pulsar", name: "Pulsar System", icon: "⚡", color: "#00ffff", desc: "Intense electromagnetic radiation" },
];

export function generateGalaxyMap(loopCount = 0) {
  const structure = [1, 2, 3, 2, 1];
  const tiers = [];
  
  let nodeIdCounter = 0;

  for (let tierIndex = 0; tierIndex < structure.length; tierIndex++) {
    const nodeCount = structure[tierIndex];
    const tierNodes = [];

    for (let i = 0; i < nodeCount; i++) {
      let type;
      if (tierIndex === structure.length - 1) {
        type = "boss";
      } else if (tierIndex === 0) {
        // First node is just a standard galaxy now
        type = "nebula";
      } else {
        const randomType = NODE_TYPES[Math.floor(Math.random() * NODE_TYPES.length)];
        type = randomType.id;
      }

      tierNodes.push({
        id: `node_${nodeIdCounter++}`,
        tier: tierIndex,
        col: i,
        type: type,
        next: [],
      });
    }
    tiers.push(tierNodes);
  }

  // Connect nodes
  for (let t = 0; t < tiers.length - 1; t++) {
    const currentTier = tiers[t];
    const nextTier = tiers[t + 1];

    if (currentTier.length === 1 && nextTier.length === 2) {
      currentTier[0].next.push(nextTier[0].id, nextTier[1].id);
    } else if (currentTier.length === 2 && nextTier.length === 3) {
      currentTier[0].next.push(nextTier[0].id, nextTier[1].id);
      currentTier[1].next.push(nextTier[1].id, nextTier[2].id);
    } else if (currentTier.length === 3 && nextTier.length === 2) {
      currentTier[0].next.push(nextTier[0].id);
      currentTier[1].next.push(nextTier[0].id, nextTier[1].id);
      currentTier[2].next.push(nextTier[1].id);
    } else if (currentTier.length === 2 && nextTier.length === 1) {
      currentTier[0].next.push(nextTier[0].id);
      currentTier[1].next.push(nextTier[0].id);
    }
  }

  return tiers;
}
