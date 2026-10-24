function normalizeCircularAngle(angle) {
  const twoPi = Math.PI * 2;
  const normalized = angle % twoPi;
  return normalized < 0 ? normalized + twoPi : normalized;
}

function signedCircularDiff(from, to) {
  let diff = to - from;
  const twoPi = Math.PI * 2;
  diff = diff % twoPi;
  if (diff > Math.PI) diff -= twoPi;
  if (diff < -Math.PI) diff += twoPi;
  return diff;
}

function circularDiff(from, to) {
  const diff = signedCircularDiff(from, to);
  return Math.abs(diff);
}

const sortByRawAngle = (a, b) =>
  a.rawAngle - b.rawAngle || a.originalIndex - b.originalIndex;

function finalizeRenderOrder(items) {
  const orderedItems = [...items].sort(
    (a, b) =>
      a.rawAngle - b.rawAngle ||
      ((a.renderPriority ?? 0) - (b.renderPriority ?? 0)) ||
      a.originalIndex - b.originalIndex,
  );

  orderedItems.forEach((item, index) => {
    item.renderOrder = index;
  });

  return orderedItems;
}

export function distributeCircularObjects(items, options = {}) {
  const minSeparation = Math.max(0.04, Number(options.minSeparation) || 0.12);
  const lockGuard = Math.max(minSeparation * 1.6, Number(options.lockGuard) || 0.16);
  const isLocked = options.isLocked || (() => false);

  if (!Array.isArray(items) || items.length === 0) {
    return [];
  }

  const normalizedItems = items.map((item, index) => {
    const rawAngle = normalizeCircularAngle(Number(item.rawAngle ?? item.angle ?? item.position ?? 0));
    return {
      ...item,
      originalIndex: index,
      rawAngle,
      adjustedAngle: rawAngle,
      isLocked: Boolean(isLocked(item)),
    };
  });

  const lockedItems = normalizedItems.filter((item) => item.isLocked);
  const movableItems = normalizedItems.filter((item) => !item.isLocked);

  if (normalizedItems.length === 1 || movableItems.length === 0) {
    return finalizeRenderOrder(normalizedItems);
  }

  const moveAwayFromLocked = (item) => {
    if (item.isLocked) return;

    lockedItems.forEach((lockedItem) => {
      const diff = signedCircularDiff(lockedItem.adjustedAngle, item.adjustedAngle);
      const absDiff = Math.abs(diff);

      if (absDiff < lockGuard) {
        const direction = absDiff < 0.000001 ? (item.originalIndex % 2 === 0 ? 1 : -1) : Math.sign(diff);
        const delta = lockGuard - absDiff + 0.002;
        item.adjustedAngle = normalizeCircularAngle(lockedItem.adjustedAngle + direction * delta);
      }
    });
  };

  movableItems.forEach(moveAwayFromLocked);

  const relaxCollisions = (iterations) => {
    for (let iteration = 0; iteration < iterations; iteration += 1) {
      let changed = false;
      const ordered = [...lockedItems, ...movableItems].sort(
        (a, b) => a.adjustedAngle - b.adjustedAngle || a.originalIndex - b.originalIndex,
      );

      for (let i = 0; i < ordered.length; i += 1) {
        const current = ordered[i];
        const next = ordered[(i + 1) % ordered.length];
        const gap = circularDiff(current.adjustedAngle, next.adjustedAngle);

        if (gap >= minSeparation) continue;
        if (current.isLocked && next.isLocked) continue;

        const push = minSeparation - gap + 0.004;

        if (current.isLocked) {
          next.adjustedAngle = normalizeCircularAngle(next.adjustedAngle + push);
        } else if (next.isLocked) {
          current.adjustedAngle = normalizeCircularAngle(current.adjustedAngle - push);
        } else {
          current.adjustedAngle = normalizeCircularAngle(current.adjustedAngle - push / 2);
          next.adjustedAngle = normalizeCircularAngle(next.adjustedAngle + push / 2);
        }

        changed = true;
      }

      movableItems.forEach(moveAwayFromLocked);
      if (!changed) break;
    }
  };

  relaxCollisions(Math.max(80, normalizedItems.length * 12));

  movableItems.sort((a, b) => a.rawAngle - b.rawAngle || a.originalIndex - b.originalIndex);
  movableItems.forEach(moveAwayFromLocked);

  for (let i = 1; i < movableItems.length; i += 1) {
    const previous = movableItems[i - 1];
    const current = movableItems[i];
    const gap = circularDiff(previous.adjustedAngle, current.adjustedAngle);

    if (gap < minSeparation) {
      current.adjustedAngle = normalizeCircularAngle(previous.adjustedAngle + minSeparation + 0.004);
      moveAwayFromLocked(current);
    }
  }

  relaxCollisions(Math.max(50, normalizedItems.length * 8));

  return finalizeRenderOrder(normalizedItems);
}
