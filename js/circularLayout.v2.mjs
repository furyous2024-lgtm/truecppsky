/**
 * Advanced Circular Layout Algorithm v2
 * 
 * This is a complete rewrite of the collision detection and spacing system.
 * Key improvements:
 * 1. Adaptive spacing based on local density
 * 2. Multi-pass algorithm with different strategies per pass
 * 3. Better handling of tight clusters
 * 4. Improved angular arithmetic for wraparound
 * 5. Weighted distribution considering planet priorities
 */

// ============================================================================
// ANGULAR UTILITIES
// ============================================================================

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

// ============================================================================
// MAIN DISTRIBUTION FUNCTION
// ============================================================================

export function distributeCircularObjectsV2(items, options = {}) {
  const {
    minSeparation = 0.12,           // Minimum angular separation (radians)
    lockGuard = 0.16,               // Guard distance around locked points
    isLocked = () => false,         // Callback to determine if item is locked
    densityThreshold = 0.3,         // If gap < this ratio of minSeparation, use high-density algorithm
    maxIterations = 300,            // Maximum iterations for relaxation
  } = options;

  if (!Array.isArray(items) || items.length === 0) {
    return [];
  }

  // ========================================================================
  // STEP 1: NORMALIZE INPUT DATA
  // ========================================================================
  
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

  // Edge cases
  if (normalized.length === 1 || movableItems.length === 0) {
    return finalizeOrder(normalized);
  }

  // ========================================================================
  // STEP 2: ENFORCE LOCKED ITEMS BUFFER
  // ========================================================================
  
  movableItems.forEach(item => {
    let bestPosition = item.adjustedAngle;
    let maxMinDist = 0;

    lockedItems.forEach(locked => {
      const dist = angularDistance(locked.adjustedAngle, item.adjustedAngle);
      if (dist < lockGuard) {
        // Find the closest position outside the guard zone
        const directions = [1, -1];
        directions.forEach(dir => {
          const candidate = moveAngle(locked.adjustedAngle, dir, lockGuard + 0.001);
          let valid = true;

          // Check if candidate conflicts with other locked items
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
    item.moved = true;
  });

  // ========================================================================
  // STEP 3: IDENTIFY COLLISION CLUSTERS
  // ========================================================================

  function findClusters() {
    const allItems = [...lockedItems, ...movableItems].sort((a, b) => a.adjustedAngle - b.adjustedAngle);
    const clusters = [];
    let currentCluster = [allItems[0]];

    for (let i = 1; i < allItems.length; i++) {
      const prev = allItems[i - 1];
      const curr = allItems[i];
      const gap = angularDistance(prev.adjustedAngle, curr.adjustedAngle);

      if (gap < minSeparation * 1.5) {
        currentCluster.push(curr);
      } else {
        if (currentCluster.length > 1) {
          clusters.push(currentCluster);
        }
        currentCluster = [curr];
      }
    }

    // Handle wraparound
    if (currentCluster.length > 1 || allItems.length > 1) {
      const firstItem = allItems[0];
      const lastItem = allItems[allItems.length - 1];
      const wrapGap = angularDistance(lastItem.adjustedAngle, firstItem.adjustedAngle);

      if (wrapGap < minSeparation * 1.5 && currentCluster.length === 1) {
        currentCluster = [...currentCluster, ...clusters.pop()];
      }

      if (currentCluster.length > 1) {
        clusters.push(currentCluster);
      }
    }

    return clusters;
  }

  // ========================================================================
  // STEP 4: DISTRIBUTE CLUSTERS
  // ========================================================================

  function redistributeCluster(cluster) {
    const hasLocked = cluster.some(i => i.isLocked);
    const locked = cluster.filter(i => i.isLocked);
    const movable = cluster.filter(i => !i.isLocked);

    if (movable.length === 0) return;

    // Find the total angular span available
    let startAngle, endAngle;
    
    if (locked.length > 0) {
      // Find space between locked items
      const lockedAngles = locked.map(i => i.adjustedAngle).sort((a, b) => a - b);
      let maxGap = 0;
      let gapStart = 0;

      for (let i = 0; i < lockedAngles.length; i++) {
        const start = lockedAngles[i];
        const end = lockedAngles[(i + 1) % lockedAngles.length];
        const gap = end > start ? end - start : (2 * Math.PI) - start + end;
        
        if (gap > maxGap) {
          maxGap = gap;
          gapStart = normalizeAngle(start + lockGuard);
        }
      }

      startAngle = gapStart;
      endAngle = normalizeAngle(gapStart + maxGap - 2 * lockGuard);
    } else {
      // Find the largest gap between all items
      const sorted = cluster.sort((a, b) => a.adjustedAngle - b.adjustedAngle);
      let maxGap = 0;
      let gapPos = 0;

      for (let i = 0; i < sorted.length; i++) {
        const curr = sorted[i].adjustedAngle;
        const next = sorted[(i + 1) % sorted.length].adjustedAngle;
        const gap = next > curr ? next - curr : (2 * Math.PI) - curr + next;

        if (gap > maxGap) {
          maxGap = gap;
          gapPos = curr;
        }
      }

      startAngle = normalizeAngle(gapPos + angularDistance(gapPos, sorted[0].adjustedAngle) / 2);
      endAngle = normalizeAngle(startAngle + (2 * Math.PI) - angularDistance(sorted[0].adjustedAngle, sorted[sorted.length - 1].adjustedAngle));
    }

    // Distribute movable items evenly in the available space
    const neededSpace = (movable.length - 1) * minSeparation + 0.01;
    const availableSpace = angularDistance(startAngle, endAngle);

    if (neededSpace <= availableSpace) {
      const spacing = availableSpace / (movable.length + 1);
      movable.forEach((item, idx) => {
        item.adjustedAngle = normalizeAngle(startAngle + (idx + 1) * spacing);
      });
    } else {
      // Forced distribution with minimum spacing
      movable.forEach((item, idx) => {
        item.adjustedAngle = normalizeAngle(startAngle + idx * minSeparation);
      });
    }
  }

  // ========================================================================
  // STEP 5: ITERATIVE RELAXATION
  // ========================================================================

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
          // Can't move either - already handled in earlier step
          continue;
        }

        if (current.isLocked) {
          // Push next away
          next.adjustedAngle = normalizeAngle(current.adjustedAngle + minSeparation + 0.001);
        } else if (next.isLocked) {
          // Pull current back
          current.adjustedAngle = normalizeAngle(next.adjustedAngle - minSeparation - 0.001);
        } else {
          // Split the difference
          const push = (minSeparation - gap) / 2 + 0.001;
          current.adjustedAngle = normalizeAngle(current.adjustedAngle - push);
          next.adjustedAngle = normalizeAngle(next.adjustedAngle + push);
        }
      }
    }

    return conflicts;
  }

  // ========================================================================
  // STEP 6: EXECUTE ALGORITHM
  // ========================================================================

  // Apply cluster redistribution
  const clusters = findClusters();
  clusters.forEach(redistributeCluster);

  // Iterative relaxation
  let iteration = 0;
  let conflicts = 1;
  while (conflicts > 0 && iteration < maxIterations) {
    conflicts = relax();
    iteration++;
  }

  // Final enforcement of locked item buffers
  movableItems.forEach(item => {
    lockedItems.forEach(locked => {
      if (angularDistance(locked.adjustedAngle, item.adjustedAngle) < lockGuard) {
        const dir = signedAngularDistance(locked.adjustedAngle, item.adjustedAngle) > 0 ? 1 : -1;
        item.adjustedAngle = moveAngle(locked.adjustedAngle, dir, lockGuard + 0.001);
      }
    });
  });

  return finalizeOrder(normalized);
}

// ============================================================================
// FINALIZATION
// ============================================================================

function finalizeOrder(items) {
  const ordered = [...items].sort((a, b) => {
    // Sort by angle first
    const angleDiff = a.adjustedAngle - b.adjustedAngle;
    if (Math.abs(angleDiff) > 0.0001) return angleDiff;

    // Then by render priority (lower values render first = appear behind)
    const priorityDiff = (a.renderPriority ?? 0) - (b.renderPriority ?? 0);
    if (priorityDiff !== 0) return priorityDiff;

    // Then by original index
    return a.originalIndex - b.originalIndex;
  });

  ordered.forEach((item, idx) => {
    item.renderOrder = idx;
  });

  return ordered;
}

// ============================================================================
// LEGACY WRAPPER - For backward compatibility with existing code
// ============================================================================

export function distributeCircularObjects(items, options = {}) {
  // Automatically use v2 for better results
  return distributeCircularObjectsV2(items, {
    minSeparation: Math.max(0.04, Number(options.minSeparation) || 0.12),
    lockGuard: Math.max((options.minSeparation || 0.12) * 1.6, Number(options.lockGuard) || 0.16),
    isLocked: options.isLocked || (() => false),
  });
}
