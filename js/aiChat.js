"use strict";

/**
 * AI Chat Module
 * Handles the #AI channel in the community chat section
 */

// State
let isAIChannel = false;
let remainingMessages = 50; // Will be updated from server
let monthlyLimit = 50; // Will be updated from server
let resetDate = null; // Will be updated from server (ISO string)
let isUnlimited = false; // True if user has AI unlimited addon
let fairUseCapped = false; // True if unlimited user hit fair use cap
let subscriptionRequired = false; // True if user needs to subscribe to use AI chat

// ============================================
// ASTROLOGICAL TERM HIGHLIGHTING
// ============================================

/**
 * Escape HTML special characters to prevent XSS
 * Must be called before any innerHTML assignment
 */
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Highlight astrological terms in text by wrapping them in <strong> tags
 * Processes escaped HTML text and returns HTML with highlights
 *
 * Terms highlighted:
 * - Planets: Sun, Moon, Mercury, Venus, Mars, Jupiter, Saturn, Uranus, Neptune, Pluto
 * - Points: North Node, South Node, Chiron, Ceres, Ascendant, Midheaven, Descendant, IC
 * - Signs: Aries, Taurus, Gemini, Cancer, Leo, Virgo, Libra, Scorpio, Sagittarius, Capricorn, Aquarius, Pisces
 * - Houses: 1st-12th (with or without "house" word)
 *
 * NOT highlighted (for readability):
 * - Aspects: conjunction, opposition, trine, square, etc.
 */
function highlightAstroTerms(escapedHtml) {
  // Highlight style: semi-bold (lighter than full bold for readability)
  const highlight = (text) => `<span style="font-weight:600">${text}</span>`;

  // Multi-word terms must come first (before single words get matched)
  const multiWordTerms = [
    "North Node",
    "South Node",
    "Imum Coeli",
    "Part of Fortune",
    "Part of Spirit",
    "Galactic Center",
    "Anti-Vertex",
    // Lunar phases
    "New Moon",
    "Full Moon",
    "First Quarter Moon",
    "Last Quarter Moon",
    "Third Quarter Moon",
    "Crescent Moon",
    "Gibbous Moon",
    "Balsamic Moon",
    "Disseminating Moon",
  ];

  // Single-word planets and points
  const planets = [
    "Sun",
    "Moon",
    "Mercury",
    "Venus",
    "Mars",
    "Jupiter",
    "Saturn",
    "Uranus",
    "Neptune",
    "Pluto",
    "Chiron",
    "Ceres",
    "Vesta",
    "Pallas",
    "Juno",
    "Lilith",
    "Priapus",
    "Vertex",
    "Ascendant",
    "Midheaven",
    "Descendant",
    "IC",
    "MC",
  ];

  // Zodiac signs (includes Ophiuchus for True Sidereal)
  const signs = [
    "Aries",
    "Taurus",
    "Gemini",
    "Cancer",
    "Leo",
    "Virgo",
    "Libra",
    "Scorpio",
    "Ophiuchus",
    "Sagittarius",
    "Capricorn",
    "Aquarius",
    "Pisces",
  ];

  let result = escapedHtml;

  // 1. Multi-word terms first (case-insensitive, preserves original case)
  for (const term of multiWordTerms) {
    const regex = new RegExp(`\\b(${term})\\b`, "gi");
    result = result.replace(regex, (match) => highlight(match));
  }

  // 2. Planets and points (case-sensitive to avoid false positives like "sun" in "sunny")
  for (const term of planets) {
    // Match the term with optional possessive 's
    const regex = new RegExp(`\\b(${term})('s)?\\b`, "g");
    result = result.replace(regex, (_, p1, p2) => highlight(p1) + (p2 || ""));
  }

  // 3. Signs (case-sensitive)
  for (const term of signs) {
    const regex = new RegExp(`\\b(${term})\\b`, "g");
    result = result.replace(regex, (match) => highlight(match));
  }

  // 4. House references: ordinals 1st-12th (with or without "house" word)
  // Matches "his 8th", "her 5th", "1st house", "4th and 10th houses", etc.
  // Only 1-12 since there are 12 houses - avoids false positives with other ordinals
  result = result.replace(
    /\b(1st|2nd|3rd|4th|5th|6th|7th|8th|9th|10th|11th|12th)\b/gi,
    (match) => highlight(match),
  );

  return result;
}

/**
 * Process message text for display: escape HTML then highlight astro terms
 * Use this for all AI message rendering
 */
function formatAIMessageText(text) {
  return highlightAstroTerms(escapeHtml(text));
}

// Shared aspect definitions (matches app)
const ASPECT_DEFINITIONS = [
  { name: "conjunction", angle: 0, orb: 10 },
  { name: "opposition", angle: 180, orb: 10 },
  { name: "trine", angle: 120, orb: 8 },
  { name: "square", angle: 90, orb: 8 },
  { name: "sextile", angle: 60, orb: 6 },
  { name: "semisextile", angle: 30, orb: 3 },
  { name: "quincunx", angle: 150, orb: 3 },
];

// Map planet names to settings keys (handles naming inconsistencies)
const PLANET_TO_SETTINGS_KEY = {
  "North Node": "True_Node",
  "Ascendant Symbol": "Ascendant_Symbol",
};

/**
 * Check if a planet has aspects enabled in settings
 * Returns true if settings not available (fallback to include all)
 */
const isPlanetAspectEnabled = (planetName, settings) => {
  if (!settings?.wheelSettings?.planets) return true;
  const key = PLANET_TO_SETTINGS_KEY[planetName] || planetName;
  const planetSettings = settings.wheelSettings.planets[key];
  // If planet not in settings, include it (custom points, etc.)
  if (!planetSettings) return true;
  return planetSettings.aspect === true;
};

/**
 * Filter planets to only those with aspects enabled in settings
 */
const filterPlanetsByAspectSettings = (planets, settings) => {
  if (!settings?.wheelSettings?.planets) return planets;
  return planets.filter((p) => isPlanetAspectEnabled(p.name, settings));
};

/**
 * Add aspectDisabled: true flag to planets that have aspects turned off in settings
 * This helps AI understand why a planet has no aspects in the data
 */
const markDisabledAspectPlanets = (planets, settings) => {
  if (!planets?.length || !settings?.wheelSettings?.planets) return planets;
  return planets.map((p) => {
    if (!isPlanetAspectEnabled(p.name, settings)) {
      return { ...p, aspectDisabled: true };
    }
    return p;
  });
};

/**
 * Capitalize first letter of aspect name to match settings keys
 * e.g., "conjunction" -> "Conjunction"
 */
const capitalizeAspect = (name) => name.charAt(0).toUpperCase() + name.slice(1);

/**
 * Check if an aspect type is enabled in settings
 * Returns true if settings not available (fallback to include all)
 */
const isAspectTypeEnabled = (aspectName, settings) => {
  if (!settings?.aspectSettings?.enabled) return true;
  const key = capitalizeAspect(aspectName);
  const enabled = settings.aspectSettings.enabled[key];
  // If aspect not in settings, include it (fallback)
  if (enabled === undefined) return true;
  return enabled === true;
};

/**
 * Get aspect definitions with user-configured orbs
 * Falls back to default orbs if settings not available
 */
const getAspectDefinitions = (settings) => {
  if (!settings?.aspectSettings?.orbs) return ASPECT_DEFINITIONS;

  return ASPECT_DEFINITIONS.map((asp) => {
    const key = capitalizeAspect(asp.name);
    const userOrb = settings.aspectSettings.orbs[key];
    return {
      ...asp,
      orb: userOrb !== undefined ? userOrb : asp.orb,
    };
  });
};

// Shared helper functions
const normalizeAngle = (v) => ((v % 360) + 360) % 360;
const angleDelta = (a, b) => {
  const diff = Math.abs(normalizeAngle(a) - normalizeAngle(b));
  return diff > 180 ? 360 - diff : diff;
};

// Format orb as degrees°minutes to match app display (e.g., "2°27'")
const formatOrb = (orbDecimal) => {
  const deg = Math.floor(orbDecimal);
  const min = Math.round((orbDecimal - deg) * 60);
  return `${deg}°${String(min).padStart(2, "0")}'`;
};

/**
 * Calculate timing hint for transits based on orb and planet speed
 * @param {number} orbDegrees - Orb in decimal degrees
 * @param {number} speed - Planet speed in degrees/day (absolute value used)
 * @param {boolean} isProgressed - If true, speed represents degrees/year (secondary progressions)
 * @returns {string|null} Human-readable timing hint or null if can't calculate
 */
// Average speeds in degrees/day for each planet
const AVERAGE_PLANET_SPEEDS = {
  Moon: 13.2,
  Sun: 0.986,
  Mercury: 1.2,
  Venus: 1.0,
  Mars: 0.5,
  Jupiter: 0.083,
  Saturn: 0.034,
  Uranus: 0.012,
  Neptune: 0.006,
  Pluto: 0.004,
  "North Node": 0.053,
  "South Node": 0.053,
  Chiron: 0.02,
  Lilith: 0.11,
  Ceres: 0.2,
  Pallas: 0.2,
  Juno: 0.2,
  Vesta: 0.2,
};

// Fast movers where retrograde significantly affects timing - need station detection
const FAST_MOVERS = ["Mercury", "Venus", "Mars"];

// Slow movers where we use average speed for stable estimates
// (station doesn't meaningfully affect multi-month/year transits)
const SLOW_MOVERS = ["Jupiter", "Saturn", "Uranus", "Neptune", "Pluto", "Chiron"];

// Planets that never retrograde - use current speed
const NO_RETROGRADE = ["Moon", "Sun"];

/**
 * Get the effective speed to use for timing calculation
 * - Moon/Sun: use current speed (no retrograde)
 * - All other planets: use average speed for stable estimates
 *   (accounts for speed fluctuation and retrograde periods)
 */
const getEffectiveSpeed = (planetName, currentSpeed) => {
  if (NO_RETROGRADE.includes(planetName)) {
    return currentSpeed;
  }
  // Use average speed for all planets that can retrograde
  return AVERAGE_PLANET_SPEEDS[planetName] || currentSpeed;
};

/**
 * Check if a fast-moving planet is near station
 * Only applies to Mercury, Venus, Mars where station significantly affects timing
 * @returns {string|null} "retrograde" if approaching Rx station, "direct" if approaching D station, null if not near station
 */
const checkStationStatus = (planetName, speed) => {
  if (!FAST_MOVERS.includes(planetName)) return null;
  const avgSpeed = AVERAGE_PLANET_SPEEDS[planetName];
  if (!avgSpeed) return null;

  const absSpeed = Math.abs(speed);
  // If moving less than 25% of average speed, planet is near station
  if (absSpeed < avgSpeed * 0.25) {
    // Positive speed = direct motion, slowing toward retrograde station
    // Negative speed = retrograde motion, slowing toward direct station
    return speed > 0 ? "retrograde" : "direct";
  }
  return null;
};

const calculateTimingHint = (orbDegrees, speed, isProgressed = false, planetName = null) => {
  // Planet is stationary - can't estimate timing
  if (!speed || Math.abs(speed) < 0.0001) return "uncertain (stationary)";

  const absSpeed = Math.abs(speed);

  // For fast movers (Mercury, Venus, Mars), check if near station
  if (planetName) {
    const stationStatus = checkStationStatus(planetName, speed);
    if (stationStatus === "retrograde") {
      return "uncertain (stationing retrograde)";
    }
    if (stationStatus === "direct") {
      return "uncertain (stationing direct)";
    }
  }

  // Get effective speed: current for Moon/Sun, average for all others
  const effectiveSpeed = planetName ? getEffectiveSpeed(planetName, absSpeed) : absSpeed;
  const timeUnits = orbDegrees / effectiveSpeed;
  const isSlowMover = planetName && SLOW_MOVERS.includes(planetName);

  if (isProgressed) {
    // For progressions: timeUnits is "progressed days" = actual years
    // Convert to months for better precision (progressed Moon ~1°/month)
    const months = timeUnits * 12;

    if (months < 0.5) return "within weeks";
    if (months < 18) {
      const m = Math.round(months);
      return m === 1 ? "~1 month" : `~${m} months`;
    }
    const y = Math.round(months / 12);
    return y === 1 ? "~1 year" : `~${y} years`;
  } else {
    // For transits: speed is degrees/day, timeUnits is actual days
    const days = timeUnits;

    // For slow movers (Jupiter-Pluto), use conservative year-based language
    // since retrograde motion can significantly affect actual timing
    if (isSlowMover) {
      if (days < 30) return "in the coming weeks";
      if (days < 90) return "in the coming months";
      if (days < 180) return "within ~6 months";
      if (days < 365) return "within the year";
      const y = Math.round(days / 365);
      return y === 1 ? "~1 year" : `~${y} years`;
    }

    // For fast movers and Moon/Sun, use precise timing
    if (days < 1) return "within hours";
    if (days < 6.5) {
      const d = Math.round(days);
      return d === 1 ? "~1 day" : `~${d} days`;
    }
    if (days < 75) {
      const w = Math.round(days / 7);
      return w === 1 ? "~1 week" : `~${w} weeks`;
    }
    if (days < 365) {
      const m = Math.round(days / 30);
      return `~${m} months`;
    }
    const y = Math.round(days / 365);
    return y === 1 ? "~1 year" : `~${y} years`;
  }
};

/**
 * Calculate past timing hint (how long ago something happened)
 * Uses same logic as calculateTimingHint but with past-oriented phrasing
 */
const calculatePastTimingHint = (orbDegrees, speed, isProgressed = false, planetName = null) => {
  // Planet is stationary - can't estimate timing
  if (!speed || Math.abs(speed) < 0.0001) return "uncertain (stationary)";

  const absSpeed = Math.abs(speed);

  // For fast movers (Mercury, Venus, Mars), check if near station
  if (planetName) {
    const stationStatus = checkStationStatus(planetName, speed);
    if (stationStatus === "retrograde" || stationStatus === "direct") {
      return "uncertain (near station)";
    }
  }

  // Get effective speed: current for Moon/Sun, average for all others
  const effectiveSpeed = planetName ? getEffectiveSpeed(planetName, absSpeed) : absSpeed;
  const timeUnits = orbDegrees / effectiveSpeed;
  const isSlowMover = planetName && SLOW_MOVERS.includes(planetName);

  if (isProgressed) {
    // For progressions: timeUnits is "progressed days" = actual years
    const months = timeUnits * 12;

    if (months < 0.5) return "within past weeks";
    if (months < 18) {
      const m = Math.round(months);
      return m === 1 ? "~1 month ago" : `~${m} months ago`;
    }
    const y = Math.round(months / 12);
    return y === 1 ? "~1 year ago" : `~${y} years ago`;
  } else {
    // For transits: speed is degrees/day, timeUnits is actual days
    const days = timeUnits;

    // For slow movers (Jupiter-Pluto), use conservative year-based language
    if (isSlowMover) {
      if (days < 30) return "in recent weeks";
      if (days < 90) return "in recent months";
      if (days < 180) return "within past ~6 months";
      if (days < 365) return "within the past year";
      const y = Math.round(days / 365);
      return y === 1 ? "~1 year ago" : `~${y} years ago`;
    }

    // For fast movers and Moon/Sun, use precise timing
    if (days < 1) return "within past hours";
    if (days < 6.5) {
      const d = Math.round(days);
      return d === 1 ? "~1 day ago" : `~${d} days ago`;
    }
    if (days < 75) {
      const w = Math.round(days / 7);
      return w === 1 ? "~1 week ago" : `~${w} weeks ago`;
    }
    if (days < 365) {
      const m = Math.round(days / 30);
      return `~${m} months ago`;
    }
    const y = Math.round(days / 365);
    return y === 1 ? "~1 year ago" : `~${y} years ago`;
  }
};

// Calculate applying/separating for cross-chart aspects (transit/synastry)
// p1 = aspecting planet (transit/progressed/person2)
// p2 = reference planet (natal/person1) - treated as stationary
// Uses POSITION-BASED logic: has the transit planet crossed the exact aspect position?
// This correctly handles retrograde planets where motion direction differs from "has it happened"
const calculateApplying = (p1Pos, p2Pos, p1Speed, p2Speed, aspectAngle) => {
  // Compute signed difference in [-180, +180]
  // Positive raw = transit is ahead of natal (has passed natal in zodiacal order)
  // Negative raw = transit is behind natal (hasn't reached natal yet)
  let raw = p1Pos - p2Pos;
  if (raw > 180) raw -= 360;
  else if (raw < -180) raw += 360;

  // Position-based applying/separating:
  // - applying = transit hasn't crossed the exact aspect position yet
  // - separating = transit has crossed the exact aspect position
  //
  // For conjunction (aspectAngle = 0):
  //   - raw < 0: behind natal = applying
  //   - raw >= 0: at or ahead of natal = separating
  //
  // For other aspects (e.g., square at 90°, opposition at 180°):
  //   - Two exact positions: +aspectAngle and -aspectAngle (in zodiacal order)
  //   - If raw >= 0: near the first exact point, applying if raw < aspectAngle
  //   - If raw < 0: near the second exact point, applying if raw < -aspectAngle
  if (raw >= 0) {
    return raw < aspectAngle; // applying if haven't reached first exact point
  } else {
    return raw < -aspectAngle; // applying if haven't reached second exact point
  }
};

/**
 * Calculate aspects between two sets of planets (synastry/transit)
 * Includes applying/separating status and human-readable description
 * Only includes aspects for planets with aspects enabled in settings
 * Uses user-configured orbs and respects enabled/disabled aspect types
 */
function calculateCrossChartAspects(
  planets1,
  planets2,
  label1,
  label2,
  settings,
) {
  if (!planets1?.length || !planets2?.length) return [];

  // Filter planets to only those with aspects enabled in settings
  const filtered1 = filterPlanetsByAspectSettings(planets1, settings);
  const filtered2 = filterPlanetsByAspectSettings(planets2, settings);

  // Get aspect definitions with user-configured orbs
  const aspectDefs = getAspectDefinitions(settings);

  // Derive prefix from label for human-readable description
  const prefix =
    label1 === "transitPlanet"
      ? "Transiting"
      : label1 === "progressedPlanet"
        ? "Progressed"
        : "";

  const aspects = [];
  for (const p1 of filtered1) {
    if (p1.position == null) continue;
    for (const p2 of filtered2) {
      if (p2.position == null) continue;
      const d = angleDelta(p1.position, p2.position);
      for (const asp of aspectDefs) {
        // Skip disabled aspect types
        if (!isAspectTypeEnabled(asp.name, settings)) continue;

        const orbDiff = Math.abs(d - asp.angle);
        if (orbDiff <= asp.orb) {
          const applying = calculateApplying(
            p1.position,
            p2.position,
            p1.speed,
            p2.speed,
            asp.angle,
          );
          const result = {
            description: `${prefix} ${p1.name} ${asp.name} natal ${p2.name}`,
            aspect: asp.name,
            orb: formatOrb(orbDiff),
            status: applying ? "applying" : "separating",
          };
          // Add timing hint for applying aspects (transit/progressed only)
          if (applying && p1.speed && (label1 === "transitPlanet" || label1 === "progressedPlanet")) {
            const isProgressed = label1 === "progressedPlanet";
            const hint = calculateTimingHint(orbDiff, p1.speed, isProgressed, p1.name);
            if (hint) result.timingHint = hint;
          // Add past timing hint for separating aspects (transit/progressed only)
          } else if (!applying && p1.speed && (label1 === "transitPlanet" || label1 === "progressedPlanet")) {
            const isProgressed = label1 === "progressedPlanet";
            const hint = calculatePastTimingHint(orbDiff, p1.speed, isProgressed, p1.name);
            if (hint) result.pastTimingHint = hint;
          }
          result[label1] = p1.name;
          result[label2] = p2.name;
          aspects.push(result);
          break;
        }
      }
    }
  }
  return aspects;
}

/**
 * Calculate synastry aspects between two people's planets
 * Uses actual names for clarity (e.g., "Athen's Venus" instead of "person1Planet: Venus")
 * Only includes aspects for planets with aspects enabled in settings
 * Uses user-configured orbs and respects enabled/disabled aspect types
 */
function calculateSynastryAspects(
  person1Planets,
  person2Planets,
  person1Name,
  person2Name,
  settings,
) {
  if (!person1Planets?.length || !person2Planets?.length) return [];

  // Filter planets to only those with aspects enabled in settings
  const filtered1 = filterPlanetsByAspectSettings(person1Planets, settings);
  const filtered2 = filterPlanetsByAspectSettings(person2Planets, settings);

  // Get aspect definitions with user-configured orbs
  const aspectDefs = getAspectDefinitions(settings);

  const aspects = [];
  for (const p1 of filtered1) {
    if (p1.position == null) continue;
    for (const p2 of filtered2) {
      if (p2.position == null) continue;
      const d = angleDelta(p1.position, p2.position);
      for (const asp of aspectDefs) {
        // Skip disabled aspect types
        if (!isAspectTypeEnabled(asp.name, settings)) continue;

        const orbDiff = Math.abs(d - asp.angle);
        if (orbDiff <= asp.orb) {
          const applying = calculateApplying(
            p1.position,
            p2.position,
            p1.speed,
            p2.speed,
            asp.angle,
          );
          const p1Label = person1Name ? `${person1Name}'s ${p1.name}` : p1.name;
          const p2Label = person2Name ? `${person2Name}'s ${p2.name}` : p2.name;
          aspects.push({
            description: `${p1Label} ${asp.name} ${p2Label}`,
            planet1: p1Label,
            planet2: p2Label,
            aspect: asp.name,
            orb: formatOrb(orbDiff),
            status: applying ? "applying" : "separating",
          });
          break;
        }
      }
    }
  }
  return aspects;
}

/**
 * Calculate transit-to-natal aspects
 * Only includes aspects for planets with aspects enabled in settings
 */
function calculateTransitAspects(transitPlanets, natalPlanets, settings) {
  return calculateCrossChartAspects(
    transitPlanets,
    natalPlanets,
    "transitPlanet",
    "natalPlanet",
    settings,
  );
}

/**
 * Calculate progressed-to-natal aspects
 * Only includes aspects for planets with aspects enabled in settings
 */
function calculateProgressedAspects(progressedPlanets, natalPlanets, settings) {
  return calculateCrossChartAspects(
    progressedPlanets,
    natalPlanets,
    "progressedPlanet",
    "natalPlanet",
    settings,
  );
}

/**
 * Calculate applying/separating for within-chart aspects (transit-to-transit, progressed-to-progressed)
 * Both planets are moving, so we use relative speed
 */
const calculateApplyingBothMoving = (p1Pos, p2Pos, p1Speed, p2Speed, aspectAngle) => {
  // Compute signed difference in [-180, +180]
  let raw = p1Pos - p2Pos;
  if (raw > 180) raw -= 360;
  else if (raw < -180) raw += 360;

  // How far from exact aspect angle
  const sep = Math.abs(raw);
  const diff = sep - aspectAngle;

  // Derivative of separation using RELATIVE speed (both planets moving)
  const relativeSpeed = (p1Speed || 0) - (p2Speed || 0);
  const deriv = Math.sign(raw) * relativeSpeed;

  // If diff * deriv < 0, we're closing in = applying
  return diff * deriv < 0;
};

/**
 * Calculate within-chart aspects (transit-to-transit or progressed-to-progressed)
 * Both planets are moving, so timing uses relative speed
 * Avoids duplicate pairs (A-B only, not B-A) and self-aspects
 */
function calculateWithinChartAspects(planets, chartType, settings) {
  if (!planets?.length) return [];

  // Filter planets to only those with aspects enabled in settings
  const filtered = filterPlanetsByAspectSettings(planets, settings);

  // Get aspect definitions with user-configured orbs
  const aspectDefs = getAspectDefinitions(settings);

  const prefix = chartType === "transit" ? "Transiting" : "Progressed";
  const isProgressed = chartType === "progressed";

  const aspects = [];
  // Only check each pair once (i < j) to avoid duplicates
  for (let i = 0; i < filtered.length; i++) {
    const p1 = filtered[i];
    if (p1.position == null) continue;

    for (let j = i + 1; j < filtered.length; j++) {
      const p2 = filtered[j];
      if (p2.position == null) continue;

      const d = angleDelta(p1.position, p2.position);
      for (const asp of aspectDefs) {
        // Skip disabled aspect types
        if (!isAspectTypeEnabled(asp.name, settings)) continue;

        const orbDiff = Math.abs(d - asp.angle);
        if (orbDiff <= asp.orb) {
          const applying = calculateApplyingBothMoving(
            p1.position,
            p2.position,
            p1.speed,
            p2.speed,
            asp.angle,
          );

          // Use relative speed for timing (both planets moving)
          const relativeSpeed = Math.abs((p1.speed || 0) - (p2.speed || 0));

          const result = {
            description: `${prefix} ${p1.name} ${asp.name} ${prefix.toLowerCase()} ${p2.name}`,
            aspect: asp.name,
            orb: formatOrb(orbDiff),
            status: applying ? "applying" : "separating",
          };

          // Add timing hints using relative speed
          if (relativeSpeed > 0.0001) {
            if (applying) {
              // For transit-to-transit, use faster planet's name for station detection
              const fasterPlanet = Math.abs(p1.speed || 0) > Math.abs(p2.speed || 0) ? p1.name : p2.name;
              const hint = calculateTimingHint(orbDiff, relativeSpeed, isProgressed, fasterPlanet);
              if (hint) result.timingHint = hint;
            } else {
              const fasterPlanet = Math.abs(p1.speed || 0) > Math.abs(p2.speed || 0) ? p1.name : p2.name;
              const hint = calculatePastTimingHint(orbDiff, relativeSpeed, isProgressed, fasterPlanet);
              if (hint) result.pastTimingHint = hint;
            }
          } else {
            // Both planets moving at same speed - timing uncertain
            if (applying) {
              result.timingHint = "uncertain (parallel motion)";
            } else {
              result.pastTimingHint = "uncertain (parallel motion)";
            }
          }

          result[`${chartType}Planet1`] = p1.name;
          result[`${chartType}Planet2`] = p2.name;
          aspects.push(result);
          break;
        }
      }
    }
  }
  return aspects;
}

/**
 * Calculate transit-to-transit aspects
 */
function calculateTransitToTransitAspects(transitPlanets, settings) {
  return calculateWithinChartAspects(transitPlanets, "transit", settings);
}

/**
 * Calculate progressed-to-progressed aspects
 */
function calculateProgressedToProgressedAspects(progressedPlanets, settings) {
  return calculateWithinChartAspects(progressedPlanets, "progressed", settings);
}

/**
 * Extract and format aspects from planet objects (for natal/composite)
 * Converts embedded planet.aspects with decimal orbs to formatted output
 */
function formatPlanetAspects(planets) {
  if (!planets?.length) return [];

  const aspects = [];
  const processedKeys = new Set();

  for (const planet of planets) {
    if (!planet.aspects?.length) continue;

    for (const asp of planet.aspects) {
      // Create unique key to avoid duplicates (Sun-Moon same as Moon-Sun)
      const key = [planet.name, asp.planet].sort().join("-") + "-" + asp.type;
      if (processedKeys.has(key)) continue;
      processedKeys.add(key);

      aspects.push({
        description: `${planet.name} ${asp.type.toLowerCase()} ${asp.planet}`,
        planet1: planet.name,
        planet2: asp.planet,
        aspect: asp.type.toLowerCase(),
        orb: formatOrb(parseFloat(asp.orb)),
        status: asp.status || "unknown",
      });
    }
  }
  return aspects;
}

/**
 * Ensure all planets have degree/minute calculated (for synastry/transit which only set on click)
 * Renames 'hour' to 'degree' for AI clarity (hour sounds like time, degree is the sign position)
 * Must be called BEFORE stripForAI since it needs position
 */
const ensureDegrees = (planets, zodiacSystem) => {
  if (!window.calculatePlanetDegrees) return planets;
  return planets.map((planet) => {
    // If already has degree, keep as-is
    if (planet.degree !== undefined) return planet;
    // If has hour (from click handler), rename to degree
    if (planet.hour !== undefined) {
      const { hour, ...rest } = planet;
      return { ...rest, degree: hour };
    }
    // Calculate from position
    const { hour, minute } = window.calculatePlanetDegrees(
      planet.position,
      zodiacSystem,
    );
    return { ...planet, degree: hour, minute };
  });
};

/**
 * Normalize retrograde values for AI clarity
 * sr/sd are cryptic - expand to full descriptions
 */
const normalizeRetrograde = (retrograde) => {
  if (retrograde === "sr") return "stationary retrograde";
  if (retrograde === "sd") return "stationary direct";
  if (retrograde === "Rx" || retrograde === true) return true;
  return false;
};

/**
 * Strip fields the user doesn't see and reorder for AI clarity
 * Groups positional info: name → sign → degree → minute → house → retrograde
 * Normalizes minute to number (sometimes comes as string like "07")
 * Normalizes retrograde values (sr → "stationary retrograde", sd → "stationary direct")
 */
const stripForAI = (planets) =>
  planets.map(
    ({ speed, houseNatal, declination, tropical, position, ...rest }) => {
      const {
        name,
        sign,
        degree,
        minute,
        house,
        retrograde,
        aspects,
        ...other
      } = rest;
      return {
        name,
        sign,
        degree,
        minute: typeof minute === "string" ? parseInt(minute, 10) : minute,
        house,
        retrograde: normalizeRetrograde(retrograde),
        ...(aspects && { aspects }),
        ...other,
      };
    },
  );

/**
 * For transit/progressed planets, use houseNatal as house (where they fall in natal houses)
 * This must happen BEFORE stripForAI removes houseNatal
 */
const useNatalHouse = (planets) =>
  planets.map((planet) => ({
    ...planet,
    house: planet.houseNatal ?? planet.house,
  }));

/**
 * Strip embedded aspects from planets
 * Used for person1Planets in synastry - users don't see Person 1's natal aspects in synastry view
 */
const stripEmbeddedAspects = (planets) =>
  planets.map(({ aspects, ...rest }) => rest);

/**
 * Check if a position is near a house cusp (either entering or exiting)
 * Returns true if within threshold degrees of either the current house cusp or next house cusp
 * Used to detect positions where approximations may place the position in the wrong house
 */
function isNearHouseCusp(position, house, houseCusps, threshold = 3) {
  if (!houseCusps?.length || !house) return false;

  // Extract house number from string like "1st", "2nd", "10th" or just a number
  const houseNum = parseInt(house);
  if (isNaN(houseNum)) return false;

  const currentCusp = houseCusps.find((c) => c.name === `House ${houseNum}`);
  const nextHouseNum = houseNum === 12 ? 1 : houseNum + 1;
  const nextCusp = houseCusps.find((c) => c.name === `House ${nextHouseNum}`);
  if (!currentCusp || !nextCusp) return false;

  const pos = ((position % 360) + 360) % 360;
  const currentCuspPos = ((currentCusp.position % 360) + 360) % 360;
  const nextCuspPos = ((nextCusp.position % 360) + 360) % 360;

  // Distance from current house cusp (entry)
  let fromEntry = pos - currentCuspPos;
  if (fromEntry < 0) fromEntry += 360;

  // Distance to next house cusp (exit)
  let toExit = nextCuspPos - pos;
  if (toExit < 0) toExit += 360;

  // Near cusp if within threshold of either entry or exit
  return Math.round(fromEntry) <= threshold || Math.round(toExit) <= threshold;
}

/**
 * Calculate the lunar phase based on Moon's angular distance from Sun
 * Works for any chart type (natal, progressed, transit, composite, return)
 * For transit/progressed charts, also adds timing hints when timingMode is specified
 * @param {Array} planets - Array of planet objects with 'position' field (before stripForAI)
 * @param {string|null} timingMode - 'transit' or 'progressed' to add timing hints, null otherwise
 * @returns {Object|null} - { phase, degreesFromSun, toNextFullMoon?, sinceLastFullMoon?, toNextNewMoon?, sinceLastNewMoon? }
 */
function calculateLunarPhase(planets, timingMode = null, houseCusps = null, zodiacSystem = null) {
  if (!planets || planets.length === 0) return null;

  const sun = planets.find((p) => p.name === "Sun");
  const moon = planets.find((p) => p.name === "Moon");

  if (!sun || !moon || sun.position == null || moon.position == null)
    return null;

  // Calculate Moon's position relative to Sun (0-360°)
  let angle = moon.position - sun.position;
  if (angle < 0) angle += 360;

  // Round for display
  const roundedAngle = Math.round(angle);

  // Determine phase based on angle ranges (45° segments centered on each phase)
  let phase;
  if (angle < 22.5 || angle >= 337.5) {
    phase = "New Moon";
  } else if (angle < 67.5) {
    phase = "Crescent";
  } else if (angle < 112.5) {
    phase = "First Quarter";
  } else if (angle < 157.5) {
    phase = "Gibbous";
  } else if (angle < 202.5) {
    phase = "Full Moon";
  } else if (angle < 247.5) {
    phase = "Disseminating";
  } else if (angle < 292.5) {
    phase = "Last Quarter";
  } else {
    phase = "Balsamic";
  }

  const result = { phase, degreesFromSun: roundedAngle };

  // Add timing hints for transit/progressed charts (when timingMode specified and Moon has speed)
  if (timingMode && moon.speed) {
    // Relative speed: Moon (~13.2°/day for transit, ~1°/month for progressed) - Sun
    const sunSpeed = sun.speed || (timingMode === "progressed" ? 0.083 : 1);
    const relativeSpeed = Math.abs(moon.speed - sunSpeed);
    const isProgressed = timingMode === "progressed";

    if (relativeSpeed > 0.001) {
      // Degrees to/since Full Moon (180°)
      let toFullMoon = 180 - angle;
      if (toFullMoon < 0) toFullMoon += 360;
      let sinceFullMoon = angle - 180;
      if (sinceFullMoon < 0) sinceFullMoon += 360;

      // Degrees to/since New Moon (0°)
      let toNewMoon = 360 - angle;
      let sinceNewMoon = angle;

      // Add timing hints using existing functions
      result.toNextFullMoon = calculateTimingHint(toFullMoon, relativeSpeed, isProgressed, "Moon");
      result.sinceLastFullMoon = calculatePastTimingHint(sinceFullMoon, relativeSpeed, isProgressed, "Moon");
      result.toNextNewMoon = calculateTimingHint(toNewMoon, relativeSpeed, isProgressed, "Moon");
      result.sinceLastNewMoon = calculatePastTimingHint(sinceNewMoon, relativeSpeed, isProgressed, "Moon");

      // Add position data for future lunar phases (sign and house)
      // Only if we have house cusps and zodiac system for calculations
      if (houseCusps && houseCusps.length > 0 && zodiacSystem) {
        // Next New Moon: Sun and Moon will be at same position
        // Approximate position = current Sun + degrees Sun travels until New Moon
        // Sun travels ~1°/day for transits, ~1°/year for progressed
        const sunDailySpeed = isProgressed ? 0.083 : 1;
        const daysToNewMoon = toNewMoon / relativeSpeed;
        const nextNewMoonPosition = (sun.position + (daysToNewMoon * sunDailySpeed)) % 360;
        const newMoonSignData = positionToSignDegree(nextNewMoonPosition, zodiacSystem);
        result.nextNewMoonSign = newMoonSignData.sign;
        if (window.calculateHousePosition) {
          const house = window.calculateHousePosition(nextNewMoonPosition, houseCusps);
          // If within 3° of either cusp (entry or exit), add uncertainty since approximation may place it in wrong house
          if (isNearHouseCusp(nextNewMoonPosition, house, houseCusps)) {
            result.nextNewMoonHouse = `${house} (approximate - near cusp, verify with GRAPH)`;
          } else {
            result.nextNewMoonHouse = house;
          }
        }

        // Next Full Moon: Moon will be opposite Sun
        // Approximate Sun position at Full Moon
        const daysToFullMoon = toFullMoon / relativeSpeed;
        const sunAtFullMoon = (sun.position + (daysToFullMoon * sunDailySpeed)) % 360;
        const moonAtFullMoon = (sunAtFullMoon + 180) % 360;
        const fullMoonSignData = positionToSignDegree(moonAtFullMoon, zodiacSystem);
        result.nextFullMoonSign = fullMoonSignData.sign;
        if (window.calculateHousePosition) {
          const house = window.calculateHousePosition(moonAtFullMoon, houseCusps);
          // If within 3° of either cusp (entry or exit), add uncertainty since approximation may place it in wrong house
          if (isNearHouseCusp(moonAtFullMoon, house, houseCusps)) {
            result.nextFullMoonHouse = `${house} (approximate - near cusp, verify with GRAPH)`;
          } else {
            result.nextFullMoonHouse = house;
          }
        }
      }
    }
  }

  return result;
}

/**
 * Calculate return chart timing (elapsed and remaining time)
 * @param {string|null} returnType - "Solar", "Lunar", or a planet name (Mercury-Saturn)
 * @param {Object|null} returnDate - { day, month, year }
 * @returns {Object|null} - { elapsed, remaining, status } or null if data missing
 */
function calculateReturnTiming(returnType, returnDate) {
  if (!returnType || !returnDate) return null;

  const { day, month, year } = returnDate;
  if (!day || !month || !year) return null;

  // Convert month name to number if needed (same pattern as isTodayChart in backend)
  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  let monthNum = typeof month === "string"
    ? monthNames.findIndex((m) => m.toLowerCase() === month.toLowerCase()) + 1
    : parseInt(month, 10);

  if (!monthNum || monthNum < 1 || monthNum > 12) return null;

  // Parse return date
  const returnDateObj = new Date(parseInt(year), monthNum - 1, parseInt(day));
  const now = new Date();

  // Calculate duration based on return type (mean time until the next return)
  // Solar return: ~365.25 days, Lunar return: ~29.5 days (synodic month)
  // Mercury/Venus circle the zodiac with the Sun (~1 year geocentrically);
  // Mars-Saturn average their sidereal periods
  const returnDurations = {
    Solar: 365.25,
    Lunar: 29.5,
    Mercury: 365.25,
    Venus: 365.25,
    Mars: 686.98,
    Jupiter: 4332.59,
    Saturn: 10759.22,
  };
  const durationDays = returnDurations[returnType] || 29.5;
  const returnEndDate = new Date(returnDateObj.getTime() + durationDays * 24 * 60 * 60 * 1000);

  // Calculate elapsed days since return started
  const elapsedMs = now - returnDateObj;
  const elapsedDays = elapsedMs / (24 * 60 * 60 * 1000);

  // Calculate remaining days until return ends
  const remainingMs = returnEndDate - now;
  const remainingDays = remainingMs / (24 * 60 * 60 * 1000);

  // Determine status and format timing strings
  let status, elapsed, remaining;

  if (elapsedDays < 0) {
    // Return hasn't started yet
    status = "upcoming";
    elapsed = null;
    const daysUntil = Math.abs(elapsedDays);
    if (daysUntil < 1) {
      remaining = "begins within hours";
    } else if (daysUntil < 7) {
      remaining = `begins in ~${Math.round(daysUntil)} days`;
    } else if (daysUntil < 30) {
      remaining = `begins in ~${Math.round(daysUntil / 7)} weeks`;
    } else {
      remaining = `begins in ~${Math.round(daysUntil / 30)} months`;
    }
  } else if (remainingDays > 0) {
    // Return is currently active
    status = "active";
    elapsed = formatReturnDuration(elapsedDays, returnType);
    remaining = formatReturnDuration(remainingDays, returnType);
  } else {
    // Return has ended
    status = "ended";
    elapsed = formatReturnDuration(elapsedDays, returnType) + " since it began";
    const daysAgo = Math.abs(remainingDays);
    if (daysAgo < 1) {
      remaining = "ended within past day";
    } else if (daysAgo < 7) {
      remaining = `ended ~${Math.round(daysAgo)} days ago`;
    } else if (daysAgo < 30) {
      remaining = `ended ~${Math.round(daysAgo / 7)} weeks ago`;
    } else {
      remaining = `ended ~${Math.round(daysAgo / 30)} months ago`;
    }
  }

  return { elapsed, remaining, status };
}

/**
 * Format duration for return timing display
 * Uses appropriate units based on return type and duration
 */
function formatReturnDuration(days, returnType) {
  if (returnType === "Lunar") {
    // Lunar returns are short - use days/weeks
    if (days < 1) return "less than a day";
    if (days < 7) return `~${Math.round(days)} days`;
    if (days < 14) return "~1 week";
    return `~${Math.round(days / 7)} weeks`;
  } else {
    // Solar and planetary returns are long - use weeks/months/years
    if (days < 7) return `~${Math.round(days)} days`;
    if (days < 30) return `~${Math.round(days / 7)} weeks`;
    if (days < 60) return "~1 month";
    if (days < 365) return `~${Math.round(days / 30)} months`;
    if (days < 550) return "~1 year";
    return `~${Math.round(days / 365.25)} years`;
  }
}

/**
 * Strip house field from planets
 * Used for person1Planets in synastry - synastry focuses on overlays and aspects, not Person 1's natal houses
 */
const stripHouse = (planets) => planets.map(({ house, ...rest }) => rest);

/**
 * Rename house to inPerson1House for synastry planets
 * Makes it unambiguous that Person 2's planets fall in Person 1's houses (not the reverse)
 * Maintains field ordering: name, sign, degree, minute, inPerson1House, retrograde
 */
const useOverlayHouse = (planets) =>
  planets.map(({ name, sign, degree, minute, house, retrograde, ...rest }) => ({
    name,
    sign,
    degree,
    minute,
    inPerson1House: house,
    retrograde,
    ...rest,
  }));

/**
 * Extract and format fixed stars for AI
 * Keeps only: name, sign, degree, minute, house, magnitude
 * Removes: tropical, position, eclipticLatitude, houseNatal, retrograde, isFixedStar
 */
const extractFixedStarsForAI = (data, zodiacSystem) => {
  if (!data || !Array.isArray(data)) return [];

  const fixedStars = data.filter((item) => item.isFixedStar === true);
  if (fixedStars.length === 0) return [];

  return fixedStars.map((star) => {
    // Calculate degree/minute within sign from position
    const pos = ((star.position % 360) + 360) % 360;
    let degreeInSign;

    if (zodiacSystem === "Midpoint") {
      // Find sign boundary for True Sidereal
      const boundaries = [
        { sign: "Aries", start: 0 },
        { sign: "Taurus", start: 19.7267 },
        { sign: "Gemini", start: 56.5838 },
        { sign: "Cancer", start: 86.0378 },
        { sign: "Leo", start: 103.1872 },
        { sign: "Virgo", start: 141.6068 },
        { sign: "Libra", start: 191.3253 },
        { sign: "Scorpio", start: 210.2037 },
        { sign: "Ophiuchus", start: 223.4316 },
        { sign: "Sagittarius", start: 235.7895 },
        { sign: "Capricorn", start: 269.1806 },
        { sign: "Aquarius", start: 294.8496 },
        { sign: "Pisces", start: 318.0143 },
      ];
      const signData = boundaries.find((b) => b.sign === star.sign);
      degreeInSign = signData ? pos - signData.start : pos % 30;
      if (degreeInSign < 0) degreeInSign += 360;
    } else if (zodiacSystem === "13 Equal") {
      const signStart =
        EQUAL_13_BOUNDARIES.find((boundary) => boundary.sign === star.sign)
          ?.start ?? 0;
      degreeInSign = pos - signStart;
      if (degreeInSign < 0) degreeInSign += 360;
    } else {
      // Tropical - standard 30° signs
      degreeInSign = pos % 30;
    }

    const degree = Math.floor(degreeInSign);
    const minute = Math.floor((degreeInSign - degree) * 60);

    return {
      name: star.name,
      sign: star.sign,
      degree,
      minute,
      house: star.house,
      magnitude: star.magnitude,
    };
  });
};

/**
 * Strip fixed stars from raw data arrays before sending to AI
 * Fixed stars are now extracted separately via extractFixedStarsForAI
 * This prevents sending redundant data and exceeding payload limits
 */
const stripFixedStarsFromRawData = (data) => {
  if (!data || !Array.isArray(data)) return data;
  return data.filter((item) => !item.isFixedStar);
};

// Tropical sign order (standard 30° each)
const TROPICAL_SIGNS = [
  "Aries",
  "Taurus",
  "Gemini",
  "Cancer",
  "Leo",
  "Virgo",
  "Libra",
  "Scorpio",
  "Sagittarius",
  "Capricorn",
  "Aquarius",
  "Pisces",
];

const EQUAL_13_SIGN_ORDER = [
  "Aries",
  "Taurus",
  "Gemini",
  "Cancer",
  "Leo",
  "Virgo",
  "Libra",
  "Scorpio",
  "Sagittarius",
  "Capricorn",
  "Aquarius",
  "Pisces",
  "Ophiuchus",
];
const EQUAL_13_BOUNDARIES = EQUAL_13_SIGN_ORDER.map((sign, index) => ({
  sign,
  start: (240 + (index - 8) * (360 / EQUAL_13_SIGN_ORDER.length) + 360) % 360,
}));

function zodiacSignOrder(zodiacSystem) {
  if (zodiacSystem === "Midpoint") return MIDPOINT_SIGNS;
  if (zodiacSystem === "13 Equal") return EQUAL_13_SIGN_ORDER;
  return TROPICAL_SIGNS;
}

// Midpoint (True Sidereal) sign boundaries - absolute start positions
// Used internally to calculate sign and degree from position
const MIDPOINT_BOUNDARIES = [
  { sign: "Aries", start: 0 },
  { sign: "Taurus", start: 19.7267 },
  { sign: "Gemini", start: 56.5838 },
  { sign: "Cancer", start: 86.0378 },
  { sign: "Leo", start: 103.1872 },
  { sign: "Virgo", start: 141.6068 },
  { sign: "Libra", start: 191.3253 },
  { sign: "Scorpio", start: 210.2037 },
  { sign: "Ophiuchus", start: 223.4316 },
  { sign: "Sagittarius", start: 235.7895 },
  { sign: "Capricorn", start: 269.1806 },
  { sign: "Aquarius", start: 294.8496 },
  { sign: "Pisces", start: 318.0143 },
];

// Midpoint sign widths - used internally to calculate degreesToNextSign
const MIDPOINT_SIGN_WIDTHS = {
  Aries: 19.73,
  Taurus: 36.86,
  Gemini: 29.45,
  Cancer: 17.15,
  Leo: 38.42,
  Virgo: 49.72,
  Libra: 18.88,
  Scorpio: 13.23,
  Ophiuchus: 12.36,
  Sagittarius: 33.39,
  Capricorn: 25.67,
  Aquarius: 23.16,
  Pisces: 41.99,
};

// Midpoint (True Sidereal) sign order - includes Ophiuchus
const MIDPOINT_SIGNS = [
  "Aries",
  "Taurus",
  "Gemini",
  "Cancer",
  "Leo",
  "Virgo",
  "Libra",
  "Scorpio",
  "Ophiuchus",
  "Sagittarius",
  "Capricorn",
  "Aquarius",
  "Pisces",
];

/**
 * Get the next sign in the zodiac order
 */
function getNextSign(sign, zodiacSystem) {
  const signs = zodiacSignOrder(zodiacSystem);
  const index = signs.indexOf(sign);
  if (index === -1) return null;
  return signs[(index + 1) % signs.length];
}

/**
 * Get the previous sign in the zodiac order
 */
function getPreviousSign(sign, zodiacSystem) {
  const signs = zodiacSignOrder(zodiacSystem);
  const index = signs.indexOf(sign);
  if (index === -1) return null;
  return signs[(index - 1 + signs.length) % signs.length];
}

/**
 * Get the width of a sign in degrees
 */
function getSignWidth(sign, zodiacSystem) {
  if (zodiacSystem === "Midpoint") {
    return MIDPOINT_SIGN_WIDTHS[sign] || 30;
  }
  return 30; // Tropical - all signs are 30°
}

/**
 * Get threshold label for distance
 */
function getDistanceThreshold(degrees) {
  if (degrees <= 3) return "very close";
  if (degrees <= 5) return "close";
  if (degrees <= 10) return "somewhat close";
  return "not close";
}

/**
 * Format distance with threshold so AI quotes it directly
 */
function formatDistance(degrees) {
  return `${degrees}° (${getDistanceThreshold(degrees)})`;
}

/**
 * Format house distance with correct cusp terminology
 * The cusp of house X is where house X STARTS, so distance from house 9
 * when in house 10 = distance from the 10th house cusp
 */
function formatHouseDistance(degrees, currentHouse) {
  return `${degrees}° from ${currentHouse}${getOrdinalSuffix(currentHouse)} house cusp (${getDistanceThreshold(degrees)})`;
}

/**
 * Get ordinal suffix for a number (1st, 2nd, 3rd, 4th, etc.)
 */
function getOrdinalSuffix(n) {
  if (n === 1) return "st";
  if (n === 2) return "nd";
  if (n === 3) return "rd";
  return "th";
}

/**
 * Add houseDegree field to planets (how far into the house)
 * Proximity data is now extracted separately via extractProximityData() for token savings
 * Must be called BEFORE stripForAI (needs position field)
 */
function addHouseDegree(planets, houseCusps) {
  return planets.map((planet) => {
    const { position, house } = planet;

    // Calculate houseDegree (like degree for signs)
    let houseDegree = null;
    if (position != null && house && houseCusps?.length) {
      const currentCusp = houseCusps.find((c) => c.name === `House ${house}`);
      if (currentCusp) {
        const pos = ((position % 360) + 360) % 360;
        const currentPos = ((currentCusp.position % 360) + 360) % 360;

        let degreesPast = pos - currentPos;
        if (degreesPast < 0) degreesPast += 360;

        houseDegree = Math.round(degreesPast);
      }
    }

    // Build result with houseDegree positioned right after house
    const { houseDegree: existingHouseDegree, ...rest } = planet;
    const result = {};
    for (const key of Object.keys(rest)) {
      result[key] = rest[key];
      if (key === "house" && houseDegree != null) {
        result.houseDegree = houseDegree;
      }
    }
    return result;
  });
}

/**
 * Extract proximity data from planets into a separate object keyed by planet name
 * Returns { "Sun": { signs: {...}, houses: {...} }, "Moon": {...}, ... }
 * This is sent separately in chartContext and only returned when get_proximity_data tool is called
 * @param {Array} planets - Array of planet objects
 * @param {string} zodiacSystem - Zodiac system for sign width calculation
 * @param {Array} houseCusps - House cusp data
 * @param {string|null} timingMode - 'transit' or 'progressed' to add timing hints, null otherwise
 */
function extractProximityData(planets, zodiacSystem, houseCusps, timingMode = null) {
  const proximityData = {};
  const isProgressed = timingMode === "progressed";

  for (const planet of planets) {
    const { name, sign, degree, position, house, speed } = planet;
    if (!name) continue;

    const proximity = {};

    // Add sign proximity
    if (sign && degree != null) {
      const signWidth = getSignWidth(sign, zodiacSystem);
      const nextSign = getNextSign(sign, zodiacSystem);
      const previousSign = getPreviousSign(sign, zodiacSystem);
      const nextDegrees = Math.round(signWidth - degree);
      const prevDegrees = Math.round(degree);
      proximity.signs = {
        [`to${nextSign}`]: formatDistance(nextDegrees),
        [`from${previousSign}`]: formatDistance(prevDegrees),
      };
      // Add timing hint for sign entry if this is transit/progressed and planet has speed
      // For retrograde motion (speed < 0), calculate timing to PREVIOUS sign instead
      // Use >= 0 to include planets at exactly the sign boundary (about to enter)
      if (timingMode && speed) {
        const isRetrograde = speed < 0;
        const targetSign = isRetrograde ? previousSign : nextSign;
        const degreesToTarget = isRetrograde ? prevDegrees : nextDegrees;
        if (degreesToTarget >= 0) {
          const hint = calculateTimingHint(degreesToTarget, speed, isProgressed, name);
          if (hint) proximity.signs[`to${targetSign}Timing`] = hint;
        }
        // Add past timing hint (when did planet enter current sign)
        // Use current sign in field name so AI says "entered Pisces" not "entered Aquarius"
        // Use >= 0 to include planets at exactly 0° (just entered the sign)
        const degreesSinceEntry = isRetrograde ? nextDegrees : prevDegrees;
        if (degreesSinceEntry >= 0) {
          const pastHint = calculatePastTimingHint(degreesSinceEntry, speed, isProgressed, name);
          if (pastHint) proximity.signs[`since${sign}Timing`] = pastHint;
        }
      }
    }

    // Add house proximity
    if (position != null && house && houseCusps?.length) {
      const currentCusp = houseCusps.find((c) => c.name === `House ${house}`);
      if (currentCusp) {
        const prevHouseNum = house === 1 ? 12 : house - 1;
        const nextHouseNum = house === 12 ? 1 : house + 1;
        const nextCusp = houseCusps.find(
          (c) => c.name === `House ${nextHouseNum}`,
        );
        if (nextCusp) {
          const pos = ((position % 360) + 360) % 360;
          const currentPos = ((currentCusp.position % 360) + 360) % 360;
          const nextPos = ((nextCusp.position % 360) + 360) % 360;

          let degreesToNext = nextPos - pos;
          if (degreesToNext < 0) degreesToNext += 360;
          if (degreesToNext > 180) degreesToNext = 360 - degreesToNext;

          let degreesPast = pos - currentPos;
          if (degreesPast < 0) degreesPast += 360;

          proximity.houses = {
            [`toHouse${nextHouseNum}`]: formatDistance(
              Math.round(degreesToNext),
            ),
            [`fromHouse${prevHouseNum}`]: formatHouseDistance(
              Math.round(degreesPast),
              house,
            ),
          };
          // Add timing hint for house entry if this is transit/progressed and planet has speed
          // For retrograde motion (speed < 0), calculate timing to PREVIOUS house instead
          // Use >= 0 to include planets at exactly the house cusp (about to enter)
          if (timingMode && speed) {
            const isRetrograde = speed < 0;
            const targetHouseNum = isRetrograde ? prevHouseNum : nextHouseNum;
            const degreesToTarget = isRetrograde ? Math.round(degreesPast) : Math.round(degreesToNext);
            if (degreesToTarget >= 0) {
              const hint = calculateTimingHint(degreesToTarget, speed, isProgressed, name);
              if (hint) proximity.houses[`toHouse${targetHouseNum}Timing`] = hint;
            }
            // Add past timing hint (when did planet enter current house)
            // Use current house in field name so AI says "entered 7th house" not "entered 6th house"
            // Use >= 0 to include planets at exactly 0° (just entered the house)
            const degreesSinceEntry = isRetrograde ? Math.round(degreesToNext) : Math.round(degreesPast);
            if (degreesSinceEntry >= 0) {
              const pastHint = calculatePastTimingHint(degreesSinceEntry, speed, isProgressed, name);
              if (pastHint) proximity.houses[`sinceHouse${house}Timing`] = pastHint;
            }
          }
        }
      }
    }

    if (Object.keys(proximity).length > 0) {
      proximityData[name] = proximity;
    }
  }

  return proximityData;
}

/**
 * Convert absolute position (0-360°) to sign/degree/minute
 * Works for both Tropical (30° signs) and Midpoint (unequal signs)
 */
function positionToSignDegree(position, zodiacSystem) {
  // Normalize position to 0-360
  const pos = ((position % 360) + 360) % 360;

  let sign, degreeInSign;

  if (zodiacSystem === "Midpoint") {
    // Midpoint/True Sidereal - find which sign contains this position
    let signIndex = MIDPOINT_BOUNDARIES.length - 1; // Default to last sign (Pisces)
    for (let i = 0; i < MIDPOINT_BOUNDARIES.length; i++) {
      const current = MIDPOINT_BOUNDARIES[i];
      const next = MIDPOINT_BOUNDARIES[i + 1];
      if (!next || (pos >= current.start && pos < next.start)) {
        signIndex = i;
        break;
      }
    }
    sign = MIDPOINT_BOUNDARIES[signIndex].sign;
    degreeInSign = pos - MIDPOINT_BOUNDARIES[signIndex].start;
  } else if (zodiacSystem === "13 Equal") {
    let signIndex = EQUAL_13_BOUNDARIES.length - 1;
    for (let i = 0; i < EQUAL_13_BOUNDARIES.length; i++) {
      if (pos >= EQUAL_13_BOUNDARIES[i].start) signIndex = i;
    }
    sign = EQUAL_13_BOUNDARIES[signIndex].sign;
    degreeInSign = pos - EQUAL_13_BOUNDARIES[signIndex].start;
    if (degreeInSign < 0) degreeInSign += 360;
  } else {
    // Tropical - standard 30° signs
    const signIndex = Math.floor(pos / 30);
    sign = TROPICAL_SIGNS[signIndex];
    degreeInSign = pos % 30;
  }

  const degree = Math.floor(degreeInSign);
  const minute = Math.floor((degreeInSign - degree) * 60);

  return { sign, degree, minute };
}

/**
 * Get all signs contained within a house (from this cusp to next cusp, inclusive)
 * @param {string} thisCuspSign - The sign at this house's cusp
 * @param {string} nextCuspSign - The sign at the next house's cusp
 * @param {string} zodiacSystem - "Midpoint" for True Sidereal, else Tropical
 * @returns {string[]} Array of signs from thisCuspSign to nextCuspSign (inclusive)
 */
function getContainedSigns(thisCuspSign, nextCuspSign, zodiacSystem) {
  const signs = zodiacSignOrder(zodiacSystem);
  const startIndex = signs.indexOf(thisCuspSign);
  const endIndex = signs.indexOf(nextCuspSign);

  if (startIndex === -1 || endIndex === -1) {
    return [thisCuspSign]; // Fallback if sign not found
  }

  const containedSigns = [];
  let i = startIndex;
  while (true) {
    containedSigns.push(signs[i]);
    if (i === endIndex) break;
    i = (i + 1) % signs.length;
    if (containedSigns.length > signs.length) break; // Safety check
  }

  return containedSigns;
}

/**
 * Calculate intercepted signs from house cusps
 * An intercepted sign is one that appears in a house's containedSigns but not on any house cusp
 * @param {Array} houseCusps - Array of house cusp objects with sign and containedSigns fields
 * @returns {string[]} Array of intercepted sign names
 */
function getInterceptedSigns(houseCusps) {
  if (!houseCusps || houseCusps.length === 0) return [];

  // Collect all signs that appear on cusps
  const cuspSigns = new Set(houseCusps.map((h) => h.sign));

  // Collect all signs that appear in any containedSigns
  const allContainedSigns = new Set();
  houseCusps.forEach((h) => {
    if (h.containedSigns) {
      h.containedSigns.forEach((s) => allContainedSigns.add(s));
    }
  });

  // Intercepted signs are in containedSigns but not on any cusp
  const intercepted = [];
  allContainedSigns.forEach((sign) => {
    if (!cuspSigns.has(sign)) {
      intercepted.push(sign);
    }
  });

  return intercepted;
}

/**
 * Gather all available chart context from window.* variables
 */
function gatherChartContext() {
  // Get current settings for filtering aspects (must be retrieved early)
  const currentSettings =
    typeof getSettingsData === "function" ? getSettingsData() : null;

  // Get zodiac system for degree calculation (needed for True Sidereal unequal signs)
  const zodiacSystem = window.natalData?.[0]?.zodiacSystem;
  // Normalize zodiacSystem: metadata stores "Midpoint (True Sidereal)" but calculatePlanetDegrees expects "Midpoint"
  const zodiacSystemNormalized = zodiacSystem?.startsWith("Midpoint")
    ? "Midpoint"
    : zodiacSystem;

  // For synastry, replace house with the overlay position (where Person 2's planets fall in Person 1's houses)
  // Uses the same calculateHousePosition function as the click handler in sharedNatal.js
  let synastryPlanets = window.synastryPlanets || [];
  if (
    synastryPlanets.length > 0 &&
    window.chart1HouseCusps &&
    window.calculateHousePosition
  ) {
    // Calculate overlay house positions (where Person 2's planets fall in Person 1's houses)
    // Don't include houseInOwnChart to avoid AI confusion - it was reading natal house instead of overlay
    synastryPlanets = synastryPlanets.map((planet) => ({
      ...planet,
      house: window.calculateHousePosition(
        planet.position,
        window.chart1HouseCusps,
      ),
    }));
  }

  const natalPlanets = window.natalPlanets || [];
  const transitPlanets = window.transitPlanets || [];
  const returnPlanets = window.returnPlanets || [];

  // For composite, recalculate house positions using composite house cusps
  // (buildComposite incorrectly copies person 1's houses instead of calculating composite houses)
  let compositePlanets = window.compositePlanets || [];
  if (
    compositePlanets.length > 0 &&
    window.compositeHouseCusps &&
    window.calculateHousePosition
  ) {
    compositePlanets = compositePlanets.map((planet) => ({
      ...planet,
      house: window.calculateHousePosition(
        planet.position,
        window.compositeHouseCusps,
      ),
    }));
  }
  const progressedPlanets = window.progressedPlanets || [];

  // Extract raw house cusps with positions (for internal calculations)
  const rawNatalHouseCusps = (window.natalData || [])
    .filter((item) => item.name?.startsWith("House"))
    .map((h) => ({ name: h.name, position: h.position }));

  // Extract composite house cusps (for composite planets)
  const rawCompositeHouseCusps = (window.compositeHouseCusps || []).map(
    (h) => ({ name: h.name, position: h.position }),
  );

  // Extract return house cusps (for return planets)
  const rawReturnHouseCusps = (window.returnHouseCusps || []).map((h) => ({
    name: h.name,
    position: h.position,
  }));

  // Convert natal house cusps to sign/degree/minute format for AI output
  // Include containedSigns: all signs within each house (from this cusp to next cusp)
  const natalHouseCusps = rawNatalHouseCusps.map((h, index, arr) => {
    const { sign, degree, minute } = positionToSignDegree(
      h.position,
      zodiacSystemNormalized,
    );
    const nextHouse = arr[(index + 1) % arr.length];
    const nextCuspSign = positionToSignDegree(
      nextHouse.position,
      zodiacSystemNormalized,
    ).sign;
    const containedSigns = getContainedSigns(sign, nextCuspSign, zodiacSystemNormalized);
    return { name: h.name, sign, degree, minute, containedSigns };
  });

  // Convert composite house cusps to sign/degree/minute format for AI output
  // Include containedSigns: all signs within each house (from this cusp to next cusp)
  const compositeHouseCusps = rawCompositeHouseCusps.map((h, index, arr) => {
    const { sign, degree, minute } = positionToSignDegree(
      h.position,
      zodiacSystemNormalized,
    );
    const nextHouse = arr[(index + 1) % arr.length];
    const nextCuspSign = positionToSignDegree(
      nextHouse.position,
      zodiacSystemNormalized,
    ).sign;
    const containedSigns = getContainedSigns(sign, nextCuspSign, zodiacSystemNormalized);
    return { name: h.name, sign, degree, minute, containedSigns };
  });

  // Convert return house cusps to sign/degree/minute format for AI output
  // Include containedSigns: all signs within each house (from this cusp to next cusp)
  const returnHouseCusps = rawReturnHouseCusps.map((h, index, arr) => {
    const { sign, degree, minute } = positionToSignDegree(
      h.position,
      zodiacSystemNormalized,
    );
    const nextHouse = arr[(index + 1) % arr.length];
    const nextCuspSign = positionToSignDegree(
      nextHouse.position,
      zodiacSystemNormalized,
    ).sign;
    const containedSigns = getContainedSigns(sign, nextCuspSign, zodiacSystemNormalized);
    return { name: h.name, sign, degree, minute, containedSigns };
  });

  // Calculate intercepted signs for each chart type
  // An intercepted sign appears in containedSigns but not on any house cusp
  const natalInterceptedSigns = getInterceptedSigns(natalHouseCusps);
  const compositeInterceptedSigns = getInterceptedSigns(compositeHouseCusps);
  const returnInterceptedSigns = getInterceptedSigns(returnHouseCusps);

  // Get names from metadata for synastry aspects
  const person1Name = window.natalData?.[0]?.name || null;
  const person2Name = window.synastryData?.[0]?.name || null;

  // Calculate synastry aspects between the two charts (with actual names for clarity)
  // Only includes aspects for planets with aspects enabled in settings
  const synastryAspects = calculateSynastryAspects(
    natalPlanets,
    synastryPlanets,
    person1Name,
    person2Name,
    currentSettings,
  );

  // Calculate transit-to-natal aspects
  // Only includes aspects for planets with aspects enabled in settings
  const transitAspects = calculateTransitAspects(
    transitPlanets,
    natalPlanets,
    currentSettings,
  );

  // Calculate progressed-to-natal aspects
  // Only includes aspects for planets with aspects enabled in settings
  const progressedAspects = calculateProgressedAspects(
    progressedPlanets,
    natalPlanets,
    currentSettings,
  );

  // Calculate transit-to-transit aspects (within transit chart)
  const transitToTransitAspects = calculateTransitToTransitAspects(
    transitPlanets,
    currentSettings,
  );

  // Calculate progressed-to-progressed aspects (within progressed chart)
  const progressedToProgressedAspects = calculateProgressedToProgressedAspects(
    progressedPlanets,
    currentSettings,
  );

  // Extract and format natal aspects (from embedded planet.aspects)
  const natalAspects = formatPlanetAspects(natalPlanets);

  // Extract and format composite aspects (from embedded planet.aspects)
  const compositeAspects = formatPlanetAspects(compositePlanets);

  // Extract and format return aspects (from embedded planet.aspects)
  const returnAspects = formatPlanetAspects(returnPlanets);

  // Process graph aspects - extract only description and exact dates (same as backend)
  // This dramatically reduces size vs sending raw graphGroupedAspects
  const graphAspects = (window.graphGroupedAspects || []).map(
    ([description, aspects]) => {
      const exactDates = [];
      aspects.forEach(({ aspect }) => {
        if (aspect.transits) {
          aspect.transits.forEach((transit) => {
            const d = transit.date;
            // Just push date string - graph transits don't have status field
            exactDates.push(
              `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`
            );
          });
        }
      });
      return { description, exactDates };
    },
  );

  // Prepare planets with degrees calculated (needed before extracting proximity or stripping)
  const natalPlanetsWithDegrees = ensureDegrees(
    natalPlanets,
    zodiacSystemNormalized,
  );
  const synastryPlanetsWithDegrees = ensureDegrees(
    synastryPlanets,
    zodiacSystemNormalized,
  );
  const compositePlanetsWithDegrees = ensureDegrees(
    compositePlanets,
    zodiacSystemNormalized,
  );
  const returnPlanetsWithDegrees = ensureDegrees(
    returnPlanets,
    zodiacSystemNormalized,
  );
  const transitPlanetsWithDegrees = useNatalHouse(
    ensureDegrees(transitPlanets, zodiacSystemNormalized),
  );
  const progressedPlanetsWithDegrees = useNatalHouse(
    ensureDegrees(progressedPlanets, zodiacSystemNormalized),
  );

  // Extract proximity data BEFORE stripping position (proximity calculation needs position)
  // Proximity is sent separately and only returned when get_proximity_data tool is called
  const natalProximity =
    natalPlanetsWithDegrees.length > 0
      ? extractProximityData(
          natalPlanetsWithDegrees,
          zodiacSystemNormalized,
          rawNatalHouseCusps,
        )
      : null;
  const synastryProximity =
    synastryPlanetsWithDegrees.length > 0
      ? extractProximityData(
          synastryPlanetsWithDegrees,
          zodiacSystemNormalized,
          rawNatalHouseCusps,
        )
      : null;
  const compositeProximity =
    compositePlanetsWithDegrees.length > 0
      ? extractProximityData(
          compositePlanetsWithDegrees,
          zodiacSystemNormalized,
          rawCompositeHouseCusps,
        )
      : null;
  const returnProximity =
    returnPlanetsWithDegrees.length > 0
      ? extractProximityData(
          returnPlanetsWithDegrees,
          zodiacSystemNormalized,
          rawReturnHouseCusps,
        )
      : null;
  const transitProximity =
    transitPlanetsWithDegrees.length > 0
      ? extractProximityData(
          transitPlanetsWithDegrees,
          zodiacSystemNormalized,
          rawNatalHouseCusps,
          "transit",
        )
      : null;
  const progressedProximity =
    progressedPlanetsWithDegrees.length > 0
      ? extractProximityData(
          progressedPlanetsWithDegrees,
          zodiacSystemNormalized,
          rawNatalHouseCusps,
          "progressed",
        )
      : null;

  // Calculate lunar phases BEFORE stripForAI removes the position field
  // These show the Moon's phase relative to the Sun in each chart context
  // Transit and progressed get timing hints; natal/synastry/composite/return are fixed moments
  const natalLunarPhase = calculateLunarPhase(natalPlanetsWithDegrees);
  const synastryLunarPhase = calculateLunarPhase(synastryPlanetsWithDegrees);
  const compositeLunarPhase = calculateLunarPhase(compositePlanetsWithDegrees);
  const returnLunarPhase = calculateLunarPhase(returnPlanetsWithDegrees);
  const transitLunarPhase = calculateLunarPhase(transitPlanetsWithDegrees, "transit", rawNatalHouseCusps, zodiacSystemNormalized);
  const progressedLunarPhase = calculateLunarPhase(progressedPlanetsWithDegrees, "progressed", rawNatalHouseCusps, zodiacSystemNormalized);

  // Apply addHouseDegree BEFORE stripForAI (addHouseDegree needs position, stripForAI removes it)
  // Strip embedded aspects from planets when sending formatted aspects separately (avoids duplication)
  // Only send metadata (first element) from raw data arrays - planets/houses are already extracted separately
  // This reduces payload size significantly and avoids redundant data
  // markDisabledAspectPlanets adds aspectDisabled:true to planets with aspects turned off in settings
  return {
    natalPlanets: markDisabledAspectPlanets(
      stripEmbeddedAspects(
        stripForAI(addHouseDegree(natalPlanetsWithDegrees, rawNatalHouseCusps)),
      ),
      currentSettings,
    ),
    natalData: window.natalData?.[0] ? [window.natalData[0]] : null,
    natalAspects: natalAspects,
    synastryPlanets: markDisabledAspectPlanets(
      useOverlayHouse(
        stripEmbeddedAspects(
          stripForAI(
            addHouseDegree(synastryPlanetsWithDegrees, rawNatalHouseCusps),
          ),
        ),
      ),
      currentSettings,
    ),
    synastryData: window.synastryData?.[0] ? [window.synastryData[0]] : null,
    synastryAspects: synastryAspects,
    compositePlanets: markDisabledAspectPlanets(
      stripEmbeddedAspects(
        stripForAI(
          addHouseDegree(compositePlanetsWithDegrees, rawCompositeHouseCusps),
        ),
      ),
      currentSettings,
    ),
    compositeAspects: compositeAspects,
    // person1Planets removed - backend derives from natalPlanets to avoid duplication
    returnPlanets: markDisabledAspectPlanets(
      stripEmbeddedAspects(
        stripForAI(addHouseDegree(returnPlanetsWithDegrees, rawReturnHouseCusps)),
      ),
      currentSettings,
    ),
    returnAspects: returnAspects,
    returnType: document.getElementById("adjustType")?.value || null,
    returnDate: {
      day: document.getElementById("returnDay")?.value || null,
      month: document.getElementById("returnMonth")?.value || null,
      year: document.getElementById("returnYear")?.value || null,
    },
    returnTiming: calculateReturnTiming(
      document.getElementById("adjustType")?.value || null,
      {
        day: document.getElementById("returnDay")?.value || null,
        month: document.getElementById("returnMonth")?.value || null,
        year: document.getElementById("returnYear")?.value || null,
      }
    ),
    transitPlanets: markDisabledAspectPlanets(
      stripForAI(
        addHouseDegree(transitPlanetsWithDegrees, rawNatalHouseCusps),
      ),
      currentSettings,
    ),
    transitAspects: transitAspects,
    transitToTransitAspects: transitToTransitAspects,
    transitDateTime: {
      day: document.getElementById("triwheelDay")?.value || null,
      month: document.getElementById("triwheelMonth")?.value || null,
      year: document.getElementById("triwheelYear")?.value || null,
      hour: document.getElementById("triwheelHour")?.value || null,
      minute: document.getElementById("triwheelMinute")?.value || null,
    },
    progressedPlanets: markDisabledAspectPlanets(
      stripForAI(
        addHouseDegree(progressedPlanetsWithDegrees, rawNatalHouseCusps),
      ),
      currentSettings,
    ),
    progressedAspects: progressedAspects,
    progressedToProgressedAspects: progressedToProgressedAspects,
    natalHouseCusps: natalHouseCusps,
    natalInterceptedSigns:
      natalInterceptedSigns.length > 0 ? natalInterceptedSigns : null,
    compositeHouseCusps:
      compositeHouseCusps.length > 0 ? compositeHouseCusps : null,
    compositeInterceptedSigns:
      compositeInterceptedSigns.length > 0 ? compositeInterceptedSigns : null,
    returnHouseCusps: returnHouseCusps.length > 0 ? returnHouseCusps : null,
    returnInterceptedSigns:
      returnInterceptedSigns.length > 0 ? returnInterceptedSigns : null,
    natalFixedStars: extractFixedStarsForAI(
      window.natalData,
      zodiacSystemNormalized,
    ),
    // Proximity data extracted separately - only returned when get_proximity_data tool is called
    natalProximity,
    synastryProximity,
    compositeProximity,
    returnProximity,
    transitProximity,
    progressedProximity,
    // Lunar phases - Moon's position relative to Sun in each chart context
    natalLunarPhase,
    synastryLunarPhase,
    compositeLunarPhase,
    returnLunarPhase,
    transitLunarPhase,
    progressedLunarPhase,
    // Note: synastryFixedStars removed - fixed stars are a natal concept, not synastry.
    // Fixed star positions are identical for all charts (they're fixed in the sky).
    // For Person 2's fixed stars, user should swap charts to make Person 2 the main chart.
    // Remove natalData from graphFormData - backend uses chartContext.natalData instead (avoids duplication)
    graphFormData: window.graphFormData
      ? (() => {
          const { natalData, ...rest } = window.graphFormData;
          return rest;
        })()
      : null,
    graphAspects: graphAspects.length > 0 ? graphAspects : null,
    // Current settings from SETTINGS form (reuse settings retrieved at top of function)
    currentSettings: currentSettings,
  };
}

/**
 * Format timestamp for display
 * NOTE: Matches the formatting in community.js for consistency
 */
function formatAITimestamp(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();

  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");

  // Today
  if (date.toDateString() === now.toDateString()) {
    return `today ${hours}:${minutes}`;
  }

  // Yesterday
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) {
    return `yesterday ${hours}:${minutes}`;
  }

  // Check if message is older than 7 days
  const msPerDay = 24 * 60 * 60 * 1000;
  const daysDiff = Math.floor((now - date) / msPerDay);

  if (daysDiff > 7) {
    // Show month and day for messages older than a week
    const month = date
      .toLocaleString("en-US", { month: "short" })
      .toLowerCase();
    const day = date.getDate();
    return `${month} ${day} ${hours}:${minutes}`;
  } else {
    // Show weekday for messages within the past week
    const weekday = date
      .toLocaleString("en-US", { weekday: "long" })
      .toLowerCase();
    return `${weekday} ${hours}:${minutes}`;
  }
}

/**
 * Format reset time in user's local timezone
 * @param {string} isoString - ISO timestamp for reset (midnight UTC)
 * @returns {string} Formatted local time string
 */
function formatResetTimeLocal(isoString) {
  if (!isoString) return "midnight UTC";
  const resetDate = new Date(isoString);
  // Format: "5:00 PM" or "17:00" depending on locale
  return resetDate.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Format reset date in user's local timezone
 * @param {string} isoString - ISO timestamp for reset (billing date)
 * @returns {string} Formatted local date string
 */
function formatResetDateLocal(isoString) {
  if (!isoString) return "your next billing date";
  const date = new Date(isoString);
  // Format: "Jan 15" or "January 15, 2026"
  return date.toLocaleDateString([], {
    month: "short",
    day: "numeric",
  });
}

/**
 * Create a message element for the AI chat
 */
function createAIMessageElement(message, isUser, timestamp) {
  const msgDiv = document.createElement("div");
  msgDiv.style.display = "flex";
  msgDiv.style.alignItems = "flex-start";
  msgDiv.style.marginBottom = "10px";

  let avatar;
  if (isUser) {
    avatar = document.createElement("img");
    avatar.src = window.user?.profile_image || "/images/misc/anonymouse.png";
    avatar.alt = "User";
    avatar.style.width = "26px";
    avatar.style.height = "26px";
    avatar.style.borderRadius = "50%";
    avatar.style.marginRight = "10px";
    avatar.style.objectFit = "cover";
  } else {
    // AI avatar uses div with CSS mask for color-synced gradient
    avatar = document.createElement("div");
    avatar.className = "ai-avatar";
  }

  const messageContainer = document.createElement("div");
  messageContainer.style.wordWrap = "break-word";
  messageContainer.style.whiteSpace = "pre-wrap";
  messageContainer.style.maxWidth = "90%";
  messageContainer.style.fontSize = "18px";

  const usernameSpan = document.createElement("span");
  usernameSpan.textContent = isUser
    ? window.user?.display_name || "You"
    : "Sky";
  usernameSpan.style.fontWeight = "bold";
  messageContainer.appendChild(usernameSpan);

  const timeSpan = document.createElement("span");
  timeSpan.textContent =
    "  " + formatAITimestamp(timestamp || new Date().toISOString());
  timeSpan.style.fontSize = "12px";
  timeSpan.style.color = "#777";
  timeSpan.style.fontFamily = "Geneva, sans-serif";
  timeSpan.style.position = "relative";
  timeSpan.style.top = "-1px";
  messageContainer.appendChild(timeSpan);

  const messageText = document.createElement("div");
  // Only highlight astro terms in AI messages (not user messages) for safety
  if (isUser) {
    messageText.textContent = message;
  } else {
    messageText.innerHTML = formatAIMessageText(message);
  }
  messageText.style.marginTop = "2px";
  messageContainer.appendChild(messageText);

  msgDiv.appendChild(avatar);
  msgDiv.appendChild(messageContainer);

  return msgDiv;
}

/**
 * Create a typing indicator element
 */
function createTypingIndicator() {
  const indicator = document.createElement("div");
  indicator.id = "ai-typing-indicator";
  indicator.style.display = "flex";
  indicator.style.alignItems = "flex-start";
  indicator.style.marginBottom = "10px";

  // AI avatar uses div with CSS mask for color-synced gradient
  const avatar = document.createElement("div");
  avatar.className = "ai-avatar";

  const dotsContainer = document.createElement("div");
  dotsContainer.innerHTML =
    '<span class="typing-dot">.</span><span class="typing-dot">.</span><span class="typing-dot">.</span>';
  dotsContainer.style.fontSize = "24px";
  dotsContainer.style.color = "#cccccc ";

  indicator.appendChild(avatar);
  indicator.appendChild(dotsContainer);

  return indicator;
}

/**
 * Save suggestions to the server (persists with the AI message)
 * @param {string[]} questions - Array of suggested questions
 */
async function saveSuggestions(questions) {
  try {
    await fetch("/api/ai-chat/save-suggestions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ questions }),
    });
  } catch (error) {
    // Non-critical - suggestions will still display, just won't persist
    console.error("Failed to save suggestions:", error);
  }
}

/**
 * Fetch suggested follow-up questions from the server
 * @param {string} lastUserMessage - The user's last message
 * @param {string} lastAIResponse - The AI's response
 * @returns {Promise<string[]>} Array of suggested questions
 */
async function fetchSuggestions(lastUserMessage, lastAIResponse) {
  try {
    const response = await fetch("/api/ai-chat/suggestions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ lastUserMessage, lastAIResponse }),
    });

    if (!response.ok) return [];

    const data = await response.json();
    const questions = data.questions || [];

    // Save suggestions to persist them with the AI message
    if (questions.length > 0) {
      saveSuggestions(questions);
    }

    return questions;
  } catch (error) {
    console.error("Failed to fetch suggestions:", error);
    return [];
  }
}

/**
 * Create suggestion buttons container
 * @param {string[]} questions - Array of suggested questions
 * @param {function} onClickHandler - Function to call when a suggestion is clicked
 * @returns {HTMLElement} Container with suggestion buttons
 */
function createSuggestionButtons(questions, onClickHandler) {
  const container = document.createElement("div");
  container.className = "ai-suggestions-row";
  container.id = "ai-suggestions";

  for (const question of questions) {
    const btn = document.createElement("button");
    btn.className = "ai-suggestion-btn";
    btn.textContent = question;
    btn.addEventListener("click", () => {
      // Remove suggestions when one is clicked
      container.remove();
      onClickHandler(question);
    });
    container.appendChild(btn);
  }

  return container;
}

/**
 * Remove any existing suggestion buttons
 */
function removeSuggestions() {
  const existing = document.getElementById("ai-suggestions");
  if (existing) existing.remove();
}

/**
 * Create a loading indicator for suggestions
 * Uses the same typing-dot animation as the main AI typing indicator
 */
function createSuggestionsLoading() {
  const container = document.createElement("div");
  container.className = "ai-suggestions-loading";
  container.id = "ai-suggestions-loading";
  container.innerHTML =
    '<span class="typing-dot">.</span><span class="typing-dot">.</span><span class="typing-dot">.</span>';
  return container;
}

/**
 * Adjust scroll spacer height to keep user message at top
 * If content below user message fills the viewport, remove spacer
 * Otherwise, set spacer height to the remaining space needed
 */
function adjustScrollSpacer(chatBox, userMsgElement) {
  const spacer = document.getElementById("ai-scroll-spacer");
  if (!spacer || !userMsgElement) return;

  // Calculate content height below user message (excluding spacer)
  const userMsgBottom = userMsgElement.offsetTop + userMsgElement.offsetHeight;
  const spacerTop = spacer.offsetTop;
  const contentBelowUser = spacerTop - userMsgBottom;

  // Calculate how much space we need to keep user message at top
  const chatBoxHeight = chatBox.clientHeight;
  const neededSpacerHeight =
    chatBoxHeight - userMsgElement.offsetHeight - contentBelowUser;

  if (neededSpacerHeight > 0) {
    // Need spacer to keep user message scrollable to top
    spacer.style.height = neededSpacerHeight + "px";
  } else {
    // Content is tall enough, remove spacer
    spacer.remove();
  }

  // Re-scroll user message to top
  setTimeout(() => {
    chatBox.scrollTop = userMsgElement.offsetTop - chatBox.offsetTop;
  }, 50);
}

/**
 * Update remaining messages count and UI display
 */
function updateRemainingMessages(remaining, limit = null, reset = null, unlimited = false, capped = false) {
  remainingMessages = remaining;
  isUnlimited = unlimited;
  fairUseCapped = capped;
  if (limit !== null) monthlyLimit = limit;
  if (reset !== null) resetDate = reset;
  // Update UI if status row exists
  const remainingSpan = document.getElementById("ai-remaining-count");
  if (remainingSpan) {
    if (unlimited || remaining === -1) {
      remainingSpan.textContent = "Unlimited";
    } else {
      const resetDisplay = resetDate ? ` until ${formatResetDateLocal(resetDate)}` : "";
      remainingSpan.textContent = `${remaining} of ${monthlyLimit} remaining${resetDisplay}`;
    }
  }
}

/**
 * Create the AI status row (remaining messages + clear history)
 */
function createAIStatusRow() {
  // Don't create if already exists
  if (document.getElementById("ai-status-row")) return;

  const statusRow = document.createElement("div");
  statusRow.id = "ai-status-row";
  statusRow.style.textAlign = "right";
  statusRow.style.fontSize = "12px";
  statusRow.style.color = "#888";
  statusRow.style.marginTop = "4px";
  // Match chatInputRow's width constraints
  statusRow.style.maxWidth = "625px";
  statusRow.style.marginLeft = "auto";
  statusRow.style.marginRight = "auto";
  statusRow.style.paddingRight = "10px";

  const remainingSpan = document.createElement("span");
  remainingSpan.id = "ai-remaining-count";
  if (isUnlimited || remainingMessages === -1) {
    remainingSpan.textContent = "Unlimited";
  } else {
    const resetDisplay = resetDate ? ` until ${formatResetDateLocal(resetDate)}` : "";
    remainingSpan.textContent = `${remainingMessages} of ${monthlyLimit} remaining${resetDisplay}`;
  }
  statusRow.appendChild(remainingSpan);

  const separator = document.createElement("span");
  separator.textContent = " · ";
  statusRow.appendChild(separator);

  const clearLink = document.createElement("span");
  clearLink.textContent = "Clear history";
  clearLink.style.cursor = "pointer";
  clearLink.style.textDecoration = "underline";
  clearLink.addEventListener("click", clearAIChatHistory);
  statusRow.appendChild(clearLink);

  // Insert after chatInputRow as sibling
  const chatInputRow = document.getElementById("chatInputRow");
  if (chatInputRow && chatInputRow.parentNode) {
    chatInputRow.parentNode.insertBefore(statusRow, chatInputRow.nextSibling);
  }
}

/**
 * Remove the AI status row
 */
function removeAIStatusRow() {
  const statusRow = document.getElementById("ai-status-row");
  if (statusRow) {
    statusRow.remove();
  }
}

/**
 * Clear AI chat history
 */
async function clearAIChatHistory() {
  try {
    const response = await fetch("/api/ai-chat/clear", {
      method: "POST",
      credentials: "same-origin",
    });

    if (!response.ok) {
      throw new Error("Failed to clear history");
    }

    // Reload history to show welcome message
    await loadAIChatHistory();
  } catch (error) {
    console.error("Error clearing AI chat history:", error);
  }
}

/**
 * Load AI chat history from server
 */
async function loadAIChatHistory() {
  const chatBox = document.getElementById("chatBox");
  if (!chatBox) return;

  try {
    const response = await fetch("/api/ai-chat/history", {
      credentials: "same-origin",
    });

    // Check content-type FIRST - if we got HTML, we were redirected to Stripe
    // This happens when checkSubscription middleware redirects GET requests
    const contentType = response.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
      if (response.redirected && response.url) {
        window.location.assign(response.url);
        return;
      }
      throw new Error(
        `Expected JSON while loading chat history (HTTP ${response.status})`,
      );
    }

    if (!response.ok) {
      // Handle JSON error responses
      const errorData = await response.json();
      if (errorData.redirectUrl) {
        window.location.href = errorData.redirectUrl;
        return;
      }
      throw new Error(errorData.error || "Failed to load history");
    }

    const data = await response.json();
    if (data.redirectUrl) {
      window.location.assign(data.redirectUrl);
      return;
    }

    const history = Array.isArray(data)
      ? data
      : Array.isArray(data.messages)
        ? data.messages
        : data.history;
    if (!Array.isArray(history)) {
      throw new Error("Invalid AI chat history response");
    }

    // Check if subscription is required
    subscriptionRequired = data.subscriptionRequired || false;

    // Update rate limit display (only for subscribed users)
    if (data.rateLimit && !subscriptionRequired) {
      updateRemainingMessages(
        data.rateLimit.remaining,
        data.rateLimit.limit,
        data.rateLimit.resetDate,
        data.rateLimit.isUnlimited,
        data.rateLimit.fairUseCapped
      );
    }

    // Hide status row for non-subscribed users
    if (subscriptionRequired) {
      removeAIStatusRow();
    }

    chatBox.innerHTML = "";

    if (!history || history.length === 0) {
      // Show welcome message
      const welcomeDiv = document.createElement("div");
      welcomeDiv.id = "ai-welcome-message";
      welcomeDiv.style.textAlign = "center";
      welcomeDiv.style.padding = "20px";
      welcomeDiv.style.color = "#666";

      const welcomeTitle = document.createElement("p");
      welcomeTitle.style.fontSize = "18px";
      welcomeTitle.style.marginBottom = "4px";
      welcomeTitle.textContent = "Welcome to Sky Chat";
      welcomeDiv.appendChild(welcomeTitle);

      const welcomeSubtitle = document.createElement("p");
      welcomeSubtitle.style.fontSize = "16px";
      welcomeSubtitle.style.color = "#999";
      welcomeSubtitle.textContent = "Ask Sky anything about your charts!";
      welcomeDiv.appendChild(welcomeSubtitle);

      // Show subscribe message for non-subscribed users
      if (subscriptionRequired) {
        const subscribeMsg = document.createElement("p");
        subscribeMsg.style.fontSize = "16px";
        subscribeMsg.style.marginTop = "20px";
        subscribeMsg.style.color = "#666"; // Match welcome div text color
        subscribeMsg.innerHTML =
          'Subscribe to unlock Sky Chat. <a href="/subscribe" style="color: #3498db; text-decoration: underline;">Start your free trial</a>';
        welcomeDiv.appendChild(subscribeMsg);
      }

      // Add starter question buttons
      const starterContainer = document.createElement("div");
      starterContainer.className = "ai-suggestions-row ai-starters";

      const starterQuestions = [
        "Give me a reading",
        "What is my horoscope today?",
        "What can you help me with?",
      ];

      starterQuestions.forEach((question) => {
        const btn = document.createElement("button");
        btn.className = "ai-suggestion-btn";
        btn.textContent = question;
        btn.addEventListener("click", () => {
          sendAIMessage(question);
        });
        starterContainer.appendChild(btn);
      });

      welcomeDiv.appendChild(starterContainer);

      chatBox.appendChild(welcomeDiv);
      return;
    }

    history.forEach((msg) => {
      const isUser = msg.username !== "Sky";
      const msgElement = createAIMessageElement(
        msg.message,
        isUser,
        msg.timestamp,
      );
      chatBox.appendChild(msgElement);
    });

    // Display saved suggestions from the last AI message if available
    if (history.length > 0) {
      const lastMsg = history[history.length - 1];
      if (lastMsg.username === "Sky" && lastMsg.extra_data) {
        try {
          const extraData = JSON.parse(lastMsg.extra_data);
          if (extraData.suggestions && extraData.suggestions.length > 0) {
            const suggestionsContainer = createSuggestionButtons(
              extraData.suggestions,
              sendAIMessage,
            );
            chatBox.appendChild(suggestionsContainer);
          }
        } catch (e) {
          // Ignore parse errors - extra_data might be in different format
        }
      }
    }

    // Scroll to bottom (smooth, matching community chat)
    setTimeout(() => {
      chatBox.scrollTo({
        top: chatBox.scrollHeight,
        behavior: "smooth",
      });
    }, 100);
  } catch (error) {
    console.error("Error loading AI chat history:", error);
    chatBox.textContent = "Unable to load chat history. Please try again later.";
  }
}

/**
 * Send message to AI
 */
async function sendAIMessage(message) {
  const chatBox = document.getElementById("chatBox");
  const chatInput = document.getElementById("chatInput");
  const sendButton = document.getElementById("sendMessage");

  if (!chatBox || !message.trim()) return;

  // Check if subscription is required - redirect to subscribe page
  if (subscriptionRequired) {
    window.location.href = "/subscribe";
    return;
  }

  // Check if unlimited user hit monthly maximum
  if (fairUseCapped) {
    const resetDisplay = resetDate ? formatResetDateLocal(resetDate) : "your next billing date";
    const errorElement = createAIMessageElement(
      `You've reached the monthly maximum (2000 messages). Your limit resets on ${resetDisplay}.`,
      false,
      new Date().toISOString(),
    );
    const textDiv = errorElement.querySelector("div > div:last-child");
    if (textDiv) {
      textDiv.style.color = "#c0392b";
    }
    chatBox.appendChild(errorElement);
    chatBox.scrollTop = chatBox.scrollHeight;
    return;
  }

  // Check if we have messages remaining (skip if unlimited)
  if (!isUnlimited && remainingMessages <= 0) {
    const resetDisplay = resetDate ? formatResetDateLocal(resetDate) : "your next billing date";
    const errorElement = createAIMessageElement(
      `You've reached your monthly message limit (${monthlyLimit} messages). Your limit resets on ${resetDisplay}. Upgrade to Unlimited Sky AI in ACCOUNT for unlimited access.`,
      false,
      new Date().toISOString(),
    );
    const textDiv = errorElement.querySelector("div > div:last-child");
    if (textDiv) {
      textDiv.style.color = "#c0392b";
    }
    chatBox.appendChild(errorElement);
    chatBox.scrollTop = chatBox.scrollHeight;
    return;
  }

  // Clear welcome message if present
  const welcomeDiv = document.getElementById("ai-welcome-message");
  if (welcomeDiv) {
    welcomeDiv.remove();
  }

  // Remove old suggestions
  removeSuggestions();

  // Remove any existing spacer from previous message
  const existingSpacer = document.getElementById("ai-scroll-spacer");
  if (existingSpacer) existingSpacer.remove();

  // Add user message to chat
  const userMsgElement = createAIMessageElement(
    message.trim(),
    true,
    new Date().toISOString(),
  );
  chatBox.appendChild(userMsgElement);

  // Create spacer element to enable scrolling user message to top
  // Height = chatBox height so there's enough room to scroll
  const scrollSpacer = document.createElement("div");
  scrollSpacer.id = "ai-scroll-spacer";
  scrollSpacer.style.height = chatBox.clientHeight + "px";
  scrollSpacer.style.flexShrink = "0";
  chatBox.appendChild(scrollSpacer);

  // Clear input
  if (chatInput) {
    chatInput.value = "";
    chatInput.style.height = "auto";
  }

  // Disable input while processing
  if (chatInput) chatInput.disabled = true;
  if (sendButton) sendButton.disabled = true;

  // Add typing indicator (before spacer so it's visible)
  const typingIndicator = createTypingIndicator();
  chatBox.insertBefore(typingIndicator, scrollSpacer);

  // Scroll user message to top of chat box
  setTimeout(() => {
    chatBox.scrollTop = userMsgElement.offsetTop - chatBox.offsetTop;
  }, 50);

  // Track current request for potential cancellation
  let abortController = new AbortController();

  // Declare outside try so finally block can access it for reload check
  let messageTextDiv = null;

  try {
    // Gather chart context
    const chartContext = gatherChartContext();

    // Send request
    const response = await fetch("/api/ai-chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "same-origin",
      body: JSON.stringify({
        message: message.trim(),
        chartContext: chartContext,
      }),
      signal: abortController.signal,
    });

    // Handle non-OK responses
    if (!response.ok) {
      // Try to parse as JSON for error details
      let errorMessage = "Request failed";
      try {
        const errorData = await response.json();
        if (errorData.redirectUrl) {
          window.location.href = errorData.redirectUrl;
          return;
        }
        errorMessage = errorData.error || errorMessage;
      } catch (e) {
        // Response wasn't JSON
      }
      throw new Error(errorMessage);
    }

    // Remove typing indicator (only if still on AI channel)
    if (isAIChannel) {
      const indicator = document.getElementById("ai-typing-indicator");
      if (indicator) indicator.remove();
    }

    // Create AI message element for streaming response (only if still on AI channel)
    // If user navigated away, we still process the stream (so server saves message)
    // but skip DOM manipulation
    if (isAIChannel) {
      const aiMsgElement = createAIMessageElement(
        "",
        false,
        new Date().toISOString(),
      );
      messageTextDiv = aiMsgElement.querySelector(
        "div > div > div:last-child",
      );
      const spacer = document.getElementById("ai-scroll-spacer");
      if (spacer) {
        chatBox.insertBefore(aiMsgElement, spacer);
      } else {
        chatBox.appendChild(aiMsgElement);
      }
    }

    // Process SSE stream
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullText = "";
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");

      // Keep the last potentially incomplete line in the buffer
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          try {
            const data = JSON.parse(line.slice(6));

            if (data.type === "text") {
              fullText += data.content;
              // Only update DOM if still on AI channel
              if (messageTextDiv && isAIChannel) {
                // Apply astro term highlighting as text streams in
                messageTextDiv.innerHTML = formatAIMessageText(fullText);
                // No auto-scroll during streaming - let user's message stay at top
              }
            } else if (data.type === "error") {
              // Only update DOM if still on AI channel
              if (messageTextDiv && isAIChannel) {
                // Error messages don't need highlighting
                messageTextDiv.textContent =
                  data.message || "Sorry, an error occurred. Please try again.";
                messageTextDiv.style.color = "#c0392b";
              }
            } else if (data.type === "done") {
              // Update remaining messages
              if (typeof data.remaining === "number") {
                updateRemainingMessages(data.remaining, null, null, data.isUnlimited, data.fairUseCapped);
              }
            }
          } catch (e) {
            // Ignore JSON parse errors for incomplete chunks
          }
        }
      }
    }

    // Fetch and save suggested follow-up questions
    // Always fetch (so they're saved for when user returns), but only show DOM updates if on AI channel
    if (fullText && !fullText.includes("error occurred")) {
      // Show loading indicator only if on AI channel
      let loadingIndicator = null;
      if (isAIChannel) {
        loadingIndicator = createSuggestionsLoading();
        const spacerForLoading = document.getElementById("ai-scroll-spacer");
        if (spacerForLoading) {
          chatBox.insertBefore(loadingIndicator, spacerForLoading);
        } else {
          chatBox.appendChild(loadingIndicator);
        }
      }

      fetchSuggestions(message.trim(), fullText).then((questions) => {
        // Remove loading indicator if it exists
        if (loadingIndicator) {
          loadingIndicator.remove();
        }

        // Skip DOM updates if user navigated away from AI channel
        if (!isAIChannel) {
          return;
        }

        if (questions.length > 0) {
          const suggestionsContainer = createSuggestionButtons(
            questions,
            sendAIMessage,
          );
          // Insert before spacer
          const spacerForSuggestions =
            document.getElementById("ai-scroll-spacer");
          if (spacerForSuggestions) {
            chatBox.insertBefore(suggestionsContainer, spacerForSuggestions);
          } else {
            chatBox.appendChild(suggestionsContainer);
          }
        }

        // Adjust spacer height to keep user message at top
        adjustScrollSpacer(chatBox, userMsgElement);
      });
    } else if (isAIChannel) {
      // No suggestions - still need to adjust spacer (only if on AI channel)
      adjustScrollSpacer(chatBox, userMsgElement);
    }
  } catch (error) {
    if (error.name === "AbortError") {
      console.log("AI chat request aborted");
      return;
    }

    console.error("AI chat error:", error);

    // Skip DOM updates if user navigated away from AI channel
    if (!isAIChannel) {
      return;
    }

    // Remove typing indicator
    const indicator = document.getElementById("ai-typing-indicator");
    if (indicator) indicator.remove();

    // Determine user-friendly error message based on error type
    let userMessage;
    const errorMsg = error.message?.toLowerCase() || "";

    if (
      error.name === "TypeError" ||
      errorMsg.includes("fetch") ||
      errorMsg.includes("network") ||
      errorMsg.includes("connection") ||
      errorMsg.includes("internet") ||
      errorMsg.includes("offline")
    ) {
      // Network/connection errors
      userMessage =
        "Connection lost. Please check your internet and try again.";
    } else if (errorMsg.includes("timeout") || error.name === "TimeoutError") {
      // Timeout errors
      userMessage = "The request timed out. Please try again.";
    } else {
      // Generic fallback
      userMessage = "Something went wrong. Please try again.";
    }

    // Show error message
    const errorElement = createAIMessageElement(
      userMessage,
      false,
      new Date().toISOString(),
    );
    const textDiv = errorElement.querySelector("div > div:last-child");
    if (textDiv) {
      textDiv.style.color = "#c0392b";
    }
    chatBox.appendChild(errorElement);

    // Clean up spacer on error
    const errorSpacer = document.getElementById("ai-scroll-spacer");
    if (errorSpacer) errorSpacer.remove();
  } finally {
    // Re-enable input (always, since input is shared across channels)
    if (chatInput) chatInput.disabled = false;
    if (sendButton) sendButton.disabled = false;

    // Auto-focus for desktop users (mobile keyboard popup is intrusive)
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (chatInput && isAIChannel && !isMobile) chatInput.focus();

    // If on AI channel but message element is missing/detached (user navigated away and back),
    // reload history to show the newly saved message
    if (isAIChannel && (!messageTextDiv || !document.body.contains(messageTextDiv))) {
      loadAIChatHistory();
    }
  }
}

// Store reference to subscription click handler for cleanup
let subscriptionClickHandler = null;

/**
 * Switch to AI channel mode
 */
function activateAIChannel() {
  // If already active, just scroll to bottom (don't reload and lose suggestions)
  if (isAIChannel) {
    const chatBox = document.getElementById("chatBox");
    if (chatBox) {
      setTimeout(() => {
        chatBox.scrollTo({ top: chatBox.scrollHeight, behavior: "smooth" });
      }, 100);
    }
    return;
  }

  isAIChannel = true;

  // Create status row (remaining messages + clear history)
  createAIStatusRow();

  // Add click handler for subscription redirect (runs before community.js handler)
  // Uses window.user.subscription_status directly (same pattern as #users channel)
  const sendButton = document.getElementById("sendMessage");
  if (sendButton) {
    subscriptionClickHandler = (e) => {
      // Check subscription status directly (same as #users channel)
      const status = window.user?.subscription_status;
      let hasValidLimited = false;
      if (status?.startsWith("limited_")) {
        const dateMatch = status.match(/^limited_(\d{4}-\d{2}-\d{2})$/);
        if (dateMatch) {
          const expiryDate = new Date(dateMatch[1] + "T00:00:00Z");
          const today = new Date();
          const todayUTC = new Date(
            Date.UTC(
              today.getUTCFullYear(),
              today.getUTCMonth(),
              today.getUTCDate(),
            ),
          );
          if (expiryDate >= todayUTC) {
            hasValidLimited = true;
          }
        }
      }
      const hasValidSubscription =
        status === "active" ||
        status === "trialing" ||
        status === "past_due" ||
        status === "free" ||
        hasValidLimited;

      if (!hasValidSubscription) {
        e.stopImmediatePropagation(); // Prevent community.js handler from running
        window.location.href = "/subscribe";
      }
    };
    // Use capture phase to run before other handlers
    sendButton.addEventListener("click", subscriptionClickHandler, true);
  }

  // Update UI to show AI chat
  loadAIChatHistory();
}

/**
 * Deactivate AI channel mode
 */
function deactivateAIChannel() {
  isAIChannel = false;

  // Remove subscription click handler
  const sendButton = document.getElementById("sendMessage");
  if (sendButton && subscriptionClickHandler) {
    sendButton.removeEventListener("click", subscriptionClickHandler, true);
    subscriptionClickHandler = null;
  }

  // Remove status row when leaving AI channel
  removeAIStatusRow();

  // Reset chatBox scroll position to prevent interference with next channel
  const chatBox = document.getElementById("chatBox");
  if (chatBox) {
    chatBox.scrollTop = 0;
  }
}

/**
 * Check if AI channel is active
 */
function isAIChannelActive() {
  return isAIChannel;
}

// Export functions for use in community.js
window.aiChat = {
  activate: activateAIChannel,
  deactivate: deactivateAIChannel,
  isActive: isAIChannelActive,
  sendMessage: sendAIMessage,
  loadHistory: loadAIChatHistory,
  clearHistory: clearAIChatHistory,
};
