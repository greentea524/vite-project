export const NODE_TYPES = [
  { id: "weapon", name: "Weapon Upgrade", icon: "🚀", color: "#00ffff", desc: "+1 Weapon Level" },
  { id: "shield", name: "Armor Plating", icon: "🛡️", color: "#3399ff", desc: "+50 Max Hull" },
  { id: "drone", name: "Wingman Drones", icon: "🛸", color: "#00ff88", desc: "Permanent Drones" },
  { id: "laser", name: "Piercing Laser", icon: "🔴", color: "#ff3399", desc: "Permanent Laser" },
  { id: "homing", name: "Homing Missiles", icon: "🟣", color: "#9933ff", desc: "Permanent Homing" },
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
        // First node is always a weapon upgrade to get started
        type = "weapon";
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
