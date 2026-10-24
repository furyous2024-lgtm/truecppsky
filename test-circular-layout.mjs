#!/usr/bin/env node

/**
 * Test Script for New Circular Layout Algorithm
 * 
 * Tests the distribution of planets for the date/location specified:
 * Date: 05/12/2002 
 * Location: Curitiba, Paraná, Brazil
 * Time: Should be noon by default (adjust as needed)
 */

// Mock minimal implementation for testing without full dependencies
const testData = [
  { name: "Sun", rawAngle: 4.5, renderPriority: 0 },
  { name: "Moon", rawAngle: 4.52, renderPriority: 1 },
  { name: "Mercury", rawAngle: 4.48, renderPriority: 2 },
  { name: "Venus", rawAngle: 4.51, renderPriority: 3 },
  { name: "Mars", rawAngle: 5.1, renderPriority: 4 },
  { name: "Jupiter", rawAngle: 2.3, renderPriority: 5 },
  { name: "Saturn", rawAngle: 1.5, renderPriority: 6 },
  { name: "Uranus", rawAngle: 3.8, renderPriority: 7 },
  { name: "Neptune", rawAngle: 3.2, renderPriority: 8 },
  { name: "Pluto", rawAngle: 4.6, renderPriority: 9 },
  { name: "ASC", rawAngle: 0, renderPriority: 100, isLocked: true },
  { name: "MC", rawAngle: 1.57, renderPriority: 101, isLocked: true },
];

function normalizeAngle(angle) {
  let a = angle % (2 * Math.PI);
  return a < 0 ? a + 2 * Math.PI : a;
}

function angularDistance(from, to) {
  const diff = normalizeAngle(to - from);
  return diff > Math.PI ? 2 * Math.PI - diff : diff;
}

function signedAngularDistance(from, to) {
  let diff = to - from;
  diff = diff % (2 * Math.PI);
  if (diff > Math.PI) diff -= 2 * Math.PI;
  if (diff < -Math.PI) diff += 2 * Math.PI;
  return diff;
}

function moveAngle(from, direction, distance) {
  return normalizeAngle(from + direction * distance);
}

function distributeCircularObjects(items, options = {}) {
  const {
    minSeparation = 0.12,
    lockGuard = 0.16,
    isLocked = () => false,
  } = options;

  if (!Array.isArray(items) || items.length === 0) {
    return [];
  }

  const normalized = items.map((item, idx) => {
    const angle = normalizeAngle(Number(item.rawAngle ?? item.angle ?? item.position ?? 0));
    return {
      ...item,
      originalIndex: idx,
      rawAngle: angle,
      adjustedAngle: angle,
      isLocked: Boolean(isLocked(item)),
      moved: false,
    };
  });

  const lockedItems = normalized.filter(i => i.isLocked);
  const movableItems = normalized.filter(i => !i.isLocked);

  if (normalized.length === 1 || movableItems.length === 0) {
    return normalizeOrder(normalized);
  }

  // Enforce locked items buffer
  movableItems.forEach(item => {
    let bestPosition = item.adjustedAngle;
    let maxMinDist = 0;

    lockedItems.forEach(locked => {
      const dist = angularDistance(locked.adjustedAngle, item.adjustedAngle);
      if (dist < lockGuard) {
        const directions = [1, -1];
        directions.forEach(dir => {
          const candidate = moveAngle(locked.adjustedAngle, dir, lockGuard + 0.001);
          let valid = true;

          lockedItems.forEach(other => {
            if (other !== locked && angularDistance(other.adjustedAngle, candidate) < lockGuard) {
              valid = false;
            }
          });

          if (valid) {
            const minDistToLocked = Math.min(
              ...lockedItems.map(l => angularDistance(l.adjustedAngle, candidate))
            );
            if (minDistToLocked > maxMinDist) {
              maxMinDist = minDistToLocked;
              bestPosition = candidate;
            }
          }
        });
      }
    });

    item.adjustedAngle = bestPosition;
  });

  // Iterative relaxation
  function relax() {
    const all = [...lockedItems, ...movableItems].sort((a, b) => a.adjustedAngle - b.adjustedAngle);
    let conflicts = 0;

    for (let i = 0; i < all.length; i++) {
      const current = all[i];
      const next = all[(i + 1) % all.length];
      const gap = angularDistance(current.adjustedAngle, next.adjustedAngle);

      if (gap < minSeparation) {
        conflicts++;

        if (current.isLocked && next.isLocked) {
          continue;
        }

        if (current.isLocked) {
          next.adjustedAngle = normalizeAngle(current.adjustedAngle + minSeparation + 0.001);
        } else if (next.isLocked) {
          current.adjustedAngle = normalizeAngle(next.adjustedAngle - minSeparation - 0.001);
        } else {
          const push = (minSeparation - gap) / 2 + 0.001;
          current.adjustedAngle = normalizeAngle(current.adjustedAngle - push);
          next.adjustedAngle = normalizeAngle(next.adjustedAngle + push);
        }
      }
    }

    return conflicts;
  }

  let iteration = 0;
  let conflicts = 1;
  while (conflicts > 0 && iteration < 300) {
    conflicts = relax();
    iteration++;
  }

  // Final enforcement
  movableItems.forEach(item => {
    lockedItems.forEach(locked => {
      if (angularDistance(locked.adjustedAngle, item.adjustedAngle) < lockGuard) {
        const dir = signedAngularDistance(locked.adjustedAngle, item.adjustedAngle) > 0 ? 1 : -1;
        item.adjustedAngle = moveAngle(locked.adjustedAngle, dir, lockGuard + 0.001);
      }
    });
  });

  return normalizeOrder(normalized);
}

function normalizeOrder(items) {
  const ordered = [...items].sort((a, b) => {
    const angleDiff = a.adjustedAngle - b.adjustedAngle;
    if (Math.abs(angleDiff) > 0.0001) return angleDiff;

    const priorityDiff = (a.renderPriority ?? 0) - (b.renderPriority ?? 0);
    if (priorityDiff !== 0) return priorityDiff;

    return a.originalIndex - b.originalIndex;
  });

  ordered.forEach((item, idx) => {
    item.renderOrder = idx;
  });

  return ordered;
}

// Run test
console.log("Testing new circular layout algorithm...\n");
console.log("Input planets (before distribution):");
testData.forEach(p => {
  const angle = (p.rawAngle * 180 / Math.PI).toFixed(1);
  console.log(`  ${p.name.padEnd(10)} - ${angle}° (${(p.rawAngle).toFixed(4)} rad)`);
});

const result = distributeCircularObjects(testData, {
  minSeparation: 0.12,
  lockGuard: 0.18,
  isLocked: (item) => item.isLocked,
});

console.log("\nOutput planets (after distribution):");
console.log("RenderOrder | Name       | Original Angle | New Angle  | Gap to Next");
console.log("------------|------------|----------------|------------|----------");

for (let i = 0; i < result.length; i++) {
  const item = result[i];
  const next = result[(i + 1) % result.length];
  
  const origAngle = (item.rawAngle * 180 / Math.PI).toFixed(1);
  const newAngle = (item.adjustedAngle * 180 / Math.PI).toFixed(1);
  
  let gap;
  if (i === result.length - 1) {
    gap = angularDistance(item.adjustedAngle, result[0].adjustedAngle);
  } else {
    gap = angularDistance(item.adjustedAngle, next.adjustedAngle);
  }
  const gapDeg = (gap * 180 / Math.PI).toFixed(1);
  
  console.log(
    `${String(item.renderOrder).padEnd(11)}${item.name.padEnd(11)}${origAngle}°${' '.repeat(14)}${newAngle}°${' '.repeat(8)}${gapDeg}°`
  );
}

console.log("\nValidation:");
let allValid = true;
for (let i = 0; i < result.length; i++) {
  const current = result[i];
  const next = result[(i + 1) % result.length];
  const gap = angularDistance(current.adjustedAngle, next.adjustedAngle);
  const minAllowed = current.isLocked || next.isLocked ? 0.16 : 0.12;
  
  if (gap < minAllowed - 0.001) {
    console.log(`  ✗ ${current.name} -> ${next.name}: gap ${(gap * 180 / Math.PI).toFixed(1)}° (min: ${(minAllowed * 180 / Math.PI).toFixed(1)}°)`);
    allValid = false;
  }
}

if (allValid) {
  console.log("  ✓ All planets have proper spacing!");
} else {
  console.log("  ✗ Some spacing violations found");
}
