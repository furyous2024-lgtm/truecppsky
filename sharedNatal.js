"use strict";

// Import Safari detection and view handler from shared module for consistent testing
import { isSafariMode, openSafariPrintView } from "./js/safariPrintView.js";
import { requestSwissChart } from "./js/localSwiss.js";

function filterSelectedChartObjects(objects, selectedPlanets) {
  const selectedNames = new Set(
    (Array.isArray(selectedPlanets) ? selectedPlanets : []).map((name) =>
      String(name).toLowerCase().replace(/[^a-z0-9]/g, ""),
    ),
  );

  return objects.filter((object) => {
    if (object.isCustomPoint) {
      return (
        typeof activeCustomPoints !== "undefined" &&
        activeCustomPoints.some(
          (point) =>
            point.display &&
            String(point.num) === String(object.asteroidNum),
        )
      );
    }

    const objectName = String(object.name || "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
    if (objectName === "earth") return selectedNames.has("sun");
    if (objectName === "northnode") {
      return selectedNames.has("northnode") || selectedNames.has("truenode");
    }
    return selectedNames.has(objectName);
  });
}

function isChartAspectObjectSelected(object, selectedPlanetsAspects) {
  const selectedNames = new Set(
    (Array.isArray(selectedPlanetsAspects) ? selectedPlanetsAspects : []).map(
      (name) => String(name).toLowerCase().replace(/[^a-z0-9]/g, ""),
    ),
  );

  if (object && typeof object === "object" && object.isCustomPoint) {
    return (
      typeof activeCustomPoints !== "undefined" &&
      activeCustomPoints.some(
        (point) =>
          point.aspect &&
          String(point.num) === String(object.asteroidNum),
      )
    );
  }

  const objectName = String(
    typeof object === "string" ? object : object?.name || "",
  )
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  if (objectName === "earth") return selectedNames.has("sun");
  return selectedNames.has(objectName);
}

// Wait for all images to preload before user interaction
Promise.all([
  preloadSignImages(),
  preloadPlanetImages(),
  preloadMiscImages(),
]).catch((err) => {
  console.error("Preloading images failed.");
});

// Temporary error display
function showTemporaryError(container, message, duration = 5000) {
  if (!container) return;
  container.textContent = message;
  setTimeout(() => {
    container.textContent = "";
  }, duration);
}

// Populate return form
function populateReturnForm(date, relocated = false) {
  const isRelocatedInput = document.getElementById("isRelocated");
  if (isRelocatedInput) {
    isRelocatedInput.value = relocated ? "true" : "false";
  }

  const natalName = document.getElementById("natalName")?.value;
  if (natalName) {
    document.getElementById("returnName").value = natalName;
  }
  document.getElementById("returnDay").value = String(
    date.getUTCDate(),
  ).padStart(2, "0");
  const monthNames = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  const monthName = monthNames[date.getUTCMonth()];
  document.getElementById("returnMonth").value = monthName;
  const hiddenMonth = document.querySelector("input[name='month']");
  if (hiddenMonth) hiddenMonth.value = monthName;
  document.getElementById("returnYear").value = date.getUTCFullYear();
  document.getElementById("returnHour").value = String(
    date.getUTCHours(),
  ).padStart(2, "0");
  document.getElementById("returnMinute").value = String(
    date.getUTCMinutes(),
  ).padStart(2, "0");
  if (!relocated) {
    const natalLocation = document.getElementById("natalLocation")?.value;
    if (natalLocation) {
      document.getElementById("returnLocation").value = natalLocation;
    }
  }

  // Reset the dropdown
  document.getElementById("adjustType").value = "Solar";

  // Reset the offset
  const offsetInput = document.getElementById("returnOffset");
  if (offsetInput) offsetInput.value = "0";
}

// Synastry aspects
function drawSynastryAspectLines(
  svg,
  natalPlanets,
  synastryPlanets,
  ascendantPosition,
  houseInnerRadius,
  width,
  height,
) {
  // User settings
  const { allowedAspects, allowedPlanets } = getCurrentAspectPrefs();

  // keep only planets the user wants
  // For heliocentric charts, treat "Earth" as equivalent to "Sun" since Earth replaces Sun.
  // Custom points also pass through when their per-point "Aspects" toggle is on, so the
  // synastry wheel matches the natal wheel's behavior (natal uses server-computed aspects
  // which already respect that toggle). Without this branch custom points would be dropped
  // silently — allowedPlanets can never contain "Custom_XX_Name" values.
  const isCustomPointWithAspects = (p) =>
    p.isCustomPoint &&
    typeof activeCustomPoints !== "undefined" &&
    activeCustomPoints.find((cp) => cp.num === p.asteroidNum)?.aspect === true;
  natalPlanets = natalPlanets.filter(
    (p) =>
      allowedPlanets.includes(p.name) ||
      (p.name === "Earth" && allowedPlanets.includes("Sun")) ||
      isCustomPointWithAspects(p),
  );
  synastryPlanets = synastryPlanets.filter(
    (p) =>
      allowedPlanets.includes(p.name) ||
      (p.name === "Earth" && allowedPlanets.includes("Sun")) ||
      isCustomPointWithAspects(p),
  );

  const ASPECT_MASTER = [
    { deg: 180, type: "opposition", orb: 10 },
    { deg: 120, type: "trine", orb: 8 },
    { deg: 90, type: "square", orb: 8 },
    { deg: 60, type: "sextile", orb: 6 },
    { deg: 30, type: "semisextile", orb: 3 },
    { deg: 150, type: "quincunx", orb: 3 },
  ];

  // Overwrite the defaults with what the user chose in the settings page
  document
    .querySelectorAll("#aspect-settings select.aspect-orb")
    .forEach((sel) => {
      const t = sel.dataset.aspect.toLowerCase();
      const row = ASPECT_MASTER.find((a) => a.type === t);
      if (row) row.orb = +sel.value; // (+) → Number
    });

  // Append user-defined custom aspects (up to 5). Same first-match-wins
  // ordering as the server: built-ins come first, so a custom at 60° will
  // never displace the built-in Sextile for a pair within Sextile's orb.
  if (
    typeof activeCustomAspects !== "undefined" &&
    Array.isArray(activeCustomAspects)
  ) {
    activeCustomAspects
      .filter((a) => a.enabled)
      .forEach((a) => {
        ASPECT_MASTER.push({
          deg: a.angle,
          type: `custom${a.angle}`,
          orb: a.orb,
          isCustom: true,
          customAngle: a.angle,
        });
      });
  }

  // Restrict to allowed aspect types. Custom aspects bypass the
  // allowedAspects filter because they are opted-in individually via the
  // custom-aspects UI's own enable checkbox — no need for a second toggle.
  const ASPECTS = ASPECT_MASTER.filter(
    (a) => a.isCustom || allowedAspects.includes(a.type),
  );

  // Helpers
  const norm = (v) => ((v % 360) + 360) % 360; // 0-360 wrap
  const delta = (a, b) => {
    // smallest angle
    const d = Math.abs(norm(a) - norm(b));
    return d > 180 ? 360 - d : d;
  };
  const findAsp = (aDeg, bDeg) => {
    const d = delta(aDeg, bDeg);
    return ASPECTS.find((asp) => Math.abs(d - asp.deg) <= asp.orb) || null;
  };

  // Semisextile and Quincunx use their glyph color (#556b2f dark olive
  // green) so line + glyph match — see matching comment in natal drawer.
  const aspectColours = {
    opposition: "red",
    square: "red",
    trine: "blue",
    sextile: "blue",
    semisextile: "#556b2f",
    quincunx: "#556b2f",
  };

  // Draw lines & symbols
  svg.selectAll(".aspect-line.synastry,.aspect-symbol.synastry").remove(); // clear old

  natalPlanets.forEach((pA) => {
    synastryPlanets.forEach((pB) => {
      const asp = findAsp(pA.position, pB.position);
      if (!asp) return;

      // polar to cartesian for both planets
      const angA = ((ascendantPosition - pA.position - 180) * Math.PI) / 180;
      const angB = ((ascendantPosition - pB.position - 180) * Math.PI) / 180;

      const x1 = width / 2 + houseInnerRadius * Math.cos(angA);
      const y1 = height / 2 + houseInnerRadius * Math.sin(angA);
      const x2 = width / 2 + houseInnerRadius * Math.cos(angB);
      const y2 = height / 2 + houseInnerRadius * Math.sin(angB);

      svg
        .append("line")
        .attr("x1", x1)
        .attr("y1", y1)
        .attr("x2", x2)
        .attr("y2", y2)
        .attr("class", "natal aspect-line synastry")
        .style(
          "stroke",
          asp.isCustom ? "#2c3d4f" : aspectColours[asp.type] || "gray",
        )
        .style("stroke-width", 2)
        // Higher opacity for custom aspects so #2c3d4f reads as dark-slate
        // (matching the badge) rather than washing out — see matching
        // comment in natal drawer.
        .style("stroke-opacity", asp.isCustom ? 0.55 : 0.35);

      // aspect glyph at the midpoint
      const midX = (x1 + x2) / 2;
      const midY = (y1 + y2) / 2;

      if (asp.isCustom) {
        // Text badge in place of missing SVG glyph — matches the natal
        // wheel's custom-aspect symbol style for cross-chart consistency.
        svg
          .append("text")
          .attr("x", midX)
          .attr("y", midY)
          .attr("text-anchor", "middle")
          .attr("dominant-baseline", "central")
          .attr("font-family", "Arial, sans-serif")
          .attr("font-size", "14px")
          .attr("font-weight", "bold")
          .attr("fill", "#2c3d4f")
          .attr("class", "natal aspect-symbol synastry custom-aspect-symbol")
          .style("pointer-events", "none")
          .style("opacity", 0.9)
          .text(`${asp.customAngle}°`);
      } else {
        const g = miscImageCache[asp.type]; // e.g. “trine” → SVG

        svg
          .append("image")
          .attr("xlink:href", g)
          .attr("x", midX - 10)
          .attr("y", midY - 10)
          .attr("width", 20)
          .attr("height", 20)
          .attr("class", "natal aspect-symbol synastry")
          .style("pointer-events", "none")
          .style("opacity", 0.9);
      }
    });
  });
  // Click to open aspectarian
  svg.selectAll(".aspect-hotspot").remove(); // remove any old one
  svg
    .append("circle")
    .attr("class", "aspect-hotspot")
    .attr("cx", width / 2)
    .attr("cy", height / 2)
    .attr("r", houseInnerRadius - 20)
    .attr("fill", "transparent")
    .style("cursor", "pointer")
    .on("click", function (e) {
      e.stopPropagation();
      showAspectarianSynastry(window.natalPlanets, window.synastryPlanets);
    });
}

// Triwheel aspect lines - draws aspect lines between two planet sets with a specific CSS class
function drawTriwheelAspectLines(
  svg,
  planetsA,
  planetsB,
  ascendantPosition,
  houseInnerRadius,
  width,
  height,
  cssClass,
) {
  // User settings
  const { allowedAspects, allowedPlanets } = getCurrentAspectPrefs();

  // keep only planets the user wants
  // For heliocentric charts, treat "Earth" as equivalent to "Sun" since Earth replaces Sun.
  // Custom points pass through when their per-point "Aspects" toggle is on — matches
  // the natal wheel's server-computed behavior. See matching comment in drawSynastryAspectLines.
  const isCustomPointWithAspects = (p) =>
    p.isCustomPoint &&
    typeof activeCustomPoints !== "undefined" &&
    activeCustomPoints.find((cp) => cp.num === p.asteroidNum)?.aspect === true;
  planetsA = planetsA.filter(
    (p) =>
      allowedPlanets.includes(p.name) ||
      (p.name === "Earth" && allowedPlanets.includes("Sun")) ||
      isCustomPointWithAspects(p),
  );
  planetsB = planetsB.filter(
    (p) =>
      allowedPlanets.includes(p.name) ||
      (p.name === "Earth" && allowedPlanets.includes("Sun")) ||
      isCustomPointWithAspects(p),
  );

  const ASPECT_MASTER = [
    { deg: 180, type: "opposition", orb: 10 },
    { deg: 120, type: "trine", orb: 8 },
    { deg: 90, type: "square", orb: 8 },
    { deg: 60, type: "sextile", orb: 6 },
    { deg: 30, type: "semisextile", orb: 3 },
    { deg: 150, type: "quincunx", orb: 3 },
  ];

  // Overwrite the defaults with what the user chose in the settings page
  document
    .querySelectorAll("#aspect-settings select.aspect-orb")
    .forEach((sel) => {
      const t = sel.dataset.aspect.toLowerCase();
      const row = ASPECT_MASTER.find((a) => a.type === t);
      if (row) row.orb = +sel.value;
    });

  // Append user-defined custom aspects — same shape and priority as the
  // synastry drawer above so all chart types render customs identically.
  if (
    typeof activeCustomAspects !== "undefined" &&
    Array.isArray(activeCustomAspects)
  ) {
    activeCustomAspects
      .filter((a) => a.enabled)
      .forEach((a) => {
        ASPECT_MASTER.push({
          deg: a.angle,
          type: `custom${a.angle}`,
          orb: a.orb,
          isCustom: true,
          customAngle: a.angle,
        });
      });
  }

  // Restrict to allowed aspect types (customs always pass — see synastry
  // drawer's matching comment for rationale)
  const ASPECTS = ASPECT_MASTER.filter(
    (a) => a.isCustom || allowedAspects.includes(a.type),
  );

  // Helpers
  const norm = (v) => ((v % 360) + 360) % 360;
  const delta = (a, b) => {
    const d = Math.abs(norm(a) - norm(b));
    return d > 180 ? 360 - d : d;
  };
  const findAsp = (aDeg, bDeg) => {
    const d = delta(aDeg, bDeg);
    return ASPECTS.find((asp) => Math.abs(d - asp.deg) <= asp.orb) || null;
  };

  // Semisextile and Quincunx use their glyph color (#556b2f dark olive
  // green) so line + glyph match — see matching comment in natal drawer.
  const aspectColours = {
    opposition: "red",
    square: "red",
    trine: "blue",
    sextile: "blue",
    semisextile: "#556b2f",
    quincunx: "#556b2f",
  };

  // Draw lines & symbols
  planetsA.forEach((pA) => {
    planetsB.forEach((pB) => {
      const asp = findAsp(pA.position, pB.position);
      if (!asp) return;

      // polar to cartesian for both planets
      const angA = ((ascendantPosition - pA.position - 180) * Math.PI) / 180;
      const angB = ((ascendantPosition - pB.position - 180) * Math.PI) / 180;

      const x1 = width / 2 + houseInnerRadius * Math.cos(angA);
      const y1 = height / 2 + houseInnerRadius * Math.sin(angA);
      const x2 = width / 2 + houseInnerRadius * Math.cos(angB);
      const y2 = height / 2 + houseInnerRadius * Math.sin(angB);

      svg
        .append("line")
        .attr("x1", x1)
        .attr("y1", y1)
        .attr("x2", x2)
        .attr("y2", y2)
        .attr("class", `natal aspect-line ${cssClass}`)
        .style(
          "stroke",
          asp.isCustom ? "#2c3d4f" : aspectColours[asp.type] || "gray",
        )
        .style("stroke-width", 2)
        // Higher opacity for custom aspects so #2c3d4f reads as dark-slate
        // (matching the badge) rather than washing out — see matching
        // comment in natal drawer.
        .style("stroke-opacity", asp.isCustom ? 0.55 : 0.35)
        .style("pointer-events", "none");

      // aspect glyph at the midpoint
      const midX = (x1 + x2) / 2;
      const midY = (y1 + y2) / 2;

      if (asp.isCustom) {
        svg
          .append("text")
          .attr("x", midX)
          .attr("y", midY)
          .attr("text-anchor", "middle")
          .attr("dominant-baseline", "central")
          .attr("font-family", "Arial, sans-serif")
          .attr("font-size", "14px")
          .attr("font-weight", "bold")
          .attr("fill", "#2c3d4f")
          .attr("class", `natal aspect-symbol ${cssClass} custom-aspect-symbol`)
          .style("pointer-events", "none")
          .style("opacity", 0.9)
          .text(`${asp.customAngle}°`);
      } else {
        const g = miscImageCache[asp.type];

        svg
          .append("image")
          .attr("xlink:href", g)
          .attr("x", midX - 10)
          .attr("y", midY - 10)
          .attr("width", 20)
          .attr("height", 20)
          .attr("class", `natal aspect-symbol ${cssClass}`)
          .style("pointer-events", "none")
          .style("opacity", 0.9);
      }
    });
  });
}

// Synastry aspectarian aspects from settings
function getCurrentAspectPrefs() {
  const allowedAspects = [
    ...document.querySelectorAll(
      '#aspect-settings input[name="aspects"]:checked',
    ),
  ].map((cb) => cb.value.toLowerCase()); // e.g. ['square','trine',… ]

  const allowedPlanets = [
    ...document.querySelectorAll(
      '#planet-settings input[name="planetAspects"]:checked',
    ),
  ].map((cb) => cb.value); // e.g. ['Sun','Mars', …]

  return { allowedAspects, allowedPlanets };
}

// Composite charts
let compositeNatal;
let compositeSynastry;

const MIDPOINT_SIGN_BOUNDARIES = [
  { sign: "Aries", boundary: 0 },
  { sign: "Taurus", boundary: 19.7267 },
  { sign: "Gemini", boundary: 56.5838 },
  { sign: "Cancer", boundary: 86.0378 },
  { sign: "Leo", boundary: 103.1872 },
  { sign: "Virgo", boundary: 141.6068 },
  { sign: "Libra", boundary: 191.3253 },
  { sign: "Scorpio", boundary: 210.2037 },
  { sign: "Ophiuchus", boundary: 223.4316 },
  { sign: "Sagittarius", boundary: 235.7895 },
  { sign: "Capricorn", boundary: 269.1806 },
  { sign: "Aquarius", boundary: 294.8496 },
  { sign: "Pisces", boundary: 318.0143 },
];
const EQUAL_13_SIGN_BOUNDARIES = [
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
].map((sign, index) => ({
  sign,
  boundary: (240 + (index - 8) * (360 / 13) + 360) % 360,
}));

function zodiacBoundariesFor(zodiacSystem) {
  if (
    zodiacSystem === "Midpoint" ||
    zodiacSystem === "Midpoint (True Sidereal)"
  ) {
    return MIDPOINT_SIGN_BOUNDARIES;
  }
  if (String(zodiacSystem || "").toLowerCase().includes("13 equal")) {
    return EQUAL_13_SIGN_BOUNDARIES;
  }
  if (
    String(zodiacSystem || "")
      .toLowerCase()
      .includes("iau real constellations")
  ) {
    return window.currentZodiacBoundaries || null;
  }
  return null;
}

function zodiacSignAt(position, boundaries) {
  const longitude = ((position % 360) + 360) % 360;
  let sign = boundaries[boundaries.length - 1]?.sign;
  for (const item of boundaries) {
    if (longitude < item.boundary) break;
    sign = item.sign;
  }
  return sign;
}

function getSignFromPosition(position, zodiacSystem) {
  const normPos = ((position % 360) + 360) % 360;
  const boundaries = zodiacBoundariesFor(zodiacSystem);
  if (boundaries) {
    return zodiacSignAt(normPos, boundaries);
  }
  const signs = [
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
  return signs[Math.floor(normPos / 30)];
}

// Detailed MAIN chart positions table. `position` is the longitude used in the
// selected zodiac (and may be sidereal/draconic); `tropical` is the corresponding
// tropical ecliptic longitude supplied by the Swiss Ephemeris response.
function tsPositionsEscape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function tsPositionsNormalize(longitude) {
  const value = Number(longitude);
  return Number.isFinite(value) ? ((value % 360) + 360) % 360 : NaN;
}

function tsPositionsDecimal(value, digits = 8, normalize = false) {
  let number = Number(value);
  if (!Number.isFinite(number)) return "—";
  if (normalize) number = tsPositionsNormalize(number);
  return Number.isFinite(number) ? number.toFixed(digits) : "—";
}

function tsPositionsDms(value, normalize = false) {
  let number = Number(value);
  if (!Number.isFinite(number)) return "—";
  if (normalize) number = tsPositionsNormalize(number);
  let degrees = Math.floor(number);
  let minutesFloat = (number - degrees) * 60;
  let minutes = Math.floor(minutesFloat);
  let seconds = Math.round((minutesFloat - minutes) * 60);
  if (seconds >= 60) { seconds = 0; minutes += 1; }
  if (minutes >= 60) { minutes = 0; degrees += 1; }
  if (normalize && degrees >= 360) degrees = 0;
  return `${degrees}° ${String(minutes).padStart(2, "0")}′ ${String(seconds).padStart(2, "0")}″`;
}

function tsPositionsDegreeInSign(position, zodiacSystem) {
  const longitude = tsPositionsNormalize(position);
  if (!Number.isFinite(longitude)) return NaN;
  let boundaries = null;
  try {
    if (typeof zodiacBoundariesFor === "function") boundaries = zodiacBoundariesFor(zodiacSystem);
  } catch (_) {}
  if (Array.isArray(boundaries) && boundaries.length) {
    const ordered = boundaries
      .filter((entry) => entry && Number.isFinite(Number(entry.boundary)))
      .slice()
      .sort((a, b) => Number(a.boundary) - Number(b.boundary));
    if (ordered.length) {
      let start = ordered[ordered.length - 1];
      for (const boundary of ordered) {
        if (Number(boundary.boundary) <= longitude) start = boundary;
        else break;
      }
      return tsPositionsNormalize(longitude - Number(start.boundary));
    }
  }
  return longitude % 30;
}

function tsPositionsIcon(folder, name) {
  const slug = String(name || "").toLowerCase().replace(/[^a-z0-9]+/g, "").trim();
  if (!slug) return "";
  const path = folder === "sign"
    ? `/images/signs/colorized/${slug}.svg`
    : `/images/planets/${slug}.svg`;
  return `<img class="positions-symbol" src="${path}" alt="${tsPositionsEscape(name)}" loading="lazy" onerror="this.style.display='none'">`;
}

function tsPositionsMotion(item) {
  if (item?.retrograde === true || Number(item?.speed) < 0) return "Retrógrado";
  if (Number.isFinite(Number(item?.speed)) && Number(item.speed) === 0) return "Estacionário";
  if (item?.retrograde === false || Number(item?.speed) > 0) return "Direto";
  return "—";
}

function renderMainChartPositionTable(data, natalData, zodiacSystem, houseCusps) {
  if (typeof document === "undefined" || !Array.isArray(data)) return;
  const section = document.getElementById("showNatal");
  const formElement = document.getElementById("natalForm");
  if (!section || !formElement) return;

  let panel = document.getElementById("main-chart-positions-panel");
  if (!panel) {
    panel = document.createElement("section");
    panel.id = "main-chart-positions-panel";
    panel.className = "chart-positions-panel";
    formElement.insertAdjacentElement("afterend", panel);
  }

  const objectRows = [];
  const validObjects = data.filter((item, index) =>
    index > 0 && item && item.name && Number.isFinite(Number(item.position)) &&
    !/^House\s+\d+$/i.test(String(item.name))
  );

  validObjects.forEach((item) => {
    const position = tsPositionsNormalize(item.position);
    const tropicalLongitude = Number.isFinite(Number(item.tropical))
      ? tsPositionsNormalize(item.tropical)
      : position;
    const displayName = item.isCustomPoint && item.asteroidName ? item.asteroidName : item.name;
    const sign = item.sign || getSignFromPosition(position, zodiacSystem) || "—";
    const house = item.houseNatal || item.house || "—";
    const degreeInSign = tsPositionsDegreeInSign(position, zodiacSystem);
    const degreeText = Number.isFinite(degreeInSign) ? tsPositionsDms(degreeInSign) : "—";
    const retro = tsPositionsMotion(item) === "Retrógrado" ? `<span class="positions-retro">R</span>` : "";
    const kind = item.isFixedStar ? "Estrela fixa"
      : item.isCustomPoint ? "Ponto customizado"
      : /^(Ascendant|Ascendant Symbol|Descendant|Midheaven|Imum Coeli)$/i.test(String(item.name)) ? "Ângulo"
      : /^(Part of Fortune|Part of Spirit)$/i.test(String(item.name)) ? "Parte árabe"
      : /^Galactic Center$/i.test(String(item.name)) ? "Centro galáctico"
      : "Objeto";
    const latitude = Number.isFinite(Number(item.eclipticLatitude))
      ? tsPositionsDecimal(item.eclipticLatitude, 6)
      : "—";
    const speed = Number.isFinite(Number(item.speed))
      ? tsPositionsDecimal(item.speed, 8)
      : "—";
    const source = item.source || item.calculationSource || "Swiss Ephemeris";

    objectRows.push(`<tr>
      <td><span class="positions-pill positions-pill-object">${tsPositionsEscape(kind)}</span></td>
      <td><span class="positions-object">${tsPositionsIcon("planet", item.name)}<span>${tsPositionsEscape(displayName)}${retro}</span></span></td>
      <td><span class="positions-sign">${tsPositionsIcon("sign", sign)}<span>${tsPositionsEscape(sign)}</span></span></td>
      <td class="positions-degree-main">${tsPositionsEscape(degreeText)}</td>
      <td>${tsPositionsEscape(house)}</td>
      <td class="positions-numeric">${tsPositionsEscape(tsPositionsDecimal(tropicalLongitude, 8, true))}°</td>
      <td class="positions-numeric">${tsPositionsEscape(tsPositionsDecimal(position, 8, true))}°</td>
      <td class="positions-numeric">${tsPositionsEscape(tsPositionsDms(position, true))}</td>
      <td class="positions-numeric">${tsPositionsEscape(latitude)}${latitude !== "—" ? "°" : ""}</td>
      <td class="positions-numeric">${tsPositionsEscape(speed)}</td>
      <td>${tsPositionsEscape(tsPositionsMotion(item))}</td>
      <td>${tsPositionsEscape(source)}</td>
    </tr>`);
  });

  const houseRows = (Array.isArray(houseCusps) ? houseCusps : [])
    .slice()
    .filter((house) => house && Number.isFinite(Number(house.position)))
    .sort((a, b) => Number(a.house || String(a.name || "").replace(/\D/g, "") || 0) - Number(b.house || String(b.name || "").replace(/\D/g, "") || 0))
    .map((house) => {
      const houseNo = house.house || String(house.name || "").replace(/\D/g, "") || "—";
      const position = tsPositionsNormalize(house.position);
      const tropicalLongitude = Number.isFinite(Number(house.tropical))
        ? tsPositionsNormalize(house.tropical)
        : position;
      const sign = house.sign || getSignFromPosition(position, zodiacSystem) || "—";
      const degreeInSign = tsPositionsDegreeInSign(position, zodiacSystem);
      const degreeText = Number.isFinite(degreeInSign) ? tsPositionsDms(degreeInSign) : "—";
      return `<tr class="positions-house-row">
        <td><span class="positions-pill positions-pill-house">Casa</span></td>
        <td><span class="positions-object positions-house-name"><span>Casa ${tsPositionsEscape(houseNo)}</span></span></td>
        <td><span class="positions-sign">${tsPositionsIcon("sign", sign)}<span>${tsPositionsEscape(sign)}</span></span></td>
        <td class="positions-degree-main">${tsPositionsEscape(degreeText)}</td>
        <td>${tsPositionsEscape(houseNo)}</td>
        <td class="positions-numeric">${tsPositionsEscape(tsPositionsDecimal(tropicalLongitude, 8, true))}°</td>
        <td class="positions-numeric">${tsPositionsEscape(tsPositionsDecimal(position, 8, true))}°</td>
        <td class="positions-numeric">${tsPositionsEscape(tsPositionsDms(position, true))}</td>
        <td class="positions-numeric">—</td><td class="positions-numeric">—</td><td>—</td><td>Swiss Ephemeris (casas)</td>
      </tr>`;
    });

  const titleName = natalData?.name || data?.[0]?.name || "Mapa principal";
  const systemLine = [natalData?.zodiacSystem || zodiacSystem, natalData?.houseSystem, natalData?.coordinateSystem]
    .filter(Boolean).join(" • ");
  const objectCount = validObjects.length;
  const houseCount = houseRows.length;
  panel.innerHTML = `
    <div class="positions-header">
      <div>
        <p class="positions-kicker">Tabela de posições do MAIN</p>
        <h2>Objetos, graus, casas e longitude eclíptica</h2>
        <p>${tsPositionsEscape(titleName)}${systemLine ? ` — ${tsPositionsEscape(systemLine)}` : ""}</p>
        <p class="positions-note">A longitude eclíptica tropical é exibida em graus decimais com 8 casas; a longitude zodiacal mostra a posição usada pelo mapa atual.</p>
      </div>
      <div class="positions-summary"><span>${objectCount} objetos</span><span>${houseCount} casas</span></div>
    </div>
    <article class="positions-card positions-card-single">
      <div class="positions-table-wrap">
        <table class="positions-table">
          <thead><tr>
            <th>Tipo</th><th>Objeto/Casa</th><th>Signo</th><th>Grau no signo</th><th>Casa</th>
            <th>Longitude eclíptica tropical (°)</th><th>Longitude zodiacal (°)</th><th>Longitude zodiacal (DMS)</th>
            <th>Latitude eclíptica (°)</th><th>Velocidade (°/dia)</th><th>Movimento</th><th>Fonte</th>
          </tr></thead>
          <tbody>${objectRows.join("")}${houseRows.join("") || ""}${!objectRows.length && !houseRows.length ? `<tr><td colspan="12" class="positions-empty">Nenhuma posição disponível. Calcule o mapa principal para preencher a tabela.</td></tr>` : ""}</tbody>
        </table>
      </div>
    </article>`;
}

function buildComposite(natalPlanets, synastryPlanets) {
  const norm = (v) => ((v % 360) + 360) % 360;
  const delta = (a, b) => {
    let d = norm(b) - norm(a);
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    return d;
  };

  const zodiacSystem = natalPlanets?.[0]?.zodiacSystem || "";
  const houseSystem = natalPlanets?.[0]?.houseSystem || "";
  const isWholeSign = houseSystem === "Whole Sign";

  // Pull user aspect preferences
  const allowedAspects = Array.from(
    document.querySelectorAll('#aspect-settings input[name="aspects"]:checked'),
  ).map((cb) => cb.value.toLowerCase());

  const allowedPlanets = Array.from(
    document.querySelectorAll(
      '#planet-settings input[name="planetAspects"]:checked',
    ),
  ).map((cb) => cb.value);

  const aspectOrbs = {};
  document
    .querySelectorAll("#aspect-settings select.aspect-orb")
    .forEach((sel) => {
      aspectOrbs[sel.dataset.aspect.toLowerCase()] = +sel.value;
    });

  const ASPECT_MASTER = [
    { deg: 0, type: "conjunction" },
    { deg: 180, type: "opposition" },
    { deg: 120, type: "trine" },
    { deg: 90, type: "square" },
    { deg: 60, type: "sextile" },
    { deg: 30, type: "semisextile" },
    { deg: 150, type: "quincunx" },
  ].filter((a) => allowedAspects.includes(a.type));

  // Append user-defined custom aspects for the composite chart. Carry the
  // per-row orb directly on the aspect object so the loop below can prefer
  // it over the (nonexistent) built-in aspectOrbs entry for this key.
  if (
    typeof activeCustomAspects !== "undefined" &&
    Array.isArray(activeCustomAspects)
  ) {
    activeCustomAspects
      .filter((a) => a.enabled)
      .forEach((a) => {
        ASPECT_MASTER.push({
          deg: a.angle,
          type: `custom${a.angle}`,
          orb: a.orb,
          isCustom: true,
          customAngle: a.angle,
        });
      });
  }

  // Generate composite planets (immediate returnable form)
  const composite = natalPlanets
    .slice(1)
    .map((p) => {
      const match = synastryPlanets.find((q) => q.name === p.name);
      if (!match) return null;

      // For Whole Sign, skip house cusps - we'll generate them properly below
      if (isWholeSign && p.name && p.name.startsWith("House")) {
        return null;
      }

      const d = delta(p.position, match.position);
      const mid = norm(p.position + d / 2);
      const newSign = getSignFromPosition(mid, zodiacSystem);

      return {
        ...p,
        position: mid,
        sign: newSign || p.sign,
        retrograde: false,
      };
    })
    .filter(Boolean);

  // For Whole Sign, generate house cusps based on composite Ascendant's sign
  if (isWholeSign) {
    const natalAsc = natalPlanets.find((p) => p.name === "Ascendant");
    const synastryAsc = synastryPlanets.find((p) => p.name === "Ascendant");

    if (natalAsc && synastryAsc) {
      // Calculate composite Ascendant midpoint
      const ascDelta = delta(natalAsc.position, synastryAsc.position);
      const compositeAscPosition = norm(natalAsc.position + ascDelta / 2);

      if (zodiacSystem === "Midpoint (True Sidereal)") {
        // Midpoint zodiac with custom boundaries (excluding Ophiuchus for houses)
        const customBoundaries = [
          { sign: "Aries", boundary: 0 },
          { sign: "Taurus", boundary: 19.7267 },
          { sign: "Gemini", boundary: 56.5838 },
          { sign: "Cancer", boundary: 86.0378 },
          { sign: "Leo", boundary: 103.1872 },
          { sign: "Virgo", boundary: 141.6068 },
          { sign: "Libra", boundary: 191.3253 },
          { sign: "Scorpio", boundary: 210.2037 },
          { sign: "Sagittarius", boundary: 235.7895 },
          { sign: "Capricorn", boundary: 269.1806 },
          { sign: "Aquarius", boundary: 294.8496 },
          { sign: "Pisces", boundary: 318.0143 },
        ];

        // Find which sign the composite Ascendant is in
        let firstHouseIndex = customBoundaries.findIndex((sign, index) => {
          const nextSign =
            customBoundaries[(index + 1) % customBoundaries.length];
          return (
            (compositeAscPosition >= sign.boundary &&
              compositeAscPosition < nextSign.boundary) ||
            (sign.boundary > nextSign.boundary &&
              (compositeAscPosition >= sign.boundary ||
                compositeAscPosition < nextSign.boundary))
          );
        });

        // Generate 12 house cusps at sign boundaries
        for (let i = 0; i < 12; i++) {
          const signIndex = (firstHouseIndex + i) % customBoundaries.length;
          const cusp = customBoundaries[signIndex].boundary;
          composite.push({
            name: `House ${i + 1}`,
            position: cusp,
            sign: customBoundaries[signIndex].sign,
          });
        }
      } else {
        // Regular Whole Sign (30° per sign)
        const firstHouseStart = Math.floor(compositeAscPosition / 30) * 30;
        const signs = [
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

        for (let i = 0; i < 12; i++) {
          const cusp = (firstHouseStart + i * 30) % 360;
          const signIndex = Math.floor(cusp / 30);
          composite.push({
            name: `House ${i + 1}`,
            position: cusp,
            sign: signs[signIndex],
          });
        }
      }
    }
  }

  // Helper to check if a composite planet is allowed to participate in
  // aspects. Treats Earth as Sun for heliocentric charts. Custom points
  // pass through when the user's per-point "Aspects" toggle is on —
  // matches natal-side behavior and closes an oversight that silently
  // dropped custom-point aspects from every composite chart.
  const isPlanetAllowed = (planet) =>
    allowedPlanets.includes(planet.name) ||
    (planet.name === "Earth" && allowedPlanets.includes("Sun")) ||
    (planet.isCustomPoint &&
      typeof activeCustomPoints !== "undefined" &&
      activeCustomPoints.find((cp) => cp.num === planet.asteroidNum)?.aspect ===
        true);

  // Inject aspects directly into each planet
  return composite.map((planetA) => {
    if (!isPlanetAllowed(planetA)) {
      return { ...planetA, aspects: [] };
    }

    const aspects = composite
      .filter(
        (planetB) =>
          planetB.name !== planetA.name && isPlanetAllowed(planetB),
      )
      .map((planetB) => {
        const diff = Math.abs(norm(planetA.position) - norm(planetB.position));
        const angle = diff > 180 ? 360 - diff : diff;

        for (const asp of ASPECT_MASTER) {
          // Prefer the aspect's own orb (custom aspects carry it directly).
          // For built-ins, fall back to the aspectOrbs map keyed by type.
          const orb = asp.orb ?? aspectOrbs[asp.type] ?? 0;
          if (Math.abs(angle - asp.deg) <= orb) {
            const result = {
              planet: planetB.name,
              type: asp.type[0].toUpperCase() + asp.type.slice(1),
              orb: Math.abs(angle - asp.deg),
              status:
                planetA.position < planetB.position ? "applying" : "separating",
            };
            if (asp.isCustom) {
              result.isCustom = true;
              result.customAngle = asp.customAngle;
            }
            return result;
          }
        }

        return null;
      })
      .filter(Boolean);

    return { ...planetA, aspects };
  });
}

// Function to copy composite birth details text to synastry chart
function copyCompositeBirthDetailsToSynastry() {
  // Wait a bit to ensure composite DOM is fully rendered
  setTimeout(() => {
    // Find composite chart birth details
    const compositeChart = document.getElementById("composite-chart");
    if (!compositeChart) return;

    const compositeSvg = compositeChart.querySelector("svg");
    if (!compositeSvg) return;

    // Get all birth detail text elements from composite
    const compositeLeftDetails = compositeSvg.querySelectorAll(
      ".birth-details-left text",
    );
    const compositeRightDetails = compositeSvg.querySelectorAll(
      ".birth-details-right text",
    );
    const compositeTitle = compositeSvg.querySelector(
      ".birth-details-center text",
    );

    if (
      !compositeLeftDetails.length ||
      !compositeRightDetails.length ||
      !compositeTitle
    )
      return;

    // Extract text content
    const leftTexts = Array.from(compositeLeftDetails).map(
      (el) => el.textContent,
    );
    const rightTexts = Array.from(compositeRightDetails).map(
      (el) => el.textContent,
    );
    const titleText = compositeTitle.textContent;

    // Find all SVGs that might be synastry charts
    const allSvgs = document.querySelectorAll("svg");

    allSvgs.forEach((svg) => {
      // Skip the composite chart itself
      if (svg === compositeSvg) return;

      // Skip the natal chart - it should keep its own birth details
      const parentElement = svg.closest("#natal-chart");
      if (parentElement) return;

      // Skip the triwheel chart - it should keep its own birth details
      const triwheelParent = svg.closest("#triwheel-chart");
      if (triwheelParent) return;

      // Skip the return chart - it should keep its own birth details
      const returnParent = svg.closest("#return-chart");
      if (returnParent) return;

      // Check if this SVG has birth details (indicating it's a chart)
      const existingDetails = svg.querySelector(".birth-details");
      if (!existingDetails) return;

      // Remove existing birth details
      svg.querySelectorAll(".birth-details").forEach((el) => el.remove());
      svg.querySelectorAll(".birth-details-left").forEach((el) => el.remove());
      svg.querySelectorAll(".birth-details-right").forEach((el) => el.remove());
      svg
        .querySelectorAll(".birth-details-center")
        .forEach((el) => el.remove());

      // Copy composite's birth details structure
      const width = 1000; // Standard width from sharedNatal

      // Add left column details
      const leftGroup = d3
        .select(svg)
        .append("g")
        .attr("class", "birth-details birth-details-left")
        .attr("transform", "translate(0, -64)");

      leftTexts.forEach((text, i) => {
        leftGroup
          .append("text")
          .attr("y", i * 34)
          .attr("font-family", "Segoe UI, sans-serif")
          .attr("font-size", "28px")
          .attr("fill", "#222")
          .attr("font-weight", "normal")
          .text(text);
      });

      // Add right column details
      const rightGroup = d3
        .select(svg)
        .append("g")
        .attr("class", "birth-details birth-details-right")
        .attr("transform", `translate(${width - 20}, -64)`);

      rightTexts.forEach((text, i) => {
        rightGroup
          .append("text")
          .attr("y", i * 34)
          .attr("text-anchor", "end")
          .attr("font-family", "Segoe UI, sans-serif")
          .attr("font-size", "28px")
          .attr("fill", "#222")
          .attr("font-weight", "normal")
          .text(text);
      });

      // Add center title, but change "Composite" to "Synastry"
      const synastryTitle = titleText.replace("Composite", "Synastry");

      d3.select(svg)
        .append("g")
        .attr("class", "birth-details birth-details-center")
        .attr("transform", `translate(${width / 2}, -112)`)
        .append("text")
        .attr("y", 0)
        .attr("text-anchor", "middle")
        .attr("font-family", "Segoe UI, sans-serif")
        .attr("font-size", "36px")
        .attr("fill", "#222")
        .attr("font-weight", "bold")
        .text(synastryTitle);
    });
  }, 500); // Wait for composite to fully render
}

// Preloaded sign and image caches
const signImageCache = {};
const colorizedSignImageCache = {};
const planetImageCache = {};
const miscImageCache = {};

// Preload sign images
async function preloadSignImages() {
  const signs = [
    "aries",
    "taurus",
    "gemini",
    "cancer",
    "leo",
    "virgo",
    "libra",
    "scorpio",
    "sagittarius",
    "ophiuchus",
    "capricorn",
    "aquarius",
    "pisces",
  ];

  await Promise.all(
    signs.flatMap((sign) => [
      // Default sign image
      (async () => {
        try {
          const res = await fetch(`/images/signs/${sign}.svg`);
          const blob = await res.blob();
          const reader = new FileReader();
          const result = await new Promise((resolve) => {
            reader.onloadend = () => resolve(reader.result);
            reader.readAsDataURL(blob);
          });
          signImageCache[sign] = result;
        } catch {
          signImageCache[sign] = `/images/signs/${sign}.svg`;
        }
      })(),

      // Colorized sign image
      (async () => {
        try {
          const res = await fetch(`/images/signs/colorized/${sign}.svg`);
          const blob = await res.blob();
          const reader = new FileReader();
          const result = await new Promise((resolve) => {
            reader.onloadend = () => resolve(reader.result);
            reader.readAsDataURL(blob);
          });
          colorizedSignImageCache[sign] = result;
        } catch {
          colorizedSignImageCache[sign] = `/images/signs/colorized/${sign}.svg`;
        }
      })(),
    ]),
  );
}

// Preload planet images
async function preloadPlanetImages() {
  const planets = [
    "sun",
    "earth",
    "moon",
    "mercury",
    "venus",
    "mars",
    "jupiter",
    "saturn",
    "uranus",
    "neptune",
    "pluto",
    "chiron",
    "northnode",
    "southnode",
    "ascendantsymbol",
    "midheaven",
    "descendant",
    "imumcoeli",
    "ceres",
    "vesta",
    "pallas",
    "juno",
    "lilith",
    "priapus",
    "partoffortune",
    "partofspirit",
    "vertex",
    "antivertex",
    "galacticcenter",
  ];

  await Promise.all(
    planets.map(async (planet) => {
      try {
        const res = await fetch(`/images/planets/${planet}.svg`);
        const blob = await res.blob();
        const reader = new FileReader();
        const result = await new Promise((resolve) => {
          reader.onloadend = () => resolve(reader.result);
          reader.readAsDataURL(blob);
        });
        planetImageCache[planet] = result;
      } catch {
        planetImageCache[planet] = `/images/planets/${planet}.svg`; // fallback
      }
    }),
  );
}

// Preload misc images
async function preloadMiscImages() {
  const retroSymbols = ["retrograde", "sd", "sr"];
  const aspectSymbols = [
    "opposition",
    "square",
    "trine",
    "sextile",
    "conjunction",
    "semisextile",
    "quincunx",
  ];

  await Promise.all([
    ...retroSymbols.map(async (filename) => {
      try {
        const res = await fetch(`/images/misc/${filename}.svg`);
        const blob = await res.blob();
        const reader = new FileReader();
        const result = await new Promise((resolve) => {
          reader.onloadend = () => resolve(reader.result);
          reader.readAsDataURL(blob);
        });
        miscImageCache[filename] = result;
      } catch {
        miscImageCache[filename] = `/images/misc/${filename}.svg`; // fallback
      }
    }),
    ...aspectSymbols.map(async (filename) => {
      try {
        const res = await fetch(`/images/aspects/${filename}.svg`);
        const blob = await res.blob();
        const reader = new FileReader();
        const result = await new Promise((resolve) => {
          reader.onloadend = () => resolve(reader.result);
          reader.readAsDataURL(blob);
        });
        miscImageCache[filename] = result;
      } catch {
        miscImageCache[filename] = `/images/aspects/${filename}.svg`; // fallback
      }
    }),
  ]);
}

// Tooltip planet placement descriptions
let planetSignDescriptions = {};
let planetHouseDescriptions = {};
let progressedPlanetSignDescriptions = {};
let progressedPlanetHouseDescriptions = {};
let transitPlanetSignDescriptions = {};
let transitPlanetHouseDescriptions = {};
let solarReturnPlanetSignDescriptions = {};
let solarReturnPlanetHouseDescriptions = {};
let lunarReturnPlanetSignDescriptions = {};
let lunarReturnPlanetHouseDescriptions = {};
let synastryPlanetSignDescriptions = {};
let synastryPlanetHouseDescriptions = {};
let compositePlanetSignDescriptions = {};
let compositePlanetHouseDescriptions = {};
let planetAspectDescriptions = {};
let graphPlanetRetroDescriptions = {};

Promise.all([
  fetch("/json/planetSignDescriptions.json").then((res) => res.json()),
  fetch("/json/planetHouseDescriptions.json").then((res) => res.json()),
  fetch("/json/progressedPlanetSignDescriptions.json").then((res) =>
    res.json(),
  ),
  fetch("/json/progressedPlanetHouseDescriptions.json").then((res) =>
    res.json(),
  ),
  fetch("/json/transitPlanetSignDescriptions.json").then((res) => res.json()),
  fetch("/json/transitPlanetHouseDescriptions.json").then((res) => res.json()),
  fetch("/json/solarReturnPlanetSignDescriptions.json").then((res) =>
    res.json(),
  ),
  fetch("/json/solarReturnPlanetHouseDescriptions.json").then((res) =>
    res.json(),
  ),
  fetch("/json/lunarReturnPlanetSignDescriptions.json").then((res) =>
    res.json(),
  ),
  fetch("/json/lunarReturnPlanetHouseDescriptions.json").then((res) =>
    res.json(),
  ),
  fetch("/json/synastryPlanetSignDescriptions.json").then((res) => res.json()),
  fetch("/json/synastryPlanetHouseDescriptions.json").then((res) => res.json()),
  fetch("/json/compositePlanetSignDescriptions.json").then((res) => res.json()),
  fetch("/json/compositePlanetHouseDescriptions.json").then((res) =>
    res.json(),
  ),
  fetch("/json/planetAspectDescriptions.json").then((res) => res.json()),
  fetch("/json/graphPlanetRetroDescriptions.json").then((res) => res.json()),
])
  .then(
    ([
      signs,
      houses,
      progressedSigns,
      progressedHouses,
      transitSigns,
      transitHouses,
      solarReturnSigns,
      solarReturnHouses,
      lunarReturnSigns,
      lunarReturnHouses,
      synastrySigns,
      synastryHouses,
      compositeSigns,
      compositeHouses,
      aspects,
      graphRetro,
    ]) => {
      planetSignDescriptions = signs;
      planetHouseDescriptions = houses;
      progressedPlanetSignDescriptions = progressedSigns;
      progressedPlanetHouseDescriptions = progressedHouses;
      transitPlanetSignDescriptions = transitSigns;
      transitPlanetHouseDescriptions = transitHouses;
      solarReturnPlanetSignDescriptions = solarReturnSigns;
      solarReturnPlanetHouseDescriptions = solarReturnHouses;
      lunarReturnPlanetSignDescriptions = lunarReturnSigns;
      lunarReturnPlanetHouseDescriptions = lunarReturnHouses;
      synastryPlanetSignDescriptions = synastrySigns;
      synastryPlanetHouseDescriptions = synastryHouses;
      compositePlanetSignDescriptions = compositeSigns;
      compositePlanetHouseDescriptions = compositeHouses;
      planetAspectDescriptions = aspects;
      graphPlanetRetroDescriptions = graphRetro;
    },
  )
  .catch((err) => {
    console.error("Error loading planet description files.");
  });

// Helper function to calculate degrees for planet popups
function calculatePlanetDegrees(position, zodiacSystem) {
  const longitude = ((position % 360) + 360) % 360;
  const boundaries = zodiacBoundariesFor(zodiacSystem);
  const start = boundaries
    ? [...boundaries].reverse().find((item) => longitude >= item.boundary) ||
      boundaries[boundaries.length - 1]
    : { boundary: Math.floor(longitude / 30) * 30 };
  let degreeInSign = longitude - start.boundary;
  if (degreeInSign < 0) degreeInSign += 360;

  const hour = Math.floor(degreeInSign);
  const m = Math.floor((degreeInSign - hour) * 60);
  const minute = m < 10 ? "0" + m : m;

  return { hour, minute };
}

// Main function
export function sharedNatal(
  svgContainer,
  signInnerCustom = false,
  houseOuterCustom = false,
  houseInnerCustom = false,
  houseNumberCustom = false,
  planetCircleCustom = false,
  innerWheel = false,
  middleWheel = false,
  innerPlanet = false,
  centerPlanet = false,
  outerPlanet = false,
  removeHouseTicks = false,
  form = "natal",
) {
  // Define initial dimensions for the SVG viewBox
  const width = 1000;
  const height = 1000;
  const minDimension = Math.min(width, height); // Get the smaller dimension

  // Create an SVG that scales responsively
  const svg = svgContainer
    .append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("preserveAspectRatio", "xMidYMid meet")
    .attr("width", "100%")
    .attr("height", "100%");

  // Planet symbol tooltip
  const tooltip = d3.select("#tooltip");

  function showPlanetDetails(planet, chartType = "natal") {
    setTimeout(() => {
      tooltip.html("");
      const tp = tooltip
        .append("div")
        .attr("class", "planet-tooltip-instance")
        .style("pointer-events", "auto");
      const c = tp.append("div").attr("class", "tooltip-content");
      let key = planet.name.toLowerCase(),
        name = planet.name;
      // Handle custom points - use asteroid name for display only, keep key as-is to avoid matching built-in planet descriptions
      if (planet.isCustomPoint && planet.asteroidName) {
        name = planet.asteroidName;
      }
      if (key === "ascendant symbol") {
        key = "ascendant";
        name = "Ascendant";
      }
      if (key === "descendant symbol") {
        key = "descendant";
        name = "Descendant";
      }

      // Select appropriate description set based on chart type
      let signDescriptions = planetSignDescriptions;
      let houseDescriptions = planetHouseDescriptions;
      if (chartType === "progressed") {
        signDescriptions = progressedPlanetSignDescriptions;
        houseDescriptions = progressedPlanetHouseDescriptions;
      } else if (chartType === "transit") {
        signDescriptions = transitPlanetSignDescriptions;
        houseDescriptions = transitPlanetHouseDescriptions;
      } else if (chartType === "solar_return") {
        signDescriptions = solarReturnPlanetSignDescriptions;
        houseDescriptions = solarReturnPlanetHouseDescriptions;
      } else if (chartType === "lunar_return") {
        signDescriptions = lunarReturnPlanetSignDescriptions;
        houseDescriptions = lunarReturnPlanetHouseDescriptions;
      } else if (chartType === "synastry") {
        signDescriptions = synastryPlanetSignDescriptions;
        houseDescriptions = synastryPlanetHouseDescriptions;
      } else if (chartType === "composite") {
        signDescriptions = compositePlanetSignDescriptions;
        houseDescriptions = compositePlanetHouseDescriptions;
      } else if (chartType === "composite") {
        signDescriptions = compositePlanetSignDescriptions;
        houseDescriptions = compositePlanetHouseDescriptions;
      }

      const signDesc =
        (signDescriptions[key] || {})[planet.sign.toLowerCase()] ||
        "No description available";
      let houseHTML = "";
      if (
        !["ascendant", "descendant", "midheaven", "imum coeli"].includes(key) &&
        !planet.isCustomPoint
      ) {
        // Custom points have no keyed house descriptions in the descriptions
        // JSON, so their block would just print "House information not
        // available" — no info, only noise. Omit for custom points to keep
        // the popup clean, matching the treatment we already apply for the
        // aspect-details popup.
        let houseToUse;

        // For composite charts, calculate house position from composite's house cusps
        // to show midpoint houses, not chart 1's houses
        if (currentChartForm === "composite" && currentChartHouseCusps) {
          houseToUse = calculateHousePosition(
            planet.position,
            currentChartHouseCusps,
          );
        } else {
          // For other charts, use houseNatal (set for synastry) or house (from server)
          houseToUse = planet.houseNatal || planet.house;
        }

        const hd =
          ((houseToUse && houseDescriptions[key]) || {})[houseToUse] ||
          "House information not available";
        houseHTML = `<p style="margin:5px 0 0 0;"><strong>${name} in House ${
          houseToUse || "N/A"
        }:</strong> ${hd}</p>`;
      }
      const isMobile = window.innerWidth < 600,
        fs = isMobile ? "16px" : "20px";

      let planetIcon;
      if (planet.isCustomPoint && planet.displayLabel) {
        // For custom points, show the label and asteroid name
        planetIcon = `<span style="font-weight:bold;font-size:20px;vertical-align:middle;margin-right:6px">${planet.displayLabel}</span>`;
      } else {
        planetIcon = `<img src="/images/planets/${planet.name
          .toLowerCase()
          .replace(
            /[\s-]+/g,
            "",
          )}.svg" width="28" height="28" style="vertical-align:middle;margin:-6px 4px 0 -4px"/>`;
      }

      const signIcon = `<img src="/images/signs/colorized/${planet.sign
        .toLowerCase()
        .replace(
          /\s+/g,
          "",
        )}.svg" width="18" height="18" style="vertical-align:middle;margin:-2px 4px 0 2px"/>`;

      const retroIcon = planet.retroIcon
        ? `<img src="${planet.retroIcon}" width="18" height="18" style="vertical-align:middle;margin:-3px 0 0 0"/>`
        : "";

      // Skip sign description for Galactic Center (doesn't change signs)
      // and for custom points (no keyed sign descriptions in the JSON, so
      // the line would just say "No description available" — noise only).
      const signHTML =
        key === "galactic center" || planet.isCustomPoint
          ? ""
          : `<p style="margin:5px 0 0 0;"><strong>${name} in ${planet.sign}:</strong> ${signDesc}</p>`;

      c
        .append("div")
        .attr("class", "planet-details")
        .attr(
          "style",
          `white-space:normal;word-wrap:break-word;font-size:${fs};max-width:90vw;overflow-wrap:break-word;`,
        ).html(`
         <h3 style="margin:0 0 5px 0;">${planetIcon}${name}</h3>
         <p style="margin:0;"><strong>${planet.hour}°${signIcon}${planet.minute}'</strong>${retroIcon}</p>
         ${signHTML}
         ${houseHTML}
       `);

      tooltip.style("opacity", 0.95);
      if (isMobile)
        tooltip
          .style("top", "25%")
          .style("left", "0%")
          .style("transform", "translate(0,0)");

      function close(e) {
        if (!tooltip.node().contains(e.target)) {
          tooltip.style("opacity", 0);
          document.removeEventListener("click", close, true);
        }
      }
      document.addEventListener("click", close, true);
    }, 100);
  }

  // Expose showPlanetDetails on window so other modules can trigger the
  // standard planet-interpretation popup without duplicating its logic.
  // Used by the MAP's Sky view to make planet glyphs clickable.
  //
  // Gate on form === "natal": showPlanetDetails closes over
  // currentChartForm and currentChartHouseCusps. If we exposed the
  // composite/synastry/return closures, a Sky-planet click could land
  // in the composite house-calc branch at line 1096 above and compute
  // a natal planet's house against composite cusps — wrong data. Only
  // the natal closure has currentChartForm="natal", which routes
  // showPlanetDetails through the planet.house path that's correct
  // for natal planets read from window.natalPlanets.
  if (form === "natal") {
    window.showPlanetDetails = showPlanetDetails;
  }

  // Helper function to calculate which house a planet position falls into
  // Used for synastry charts to determine Chart 2 planet positions in Chart 1's houses
  // Make calculateHousePosition globally accessible for report generation
  function calculateHousePosition(planetPosition, houseCusps) {
    if (!houseCusps || houseCusps.length === 0) return null;

    // Normalize planet position to 0-360
    let normalizedPosition = planetPosition % 360;
    if (normalizedPosition < 0) normalizedPosition += 360;

    // Find which house the planet falls into
    for (let i = 0; i < houseCusps.length; i++) {
      const currentCusp = houseCusps[i].position;
      const nextCusp = houseCusps[(i + 1) % houseCusps.length].position;

      // Handle wraparound at 0/360 degrees
      if (nextCusp > currentCusp) {
        // Normal case: house doesn't cross 0°
        if (
          normalizedPosition >= currentCusp &&
          normalizedPosition < nextCusp
        ) {
          return i + 1; // House numbers are 1-indexed
        }
      } else {
        // Wraparound case: house crosses 0°
        if (
          normalizedPosition >= currentCusp ||
          normalizedPosition < nextCusp
        ) {
          return i + 1;
        }
      }
    }

    return null; // Shouldn't happen, but fallback
  }

  // Make it globally accessible
  window.calculateHousePosition = calculateHousePosition;
  window.calculatePlanetDegrees = calculatePlanetDegrees;

  // Store house cusps globally for synastry calculations
  let chart1HouseCusps = null;

  // Store current chart context for planet details
  let currentChartForm = null;
  let currentChartHouseCusps = null;

  // Dimensions
  const signOuter = 2.1;
  const signInner = signInnerCustom || 2.33;
  const houseOuter = houseOuterCustom || 4;
  const houseInner = houseInnerCustom || 4.5;
  const planetCircle = planetCircleCustom || 2.6;

  // Circles
  const signOuterRadius = minDimension / signOuter;
  const signInnerRadius = minDimension / signInner;
  const houseOuterRadius = minDimension / houseOuter;
  const houseInnerRadius = minDimension / houseInner;
  const planetCircleRadius = minDimension / planetCircle;

  // Zodiac signs
  const signs = [
    "aries",
    "taurus",
    "gemini",
    "cancer",
    "leo",
    "virgo",
    "libra",
    "scorpio",
    "sagittarius",
    "capricorn",
    "aquarius",
    "pisces",
  ];

  // Planet colors
  const planetColors = {
    sun: "#b4af00",
    earth: "#9ac77d",
    moon: "#0053bd",
    mercury: "#c5c5c5",
    venus: "#008401",
    mars: "#b90000",
    jupiter: "#ff5e00",
    saturn: "#8B4513",
    uranus: "#00a2b5",
    neptune: "#0007b8",
    pluto: "#5300c7",
    chiron: "#979797",
    "north node": "#353535",
    "south node": "#353535",
    "ascendant symbol": "#000000",
    midheaven: "#000000",
    descendant: "#000000",
    "imum coeli": "#000000",
    ceres: "#979797",
    vesta: "#979797",
    pallas: "#979797",
    juno: "#979797",
    lilith: "#000000",
    priapus: "#000000",
    "part of fortune": "#000000",
    "part of spirit": "#000000",
    vertex: "#000000",
    "anti-vertex": "#000000",
    "galactic center": "#000000",
  };

  // Sign colors
  const signColors = {
    aries: "#e15947",
    taurus: "#d58f3b",
    gemini: "#c9dd47",
    cancer: "#a5c16f",
    leo: "#33b278",
    virgo: "#44c1a8",
    libra: "#33b7bb",
    scorpio: "#3388c7",
    ophiuchus: "#353535",
    sagittarius: "#7a33d0",
    capricorn: "#a14cd3",
    aquarius: "#cf49cc",
    pisces: "#c16195",
  };

  // House colors
  const houseColors = [
    "#e15947",
    "#d58f3b",
    "#c9dd47",
    "#a5c16f",
    "#33b278",
    "#44c1a8",
    "#33b7bb",
    "#3388c7",
    "#7a33d0",
    "#a14cd3",
    "#cf49cc",
    "#c16195",
  ];

  //Sizes
  const signSizes = 28;
  const planetSizes = 48;
  const aspectSymbolSize = 20;

  // Global ascendant position
  let ascendantPosition = null;

  // Natal calculate button
  let formIdToUse;

  switch (form) {
    case "return":
      formIdToUse = "returnForm";
      break;

    case "composite":
      formIdToUse = "synastryForm";
      break;

    case "compositeBlank":
      formIdToUse = "natalForm";
      break;

    case "mapRelocation":
      formIdToUse = "mapRelocationForm";
      break;

    default:
      formIdToUse = "natalForm";
  }
  document.getElementById(formIdToUse).addEventListener("submit", function (e) {
    e.preventDefault(); // Prevent the default form submission behavior (no page reload)

    // Show the loading overlay immediately
    if (form === "natal" || form === "return") {
      document.getElementById("loading-overlay").style.display = "block";
    }

    const formData = new FormData(this); // Get the form data
    const formDataObj = Object.fromEntries(formData); // Convert form data to an object

    // Add return chart location to determine if relocated
    formDataObj.preservedNatalLocation =
      document.getElementById("natalLocation")?.value;
    formDataObj.returnLocation =
      document.getElementById("returnLocation")?.value;
    formDataObj.form = form;
    if (form === "return" || form === "mapRelocation") {
      const natalMetadata = JSON.parse(
        localStorage.getItem("natalData") || "null",
      );
      if (natalMetadata) {
        formDataObj.natalData = natalMetadata;
        if (form === "mapRelocation") {
          formDataObj.utcMode = "manual";
          formDataObj.utcOffset = natalMetadata.utcOffset;
        }
      }
    }

    // Retrieve selections from settings page
    const selectedPlanets = Array.from(
      document.querySelectorAll(
        '#planet-settings input[name="planet"]:checked',
      ),
    ).map((checkbox) => checkbox.value);

    const selectedPlanetsAspects = Array.from(
      document.querySelectorAll(
        '#planet-settings input[name="planetAspects"]:checked',
      ),
    ).map((checkbox) => checkbox.value);

    const selectedDegrees = document.querySelector(
      '.degree-settings input[name="degrees"]',
    ).checked;

    const trueNodes = document.querySelector(
      '.degree-settings input[name="trueNodes"]',
    ).checked;

    const trueLilith = document.querySelector(
      '.degree-settings input[name="trueLilith"]',
    ).checked;

    const draconic = document.querySelector(
      '.degree-settings input[name="draconic"]',
    ).checked;

    const fixedStars = document.querySelector(
      'input[name="fixedStars"]',
    ).checked;

    const fixedStarsMagnitude = parseFloat(
      document.querySelector('select[name="fixedStarsMagnitude"]').value,
    );

    const fixedStarsLatitude = parseFloat(
      document.querySelector('select[name="fixedStarsLatitude"]').value,
    );

    const selectedAspects = Array.from(
      document.querySelectorAll(
        '#aspect-settings input[name="aspects"]:checked',
      ),
    ).map((checkbox) => checkbox.value);

    const aspectOrbs = {};
    document
      .querySelectorAll("#aspect-settings select.aspect-orb") // ← existing class
      .forEach((sel) => {
        const key = sel.dataset.aspect;
        aspectOrbs[key] = +sel.value;
      });
    formDataObj.aspectOrbs = aspectOrbs;

    const selectedZodiacSystem = document.querySelector(
      '#system-settings select[name="zodiacSystem"]',
    ).value;

    const selectedHouseSystem = document.querySelector(
      '#system-settings select[name="houseSystem"]',
    ).value;

    const selectedCoordinateSystem = document.querySelector(
      '#system-settings select[name="coordinateSystem"]',
    ).value;

    const ascendantOverride =
      document.getElementById("ascendantOverride").value;

    // Include selected planets in the request
    formDataObj.selectedPlanets = selectedPlanets;
    formDataObj.selectedPlanetsAspects = selectedPlanetsAspects;
    formDataObj.selectedAspects = selectedAspects;
    formDataObj.selectedZodiacSystem = selectedZodiacSystem;
    formDataObj.selectedHouseSystem = selectedHouseSystem;
    formDataObj.selectedCoordinateSystem = selectedCoordinateSystem;
    formDataObj.ascendantOverride = ascendantOverride;
    formDataObj.trueNodes = trueNodes;
    formDataObj.trueLilith = trueLilith;
    formDataObj.draconic = draconic;
    formDataObj.fixedStars = fixedStars;
    formDataObj.fixedStarsMagnitude = fixedStarsMagnitude;
    formDataObj.fixedStarsLatitude = fixedStarsLatitude;

    // Include custom points if the global is defined (from saveLoadSettings.js)
    if (
      typeof activeCustomPoints !== "undefined" &&
      activeCustomPoints.length > 0
    ) {
      formDataObj.customPoints = activeCustomPoints
        .filter((p) => p.display)
        .map((p) => ({
          num: p.num,
          name: p.name,
          display: p.display,
          aspect: p.aspect,
        }));
    }

    // Include custom aspects if defined and any are enabled. Kept as a
    // SEPARATE payload field (not merged into selectedAspects) so the
    // server's aspect filter continues to operate on built-in names only.
    const currentCustomAspects =
      typeof activeCustomAspects !== "undefined"
        ? activeCustomAspects
            .filter((a) => a.enabled)
            .map((a) => ({ angle: a.angle, orb: a.orb }))
        : [];
    if (currentCustomAspects.length > 0) {
      formDataObj.customAspects = currentCustomAspects;
    }

    function renderChart(data) {
      // Any calc-affecting setting added here must also be added to the
      // stale-natal guard's comparison (~line 3041) or the inner wheel
      // silently renders against stale settings.
      const natalMeta = data[0];
      window.currentZodiacBoundaries = natalMeta.zodiacBoundaries || null;
      const natalData = {
        ...natalMeta,
        selectedPlanets,
        selectedPlanetsAspects,
        selectedAspects,
        zodiacSystem: selectedZodiacSystem,
        houseSystem: selectedHouseSystem,
        coordinateSystem: selectedCoordinateSystem,
        ascendantOverride,
        trueNodes,
        trueLilith,
        draconic,
        aspectOrbs,
        fixedStars,
        fixedStarsMagnitude,
        fixedStarsLatitude,
        customPoints:
          typeof activeCustomPoints !== "undefined"
            ? activeCustomPoints
                .filter((p) => p.display)
                .map((p) => ({
                  num: p.num,
                  name: p.name,
                  display: p.display,
                  aspect: p.aspect,
                }))
            : [],
        // Snapshot for stale-natal-guard comparison. Must be present even
        // if empty so the guard can detect the empty→non-empty transition
        // when a user first adds a custom aspect.
        customAspects: currentCustomAspects,
      };

      // Array of month names
      const monthNames = [
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
        "August",
        "September",
        "October",
        "November",
        "December",
      ];

      // Convert numeric month to spelled-out month for use on forms
      if (natalData.month && !isNaN(natalData.month)) {
        natalData.month = monthNames[natalData.month - 1]; // Convert numeric month to spelled-out
      }

      // Signal MAP click-to-relocate that the hidden chart finished rendering
      if (form === "mapRelocation") {
        document.dispatchEvent(new CustomEvent("mapRelocationComplete"));
      }

      // Render triwheel & synastry in parallel
      if (form === "natal") {
        localStorage.setItem("natalData", JSON.stringify(natalData));
        // Dispatch event to signal natal chart calculation is complete (used by graph)
        document.dispatchEvent(new CustomEvent("natalChartComplete"));
        document.getElementById("triwheelForm").requestSubmit();
        // MAP auto-renders alongside triwheel. Same fire-and-forget pattern —
        // its handler must not touch the loading overlay so existing 10K
        // users (who don't use MAP) see no overlay-flash change.
        document.getElementById("mapForm").requestSubmit();
        // const day = document.getElementById("synastryDay").value.trim();
        // if (day) {
        //   document.getElementById("synastryForm").requestSubmit();
        // }

        // If synastry data exists, also trigger composite recalculation
        if (window.synastryData && window.synastryData.length > 0) {
          // Trigger synastry form which will then calculate composite
          const synastryForm = document.getElementById("synastryForm");
          if (synastryForm) {
            setTimeout(() => {
              synastryForm.requestSubmit();
            }, 100);
          }
        }

        // If this natal was forced by the outer-wheel guard, re-fire
        // the source form unless line 1556/1567 already covers it.
        if (window._staleGuardResubmitFormId) {
          const resubmitId = window._staleGuardResubmitFormId;
          window._staleGuardResubmitFormId = null;
          const alreadyChained =
            resubmitId === "triwheelForm" ||
            (resubmitId === "synastryForm" &&
              window.synastryData &&
              window.synastryData.length > 0);
          if (!alreadyChained) {
            const formToResubmit = document.getElementById(resubmitId);
            if (formToResubmit) {
              setTimeout(() => {
                formToResubmit.requestSubmit();
              }, 100);
            }
          }
        }
      }

      // Clear error message - check which page is visible
      const settingsVisible =
        document.getElementById("showSettings") &&
        document.getElementById("showSettings").style.display !== "none";

      if (settingsVisible) {
        const settingsError = document.querySelector(
          "#showSettings .errorMessage",
        );
        if (settingsError) settingsError.textContent = "";
      } else {
        // Clear natal or return form error
        const natalError = document.querySelector("#natalForm .errorMessage");
        const returnError = document.querySelector("#returnForm .errorMessage");
        if (natalError) natalError.textContent = "";
        if (returnError) returnError.textContent = "";
      }

      // Remove natal images
      svg.selectAll(".natal").remove();

      // Reset the Graph Section for natal calculations (skip if graph is running)
      if (form === "natal" && !window._graphNeedsOverlay) {
        const graphContainer = document.getElementById("graph");
        if (graphContainer) {
          graphContainer.innerHTML = "";
        }
      }

      // Extract Ascendant position
      const ascendant = data.find((item) => item.name === "Ascendant");
      ascendantPosition = ascendant ? ascendant.position : null;

      // Birth details
      svg.selectAll(".birth-details").remove();

      if (form === "composite") {
        // Dual-column layout for composite charts
        const maxNatalDetailsLength = 38; // Maximum characters for natal details lines
        const person1Data = window.natalData?.[0] || {};
        const person2Data = window.synastryData?.[0] || {};

        // Convert numeric months to month names
        const monthNames = [
          "January",
          "February",
          "March",
          "April",
          "May",
          "June",
          "July",
          "August",
          "September",
          "October",
          "November",
          "December",
        ];

        if (person1Data.month && !isNaN(person1Data.month)) {
          person1Data.month = monthNames[person1Data.month - 1];
        }
        if (person2Data.month && !isNaN(person2Data.month)) {
          person2Data.month = monthNames[person2Data.month - 1];
        }

        // Left column (Person 1)
        const person1Details = [
          `${person1Data.name || ""}`.substring(0, maxNatalDetailsLength),
          `${person1Data.day || ""} ${person1Data.month || ""} ${
            person1Data.year || ""
          } ${person1Data.hourString || ""}:${
            person1Data.minuteString || ""
          } (UTC ${person1Data.utcOffset})`.substring(0, maxNatalDetailsLength),
          `${(person1Data.location || "").split(":")[0] || ""}`.substring(
            0,
            maxNatalDetailsLength,
          ),
          `${person1Data.lat || ""}, ${person1Data.long || ""}`.substring(
            0,
            maxNatalDetailsLength,
          ),
        ];

        svg
          .append("g")
          .attr("class", "birth-details birth-details-left")
          .attr("transform", `translate(0, -64)`)
          .selectAll("text")
          .data(person1Details)
          .enter()
          .append("text")
          .attr("y", (d, i) => i * 34)
          .attr("font-family", "Segoe UI, sans-serif")
          .attr("font-size", "28px")
          .attr("fill", "#222")
          .attr("font-weight", "normal")
          .text((d) => d);

        // Right column (Person 2)
        const person2Details = [
          `${person2Data.name || ""}`.substring(0, maxNatalDetailsLength),
          `${person2Data.day || ""} ${person2Data.month || ""} ${
            person2Data.year || ""
          } ${person2Data.hourString || ""}:${
            person2Data.minuteString || ""
          } (UTC ${person2Data.utcOffset})`.substring(0, maxNatalDetailsLength),
          `${(person2Data.location || "").split(":")[0] || ""}`.substring(
            0,
            maxNatalDetailsLength,
          ),
          `${person2Data.lat || ""}, ${person2Data.long || ""}`.substring(
            0,
            maxNatalDetailsLength,
          ),
        ];

        svg
          .append("g")
          .attr("class", "birth-details birth-details-right")
          .attr("transform", `translate(${width - 20}, -64)`)
          .selectAll("text")
          .data(person2Details)
          .enter()
          .append("text")
          .attr("y", (d, i) => i * 34)
          .attr("text-anchor", "end")
          .attr("font-family", "Segoe UI, sans-serif")
          .attr("font-size", "28px")
          .attr("fill", "#222")
          .attr("font-weight", "normal")
          .text((d) => d);

        // Center title for composite with both names
        const compositeTitle = `${person1Data.name || "Person 1"} & ${
          person2Data.name || "Person 2"
        } - Composite`;
        svg
          .append("g")
          .attr("class", "birth-details birth-details-center")
          .attr("transform", `translate(${width / 2}, -112)`)
          .append("text")
          .attr("y", 0)
          .attr("text-anchor", "middle")
          .attr("font-family", "Segoe UI, sans-serif")
          .attr("font-size", "36px")
          .attr("fill", "#222")
          .attr("font-weight", "bold")
          .text(compositeTitle);
      } else {
        // Standard single-column layout for other charts
        const birthDetails = [
          `${natalData.name}`,
          `${natalData.day} ${natalData.month} ${natalData.year} ${natalData.hourString}:${natalData.minuteString} (UTC ${natalData.utcOffset})`,
          `${natalData.location}`,
          `${natalData.lat}, ${natalData.long}`,
        ];

        svg
          .append("g")
          .attr("class", "birth-details")
          .attr("transform", `translate(${width / 2}, -120)`)
          .selectAll("text")
          .data(birthDetails)
          .enter()
          .append("text")
          .attr("y", (d, i) => (i === 0 ? 0 : (i - 1) * 34 + 40)) // Line spacing (more spacing below name)
          .attr("text-anchor", "middle")
          .attr("font-family", "Segoe UI, sans-serif")
          .attr("font-size", (d, i) => (i === 0 ? "36px" : "28px"))
          .attr("fill", "#222")
          .attr("font-weight", (d, i) => (i === 0 ? "bold" : "normal"))
          .text((d) => d);
      }

      // Astrology system details
      svg.selectAll(".system-details").remove();

      const systemDetails = [
        `Zodiac: ${natalData.zodiacSystem}`,
        `House: ${natalData.houseSystem}`,
        `Coordinates: ${natalData.coordinateSystem}`,
        `Lunar Nodes: True Nodes`,
      ];

      svg
        .append("g")
        .attr("class", "system-details")
        .attr("transform", `translate(${width / 2}, ${height + 26})`)
        .selectAll("text")
        .data(systemDetails)
        .enter()
        .append("text")
        .attr("y", (d, i) => i * 30)
        .attr("text-anchor", "middle")
        .attr("font-family", "Segoe UI, sans-serif")
        .attr("font-size", "24px")
        .attr("fill", "#222")
        .text((d) => d);

      // HOUSES
      // House Cusps
      // Extract house cusp positions from data
      const houseCusps = data.filter(
        (item) => item.name && item.name.startsWith("House"),
      );

      // Store Chart 1's house cusps for synastry calculations
      if (form === "synastry") {
        chart1HouseCusps = houseCusps;
        // Make it globally accessible for synastry report generation
        window.chart1HouseCusps = houseCusps;
      }

      // Store composite house cusps for composite report generation
      if (form === "composite") {
        window.compositeHouseCusps = houseCusps;
      }

      // Store return house cusps for return chart calculations
      if (form === "return") {
        window.returnHouseCusps = houseCusps;
      }

      // Store natal house cusps for external modules — used by the MAP's
      // Sky view to draw faint cusp markers at each natal house boundary.
      // Mirrors the synastry/composite/return pattern above. Each cusp
      // entry has { name: "House N", tropical, position, sign }.
      if (form === "natal") {
        window.natalHouseCusps = houseCusps;
      }

      // Store current chart's form and house cusps for planet details
      currentChartForm = form;
      currentChartHouseCusps = houseCusps;

      // Keep the complete positions table directly below MAIN. Background transit/map
      // calculations do not replace it, so it always reflects the visible main chart.
      if (form === "natal") {
        renderMainChartPositionTable(data, natalData, selectedZodiacSystem, houseCusps);
      }

      houseCusps.forEach((house) => {
        // Convert house position from degrees to radians
        const angle =
          ((ascendantPosition - house.position - 180) * Math.PI) / 180;

        // Calculate coordinates for the start (inner circle) and end (outer circle) of each line
        const x1 = width / 2 + houseInnerRadius * Math.cos(angle);
        const y1 = height / 2 + houseInnerRadius * Math.sin(angle);
        const x2 = width / 2 + signInnerRadius * Math.cos(angle);
        const y2 = height / 2 + signInnerRadius * Math.sin(angle);

        // Append house cusp line from inner house circle to outer sign circle
        svg
          .append("line")
          .attr("x1", x1)
          .attr("y1", y1)
          .attr("x2", x2)
          .attr("y2", y2)
          .attr(
            "class",
            `natal${form === "triwheel" ? " house-line-full" : ""}`,
          )
          .style("stroke", "black")
          .style("stroke-width", 1.5)
          .style("stroke-opacity", 0.5);

        // For triwheel, also render shorter house lines for biwheel mode
        // These extend only to the middle wheel's inner radius
        if (form === "triwheel" && middleWheel) {
          const x2Short =
            width / 2 + signInnerRadius * middleWheel * Math.cos(angle);
          const y2Short =
            height / 2 + signInnerRadius * middleWheel * Math.sin(angle);

          svg
            .append("line")
            .attr("x1", x1)
            .attr("y1", y1)
            .attr("x2", x2Short)
            .attr("y2", y2Short)
            .attr("class", "natal house-line-short")
            .style("stroke", "black")
            .style("stroke-width", 1.5)
            .style("stroke-opacity", 0.5);
        }
      });

      // House colors
      // Create arcs between house cusps with proper counterclockwise angle calculations
      houseCusps.forEach((house, index) => {
        const nextHouse = houseCusps[(index + 1) % houseCusps.length];

        // Calculate start and end angles based on house positions, adjusting for the ascendant
        const startAngle =
          ((ascendantPosition - house.position - 90) * Math.PI) / 180;
        const endAngle =
          ((ascendantPosition - nextHouse.position - 90) * Math.PI) / 180;

        // Ensure that if the start angle is less than the end angle, we adjust for wraparound
        let adjustedEndAngle = endAngle;
        if (startAngle < endAngle) {
          adjustedEndAngle -= 2 * Math.PI;
        }

        // Create the arc from one cusp to the next
        const arc = d3
          .arc()
          .innerRadius(houseInnerRadius)
          .outerRadius(houseOuterRadius)
          .startAngle(startAngle)
          .endAngle(adjustedEndAngle);

        // Append the arc for each house
        svg
          .append("path")
          .attr("d", arc)
          .attr("transform", `translate(${width / 2}, ${height / 2})`)
          .attr("class", "natal")
          .style("fill", houseColors[index % houseColors.length]) // Use the correct color for each house
          .style("fill-opacity", 0.9)
          .style("stroke", "none")
          .style("stroke", "black")
          .style("stroke-width", 1.5);
      });

      // House numbers
      houseCusps.forEach((house, index) => {
        const nextHouse = houseCusps[(index + 1) % houseCusps.length];

        const currentAngle =
          ((ascendantPosition - house.position) * Math.PI) / 180;
        const nextAngle =
          ((ascendantPosition - nextHouse.position) * Math.PI) / 180;

        let midAngle = (currentAngle + nextAngle) / 2;

        if (nextAngle < currentAngle) {
          midAngle = (currentAngle + (nextAngle + 2 * Math.PI)) / 2;
        }

        if (midAngle > 2 * Math.PI) {
          midAngle -= 2 * Math.PI;
        }

        const x =
          width / 2 +
          ((houseInnerRadius + houseOuterRadius) / 2) * Math.cos(midAngle);
        const y =
          height / 2 +
          ((houseInnerRadius + houseOuterRadius) / 2) * Math.sin(midAngle);

        // Append the house number (index + 1 to show correct house number)
        svg
          .append("text")
          .attr("x", x)
          .attr("y", y)
          .attr("text-anchor", "middle")
          .attr("alignment-baseline", "middle")
          .attr("font-size", houseNumberCustom || "24px")
          .attr("fill", "black")
          .attr("class", "natal")
          .text(index + 1); // House numbers 1-12
      });

      // SIGNS
      const customZodiacBoundaries = [
        { sign: "Aries", boundary: 0 },
        { sign: "Taurus", boundary: 19.7267 },
        { sign: "Gemini", boundary: 56.5838 },
        { sign: "Cancer", boundary: 86.0378 },
        { sign: "Leo", boundary: 103.1872 },
        { sign: "Virgo", boundary: 141.6068 },
        { sign: "Libra", boundary: 191.3253 },
        { sign: "Scorpio", boundary: 210.2037 },
        { sign: "Ophiuchus", boundary: 223.4316 },
        { sign: "Sagittarius", boundary: 235.7895 },
        { sign: "Capricorn", boundary: 269.1806 },
        { sign: "Aquarius", boundary: 294.8496 },
        { sign: "Pisces", boundary: 318.0143 },
      ];

      // Function to calculate zodiac angles
      function getZodiacAngles(boundaries) {
        return boundaries.map((item, index) => {
          const start = item.boundary;
          const end =
            index === boundaries.length - 1
              ? boundaries[0].boundary + 360
              : boundaries[index + 1].boundary;
          return { sign: item.sign, start, end };
        });
      }

      const zodiacBoundaries =
        selectedZodiacSystem === "Midpoint"
          ? customZodiacBoundaries
          : natalMeta.zodiacBoundaries ||
            signs.map((sign, index) => ({
              sign,
              boundary: index * 30,
            }));

      // Sign colors
      const generateSignColors = (c, selectedZodiacSystem, extraClass = "") => {
        const zodiacAngles = getZodiacAngles(zodiacBoundaries);

        const arcGenerator = d3
          .arc()
          .innerRadius(signInnerRadius * c)
          .outerRadius(signOuterRadius * c)
          .startAngle(
            (d) => ((ascendantPosition - d.start - 90) * Math.PI) / 180,
          )
          .endAngle((d) => ((ascendantPosition - d.end - 90) * Math.PI) / 180);

        zodiacAngles.forEach((angle) => {
          svg
            .append("path")
            .datum(angle)
            .attr("d", arcGenerator)
            .attr("transform", `translate(${width / 2}, ${height / 2})`)
            .attr("class", `natal${extraClass ? ` ${extraClass}` : ""}`)
            .style("fill", signColors[angle.sign.toLowerCase()] || "gray")
            .style("fill-opacity", 1)
            .style("stroke", "black")
            .style("stroke-width", 1.5);
        });
      };

      // Outer wheel sign colors
      generateSignColors(
        1,
        selectedZodiacSystem,
        form === "triwheel" ? "outer-wheel" : "",
      );

      // Inner wheel sign colors
      if (innerWheel) {
        generateSignColors(innerWheel, selectedZodiacSystem);
      }

      // Middle wheel sign colors
      if (middleWheel) {
        generateSignColors(middleWheel, selectedZodiacSystem);
      }

      // Sign Lines
      const zodiacAngles = getZodiacAngles(zodiacBoundaries);

      zodiacAngles.forEach((angle, index) => {
        // Midpoint angle for placing the sign SVG
        const midAngleDeg = (angle.start + angle.end) / 2;

        // Convert angles to radians for D3 calculations
        const startAngle =
          ((ascendantPosition - angle.start - 180) * Math.PI) / 180;
        const midAngle =
          ((ascendantPosition - midAngleDeg - 180) * Math.PI) / 180;

        // Calculate x and y coordinates for the start line of each sign
        const x1 = width / 2 + signOuterRadius * Math.cos(startAngle);
        const y1 = height / 2 + signOuterRadius * Math.sin(startAngle);
        const x2 = width / 2 + signInnerRadius * Math.cos(startAngle);
        const y2 = height / 2 + signInnerRadius * Math.sin(startAngle);

        svg
          .append("line")
          .attr("x1", x1)
          .attr("y1", y1)
          .attr("x2", x2)
          .attr("y2", y2)
          .attr("class", `natal${form === "triwheel" ? " outer-wheel" : ""}`)
          .style("stroke", "black")
          .style("stroke-width", 1.5);

        // Sign symbols
        // Symbol sizes
        let signSize = signSizes;

        // Function to position and append sign symbols
        const appendSignSymbols = (s, extraClass = "") => {
          const xMid =
            width / 2 +
            ((signOuterRadius * s + signInnerRadius * s) / 2) *
              Math.cos(midAngle);
          const yMid =
            height / 2 +
            ((signOuterRadius * s + signInnerRadius * s) / 2) *
              Math.sin(midAngle);

          const scaledSignSize = signSize * s;

          const signKey = angle.sign.toLowerCase().replace(/[\s-]+/g, "");
          const signHref = signImageCache[signKey];

          svg
            .append("image")
            .attr("xlink:href", signHref)
            .attr("x", xMid - scaledSignSize / 2)
            .attr("y", yMid - scaledSignSize / 2)
            .attr("width", scaledSignSize)
            .attr("height", scaledSignSize)
            .attr("class", `natal${extraClass ? ` ${extraClass}` : ""}`);
        };

        // Outer wheel sign symbol
        appendSignSymbols(1, form === "triwheel" ? "outer-wheel" : "");

        // Inner wheel sign symbol
        if (innerWheel) {
          appendSignSymbols(innerWheel);
        }

        // Middle wheel sign symbol
        if (middleWheel) {
          appendSignSymbols(middleWheel);
        }
      });

      // PLANETS
      // Array of planets from the data
      const planets = filterSelectedChartObjects(
        data.filter(
          (item) =>
            (item.name &&
              [
                "Sun",
                "Earth",
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
                "North Node",
                "South Node",
                "Ascendant Symbol",
                "Midheaven",
                "Descendant",
                "Imum Coeli",
                "Ceres",
                "Vesta",
                "Pallas",
                "Juno",
                "Lilith",
                "Priapus",
                "Part of Fortune",
                "Part of Spirit",
                "Vertex",
                "Anti-Vertex",
                "Galactic Center",
              ].includes(item.name)) ||
            item.isCustomPoint,
        ),
        selectedPlanets,
      );

      // Extract fixed stars from data
      const fixedStarsData = data.filter((item) => item.isFixedStar === true);

      // Use planets in aspectarian and report
      if (form === "synastry") {
        window.synastryPlanets = planets;
      }
      if (form === "return") {
        window.returnPlanets = planets;
      }
      if (form === "natal") {
        window.natalPlanets = planets;
        // Get natal data for composite
        window.natalData = data;
      }

      // FIXED STARS (rendered before planets so planets appear on top)
      if (fixedStars && fixedStarsData.length > 0) {
        // Position for dots (on inner edge of zodiac signs)
        const starDotRadius = innerWheel
          ? signInnerRadius * innerWheel
          : signInnerRadius;

        // Text labels positioned inside toward center (closer for triwheel with smaller font)
        const starTextOffset = form === "triwheel" ? 15 : 25;
        const starTextRadius = starDotRadius - starTextOffset;

        // Sort stars by position and calculate spaced label positions
        const sortedStars = [...fixedStarsData].sort(
          (a, b) => a.position - b.position,
        );

        // Simple angular spacing: push labels apart when too close
        const minSeparation = 3; // minimum degrees between labels
        const labelPositions = [];

        sortedStars.forEach((star, i) => {
          let labelPos = star.position;

          // Check against all previous labels and push apart if too close
          for (let j = 0; j < labelPositions.length; j++) {
            const diff = labelPos - labelPositions[j];
            const absDiff = Math.abs(diff);
            const actualDiff = absDiff > 180 ? 360 - absDiff : absDiff;

            if (actualDiff < minSeparation) {
              labelPos = labelPositions[j] + minSeparation;
              if (labelPos >= 360) labelPos -= 360;
            }
          }

          labelPositions.push(labelPos);
        });

        // Render stars with spaced labels and connecting lines
        sortedStars.forEach((star, i) => {
          const dotAngle =
            ((ascendantPosition - star.position - 180) * Math.PI) / 180;
          const dotX = width / 2 + starDotRadius * Math.cos(dotAngle);
          const dotY = height / 2 + starDotRadius * Math.sin(dotAngle);

          const labelAngle =
            ((ascendantPosition - labelPositions[i] - 180) * Math.PI) / 180;
          const textX = width / 2 + starTextRadius * Math.cos(labelAngle);
          const textY = height / 2 + starTextRadius * Math.sin(labelAngle);

          // Determine hemisphere for text orientation
          let rotationDeg = (labelAngle * 180) / Math.PI;
          const normalizedAngle = ((rotationDeg % 360) + 360) % 360;
          const isLeftHemisphere =
            normalizedAngle > 90 && normalizedAngle < 270;

          // Draw connecting line if label is offset from dot
          const labelOffset = Math.abs(star.position - labelPositions[i]);
          if (labelOffset > 0.5) {
            svg
              .append("line")
              .attr("x1", dotX)
              .attr("y1", dotY)
              .attr("x2", textX)
              .attr("y2", textY)
              .attr("stroke", "#555555")
              .attr("stroke-width", 1)
              .attr("class", "natal fixed-star-line");
          }

          // Draw dots (all three wheels in triwheel mode)
          if (form === "triwheel" && middleWheel) {
            // Draw dot on inner wheel (always visible)
            const innerDotRadius = signInnerRadius * innerWheel;
            const innerDotX = width / 2 + innerDotRadius * Math.cos(dotAngle);
            const innerDotY = height / 2 + innerDotRadius * Math.sin(dotAngle);
            svg
              .append("circle")
              .attr("cx", innerDotX)
              .attr("cy", innerDotY)
              .attr("r", 3)
              .attr("class", "natal fixed-star-dot")
              .style("fill", "#000000");

            // Draw dot on middle wheel (visible in biwheel modes as the outer ring)
            const middleDotRadius = signInnerRadius * middleWheel;
            const middleDotX = width / 2 + middleDotRadius * Math.cos(dotAngle);
            const middleDotY =
              height / 2 + middleDotRadius * Math.sin(dotAngle);
            svg
              .append("circle")
              .attr("cx", middleDotX)
              .attr("cy", middleDotY)
              .attr("r", 3)
              .attr("class", "natal fixed-star-dot")
              .style("fill", "#000000");

            // Draw dot on outer wheel (hidden in biwheel modes)
            const outerDotX = width / 2 + signInnerRadius * Math.cos(dotAngle);
            const outerDotY = height / 2 + signInnerRadius * Math.sin(dotAngle);
            svg
              .append("circle")
              .attr("cx", outerDotX)
              .attr("cy", outerDotY)
              .attr("r", 3)
              .attr("class", "natal fixed-star-dot outer-wheel")
              .style("fill", "#000000");
          } else {
            // Single wheel - draw one dot
            svg
              .append("circle")
              .attr("cx", dotX)
              .attr("cy", dotY)
              .attr("r", 4)
              .attr("class", "natal fixed-star-dot")
              .style("fill", "#000000");
          }

          let textAnchor;
          if (isLeftHemisphere) {
            textAnchor = "start";
            rotationDeg = rotationDeg + 180;
          } else {
            textAnchor = "end";
          }

          // Draw star name (smaller for triwheel)
          const starFontSize = form === "triwheel" ? "12px" : "18px";
          svg
            .append("text")
            .attr("x", textX)
            .attr("y", textY)
            .attr("text-anchor", textAnchor)
            .attr("dominant-baseline", "middle")
            .attr("font-family", "Arial, sans-serif")
            .attr("font-size", starFontSize)
            .attr("fill", "#333333")
            .attr("class", "natal fixed-star-label")
            .attr("transform", `rotate(${rotationDeg}, ${textX}, ${textY})`)
            .text(star.name);
        });
      }

      // PLANET SYMBOLS
      // Planet symbols spacing
      let spacingDistance = 0.12;
      if (innerPlanet) {
        spacingDistance = 0.19;
      }
      const spacedSymbols = symbolSpacing(
        planets,
        ascendantPosition,
        spacingDistance,
      );

      // Draw planet symbols
      spacedSymbols.forEach((planet) => {
        // Adjusted angle for symbols
        const adjustedAngle = planet.adjustedAngle;

        // Calculate x and y coordinates for the planet based on its position
        const x = width / 2 + planetCircleRadius * Math.cos(adjustedAngle);
        const y = height / 2 + planetCircleRadius * Math.sin(adjustedAngle);

        // Store degree + minute
        const { hour, minute } = formatZodiacDegrees(
          planet.position,
          zodiacBoundaries,
          selectedZodiacSystem,
        );
        planet.hour = hour;
        planet.minute = minute;

        // Store retro icon
        if (planet.retrograde) {
          let icon = "/images/misc/retrograde.svg";
          if (planet.retrograde === "sd") icon = "/images/misc/sd.svg";
          if (planet.retrograde === "sr") icon = "/images/misc/sr.svg";
          planet.retroIcon = icon;
        }

        // Mirror hour/minute/retroIcon onto the original planet object in
        // window.natalPlanets. symbolSpacing returns shallow COPIES of the
        // planets via spread ({...planet, adjustedAngle}), so the lines
        // above only mutate the local copy — window.natalPlanets[i] keeps
        // hour/minute undefined unless we write them back. External modules
        // (e.g. MAP's Sky-planet click handler) read directly from
        // window.natalPlanets and need these fields. Gated to natal renders
        // so composite/synastry/return renders don't pollute the natal cache.
        if (form === "natal" && window.natalPlanets) {
          const orig = window.natalPlanets.find((p) => p.name === planet.name);
          if (orig) {
            orig.hour = hour;
            orig.minute = minute;
            if (planet.retroIcon) orig.retroIcon = planet.retroIcon;
          }
        }

        // Planet sizes
        let planetSize = planetSizes;

        if (innerPlanet) {
          planetSize *= innerPlanet;
        }

        const planetKey = planet.name.toLowerCase().replace(/[\s-]+/g, "");
        const planetHref =
          planetImageCache[planetKey] || `/images/planets/${planetKey}.svg`;

        // Check if this is a custom point (renders text instead of image)
        if (planet.isCustomPoint && planet.displayLabel) {
          // Render text label for custom points (01, 02, etc.)
          // Use planetSize * 0.6 to get proportional font size matching planet SVGs
          const customFontSize = Math.round(planetSize * 0.6);
          svg
            .append("text")
            .attr("x", x)
            .attr("y", y)
            .attr("text-anchor", "middle")
            .attr("dominant-baseline", "central")
            .attr("font-family", "Arial, sans-serif")
            .attr("font-size", `${customFontSize}px`)
            .attr("font-weight", "bold")
            .attr("fill", "#2c3d4f")
            .attr("class", "natal custom-point-symbol")
            .style("filter", "drop-shadow(1px 1px 0px #999)")
            .style("cursor", "pointer")
            .text(planet.displayLabel)
            .on("click", function (event) {
              event.stopPropagation();
              showPlanetDetails(planet);
            });
        } else {
          // Append planet SVG image at calculated position
          svg
            .append("image")
            .attr("xlink:href", planetHref) // data planet name to svg name
            .attr("x", x - planetSize / 2) // Offset to center image on position
            .attr("y", y - planetSize / 2) // Offset to center image on position
            .attr("width", planetSize) // Width of planet image
            .attr("height", planetSize) // Height of planet image
            .attr("class", "natal")
            .style(
              "filter",
              innerPlanet
                ? `drop-shadow(1px 1px 0px #555)`
                : `drop-shadow(2px 2px 0px #555)`,
            )
            // Add click event for the popup
            .on("mouseover", function () {
              d3.select(this).style("cursor", "pointer");
            })
            .on("click", function (event) {
              event.stopPropagation();
              if (form === "return") {
                const adjustType = document.getElementById("adjustType")?.value;
                // Planetary returns (mercury_return etc.) have no description
                // sets yet, so they fall through to natal descriptions
                const chartType =
                  (adjustType || "Solar").toLowerCase() + "_return";
                showPlanetDetails(planet, chartType);
              } else if (form === "composite") {
                showPlanetDetails(planet, "composite");
              } else {
                showPlanetDetails(planet);
              }
            });
        }

        // Sign symbol
        let signOffset = 60;
        const signX =
          width / 2 +
          (planetCircleRadius - signOffset) * Math.cos(adjustedAngle);
        const signY =
          height / 2 +
          (planetCircleRadius - signOffset) * Math.sin(adjustedAngle);

        const signKey = planet.sign.toLowerCase().replace(/[\s-]+/g, "");
        const signHref = colorizedSignImageCache[signKey];

        if (selectedDegrees && !innerPlanet) {
          svg
            .append("image")
            .attr("xlink:href", signHref)
            .attr("x", signX - 10)
            .attr("y", signY - 10)
            .attr("width", 18)
            .attr("height", 18)
            .attr("class", "natal")
            .style("opacity", 0.8)
            .style("filter", `drop-shadow(1px 1px 0px #555)`);
        }

        // DEGREES
        // Function for getting degrees
        function formatZodiacDegrees(
          totalDegrees,
          boundaries,
          selectedZodiacSystem,
        ) {
          // Mainstream 30 degree systems
          if (selectedZodiacSystem !== "Midpoint") {
            const degreeInSign = totalDegrees % 30;
            const d = Math.floor(degreeInSign);
            const m = Math.floor((degreeInSign - d) * 60);
            const mStr = m < 10 ? "0" + m : m;
            return { hour: d, minute: mStr };
          }

          // Custom boundaries
          let signStart = 0,
            signEnd = 0;

          // If planet's position is less than the first boundary it belongs to the last sign
          if (totalDegrees < boundaries[0].boundary) {
            signStart = boundaries[boundaries.length - 1].boundary;
            signEnd = 360;
          } else {
            // Otherwise find the sign where totalDegrees falls
            for (let i = 0; i < boundaries.length; i++) {
              const current = boundaries[i];
              const next = boundaries[i + 1];
              if (!next) {
                // last sign
                signStart = current.boundary;
                signEnd = 360;
                break;
              }
              if (
                totalDegrees >= current.boundary &&
                totalDegrees < next.boundary
              ) {
                signStart = current.boundary;
                signEnd = next.boundary;
                break;
              }
            }
          }
          const degreeInSign = totalDegrees - signStart;
          const d = Math.floor(degreeInSign);
          const m = Math.floor((degreeInSign - d) * 60);
          const mStr = m < 10 ? "0" + m : m;
          return { hour: d, minute: mStr };
        }

        if (selectedDegrees && !innerPlanet) {
          const { hour, minute } = formatZodiacDegrees(
            planet.position,
            zodiacBoundaries,
            selectedZodiacSystem,
          );

          // Hour (degree) - outer text
          const hourOffset = 38;
          const hourX =
            width / 2 +
            (planetCircleRadius - hourOffset) * Math.cos(adjustedAngle);
          const hourY =
            height / 2 +
            (planetCircleRadius - hourOffset) * Math.sin(adjustedAngle);

          svg
            .append("text")
            .attr("x", hourX)
            .attr("y", hourY)
            .attr("text-anchor", "middle")
            .attr("alignment-baseline", "middle")
            .attr(
              "font-family",
              "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
            )
            .attr("font-size", "16px")
            .attr("fill", "black")
            .attr("font-weight", "bold")
            .attr("class", "natal degrees")
            .text(`${hour}°`);

          // Minute - inner text
          const minuteOffset = 82;
          const minuteX =
            width / 2 +
            (planetCircleRadius - minuteOffset) * Math.cos(adjustedAngle);
          const minuteY =
            height / 2 +
            (planetCircleRadius - minuteOffset) * Math.sin(adjustedAngle);

          svg
            .append("text")
            .attr("x", minuteX)
            .attr("y", minuteY)
            .attr("text-anchor", "middle")
            .attr("alignment-baseline", "middle")
            .attr(
              "font-family",
              "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
            )
            .attr("font-size", "14px")
            .attr("fill", "black")
            .attr("font-weight", "normal")
            .attr("class", "natal degrees")
            .text(`${minute}'`);
        }

        // Retrograde symbols
        if (planet.retrograde) {
          let retrogradeOffset = selectedDegrees ? 106 : 42;
          if (innerPlanet) {
            retrogradeOffset = 36;
          }
          const retrogradeX =
            width / 2 +
            (planetCircleRadius - retrogradeOffset) * Math.cos(adjustedAngle);
          const retrogradeY =
            height / 2 +
            (planetCircleRadius - retrogradeOffset) * Math.sin(adjustedAngle);

          let svgHref;
          if (planet.retrograde === true) {
            svgHref = miscImageCache["retrograde"];
          } else if (planet.retrograde === "sd") {
            svgHref = miscImageCache["sd"];
          } else if (planet.retrograde === "sr") {
            svgHref = miscImageCache["sr"];
          }

          svg
            .append("image")
            .attr("xlink:href", svgHref)
            .attr("x", retrogradeX - 10)
            .attr("y", retrogradeY - 10)
            .attr("width", 22)
            .attr("height", 22)
            .attr("class", "natal")
            .style("opacity", 0.8);
        }
      });

      // Degree ticks
      // Function to add degree ticks for different wheels
      function addDegreeTicks(
        wheelRadius,
        tickLength,
        thickness,
        extraClass = "",
      ) {
        const majorTickLength = tickLength * 2; // Longer tick every 5 degrees

        for (let i = 0; i < 360; i++) {
          const angle = ((ascendantPosition - i - 180) * Math.PI) / 180;
          const length = i % 5 === 0 ? majorTickLength : tickLength;

          const x1 = width / 2 + (wheelRadius - length) * Math.cos(angle);
          const y1 = height / 2 + (wheelRadius - length) * Math.sin(angle);
          const x2 = width / 2 + wheelRadius * Math.cos(angle);
          const y2 = height / 2 + wheelRadius * Math.sin(angle);

          svg
            .append("line")
            .attr("x1", x1)
            .attr("y1", y1)
            .attr("x2", x2)
            .attr("y2", y2)
            .attr("class", `natal${extraClass ? ` ${extraClass}` : ""}`)
            .style("stroke", "black")
            .style("stroke-width", thickness)
            .style("stroke-opacity", 0.6);
        }
      }

      // Outer wheel degree ticks
      addDegreeTicks(
        signInnerRadius,
        10,
        2,
        form === "triwheel" ? "outer-wheel" : "",
      );

      // Middle wheel degree ticks
      if (middleWheel) {
        addDegreeTicks(signInnerRadius * middleWheel, 6, 1.8);
      }

      // Inner wheel degree ticks
      if (innerWheel) {
        addDegreeTicks(signInnerRadius * innerWheel, 4, 1.4);
      }

      // PLANET TICKS
      planets.forEach((planet) => {
        // Original angle for ticks
        const angle =
          ((ascendantPosition - planet.position - 180) * Math.PI) / 180;

        const tickLength = 16;

        // Inner sign circle tick
        let xInnerSign1 =
          width / 2 + (signInnerRadius - tickLength / 2) * Math.cos(angle);
        let yInnerSign1 =
          height / 2 + (signInnerRadius - tickLength / 2) * Math.sin(angle);
        let xInnerSign2 =
          width / 2 + (signInnerRadius + tickLength / 2) * Math.cos(angle);
        let yInnerSign2 =
          height / 2 + (signInnerRadius + tickLength / 2) * Math.sin(angle);

        if (innerWheel) {
          xInnerSign1 =
            width / 2 +
            (signInnerRadius * innerWheel - tickLength / 2) * Math.cos(angle);
          yInnerSign1 =
            height / 2 +
            (signInnerRadius * innerWheel - tickLength / 2) * Math.sin(angle);
          xInnerSign2 =
            width / 2 +
            (signInnerRadius * innerWheel + tickLength / 2) * Math.cos(angle);
          yInnerSign2 =
            height / 2 +
            (signInnerRadius * innerWheel + tickLength / 2) * Math.sin(angle);
        }

        // Inner sign circle tick
        // Get tick color - use black for custom points
        const tickColor = planet.isCustomPoint
          ? "#2c3d4f"
          : planetColors[planet.name.toLowerCase()];

        svg
          .append("line")
          .attr("x1", xInnerSign1)
          .attr("y1", yInnerSign1)
          .attr("x2", xInnerSign2)
          .attr("y2", yInnerSign2)
          .attr("class", "natal")
          .style("stroke", tickColor)
          .style("stroke-width", 4);

        if (!removeHouseTicks) {
          // Function to add house ticks
          const appendHouseTick = (radius) => {
            const x1 = width / 2 + (radius - tickLength / 2) * Math.cos(angle);
            const y1 = height / 2 + (radius - tickLength / 2) * Math.sin(angle);
            const x2 = width / 2 + (radius + tickLength / 2) * Math.cos(angle);
            const y2 = height / 2 + (radius + tickLength / 2) * Math.sin(angle);

            svg
              .append("line")
              .attr("x1", x1)
              .attr("y1", y1)
              .attr("x2", x2)
              .attr("y2", y2)
              .attr("class", "natal")
              .style("stroke", tickColor)
              .style("stroke-width", 4);
          };

          appendHouseTick(houseOuterRadius);
          appendHouseTick(houseInnerRadius);
        }
      });

      // ASPECTS
      // Create a map of planet names to their angles on the inner house radius
      if (form !== "synastry") {
        const planetAngles = {};
        planets.forEach((planet) => {
          const angle =
            ((ascendantPosition - planet.position - 180) * Math.PI) / 180;
          planetAngles[planet.name.toLowerCase()] = angle;
        });

        // Collect unique aspects to avoid duplicates
        const uniqueAspects = new Set();
        const aspectConnections = [];
        const planetsWithRenderedAspects = new Set();

        // Make sure every enabled planet is visible even if it ends up with zero drawable lines
        selectedPlanetsAspects.forEach((p) =>
          planetsWithRenderedAspects.add(p.toLowerCase()),
        );

        // For heliocentric charts, Sun is replaced with Earth in the backend
        // Add "earth" to the set so it appears in the aspectarian
        if (
          natalData.coordinateSystem === "Heliocentric" &&
          planetsWithRenderedAspects.has("sun")
        ) {
          planetsWithRenderedAspects.add("earth");
        }

        planets.forEach((planet) => {
          if (
            !isChartAspectObjectSelected(planet, selectedPlanetsAspects)
          ) {
            return;
          }

          const planetName = planet.name.toLowerCase();
          const aspects = planet.aspects || [];

          aspects.forEach((aspect) => {
            const targetPlanet = aspect.planet.toLowerCase();
            const targetObject = data.find(
              (item) => item.name?.toLowerCase() === targetPlanet,
            );
            if (
              !isChartAspectObjectSelected(
                targetObject || aspect.planet,
                selectedPlanetsAspects,
              )
            ) {
              return;
            }

            const aspectType = aspect.type;

            // Skip Conjunctions
            if (aspectType === "Conjunction") {
              return;
            }

            // Create a unique key for the aspect to prevent duplicates (sorted)
            const key =
              planetName < targetPlanet
                ? `${planetName}-${targetPlanet}-${aspectType}`
                : `${targetPlanet}-${planetName}-${aspectType}`;

            if (!uniqueAspects.has(key)) {
              uniqueAspects.add(key);
              aspectConnections.push({
                from: planetName,
                to: targetPlanet,
                type: aspectType,
                // Propagate custom-aspect metadata so the wheel render loop
                // can draw a text badge (e.g. "135°") in place of the
                // missing SVG glyph. Absent for built-in aspects, which is
                // exactly what the `if (aspect.isCustom)` branch expects.
                isCustom: aspect.isCustom,
                customAngle: aspect.customAngle,
              });
            }
          });
        });

        // Store planets that were actually involved in drawn aspects for aspectaria
        aspectConnections.forEach((aspect) => {
          planetsWithRenderedAspects.add(aspect.from);
          planetsWithRenderedAspects.add(aspect.to);
        });
        window.planetsWithRenderedAspects = planetsWithRenderedAspects;

        // Define color mapping based on aspect type. Semisextile and
        // Quincunx use the same dark olive green as their SVG glyphs
        // (#556b2f in the glyph files) so the line color matches the
        // glyph color — mirroring the pattern the other 4 aspects
        // already follow (red glyph + red line, blue glyph + blue line).
        // The aspectarian graph in graph.js has always used this color
        // for these two aspects; the wheel drawers were the outlier.
        const aspectColors = {
          Opposition: "red",
          Square: "red",
          Trine: "blue",
          Sextile: "blue",
          Semisextile: "#556b2f",
          Quincunx: "#556b2f",
        };

        // Draw lines between planets based on aspects and append aspect symbols
        aspectConnections.forEach((aspect) => {
          const fromAngle = planetAngles[aspect.from];
          const toAngle = planetAngles[aspect.to];

          if (fromAngle === undefined || toAngle === undefined) {
            // Skip if any planet is not found
            return;
          }

          // Calculate coordinates on the inner house radius
          const x1 = width / 2 + houseInnerRadius * Math.cos(fromAngle);
          const y1 = height / 2 + houseInnerRadius * Math.sin(fromAngle);
          const x2 = width / 2 + houseInnerRadius * Math.cos(toAngle);
          const y2 = height / 2 + houseInnerRadius * Math.sin(toAngle);

          // Determine the color based on aspect type. Custom aspects use
          // the same dark-slate as custom points so all user-defined
          // additions read as one visual family. Softer than pure black,
          // which was too visually loud at high opacity.
          const color = aspect.isCustom
            ? "#2c3d4f"
            : (aspectColors[aspect.type] || "gray");

          // Append the line. Custom aspects use a slightly higher
          // stroke-opacity than built-ins because #2c3d4f at 0.3 alpha
          // reads as washed-out gray; 0.55 makes it visibly dark-slate
          // to match its degree-text badge — the same way red squares'
          // line color visually matches the red square glyph.
          svg
            .append("line")
            .attr("x1", x1)
            .attr("y1", y1)
            .attr("x2", x2)
            .attr("y2", y2)
            .attr("class", "natal aspect-line")
            .style("stroke", color)
            .style("stroke-width", 2)
            .style("stroke-opacity", aspect.isCustom ? 0.55 : 0.3);

          // Calculate midpoint coordinates
          const midX = (x1 + x2) / 2;
          const midY = (y1 + y2) / 2;

          if (aspect.isCustom) {
            // Custom aspects have no SVG glyph. Render the angle as a text
            // badge (e.g. "72°") in the same visual style as custom points'
            // "01"/"02" labels — scales for all devices via the parent
            // viewBox, so no per-device sizing needed.
            const angleText = `${aspect.customAngle}°`;
            svg
              .append("text")
              .attr("x", midX)
              .attr("y", midY)
              .attr("text-anchor", "middle")
              .attr("dominant-baseline", "central")
              .attr("font-family", "Arial, sans-serif")
              .attr(
                "font-size",
                `${Math.round(aspectSymbolSize * 0.72)}px`,
              )
              .attr("font-weight", "bold")
              .attr("fill", "#2c3d4f")
              .attr("class", "natal aspect-symbol custom-aspect-symbol")
              .style("pointer-events", "none")
              .style("opacity", 0.9)
              .text(angleText);
          } else {
            const aspectKey = aspect.type
              .toLowerCase()
              .replace(/[\s-]+/g, "");
            const aspectSymbol = miscImageCache[aspectKey];

            // Append the aspect symbol image at the midpoint of the line
            svg
              .append("image")
              .attr("xlink:href", aspectSymbol) // Path to aspect symbol
              .attr("x", midX - aspectSymbolSize / 2)
              .attr("y", midY - aspectSymbolSize / 2)
              .attr("width", aspectSymbolSize)
              .attr("height", aspectSymbolSize)
              .attr("class", "natal aspect-symbol")
              .style("pointer-events", "none")
              .style("opacity", 0.9);
          }
        });

        svg
          .append("circle")
          .attr("cx", width / 2)
          .attr("cy", height / 2)
          .attr("r", houseInnerRadius - 20) // Adjust if needed
          .attr("fill", "transparent")
          .style("cursor", "pointer") // aspectarian
          .on("click", function (event) {
            event.stopPropagation();
            if (form === "return") {
              showAspectarian(window.returnPlanets);
            } else if (form === "natal" || form === "compositeBlank") {
              showAspectarian(window.natalPlanets);
            } else if (form === "composite") {
              showAspectarian(window.compositePlanets);
            } else if (form === "triwheel") {
              // Check which wheel mode is selected
              const triwheelChart = document.getElementById("triwheel-chart");
              const isProgressionsBiwheel = triwheelChart?.classList.contains(
                "biwheel-progressions",
              );
              const isTransitsBiwheel =
                triwheelChart?.classList.contains("biwheel-transits");

              if (
                isProgressionsBiwheel &&
                window.natalPlanets &&
                window.progressedPlanets
              ) {
                // Progressions biwheel: show progressions to natal aspects
                const natalName =
                  JSON.parse(localStorage.getItem("natalData") || "{}").name ||
                  "Natal";
                showAspectarianSynastry(
                  window.natalPlanets,
                  window.progressedPlanets,
                  {
                    chartAName: natalName,
                    chartBName: "Progressions",
                  },
                );
              } else if (
                isTransitsBiwheel &&
                window.natalPlanets &&
                window.transitPlanets
              ) {
                // Transits biwheel: show transits to natal aspects
                const natalName =
                  JSON.parse(localStorage.getItem("natalData") || "{}").name ||
                  "Natal";
                showAspectarianSynastry(
                  window.natalPlanets,
                  window.transitPlanets,
                  {
                    chartAName: natalName,
                    chartBName: "Transits",
                  },
                );
              } else if (window.transitPlanets && window.progressedPlanets) {
                // Default triwheel: show transits to progressions aspects
                showAspectarianSynastry(
                  window.progressedPlanets,
                  window.transitPlanets,
                  {
                    chartAName: "Progressions",
                    chartBName: "Transits",
                  },
                );
              } else {
                // Fallback to natal aspectarian if data not available
                showAspectarian(window.natalPlanets);
              }
            }
          });
        return;
      }
    }

    // Pull out renderChart for universal use
    window.renderChart = renderChart;

    // Send the data using Fetch
    requestSwissChart(formDataObj, document.getElementById(formIdToUse))
      .then((data) => {
        // console.log(`Natal from ${form}: `, data);

        // Composite chart immediate display
        if (form === "composite") {
          // Don't set display inline - remove display property to let CSS take over
          document
            .getElementById("composite-chart")
            .style.removeProperty("display");
          document.getElementById("composite-chart-blank").style.display =
            "none";
        } else {
          // For non-composite charts, only hide composite if it's a natal form submission
          // This preserves composite chart when synastry is calculated
          if (form === "natal") {
            document.getElementById("composite-chart").style.display = "none";
          }
          // Normal chart rendering for all non-composite charts
          renderChart(data);
        }

        if (form === "return") {
          const isRelocatedInput = document.getElementById("isRelocated");
          const returnLocation =
            document.getElementById("returnLocation")?.value;
          const preservedNatalLocation =
            document.getElementById("natalLocation")?.value;
          if (isRelocatedInput) {
            // only clear “relocated” when they’ve actually switched back to natal loc
            isRelocatedInput.value =
              returnLocation === preservedNatalLocation ? "false" : "true";
          }
        }
      })
      .catch((error) => {
        // Dispatch event so graph doesn't hang if it triggered this natal calculation
        if (form === "natal") {
          document.dispatchEvent(new CustomEvent("natalChartComplete"));
          // Clear stale-guard flags so a failed natal doesn't leave
          // them stuck for an unrelated future submit.
          window._staleGuardResubmitFormId = null;
          window._staleGuardOverlayHold = null;
        }

        // Dispatch event so MAP click-to-relocate doesn't hang on its 8-second
        // timeout when the server returns an error fast. The error message is
        // attached as event detail so the MAP client can decide whether to
        // surface it (network/server errors) or silently dismiss
        // (expected "house cusps can't be calculated at this latitude" case).
        // Return early so the existing errorContainer logic below doesn't
        // also write the error into the wrong section's form (#returnForm)
        // — MAP's own showError shows it in #showMap .errorMessageMap.
        if (form === "mapRelocation") {
          document.dispatchEvent(
            new CustomEvent("mapRelocationComplete", {
              detail: { error: error.message },
            }),
          );
          return;
        }

        let errorContainer;

        // Check if settings page is visible
        const settingsVisible =
          document.getElementById("showSettings").style.display !== "none";

        if (settingsVisible) {
          errorContainer = document.querySelector(
            "#showSettings .errorMessage",
          );
        } else if (formIdToUse === "natalForm") {
          errorContainer = document.querySelector("#natalForm .errorMessage");
        } else {
          errorContainer = document.querySelector("#returnForm .errorMessage");
        }

        showTemporaryError(
          errorContainer,
          error.message || "Unexpected error. Please check your connection.",
        );
      })
      .finally(() => {
        setTimeout(() => {
          // Don't hide overlay if graph is waiting for its own fetch,
          // or if the stale-guard is holding it for the outer wheel.
          if (
            !window._graphNeedsOverlay &&
            !window._staleGuardOverlayHold
          ) {
            document.getElementById("loading-overlay").style.display = "none";
          }
        }, 300);
      });
  });

  // TRIWHEEL
  // Check which triwheel to generate
  let formId = "triwheelForm";
  if (form === "triwheelGraph") {
    formId = "triwheelFormGraph";
  } else if (form === "synastry") {
    formId = "synastryForm";
  }

  document.getElementById(formId).addEventListener("submit", function (e) {
    e.preventDefault();

    // Stale-natal guard: force a natal recalc if any tracked setting
    // differs from the cached natalData. Natal auto-chains back to
    // triwheelForm at ~line 1556, so this handler re-enters with
    // matching settings on the second pass — no loop.
    // Same pattern as graph.js:375-385. Gated on centerPlanet/outerPlanet
    // so no-op instances (natal/return/composite/mapRelocation) skip.
    if (centerPlanet || outerPlanet) {
      const stored = JSON.parse(localStorage.getItem("natalData") || "null");
      if (stored) {
        const zEl = document.querySelector(
          '#system-settings select[name="zodiacSystem"]',
        );
        const ayEl = document.querySelector(
          '#system-settings select[name="ayanamsaSystem"]',
        );
        const customAyEl = document.querySelector(
          '#system-settings input[name="customAyanamsa"]',
        );
        const hEl = document.querySelector(
          '#system-settings select[name="houseSystem"]',
        );
        const cEl = document.querySelector(
          '#system-settings select[name="coordinateSystem"]',
        );
        const aoEl = document.getElementById("ascendantOverride");
        const tnEl = document.querySelector(
          '.degree-settings input[name="trueNodes"]',
        );
        const tlEl = document.querySelector(
          '.degree-settings input[name="trueLilith"]',
        );
        const drEl = document.querySelector(
          '.degree-settings input[name="draconic"]',
        );
        const fsEl = document.querySelector('input[name="fixedStars"]');
        const fsmEl = document.querySelector(
          'select[name="fixedStarsMagnitude"]',
        );
        const fslEl = document.querySelector(
          'select[name="fixedStarsLatitude"]',
        );

        // Snapshot collections in the same shape the natal render
        // stores them (~line 1387) so JSON.stringify equality is stable.
        const currentPlanets = Array.from(
          document.querySelectorAll(
            '#planet-settings input[name="planet"]:checked',
          ),
        ).map((cb) => cb.value);
        const currentPlanetsAspects = Array.from(
          document.querySelectorAll(
            '#planet-settings input[name="planetAspects"]:checked',
          ),
        ).map((cb) => cb.value);
        const currentAspects = Array.from(
          document.querySelectorAll(
            '#aspect-settings input[name="aspects"]:checked',
          ),
        ).map((cb) => cb.value);
        const currentOrbs = {};
        document
          .querySelectorAll("#aspect-settings select.aspect-orb")
          .forEach((sel) => {
            currentOrbs[sel.dataset.aspect] = +sel.value;
          });
        const currentCustomPoints =
          typeof activeCustomPoints !== "undefined"
            ? activeCustomPoints
                .filter((p) => p.display)
                .map((p) => ({
                  num: p.num,
                  name: p.name,
                  display: p.display,
                  aspect: p.aspect,
                }))
            : [];
        // Snapshot of currently-enabled custom aspects for the stale guard.
        // stored.customAspects is undefined for legacy natalData written
        // before this feature — the ?? [] on the compare side means those
        // users see no false-positive stale hits (empty === empty).
        const currentCustomAspects =
          typeof activeCustomAspects !== "undefined"
            ? activeCustomAspects
                .filter((a) => a.enabled)
                .map((a) => ({ angle: a.angle, orb: a.orb }))
            : [];

        const stale =
          (zEl && stored.zodiacSystem !== zEl.value) ||
          (ayEl && (stored.ayanamsaSystem || "Tropical") !== ayEl.value) ||
          (ayEl &&
            ayEl.value === "Custom" &&
            customAyEl &&
            Number(stored.customAyanamsa) !== Number(customAyEl.value)) ||
          (hEl && stored.houseSystem !== hEl.value) ||
          (cEl && stored.coordinateSystem !== cEl.value) ||
          (aoEl && stored.ascendantOverride !== aoEl.value) ||
          (tnEl && stored.trueNodes !== tnEl.checked) ||
          (tlEl && stored.trueLilith !== tlEl.checked) ||
          (drEl && stored.draconic !== drEl.checked) ||
          (fsEl && stored.fixedStars !== fsEl.checked) ||
          (fsmEl &&
            stored.fixedStarsMagnitude !== parseFloat(fsmEl.value)) ||
          (fslEl &&
            stored.fixedStarsLatitude !== parseFloat(fslEl.value)) ||
          JSON.stringify(stored.selectedPlanets ?? []) !==
            JSON.stringify(currentPlanets) ||
          JSON.stringify(stored.selectedPlanetsAspects ?? []) !==
            JSON.stringify(currentPlanetsAspects) ||
          JSON.stringify(stored.selectedAspects ?? []) !==
            JSON.stringify(currentAspects) ||
          JSON.stringify(stored.aspectOrbs ?? {}) !==
            JSON.stringify(currentOrbs) ||
          JSON.stringify(stored.customPoints ?? []) !==
            JSON.stringify(currentCustomPoints) ||
          JSON.stringify(stored.customAspects ?? []) !==
            JSON.stringify(currentCustomAspects);
        if (stale) {
          const natalForm = document.getElementById("natalForm");
          if (natalForm) {
            // ResubmitFormId: renderChart's block at ~line 1573 re-fires
            //   the source form when natal's own chain doesn't cover it
            //   (synastryForm when synastryData is empty; triwheelFormGraph).
            // OverlayHold: natal .finally defers hide, transit .finally
            //   clears on formId match — keeps spinner through cascade.
            // 10s safety timeout for the rare case where natal throws
            //   synchronously and .catch/.finally never run.
            const sourceFormId = this.id;
            window._staleGuardResubmitFormId = sourceFormId;
            window._staleGuardOverlayHold = sourceFormId;
            setTimeout(() => {
              if (window._staleGuardOverlayHold === sourceFormId) {
                window._staleGuardOverlayHold = null;
                window._staleGuardResubmitFormId = null;
                const el = document.getElementById("loading-overlay");
                if (el) el.style.display = "none";
              }
            }, 10000);
            natalForm.requestSubmit();
            return;
          }
        }
      }
    }

    document.getElementById("loading-overlay").style.display = "block";

    // Track completion of both fetch calls for graph auto-submit
    const isGraphAutoSubmit =
      form === "triwheelGraph" && this.dataset.autoSubmit === "true";
    let progressionsComplete = false;
    let transitsComplete = false;

    const checkTriwheelGraphComplete = () => {
      if (isGraphAutoSubmit && progressionsComplete && transitsComplete) {
        document.dispatchEvent(new CustomEvent("triwheelGraphComplete"));
        // Reset the flag
        this.dataset.autoSubmit = "false";
      }
    };

    const formData = new FormData(this);
    const formDataObj = Object.fromEntries(formData);
    const natalData = JSON.parse(localStorage.getItem("natalData"));

    // Combine natal data with triwheel data
    const combinedData = { ...formDataObj, natalData };

    // Add name if missing (triwheel form doesn't have name field)
    if (!combinedData.name && natalData && natalData.name) {
      combinedData.name = natalData.name;
    }

    // Retrieve selections from settings page
    const selectedPlanets = Array.from(
      document.querySelectorAll(
        '#planet-settings input[name="planet"]:checked',
      ),
    ).map((checkbox) => checkbox.value);

    const selectedZodiacSystem = document.querySelector(
      '#system-settings select[name="zodiacSystem"]',
    ).value;

    const selectedHouseSystem = document.querySelector(
      '#system-settings select[name="houseSystem"]',
    ).value;

    const selectedCoordinateSystem = document.querySelector(
      '#system-settings select[name="coordinateSystem"]',
    ).value;

    // Include selected planets in the request for both transits (formDataObj) and progressions (combinedData)
    formDataObj.selectedPlanets = selectedPlanets;
    combinedData.selectedPlanets = selectedPlanets;

    formDataObj.selectedZodiacSystem = selectedZodiacSystem;
    combinedData.selectedZodiacSystem = selectedZodiacSystem;

    formDataObj.selectedHouseSystem = selectedHouseSystem;
    combinedData.selectedHouseSystem = selectedHouseSystem;

    formDataObj.selectedCoordinateSystem = selectedCoordinateSystem;
    combinedData.selectedCoordinateSystem = selectedCoordinateSystem;

    const ascendantOverride =
      document.getElementById("ascendantOverride").value;
    formDataObj.ascendantOverride = ascendantOverride;
    combinedData.ascendantOverride = ascendantOverride;

    const trueNodes = document.querySelector(
      '.degree-settings input[name="trueNodes"]',
    ).checked;
    const trueLilith = document.querySelector(
      '.degree-settings input[name="trueLilith"]',
    ).checked;
    const draconic = document.querySelector(
      '.degree-settings input[name="draconic"]',
    ).checked;
    const fixedStars = document.querySelector(
      'input[name="fixedStars"]',
    ).checked;
    const fixedStarsMagnitude = parseFloat(
      document.querySelector('select[name="fixedStarsMagnitude"]').value,
    );
    const fixedStarsLatitude = parseFloat(
      document.querySelector('select[name="fixedStarsLatitude"]').value,
    );
    formDataObj.trueNodes = trueNodes;
    formDataObj.trueLilith = trueLilith;
    formDataObj.draconic = draconic;
    formDataObj.fixedStars = fixedStars;
    formDataObj.fixedStarsMagnitude = fixedStarsMagnitude;
    formDataObj.fixedStarsLatitude = fixedStarsLatitude;
    combinedData.trueNodes = trueNodes;
    combinedData.trueLilith = trueLilith;
    combinedData.draconic = draconic;
    combinedData.fixedStars = fixedStars;
    combinedData.fixedStarsMagnitude = fixedStarsMagnitude;
    combinedData.fixedStarsLatitude = fixedStarsLatitude;

    // Include custom points if defined (from saveLoadSettings.js)
    if (
      typeof activeCustomPoints !== "undefined" &&
      activeCustomPoints.length > 0
    ) {
      const customPointsForRequest = activeCustomPoints
        .filter((p) => p.display)
        .map((p) => ({
          num: p.num,
          name: p.name,
          display: p.display,
          aspect: p.aspect,
        }));
      formDataObj.customPoints = customPointsForRequest;
      combinedData.customPoints = customPointsForRequest;
    }

    // Include custom aspects (enabled only) for triwheel/synastry/composite
    // paths that share this request builder.
    if (
      typeof activeCustomAspects !== "undefined" &&
      activeCustomAspects.some((a) => a.enabled)
    ) {
      const customAspectsForRequest = activeCustomAspects
        .filter((a) => a.enabled)
        .map((a) => ({ angle: a.angle, orb: a.orb }));
      formDataObj.customAspects = customAspectsForRequest;
      combinedData.customAspects = customAspectsForRequest;
    }

    // Center wheel (progressions)
    if (centerPlanet && form !== "synastry") {
      requestSwissChart(combinedData, this)
        .then((data) => {
          document.querySelector(".errorMessageTriwheel").textContent = "";
          // console.log(`Progressions: `, data);

          // Remove triwheel images
          svg.selectAll(".progressions").remove();

          const planetCircleCenterRadius = minDimension / centerPlanet;

          const centerPlanets = filterSelectedChartObjects(
            data.filter(
              (item) =>
                (item.name &&
                  [
                    "Sun",
                    "Earth",
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
                    "North Node",
                    "South Node",
                    "Ascendant Symbol",
                    "Midheaven",
                    "Descendant",
                    "Imum Coeli",
                    "Ceres",
                    "Vesta",
                    "Pallas",
                    "Juno",
                    "Lilith",
                    "Priapus",
                    "Part of Fortune",
                    "Part of Spirit",
                    "Vertex",
                    "Anti-Vertex",
                    "Galactic Center",
                  ].includes(item.name)) ||
                item.isCustomPoint,
            ),
            selectedPlanets,
          );

          // Store progressed planets for triwheel report
          if (form === "triwheel") {
            window.progressedPlanets = centerPlanets;
          }

          // CENTER PLANET SYMBOLS
          const spacedSymbols = symbolSpacing(
            centerPlanets,
            ascendantPosition,
            0.1,
          );
          spacedSymbols.forEach((planet) => {
            // Adjusted angle for symbols
            const adjustedAngle = planet.adjustedAngle;

            const x =
              width / 2 + planetCircleCenterRadius * Math.cos(adjustedAngle);
            const y =
              height / 2 + planetCircleCenterRadius * Math.sin(adjustedAngle);

            let planetSize = planetSizes;

            // Make smaller than inner planet size by a factor of 2
            planetSize *= innerPlanet ** 2;

            const planetKey = planet.name.toLowerCase().replace(/[\s-]+/g, "");
            const planetHref =
              planetImageCache[planetKey] || `/images/planets/${planetKey}.svg`;

            // Check if this is a custom point (renders text instead of image)
            if (planet.isCustomPoint && planet.displayLabel) {
              // Render text label for custom points (01, 02, etc.)
              // Use planetSize * 0.6 to get proportional font size matching planet SVGs
              const customFontSize = Math.round(planetSize * 0.6);
              svg
                .append("text")
                .attr("x", x)
                .attr("y", y)
                .attr("text-anchor", "middle")
                .attr("dominant-baseline", "central")
                .attr("font-family", "Arial, sans-serif")
                .attr("font-size", `${customFontSize}px`)
                .attr("font-weight", "bold")
                .attr("fill", "#2c3d4f")
                .attr("class", "progressions custom-point-symbol")
                .style("filter", "drop-shadow(1px 1px 0px #999)")
                .style("cursor", "pointer")
                .text(planet.displayLabel)
                .on("click", function (event) {
                  event.stopPropagation();
                  const { hour, minute } = calculatePlanetDegrees(
                    planet.position,
                    selectedZodiacSystem,
                  );
                  planet.hour = hour;
                  planet.minute = minute;
                  showPlanetDetails(planet, "progressed");
                });
            } else {
              svg
                .append("image")
                .attr("xlink:href", planetHref) // data planet name to svg name
                .attr("x", x - planetSize / 2)
                .attr("y", y - planetSize / 2)
                .attr("width", planetSize)
                .attr("height", planetSize)
                .attr("class", "progressions")
                .style("filter", `drop-shadow(1px 1px 0px #555)`)
                .style("cursor", "pointer")
                .on("mouseover", function () {
                  d3.select(this).style("cursor", "pointer");
                })
                .on("click", function (event) {
                  event.stopPropagation();
                  const { hour, minute } = calculatePlanetDegrees(
                    planet.position,
                    selectedZodiacSystem,
                  );
                  planet.hour = hour;
                  planet.minute = minute;
                  if (planet.retrograde) {
                    planet.retroIcon =
                      planet.retrograde === "sd"
                        ? "/images/misc/sd.svg"
                        : planet.retrograde === "sr"
                          ? "/images/misc/sr.svg"
                          : "/images/misc/retrograde.svg";
                  }
                  showPlanetDetails(planet, "progressed");
                });
            }

            // Retrograde symbol
            if (planet.retrograde) {
              let retrogradeOffset = 28;
              const retrogradeX =
                width / 2 +
                (planetCircleCenterRadius - retrogradeOffset) *
                  Math.cos(adjustedAngle);
              const retrogradeY =
                height / 2 +
                (planetCircleCenterRadius - retrogradeOffset) *
                  Math.sin(adjustedAngle);
              let retrogradeSvg;
              if (planet.retrograde === true) {
                retrogradeSvg = miscImageCache["retrograde"];
              } else if (planet.retrograde === "sd") {
                retrogradeSvg = miscImageCache["sd"];
              } else if (planet.retrograde === "sr") {
                retrogradeSvg = miscImageCache["sr"];
              }

              svg
                .append("image")
                .attr("xlink:href", retrogradeSvg)
                .attr("x", retrogradeX - 10)
                .attr("y", retrogradeY - 10)
                .attr("width", 18)
                .attr("height", 18)
                .attr("class", "progressions")
                .style("opacity", 0.8);
            }
          });

          // PLANET TICKS
          centerPlanets.forEach((planet) => {
            // Original angle for ticks
            const angle =
              ((ascendantPosition - planet.position - 180) * Math.PI) / 180;

            const tickLength = 16;

            // Inner sign circle tick
            let xInnerSign1 =
              width / 2 +
              (signInnerRadius * middleWheel - tickLength / 2) *
                Math.cos(angle);
            let yInnerSign1 =
              height / 2 +
              (signInnerRadius * middleWheel - tickLength / 2) *
                Math.sin(angle);
            let xInnerSign2 =
              width / 2 +
              (signInnerRadius * middleWheel + tickLength / 2) *
                Math.cos(angle);
            let yInnerSign2 =
              height / 2 +
              (signInnerRadius * middleWheel + tickLength / 2) *
                Math.sin(angle);

            // Get tick color - use black for custom points
            const tickColor = planet.isCustomPoint
              ? "#2c3d4f"
              : planetColors[planet.name.toLowerCase()];

            svg
              .append("line")
              .attr("x1", xInnerSign1)
              .attr("y1", yInnerSign1)
              .attr("x2", xInnerSign2)
              .attr("y2", yInnerSign2)
              .attr("class", "progressions")
              .style("stroke", tickColor)
              .style("stroke-width", 4);
          });
        })
        .catch((error) => {
          const errorContainer =
            form === "synastry"
              ? document.querySelector("#synastryForm .errorMessageSynastry")
              : document.querySelector(".errorMessageTriwheel");

          showTemporaryError(
            errorContainer,
            error.message || "Unexpected error. Please check your connection.",
          );
        })
        .finally(() => {
          progressionsComplete = true;
          checkTriwheelGraphComplete();
        });
    } else if (isGraphAutoSubmit) {
      // No progressions fetch needed, mark as complete
      progressionsComplete = true;
    }

    // Outer wheel (transits)
    if (outerPlanet) {
      // Add name if missing (triwheel form doesn't have name field)
      if (!formDataObj.name && natalData && natalData.name) {
        formDataObj.name = natalData.name;
      }

      // Include natal data for house calculations but flag as transits (not progressions)
      // Only for triwheel and triwheelGraph, NOT synastry
      const transitData =
        form === "triwheel" || form === "triwheelGraph"
          ? { ...formDataObj, natalData, isTransit: true }
          : formDataObj;

      requestSwissChart(transitData, this)
        .then((data) => {
          // Keep rendered synastry chart metadata
          if (form === "synastry" && Array.isArray(data) && data.length) {
            const meta = data[0];

            const monthNames = [
              "January",
              "February",
              "March",
              "April",
              "May",
              "June",
              "July",
              "August",
              "September",
              "October",
              "November",
              "December",
            ];
            const monthText = !isNaN(meta.month)
              ? monthNames[meta.month - 1]
              : meta.month;

            localStorage.setItem(
              "synastryData",
              JSON.stringify({
                name: meta.name,
                year: meta.year,
                month: monthText,
                day: meta.day,
                hour: meta.hour,
                minute: meta.minute,
                lat: meta.lat,
                long: meta.long,
                utcOffset: meta.utcOffset,
                location: meta.location,
              }),
            );
          }

          document.querySelector(".errorMessageTriwheel").textContent = "";
          // console.log(`Transits: `, data);

          // Remove triwheel images
          svg.selectAll(".transits").remove();
          svg.selectAll(".transits-middle").remove();

          const planetCircleOuterRadius = minDimension / outerPlanet;

          const outerPlanets = filterSelectedChartObjects(
            data.filter(
              (item) =>
                (item.name &&
                  [
                    "Sun",
                    "Earth",
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
                    "North Node",
                    "South Node",
                    "Ascendant Symbol",
                    "Midheaven",
                    "Descendant",
                    "Imum Coeli",
                    "Ceres",
                    "Vesta",
                    "Pallas",
                    "Juno",
                    "Lilith",
                    "Priapus",
                    "Part of Fortune",
                    "Part of Spirit",
                    "Vertex",
                    "Anti-Vertex",
                    "Galactic Center",
                  ].includes(item.name)) ||
                item.isCustomPoint,
            ),
            selectedPlanets,
          );

          // Set synastry planets for synastry aspectarian & composite chart
          if (form === "synastry") {
            window.synastryPlanets = outerPlanets;
            window.synastryData = data;

            compositeNatal = window.natalData; // first person
            compositeSynastry = window.synastryData; // second person

            // Composite chart rendering
            const composite = buildComposite(compositeNatal, compositeSynastry);
            window.compositePlanets = composite;
            renderChart(composite);

            // Copy composite birth details to synastry after composite renders
            copyCompositeBirthDetailsToSynastry();
          }

          // Store transit planets for triwheel report
          if (form === "triwheel") {
            window.transitPlanets = outerPlanets;
          }

          // OUTER PLANET SYMBOLS
          const spacedSymbols = symbolSpacing(
            outerPlanets,
            ascendantPosition,
            0.08,
          );
          spacedSymbols.forEach((planet) => {
            // Adjusted angle for symbols
            const adjustedAngle = planet.adjustedAngle;

            const x =
              width / 2 + planetCircleOuterRadius * Math.cos(adjustedAngle);
            const y =
              height / 2 + planetCircleOuterRadius * Math.sin(adjustedAngle);

            let planetSize = planetSizes;

            // Make smaller than inner planet size by a factor of 2
            planetSize *= innerPlanet ** 2;

            const planetKey = planet.name.toLowerCase().replace(/[\s-]+/g, "");
            const planetHref =
              planetImageCache[planetKey] || `/images/planets/${planetKey}.svg`;

            // Check if this is a custom point (renders text instead of image)
            if (planet.isCustomPoint && planet.displayLabel) {
              // Render text label for custom points (01, 02, etc.)
              // Use planetSize * 0.6 to get proportional font size matching planet SVGs
              const customFontSize = Math.round(planetSize * 0.6);
              svg
                .append("text")
                .attr("x", x)
                .attr("y", y)
                .attr("text-anchor", "middle")
                .attr("dominant-baseline", "central")
                .attr("font-family", "Arial, sans-serif")
                .attr("font-size", `${customFontSize}px`)
                .attr("font-weight", "bold")
                .attr("fill", "#2c3d4f")
                .attr("class", "transits custom-point-symbol")
                .style("filter", "drop-shadow(1px 1px 0px #999)")
                .style("cursor", "pointer")
                .text(planet.displayLabel)
                .on("click", function (event) {
                  event.stopPropagation();
                  const { hour, minute } = calculatePlanetDegrees(
                    planet.position,
                    selectedZodiacSystem,
                  );
                  planet.hour = hour;
                  planet.minute = minute;

                  // For synastry charts, calculate Chart 2 planet's house position in Chart 1
                  if (form === "synastry" && chart1HouseCusps) {
                    planet.houseNatal = calculateHousePosition(
                      planet.position,
                      chart1HouseCusps,
                    );
                  }

                  showPlanetDetails(
                    planet,
                    form === "synastry" ? "synastry" : "transit",
                  );
                });
            } else {
              svg
                .append("image")
                .attr("xlink:href", planetHref) // data planet name to svg name
                .attr("x", x - planetSize / 2)
                .attr("y", y - planetSize / 2)
                .attr("width", planetSize)
                .attr("height", planetSize)
                .attr("class", "transits")
                .style("filter", `drop-shadow(1px 1px 0px #555)`)
                .style("cursor", "pointer")
                .on("mouseover", function () {
                  d3.select(this).style("cursor", "pointer");
                })
                .on("click", function (event) {
                  event.stopPropagation();
                  const { hour, minute } = calculatePlanetDegrees(
                    planet.position,
                    selectedZodiacSystem,
                  );
                  planet.hour = hour;
                  planet.minute = minute;
                  if (planet.retrograde) {
                    planet.retroIcon =
                      planet.retrograde === "sd"
                        ? "/images/misc/sd.svg"
                        : planet.retrograde === "sr"
                          ? "/images/misc/sr.svg"
                          : "/images/misc/retrograde.svg";
                  }

                  // For synastry charts, calculate Chart 2 planet's house position in Chart 1
                  if (form === "synastry" && chart1HouseCusps) {
                    planet.houseNatal = calculateHousePosition(
                      planet.position,
                      chart1HouseCusps,
                    );
                  }

                  showPlanetDetails(
                    planet,
                    form === "synastry" ? "synastry" : "transit",
                  );
                });
            }

            // Retrograde symbol
            if (planet.retrograde) {
              let retrogradeOffset = 28;
              const retrogradeX =
                width / 2 +
                (planetCircleOuterRadius - retrogradeOffset) *
                  Math.cos(adjustedAngle);
              const retrogradeY =
                height / 2 +
                (planetCircleOuterRadius - retrogradeOffset) *
                  Math.sin(adjustedAngle);
              let retrogradeSvg;
              if (planet.retrograde === true) {
                retrogradeSvg = miscImageCache["retrograde"];
              } else if (planet.retrograde === "sd") {
                retrogradeSvg = miscImageCache["sd"];
              } else if (planet.retrograde === "sr") {
                retrogradeSvg = miscImageCache["sr"];
              }

              svg
                .append("image")
                .attr("xlink:href", retrogradeSvg)
                .attr("x", retrogradeX - 10)
                .attr("y", retrogradeY - 10)
                .attr("width", 18)
                .attr("height", 18)
                .attr("class", "transits")
                .style("opacity", 0.8);
            }
          });

          // PLANET TICKS
          outerPlanets.forEach((planet) => {
            const angle =
              ((ascendantPosition - planet.position - 180) * Math.PI) / 180;

            const tickLength = 16;

            // Inner sign circle tick
            let xInnerSign1 =
              width / 2 + (signInnerRadius - tickLength / 2) * Math.cos(angle);
            let yInnerSign1 =
              height / 2 + (signInnerRadius - tickLength / 2) * Math.sin(angle);
            let xInnerSign2 =
              width / 2 + (signInnerRadius + tickLength / 2) * Math.cos(angle);
            let yInnerSign2 =
              height / 2 + (signInnerRadius + tickLength / 2) * Math.sin(angle);

            // Get tick color - use black for custom points
            const tickColor = planet.isCustomPoint
              ? "#2c3d4f"
              : planetColors[planet.name.toLowerCase()];

            svg
              .append("line")
              .attr("x1", xInnerSign1)
              .attr("y1", yInnerSign1)
              .attr("x2", xInnerSign2)
              .attr("y2", yInnerSign2)
              .attr("class", "transits")
              .style("stroke", tickColor)
              .style("stroke-width", 4);
          });

          // TRANSITS AT MIDDLE WHEEL POSITION (for biwheel mode)
          // Only render for triwheel form - these will be shown when "Transits" biwheel mode is selected
          if (form === "triwheel") {
            const planetCircleCenterRadius = minDimension / centerPlanet;

            // MIDDLE POSITION TRANSIT PLANET SYMBOLS
            const spacedSymbolsMiddle = symbolSpacing(
              outerPlanets,
              ascendantPosition,
              0.1,
            );
            spacedSymbolsMiddle.forEach((planet) => {
              const adjustedAngle = planet.adjustedAngle;

              const x =
                width / 2 + planetCircleCenterRadius * Math.cos(adjustedAngle);
              const y =
                height / 2 + planetCircleCenterRadius * Math.sin(adjustedAngle);

              let planetSize = planetSizes;
              planetSize *= innerPlanet ** 2;

              const planetKey = planet.name
                .toLowerCase()
                .replace(/[\s-]+/g, "");
              const planetHref =
                planetImageCache[planetKey] ||
                `/images/planets/${planetKey}.svg`;

              if (planet.isCustomPoint && planet.displayLabel) {
                const customFontSize = Math.round(planetSize * 0.6);
                svg
                  .append("text")
                  .attr("x", x)
                  .attr("y", y)
                  .attr("text-anchor", "middle")
                  .attr("dominant-baseline", "central")
                  .attr("font-family", "Arial, sans-serif")
                  .attr("font-size", `${customFontSize}px`)
                  .attr("font-weight", "bold")
                  .attr("fill", "#2c3d4f")
                  .attr("class", "transits-middle custom-point-symbol")
                  .style("filter", "drop-shadow(1px 1px 0px #999)")
                  .style("cursor", "pointer")
                  .text(planet.displayLabel)
                  .on("click", function (event) {
                    event.stopPropagation();
                    const { hour, minute } = calculatePlanetDegrees(
                      planet.position,
                      selectedZodiacSystem,
                    );
                    planet.hour = hour;
                    planet.minute = minute;
                    showPlanetDetails(planet, "transit");
                  });
              } else {
                svg
                  .append("image")
                  .attr("xlink:href", planetHref)
                  .attr("x", x - planetSize / 2)
                  .attr("y", y - planetSize / 2)
                  .attr("width", planetSize)
                  .attr("height", planetSize)
                  .attr("class", "transits-middle")
                  .style("filter", `drop-shadow(1px 1px 0px #555)`)
                  .style("cursor", "pointer")
                  .on("mouseover", function () {
                    d3.select(this).style("cursor", "pointer");
                  })
                  .on("click", function (event) {
                    event.stopPropagation();
                    const { hour, minute } = calculatePlanetDegrees(
                      planet.position,
                      selectedZodiacSystem,
                    );
                    planet.hour = hour;
                    planet.minute = minute;
                    if (planet.retrograde) {
                      planet.retroIcon =
                        planet.retrograde === "sd"
                          ? "/images/misc/sd.svg"
                          : planet.retrograde === "sr"
                            ? "/images/misc/sr.svg"
                            : "/images/misc/retrograde.svg";
                    }
                    showPlanetDetails(planet, "transit");
                  });
              }

              // Retrograde symbol
              if (planet.retrograde) {
                let retrogradeOffset = 28;
                const retrogradeX =
                  width / 2 +
                  (planetCircleCenterRadius - retrogradeOffset) *
                    Math.cos(adjustedAngle);
                const retrogradeY =
                  height / 2 +
                  (planetCircleCenterRadius - retrogradeOffset) *
                    Math.sin(adjustedAngle);
                let retrogradeSvg;
                if (planet.retrograde === true) {
                  retrogradeSvg = miscImageCache["retrograde"];
                } else if (planet.retrograde === "sd") {
                  retrogradeSvg = miscImageCache["sd"];
                } else if (planet.retrograde === "sr") {
                  retrogradeSvg = miscImageCache["sr"];
                }

                svg
                  .append("image")
                  .attr("xlink:href", retrogradeSvg)
                  .attr("x", retrogradeX - 10)
                  .attr("y", retrogradeY - 10)
                  .attr("width", 18)
                  .attr("height", 18)
                  .attr("class", "transits-middle")
                  .style("opacity", 0.8);
              }
            });

            // MIDDLE POSITION TRANSIT PLANET TICKS
            outerPlanets.forEach((planet) => {
              const angle =
                ((ascendantPosition - planet.position - 180) * Math.PI) / 180;

              const tickLength = 16;

              let xInnerSign1 =
                width / 2 +
                (signInnerRadius * middleWheel - tickLength / 2) *
                  Math.cos(angle);
              let yInnerSign1 =
                height / 2 +
                (signInnerRadius * middleWheel - tickLength / 2) *
                  Math.sin(angle);
              let xInnerSign2 =
                width / 2 +
                (signInnerRadius * middleWheel + tickLength / 2) *
                  Math.cos(angle);
              let yInnerSign2 =
                height / 2 +
                (signInnerRadius * middleWheel + tickLength / 2) *
                  Math.sin(angle);

              const tickColor = planet.isCustomPoint
                ? "#2c3d4f"
                : planetColors[planet.name.toLowerCase()];

              svg
                .append("line")
                .attr("x1", xInnerSign1)
                .attr("y1", yInnerSign1)
                .attr("x2", xInnerSign2)
                .attr("y2", yInnerSign2)
                .attr("class", "transits-middle")
                .style("stroke", tickColor)
                .style("stroke-width", 4);
            });
          }

          // TRIWHEEL ASPECTS - Draw three sets of aspect lines for different modes
          if (
            form === "triwheel" &&
            window.natalPlanets &&
            window.progressedPlanets &&
            window.transitPlanets
          ) {
            // Clear any existing triwheel aspect lines
            svg
              .selectAll(
                ".aspect-line.triwheel-default,.aspect-symbol.triwheel-default",
              )
              .remove();
            svg
              .selectAll(
                ".aspect-line.triwheel-progressions,.aspect-symbol.triwheel-progressions",
              )
              .remove();
            svg
              .selectAll(
                ".aspect-line.triwheel-transits,.aspect-symbol.triwheel-transits",
              )
              .remove();

            // Default triwheel mode: Transits to Progressions
            drawTriwheelAspectLines(
              svg,
              window.transitPlanets,
              window.progressedPlanets,
              ascendantPosition,
              houseInnerRadius,
              width,
              height,
              "triwheel-default",
            );

            // Progressions biwheel mode: Progressions to Natal
            drawTriwheelAspectLines(
              svg,
              window.progressedPlanets,
              window.natalPlanets,
              ascendantPosition,
              houseInnerRadius,
              width,
              height,
              "triwheel-progressions",
            );

            // Transits biwheel mode: Transits to Natal
            drawTriwheelAspectLines(
              svg,
              window.transitPlanets,
              window.natalPlanets,
              ascendantPosition,
              houseInnerRadius,
              width,
              height,
              "triwheel-transits",
            );
          }

          // SYNASTRY ASPECTS
          if (
            form === "synastry" &&
            window.natalPlanets &&
            window.synastryPlanets
          ) {
            drawSynastryAspectLines(
              svg,
              window.natalPlanets,
              window.synastryPlanets,
              ascendantPosition,
              houseInnerRadius,
              width,
              height,
            );
          }
        })
        .catch((error) => {
          const errorContainer =
            form === "synastry"
              ? document.querySelector("#synastryForm .errorMessageSynastry")
              : document.querySelector(".errorMessageTriwheel");

          showTemporaryError(
            errorContainer,
            error.message || "Unexpected error. Please check your connection.",
          );
        })
        .finally(() => {
          transitsComplete = true;
          checkTriwheelGraphComplete();
          setTimeout(() => {
            // Graph pending → don't touch. Stale-guard holding → only
            // the source form may clear; other forms defer.
            if (window._graphNeedsOverlay) {
              return;
            }
            if (window._staleGuardOverlayHold) {
              if (window._staleGuardOverlayHold === formId) {
                window._staleGuardOverlayHold = null;
                document.getElementById("loading-overlay").style.display =
                  "none";
              }
              return;
            }
            document.getElementById("loading-overlay").style.display = "none";
          }, 300);
        });
    } else if (isGraphAutoSubmit) {
      // No transits fetch needed, mark as complete
      transitsComplete = true;
      checkTriwheelGraphComplete();
    }
  });
}

// PLANET SYMBOL SPACING
//
// Preserves each planet's natural angle wherever consecutive pairs are
// already >= minAngleSeparation apart, and only widens gaps where they
// would otherwise overlap. Where a widening is needed, the affected
// planets form a block placed at their own centroid — outliers don't
// drag distant siblings off their natural positions.
//
// Algorithm: linearise the circle by cutting at the widest natural gap,
// then run Pool-Adjacent-Violators (PAVA) to merge any pair below the
// minimum separation. Each merged block ends up centred on the mean of
// its members' natural angles, with members spaced exactly
// minAngleSeparation apart. This is the L2-optimal placement subject
// to the spacing constraint and preserves CCW zodiacal order.
//
// Contract preserved from the previous implementation:
//   - signature is unchanged
//   - returns shallow copies — input array and its objects are not mutated
//   - all input fields (name, position, retrograde, aspects, ...) flow through
export function symbolSpacing(
  planets,
  ascendantPosition,
  minAngleSeparation = 0.12,
) {
  if (!planets || planets.length === 0) return [];

  const TWO_PI = 2 * Math.PI;
  const normalizeAngle = (a) => {
    a = a % TWO_PI;
    if (a < 0) a += TWO_PI;
    return a;
  };

  const annotated = planets.map((p) => ({
    src: p,
    natural: normalizeAngle(
      ((ascendantPosition - p.position - 180) * Math.PI) / 180,
    ),
  }));

  if (annotated.length === 1) {
    return [{ ...annotated[0].src, adjustedAngle: annotated[0].natural }];
  }

  const N = annotated.length;

  // CCW order by natural angle; ties broken by descending zodiac position
  // so the CCW order stays consistent when two planets share a degree.
  annotated.sort((a, b) => {
    if (a.natural !== b.natural) return a.natural - b.natural;
    return b.src.position - a.src.position;
  });

  // Cut the circle at the widest natural gap — that's where the cluster
  // has the most slack to expand into without disturbing wrap-around.
  let maxGap = -1;
  let cutIdx = 0;
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N;
    let gap = annotated[j].natural - annotated[i].natural;
    if (j === 0) gap += TWO_PI;
    if (gap > maxGap) {
      maxGap = gap;
      cutIdx = j;
    }
  }

  const base = annotated[cutIdx].natural;
  const linear = [];
  for (let i = 0; i < N; i++) {
    const orig = annotated[(cutIdx + i) % N];
    let rel = orig.natural - base;
    if (rel < 0) rel += TWO_PI;
    linear.push({ src: orig.src, rel });
  }

  // If there are more planets than the circle can fit at minSep, distribute
  // evenly (graceful degradation; won't happen for any realistic chart).
  if ((N - 1) * minAngleSeparation > TWO_PI - minAngleSeparation - 1e-9) {
    const step = TWO_PI / N;
    return linear.map((item, idx) => ({
      ...item.src,
      adjustedAngle: normalizeAngle(base + idx * step),
    }));
  }

  // PAVA / pool-adjacent-violators. Each block tracks Σ natural-rel and count.
  // The block's ideal start = mean(rel) - minSep*(count-1)/2.
  const blocks = [];
  const startOf = (b) =>
    b.sumRel / b.count - (minAngleSeparation * (b.count - 1)) / 2;
  const endOf = (b) => startOf(b) + (b.count - 1) * minAngleSeparation;

  for (let i = 0; i < N; i++) {
    const block = { sumRel: linear[i].rel, count: 1, members: [i] };
    while (blocks.length > 0) {
      const prev = blocks[blocks.length - 1];
      if (startOf(block) - endOf(prev) < minAngleSeparation - 1e-12) {
        block.sumRel = prev.sumRel + block.sumRel;
        block.count = prev.count + block.count;
        block.members = prev.members.concat(block.members);
        blocks.pop();
      } else {
        break;
      }
    }
    blocks.push(block);
  }

  // Total span across all blocks must fit in 2π - minSep so the wrap gap
  // back from the last placed planet to the first stays >= minSep. The
  // cut-at-widest-gap step makes this trivially true for normal inputs;
  // the scale branch is just a defensive guard.
  const spanStart = startOf(blocks[0]);
  const spanEnd = endOf(blocks[blocks.length - 1]);
  const span = spanEnd - spanStart;
  const maxAllowedSpan = TWO_PI - minAngleSeparation;
  const scale = span > maxAllowedSpan + 1e-9 ? maxAllowedSpan / span : 1;
  const scaleOrigin = spanStart;

  const linearFinal = new Array(N);
  for (const b of blocks) {
    const s = startOf(b);
    b.members.forEach((idx, j) => {
      const raw = s + j * minAngleSeparation;
      linearFinal[idx] = scaleOrigin + (raw - scaleOrigin) * scale;
    });
  }

  return linear.map((item, idx) => ({
    ...item.src,
    adjustedAngle: normalizeAngle(base + linearFinal[idx]),
  }));
}

// Show aspect interpretation popup
function showAspectDetails(
  planet1Name,
  planet2Name,
  aspectType,
  orb,
  status,
  customAngle,
) {
  const tooltip = d3.select("#tooltip");

  // Clear and create new popup
  tooltip.html("");

  const tp = tooltip
    .append("div")
    .attr("class", "planet-tooltip-instance")
    .style("pointer-events", "auto");

  const c = tp.append("div").attr("class", "tooltip-content");

  // Normalize planet names to match JSON keys and get display names
  const normalizeKey = (name) => {
    let key = name.toLowerCase().replace(/\s+/g, " ");
    if (key === "ascendant symbol") return "ascendant";
    if (key === "descendant symbol") return "descendant";
    return key;
  };

  const getDisplayName = (name) => {
    let key = name.toLowerCase().replace(/\s+/g, " ");
    if (key === "ascendant symbol") return "Ascendant";
    if (key === "descendant symbol") return "Descendant";
    return name;
  };

  const planet1Key = normalizeKey(planet1Name);
  const planet2Key = normalizeKey(planet2Name);

  // Detect custom points by the server's naming convention
  // ("Custom_01_AsteroidName" — see chart-engine calculate-natal.js:945).
  // For display we show just the friendly asteroid name; the raw
  // "Custom_01_Galatea" is an internal identifier. The 2-digit slot label
  // ("01") stands in for the missing planet-glyph image (custom points
  // have no SVG on disk — a plain img would 404).
  const customPointPattern = /^Custom_(\d{2})_(.+)$/;
  const planet1CpMatch = planet1Name.match(customPointPattern);
  const planet2CpMatch = planet2Name.match(customPointPattern);
  const planet1IsCustomPoint = !!planet1CpMatch;
  const planet2IsCustomPoint = !!planet2CpMatch;

  const planet1Display = planet1IsCustomPoint
    ? planet1CpMatch[2]
    : getDisplayName(planet1Name);
  const planet2Display = planet2IsCustomPoint
    ? planet2CpMatch[2]
    : getDisplayName(planet2Name);

  // Custom aspects don't have descriptions in planetAspectDescriptions;
  // the || fallback below already handles that (returns "No description
  // available"). customAngle is defined only for custom aspects and drives
  // the header label and glyph swap below.
  const isCustom = typeof customAngle === "number";
  // Any aspect touching a custom point also has no meaningful narrative
  // description (custom points aren't keyed in planetAspectDescriptions).
  // Skip the description paragraph for these too, so users see a clean
  // header instead of a redundant "No description available" line.
  const skipDescription =
    isCustom || planet1IsCustomPoint || planet2IsCustomPoint;

  // Get description from planetAspectDescriptions
  const description = isCustom
    ? `Custom aspect at ${customAngle}°.`
    : planetAspectDescriptions[planet1Key]?.[planet2Key]?.[aspectType] ||
      planetAspectDescriptions[planet2Key]?.[planet1Key]?.[aspectType] ||
      "No description available";

  // Format aspect type for display
  const aspectTypeDisplay = isCustom
    ? `${customAngle}°`
    : aspectType.charAt(0).toUpperCase() + aspectType.slice(1);

  // Format orb (degrees and minutes)
  const orbNum = parseFloat(orb);
  const deg = Math.floor(orbNum);
  const min = Math.round((orbNum - deg) * 60);
  const orbText = `(${deg}° ${min}')`;

  // Get planet icons. Custom points have no SVG glyph on disk — render
  // their 2-digit slot label as a bold text badge in the same style as
  // the "01" they wear on the wheel and in the aspectarian cell.
  //
  // Margins are handled per-position, not shared, because the aspect glyph
  // that sits between them uses margin:-2px on its right side (pulling
  // planet2 leftward). Using the same negative-left margin as planet1's
  // image (-6px) on the planet2 badge caused visible overlap in the
  // header — planet2's badge needs a positive left margin to breathe.
  const planet1IconKey = planet1Name.toLowerCase().replace(/[\s-]+/g, "");
  const planet2IconKey = planet2Name.toLowerCase().replace(/[\s-]+/g, "");

  const badgeBase =
    "display:inline-block;min-width:28px;font-family:Arial,sans-serif;font-size:22px;font-weight:bold;color:#2c3d4f;vertical-align:middle;text-align:center;";

  const planet1Icon = planet1IsCustomPoint
    ? `<span style="${badgeBase}margin:-6px 2px 0 -6px;">${planet1CpMatch[1]}</span>`
    : `<img src="/images/planets/${planet1IconKey}.svg" width="28" height="28" style="vertical-align:middle;margin:-6px 2px 0 -6px"/>`;
  const planet2Icon = planet2IsCustomPoint
    ? `<span style="${badgeBase}margin:-6px 2px 0 6px;">${planet2CpMatch[1]}</span>`
    : `<img src="/images/planets/${planet2IconKey}.svg" width="28" height="28" style="vertical-align:middle;margin:-6px 2px 0 0"/>`;

  // Get aspect icon (text badge for custom aspects since they have no SVG
  // glyph on disk — a 404 would show a broken image otherwise).
  const aspectIcon = isCustom
    ? `<span style="display:inline-block;min-width:24px;font-family:Arial,sans-serif;font-size:20px;color:#2c3d4f;vertical-align:middle;margin:-2px 2px 0 6px;">${customAngle}°</span>`
    : `<img src="/images/aspects/${aspectType}.svg" width="24" height="24" style="vertical-align:middle;margin:-2px -2px 0 4px"/>`;

  const isMobile = window.innerWidth < 600;
  const fs = isMobile ? "16px" : "20px";

  // Omit the description paragraph entirely when it would add no useful
  // info — for custom aspects (would just repeat "135.55°") AND for any
  // aspect touching a custom point (planetAspectDescriptions has no entry
  // for custom points, so it would just print "No description available").
  const descriptionParagraph = skipDescription
    ? ""
    : `<p style="margin:0;"><strong>${aspectTypeDisplay}:</strong> ${description}</p>`;

  c
    .append("div")
    .attr("class", "aspect-details")
    .attr(
      "style",
      `white-space:normal;word-wrap:break-word;font-size:${fs};max-width:90vw;overflow-wrap:break-word;padding:10px;`,
    ).html(`
      <h3 style="margin:0 0 10px 0;">${planet1Icon}${planet1Display}${aspectIcon}${planet2Icon}${planet2Display} ${orbText}</h3>
      ${descriptionParagraph}
    `);

  tooltip.style("opacity", 0.95);

  if (isMobile) {
    tooltip
      .style("top", "25%")
      .style("left", "0%")
      .style("transform", "translate(0,0)");
  } else {
    tooltip
      .style("top", "50%")
      .style("left", "50%")
      .style("transform", "translate(-50%, -50%)");
  }
}

// Aspectarian
function showAspectarian(planets) {
  // Early return if no planets or empty array
  if (!planets || planets.length === 0) {
    return;
  }

  const tooltip = d3.select("#tooltip");
  tooltip.html("");

  const aspectTooltip = tooltip
    .append("div")
    .attr("class", "planet-tooltip-instance")
    .style("pointer-events", "auto");

  const tooltipContent = aspectTooltip
    .append("div")
    .attr("class", "tooltip-content")
    .style("height", "auto")
    .style("overflow", "visible");

  // Get unique planet names and track custom points.
  // Custom points with their Aspects box checked always get a row, the same
  // as planets. The shared list only has them when the last chart drawn had
  // an aspect line to them.
  const isCustomPointWithAspects = (p) =>
    p.isCustomPoint &&
    typeof activeCustomPoints !== "undefined" &&
    activeCustomPoints.find((cp) => cp.num === p.asteroidNum)?.aspect === true;
  const visiblePlanetObjects = planets.filter(
    (p) =>
      p &&
      p.name &&
      (window.planetsWithRenderedAspects?.has(p.name.toLowerCase()) ||
        isCustomPointWithAspects(p)),
  );
  const visiblePlanets = visiblePlanetObjects.map((p) => p.name);

  // Create a map to check if a planet is a custom point
  const customPointMap = {};
  visiblePlanetObjects.forEach((p) => {
    if (p.isCustomPoint) {
      customPointMap[p.name] = p.displayLabel;
    }
  });

  // Early return if no visible planets
  if (visiblePlanets.length === 0) {
    return;
  }

  const aspectsMap = {};

  // Build matrix map
  planets.forEach((planet) => {
    if (!planet.aspects) return;
    aspectsMap[planet.name] = {};
    planet.aspects.forEach((aspect) => {
      if (visiblePlanets.includes(aspect.planet)) {
        aspectsMap[planet.name][aspect.planet] = {
          type: aspect.type,
          orb: aspect.orb.toFixed(2),
          status: aspect.status,
          // Preserve custom-aspect metadata so the cell renderer below can
          // draw a text badge in place of a missing SVG glyph. Absent for
          // built-in aspects (undefined), which is exactly what the
          // existing `if (aspect.isCustom)` branches expect.
          isCustom: aspect.isCustom,
          customAngle: aspect.customAngle,
        };
      }
    });
  });

  // Create right triangle table
  const container = tooltipContent
    .append("div")
    .style("display", "flex")
    .style("flex-direction", "column")
    .style("gap", "6px");

  // Insert top header row with the first planet (e.g., Sun)
  const headerRow = container
    .append("div")
    .style("display", "flex")
    .style("align-items", "center")
    .style("gap", "6px");

  // Empty placeholder for the top-left corner
  headerRow.append("div").style("width", "44px").style("height", "44px");

  // Add first planet (usually Sun) icon or custom point label
  const firstPlanetName = visiblePlanets[0];
  const firstPlanetKey = firstPlanetName.toLowerCase().replace(/[\s-]+/g, "");
  if (customPointMap[firstPlanetName]) {
    // Custom point - render text label
    headerRow
      .append("div")
      .style("width", "44px")
      .style("height", "44px")
      .style("display", "flex")
      .style("align-items", "center")
      .style("justify-content", "center")
      .style("font-family", "Arial, sans-serif")
      .style("font-size", "22px")
      .style("font-weight", "bold")
      .style("color", "#2c3d4f")
      .style("margin-left", "14px")
      .text(customPointMap[firstPlanetName]);
  } else {
    headerRow
      .append("img")
      .attr(
        "src",
        planetImageCache[firstPlanetKey] ||
          `/images/planets/${firstPlanetKey}.svg`,
      )
      .attr("width", 44)
      .attr("height", 44)
      .style("margin-left", "14px");
  }

  // Table
  for (let row = 1; row < visiblePlanets.length; row++) {
    const rowDiv = container
      .append("div")
      .style("display", "flex")
      .style("gap", "6px")
      .style("align-items", "center");

    const planetName = visiblePlanets[row];
    const planetKey = planetName.toLowerCase().replace(/[\s-]+/g, "");

    if (customPointMap[planetName]) {
      // Custom point - render text label
      rowDiv
        .append("div")
        .style("width", "44px")
        .style("height", "44px")
        .style("display", "flex")
        .style("align-items", "center")
        .style("justify-content", "center")
        .style("font-family", "Arial, sans-serif")
        .style("font-size", "22px")
        .style("font-weight", "bold")
        .style("color", "#2c3d4f")
        .text(customPointMap[planetName]);
    } else {
      rowDiv
        .append("img")
        .attr(
          "src",
          planetImageCache[planetKey] || `/images/planets/${planetKey}.svg`,
        )
        .attr("width", 44)
        .attr("height", 44);
    }

    for (let col = 0; col < row; col++) {
      const p1 = visiblePlanets[col];
      const p2 = visiblePlanets[row];
      const aspect = aspectsMap[p2]?.[p1] || aspectsMap[p1]?.[p2] || null;

      const cell = rowDiv
        .append("div")
        .style("width", "68px")
        .style("height", "68px")
        .style("background", "#f9f9f9")
        .style("border", "1px solid #ccc")
        .style("display", "flex")
        .style("flex-direction", "column")
        .style("align-items", "center")
        .style("justify-content", "center")
        .style("pointer-events", "auto");

      // Formats aspectarian degree text
      function formatOrb(orb, status) {
        const deg = Math.floor(orb);
        const min = Math.round((orb - deg) * 60);
        const letter = status === "applying" ? "A" : "S";
        const dStr = String(deg).padStart(2, "0");
        const mStr = String(min).padStart(2, "0");
        return `${dStr}${letter}${mStr}`;
      }

      if (aspect) {
        const aspectType = aspect.type.toLowerCase();
        const aspectSymbol =
          miscImageCache[aspectType] || `/images/aspects/${aspectType}.svg`;

        // Make cell clickable
        cell
          .style("cursor", "pointer")
          .on("click", function (event) {
            event.stopPropagation();
            event.preventDefault();
            setTimeout(() => {
              showAspectDetails(
                p1,
                p2,
                aspectType,
                aspect.orb,
                aspect.status,
                aspect.isCustom ? aspect.customAngle : null,
              );
            }, 10);
          })
          .on("mouseover", function () {
            d3.select(this).style("background", "#e8e8e8");
          })
          .on("mouseout", function () {
            d3.select(this).style("background", "#f9f9f9");
          });

        if (aspect.isCustom) {
          // Text badge in place of an SVG glyph. Sized to match the 44px
          // image slot so grid alignment is unchanged. Non-bold #2c3d4f
          // keeps the visual weight in line with the 44x44 built-in glyphs
          // — a bold black label would visually outshout the actual
          // aspect symbols, which is the wrong information hierarchy.
          cell
            .append("div")
            .style("width", "44px")
            .style("height", "44px")
            .style("display", "flex")
            .style("align-items", "center")
            .style("justify-content", "center")
            .style("font-family", "Arial, sans-serif")
            .style("font-size", "18px")
            .style("color", "#2c3d4f")
            .text(`${aspect.customAngle}°`);
        } else {
          cell
            .append("img")
            .attr("src", aspectSymbol)
            .attr("width", 44)
            .attr("height", 44);
        }
        cell
          .append("div")
          .style("font-size", "18px")
          .style("margin-top", "-4px")
          .style("color", aspect.status === "applying" ? "red" : "blue")
          .text(
            formatOrb(
              parseFloat(aspect.orb), // turn degree into a Number
              aspect.status, // add "applying" or "separating"
            ),
          );
      }
    }

    // Second column icon (end of row) - handle custom points
    if (customPointMap[planetName]) {
      // Custom point - render text label
      rowDiv
        .append("div")
        .style("width", "44px")
        .style("height", "44px")
        .style("display", "flex")
        .style("align-items", "center")
        .style("justify-content", "center")
        .style("font-family", "Arial, sans-serif")
        .style("font-size", "22px")
        .style("font-weight", "bold")
        .style("color", "#2c3d4f")
        .style("margin-left", "14px")
        .text(customPointMap[planetName]);
    } else {
      rowDiv
        .append("img")
        .attr(
          "src",
          planetImageCache[planetKey] || `/images/planets/${planetKey}.svg`,
        )
        .attr("width", 44)
        .attr("height", 44)
        .style("margin-left", "14px");
    }
  }

  // Scale based on number of rows
  const rowCount = visiblePlanets.length;

  let scale = 1;

  if (rowCount >= 13) {
    scale = 0.5;
  } else if (rowCount === 12 || rowCount === 11) {
    scale = 0.7;
  } else if (rowCount === 10) {
    scale = 0.9;
  } else if (rowCount <= 9) {
    scale = 1;
  }

  container
    .style("transform", `scale(${scale})`)
    .style("transform-origin", "top center")
    .style("transition", "transform 0.3s ease-in-out");

  // After building the full aspectarian...
  setTimeout(() => {
    const containerNode = container.node();

    const bounding = containerNode.getBoundingClientRect();
    const rawHeight = bounding.height;
    const scaleFactors = {
      12: 0.95,
      13: 0.9,
      14: 0.85,
      15: 0.8,
    };
    let scale = rowCount >= 16 ? 0.75 : (scaleFactors[rowCount] ?? 1);

    // Width-based scaling
    if (window.innerWidth < 300)
      scale *= 0.35; // very small mobile
    else if (window.innerWidth < 400)
      scale *= 0.4; // smaller mobile
    else if (window.innerWidth < 500)
      scale *= 0.5; // small mobile
    else if (window.innerWidth < 600)
      scale *= 0.6; // mobile
    else if (window.innerWidth < 800) scale *= 0.7;
    else if (window.innerWidth < 1000) scale *= 0.75;
    else if (window.innerWidth < 1400) scale *= 0.8;
    else if (window.innerWidth < 1800) scale *= 0.85;
    else if (window.innerWidth < 2400) scale *= 0.9;
    else scale *= 0.95;

    // Additional landscape mobile check (height-based)
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    if (viewportHeight < 500 && viewportWidth > viewportHeight) {
      scale = Math.min(scale, 0.5); // Use smaller of the two scales
    } else if (viewportHeight < 700 && viewportWidth > viewportHeight) {
      scale = Math.min(scale, 0.7); // Use smaller of the two scales
    }

    // iOS/iPadOS/Safari: zoom doesn't scale text properly, use transform instead
    // Other browsers: use zoom (preserves existing behavior)
    const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
    const isIPadOS = navigator.userAgent.includes("Macintosh") && navigator.maxTouchPoints > 1;

    if (isIOS || isIPadOS) {
      // Recalculate initial transform scale (same logic as lines 4321-4329)
      let initialScale = 1;
      if (rowCount >= 13) initialScale = 0.5;
      else if (rowCount === 12 || rowCount === 11) initialScale = 0.7;
      else if (rowCount === 10) initialScale = 0.9;

      // Combine both scales into one transform (since zoom doesn't scale text on iOS)
      const combinedScale = initialScale * scale;

      container
        .style("transform", `scale(${combinedScale})`)
        .style("transform-origin", "top center")
        .style("transition", "all 0.3s ease-in-out");

      tooltipContent
        .style("width", `${bounding.width * scale}px`)
        .style("height", `${rawHeight * scale + 8}px`)
        .style("overflow", "hidden");
    } else {
      container
        .style("zoom", scale)
        .style("transition", "all 0.3s ease-in-out");

      // Set height of tooltip content to match the scaled content
      tooltipContent
        .style("height", `${rawHeight * scale + 8}px`)
        .style("overflow", "hidden");
    }
  }, 0);

  // Tooltip display
  tooltip.style("opacity", 0.95);

  // Center on screen
  tooltip
    .style("top", "50%")
    .style("left", "50%")
    .style("transform", "translate(-50%, -50%)");
}

// Synastry Aspectarian
export function showAspectarianSynastry(planetsA, planetsB, options = {}) {
  const { tooltipId = "#tooltip" } = options;

  // Get chart names
  const chartAName =
    options.chartAName ?? // explicit override
    JSON.parse(localStorage.getItem("natalData") || "{}").name ??
    "";

  const chartBName =
    options.chartBName ??
    JSON.parse(localStorage.getItem("synastryData") || "{}").name ??
    "";

  // User settings
  const { allowedAspects, allowedPlanets } = getCurrentAspectPrefs();

  // Keep only planets the user wants to see in aspect grids.
  // For heliocentric charts, treat "Earth" as equivalent to "Sun" since Earth replaces Sun.
  // Custom points pass through when their per-point "Aspects" toggle is on — makes the
  // synastry / triwheel / transit-biwheel / progressions-biwheel aspectarians behave
  // consistently with the natal aspectarian (which already shows custom-point aspects).
  const isCustomPointWithAspects = (p) =>
    p.isCustomPoint &&
    typeof activeCustomPoints !== "undefined" &&
    activeCustomPoints.find((cp) => cp.num === p.asteroidNum)?.aspect === true;
  planetsA = planetsA.filter(
    (p) =>
      allowedPlanets.includes(p.name) ||
      (p.name === "Earth" && allowedPlanets.includes("Sun")) ||
      isCustomPointWithAspects(p),
  );
  planetsB = planetsB.filter(
    (p) =>
      allowedPlanets.includes(p.name) ||
      (p.name === "Earth" && allowedPlanets.includes("Sun")) ||
      isCustomPointWithAspects(p),
  );

  // Master list of possible aspects and default orbs
  const ASPECT_MASTER = [
    { deg: 0, type: "conjunction", orb: 10 },
    { deg: 180, type: "opposition", orb: 10 },
    { deg: 120, type: "trine", orb: 8 },
    { deg: 90, type: "square", orb: 8 },
    { deg: 60, type: "sextile", orb: 6 },
    { deg: 30, type: "semisextile", orb: 3 },
    { deg: 150, type: "quincunx", orb: 3 },
  ];

  // Overwrite default orbs with orbs in settings
  document
    .querySelectorAll("#aspect-settings select.aspect-orb")
    .forEach((sel) => {
      const t = sel.dataset.aspect.toLowerCase();
      const custom = Number(sel.value);
      const row = ASPECT_MASTER.find((a) => a.type === t);
      if (row && !Number.isNaN(custom)) row.orb = custom;
    });

  // Append user-defined custom aspects so the synastry aspectarian
  // detects them too (built-ins still take priority via array order).
  if (
    typeof activeCustomAspects !== "undefined" &&
    Array.isArray(activeCustomAspects)
  ) {
    activeCustomAspects
      .filter((a) => a.enabled)
      .forEach((a) => {
        ASPECT_MASTER.push({
          deg: a.angle,
          type: `custom${a.angle}`,
          orb: a.orb,
          isCustom: true,
          customAngle: a.angle,
        });
      });
  }

  // Limit to what the user ticked (customs bypass this filter — they have
  // their own per-row enable checkbox in the custom-aspects UI)
  const ASPECTS = ASPECT_MASTER.filter(
    (a) => a.isCustom || allowedAspects.includes(a.type),
  );

  // Helpers
  function norm(v) {
    // 0-360 wrap
    v = v % 360;
    return v < 0 ? v + 360 : v;
  }

  function delta(a, b) {
    // smallest angle between two points
    const diff = Math.abs(norm(a) - norm(b));
    return diff > 180 ? 360 - diff : diff;
  }

  function findAspect(pA, pB) {
    // find aspects between two planets (using full planet objects for speed data)
    // For synastry/triwheel: pA is the reference chart (natal/person1) - treated as stationary
    // pB is the aspecting chart (transits/person2) - uses actual speed
    const d = delta(pA.position, pB.position);
    for (const asp of ASPECTS) {
      if (Math.abs(d - asp.deg) <= asp.orb) {
        // Calculate applying/separating using speed-based formula
        // 1) Compute signed difference in [–180, +180]:
        let raw = pA.position - pB.position;
        if (raw > 180) raw -= 360;
        else if (raw < -180) raw += 360;

        // 2) Compute how far from exact angle:
        const sep = Math.abs(raw);
        const diff = sep - asp.deg;

        // 3) Derivative of sep: positive → separating, negative → applying
        // pA (reference chart) is treated as stationary (speed = 0)
        // Only pB's speed is used (the aspecting/transiting planet)
        const speedB = pB.speed ?? 0;
        const deriv = Math.sign(raw) * (0 - speedB);

        // 4) If diff*deriv < 0, we're closing in → applying
        const applying = diff * deriv < 0;

        return {
          ...asp,
          orb: Math.abs(d - asp.deg),
          status: applying ? "applying" : "separating",
        };
      }
    }
    return null;
  }

  function formatOrb(orb, status) {
    // Formats aspectarian degree text (matches natal aspectarian format)
    const deg = Math.floor(orb);
    const min = Math.round((orb - deg) * 60);
    const letter = status === "applying" ? "A" : "S";
    const dStr = String(deg).padStart(2, "0");
    const mStr = String(min).padStart(2, "0");
    return `${dStr}${letter}${mStr}`;
  }

  // Tooltip
  const tooltip = d3.select(tooltipId);
  tooltip.html("");

  const wrapper = tooltip
    .append("div")
    .attr("class", "planet-tooltip-instance")
    .style("pointer-events", "auto")
    .style("display", "flex")
    .style("align-items", "center");

  // Add chart name to left (chartAName matches planetsA in rows)
  const leftName = wrapper
    .append("div")
    .style("overflow", "visible")
    .style("flex", "0 0 0")
    .style("width", "0")
    .style("margin-right", "24px")
    .style("margin-left", "12px")
    .style("display", "flex")
    .style("justify-content", "center")
    .style("align-items", "center")
    .style("transform", "rotate(-90deg)")
    .style("transform-origin", "center")
    .style("white-space", "nowrap")
    .style("font-size", "18px")
    .style("font-weight", "bold")
    .text(chartAName);

  const box = wrapper
    .append("div")
    .attr("class", "tooltip-content")
    .style("height", "auto")
    .style("overflow", "visible");

  // Planet lists
  // Filter planets to only those with aspects in the natal chart
  const aspectedSet = window.planetsWithRenderedAspects;
  // Custom points with their Aspects box checked always stay (see showAspectarian)
  if (aspectedSet) {
    planetsA = planetsA.filter(
      (p) => aspectedSet.has(p.name.toLowerCase()) || isCustomPointWithAspects(p),
    );
    planetsB = planetsB.filter(
      (p) => aspectedSet.has(p.name.toLowerCase()) || isCustomPointWithAspects(p),
    );
  }
  const rows = planetsA.map((p) => p.name);
  const cols = planetsB.map((p) => p.name);

  // Create a map to check if a planet is a custom point
  const customPointMap = {};
  [...planetsA, ...planetsB].forEach((p) => {
    if (p.isCustomPoint) {
      customPointMap[p.name] = p.displayLabel;
    }
  });

  // Top icons
  // gap + per-cell footprint must MIRROR the data rows below (gap 6px,
  // cells 68px + 1px border on each side) so the top planet symbols line
  // up over their columns. The data cells carry a 1px border that adds to
  // their layout width (box-sizing here is content-box); the header cells
  // get a matching transparent 1px border so both occupy the same width.
  // Without this the header pitch (75px) differed from the data pitch
  // (76px), drifting the top symbols ~1px/column — invisible with a few
  // planets, visibly misaligned with many.
  const header = box
    .append("div")
    .style("display", "flex")
    .style("gap", "6px")
    .style("align-items", "center");

  // Add chart name to top (chartBName matches planetsB in columns)
  box
    .insert("div", ":first-child") // new row above header
    .style("text-align", "center")
    .style("font-size", "18px")
    .style("font-weight", "bold")
    .style("margin-bottom", "4px")
    .style("width", 60 * cols.length + 50 + "px") // icons width + stub cell
    .text(chartBName);

  header.append("div").style("width", "44px").style("height", "44px");

  cols.forEach((c) => {
    const key = c.toLowerCase().replace(/[\s-]+/g, "");
    const cell = header
      .append("div")
      .style("width", "68px")
      .style("height", "68px")
      .style("border", "1px solid transparent") // match data cells' 1px border footprint
      .style("display", "flex")
      .style("align-items", "center")
      .style("justify-content", "center");
    if (customPointMap[c]) {
      // Custom point - render text label
      cell
        .style("font-family", "Arial, sans-serif")
        .style("font-size", "22px")
        .style("font-weight", "bold")
        .style("color", "#2c3d4f")
        .text(customPointMap[c]);
    } else {
      cell
        .append("img")
        .attr("src", planetImageCache[key] || `/images/planets/${key}.svg`)
        .attr("width", 44)
        .attr("height", 44);
    }
  });

  // Left icon and cells
  rows.forEach((rName, rIdx) => {
    const row = box
      .append("div")
      .style("display", "flex")
      .style("gap", "6px")
      .style("align-items", "center")
      .style("margin-bottom", "4px");

    // Left icons
    const rKey = rName.toLowerCase().replace(/[\s-]+/g, "");
    if (customPointMap[rName]) {
      // Custom point - render text label
      row
        .append("div")
        .style("width", "44px")
        .style("height", "44px")
        .style("display", "flex")
        .style("align-items", "center")
        .style("justify-content", "center")
        .style("font-family", "Arial, sans-serif")
        .style("font-size", "22px")
        .style("font-weight", "bold")
        .style("color", "#2c3d4f")
        .text(customPointMap[rName]);
    } else {
      row
        .append("img")
        .attr("src", planetImageCache[rKey] || `/images/planets/${rKey}.svg`)
        .attr("width", 44)
        .attr("height", 44);
    }

    // Cells
    cols.forEach((cName, cIdx) => {
      const cell = row
        .append("div")
        .style("width", "68px")
        .style("height", "68px")
        .style("background", "#f9f9f9")
        .style("border", "1px solid #ccc")
        .style("display", "flex")
        .style("flex-direction", "column")
        .style("align-items", "center")
        .style("justify-content", "center")
        .style("pointer-events", "auto");

      const pA = planetsA[rIdx];
      const pB = planetsB[cIdx];
      const aspect = findAspect(pA, pB);

      if (aspect) {
        const aspKey = aspect.type.toLowerCase();

        // Make cell clickable
        cell
          .style("cursor", "pointer")
          .on("click", function (event) {
            event.stopPropagation();
            event.preventDefault();
            setTimeout(() => {
              showAspectDetails(
                rName,
                cName,
                aspKey,
                aspect.orb,
                aspect.status,
                aspect.isCustom ? aspect.customAngle : null,
              );
            }, 10);
          })
          .on("mouseover", function () {
            d3.select(this).style("background", "#e8e8e8");
          })
          .on("mouseout", function () {
            d3.select(this).style("background", "#f9f9f9");
          });

        if (aspect.isCustom) {
          // Text badge in place of missing SVG glyph — matches natal
          // aspectarian style for cross-chart consistency (non-bold
          // #2c3d4f at 18px keeps visual weight consistent with the
          // 44x44 built-in glyphs).
          cell
            .append("div")
            .style("width", "44px")
            .style("height", "44px")
            .style("display", "flex")
            .style("align-items", "center")
            .style("justify-content", "center")
            .style("font-family", "Arial, sans-serif")
            .style("font-size", "18px")
            .style("color", "#2c3d4f")
            .text(`${aspect.customAngle}°`);
        } else {
          cell
            .append("img")
            .attr(
              "src",
              miscImageCache[aspKey] || `/images/aspects/${aspKey}.svg`,
            )
            .attr("width", 44)
            .attr("height", 44);
        }
        cell
          .append("div")
          .style("font-size", "18px")
          .style("margin-top", "-4px")
          .style("color", aspect.status === "applying" ? "red" : "blue")
          .text(formatOrb(aspect.orb, aspect.status));
      }
    });
  });

  // Apply responsive scaling
  const totalPlanets = Math.max(rows.length, cols.length);
  let scale = 1;

  // Base scale by planet count
  if (totalPlanets >= 13) scale = 0.5;
  else if (totalPlanets >= 11) scale = 0.7;
  else if (totalPlanets === 10) scale = 0.9;

  // Adjust for screen size (slightly smaller for synastry since it's wider)
  if (window.innerWidth < 300)
    scale *= 0.3; // was 0.35
  else if (window.innerWidth < 400)
    scale *= 0.35; // was 0.4
  else if (window.innerWidth < 500)
    scale *= 0.45; // was 0.5
  else if (window.innerWidth < 600)
    scale *= 0.55; // was 0.6
  else if (window.innerWidth < 800)
    scale *= 0.65; // was 0.7
  else if (window.innerWidth < 1000)
    scale *= 0.7; // was 0.75
  else if (window.innerWidth < 1400)
    scale *= 0.75; // was 0.8
  else if (window.innerWidth < 1800)
    scale *= 0.8; // was 0.85
  else if (window.innerWidth < 2400)
    scale *= 0.85; // was 0.9
  else scale *= 0.9; // was 0.95

  // Additional landscape mobile check (height-based) - more aggressive for synastry
  const viewportHeight = window.innerHeight;
  const viewportWidth = window.innerWidth;
  if (viewportHeight < 400 && viewportWidth > viewportHeight) {
    scale = Math.min(scale, 0.35); // Very aggressive for very short landscape
  } else if (viewportHeight < 500 && viewportWidth > viewportHeight) {
    scale = Math.min(scale, 0.4); // More aggressive than natal
  } else if (viewportHeight < 600 && viewportWidth > viewportHeight) {
    scale = Math.min(scale, 0.5); // More aggressive than natal
  } else if (viewportHeight < 700 && viewportWidth > viewportHeight) {
    scale = Math.min(scale, 0.6); // More aggressive than natal
  }

  // iOS/iPadOS/Safari: zoom doesn't scale text properly, use transform instead
  // Other browsers: use zoom (preserves existing behavior)
  const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  const isIPadOS = navigator.userAgent.includes("Macintosh") && navigator.maxTouchPoints > 1;

  if (isIOS || isIPadOS) {
    // Get dimensions before transform
    const boxNode = box.node();
    const boxRect = boxNode.getBoundingClientRect();
    const marginRight = boxRect.width * (1 - scale);
    const marginBottom = boxRect.height * (1 - scale);

    box
      .style("transform", `scale(${scale})`)
      .style("transform-origin", "top left")
      .style("margin-right", `-${marginRight}px`)
      .style("margin-bottom", `-${marginBottom}px`);

    // leftName: scale margins proportionally (original: margin-left 12px, margin-right 24px)
    leftName
      .style("transform", `rotate(-90deg) scale(${scale})`)
      .style("transform-origin", "center")
      .style("margin-left", `${12 * scale}px`)
      .style("margin-right", `${24 * scale}px`);
  } else {
    box.style("zoom", scale);
    leftName.style("zoom", scale);
  }

  // Show & close behaviour
  tooltip.style("opacity", 0.95);

  // Center on screen
  tooltip
    .style("top", "50%")
    .style("left", "50%")
    .style("transform", "translate(-50%, -50%)");
  function close(e) {
    if (!tooltip.node().contains(e.target)) {
      tooltip.style("opacity", 0);
      document.removeEventListener("click", close, true);
    }
  }
  setTimeout(() => document.addEventListener("click", close, true), 0);
}

// Print natal chart
document.getElementById("natalPrint").addEventListener("click", function () {
  const chart = document.getElementById("natal-chart");
  if (!chart) return;

  // Detect Safari browser
  // Use shared Safari detection for consistent testing across all charts
  const isSafari = isSafariMode();
  const isMobile = /iPhone|iPad|iPod/i.test(navigator.userAgent);

  if (isSafari) {
    // Use the shared Safari print view for consistency with other charts
    openSafariPrintView("natal-chart", "Natal Chart");
    return;
  } else {
    // Original code for non-Safari browsers
    const y = chart.getBoundingClientRect().top + window.pageYOffset;
    window.scrollTo(0, y);
    window.print();
  }
});

// Print natal report
document.getElementById("natalReport").addEventListener("click", function () {
  // For Safari, open window immediately to avoid popup blocking
  const isSafari =
    /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

  // Reuse the window opened by the chart-specific report button.
  let printWindow =
    window.triwheelReportWindow ||
    window.returnReportWindow ||
    window.synastryReportWindow ||
    window.compositeReportWindow ||
    window.graphReportWindow ||
    null;

  if (!printWindow && isSafari) {
    printWindow = window.open("", "PrintChart", "width=1000,height=1200");
    if (printWindow) {
      printWindow.document.write(
        "<html><body><p>Loading report...</p></body></html>",
      );
    }
  }

  // Check subscription before allowing report access
  fetch("/view-report", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
    credentials: "same-origin",
  })
    .then((response) => response.json())
    .then((data) => {
      // If the server returns a redirectUrl, redirect the browser to Stripe Checkout
      if (data.redirectUrl) {
        if (printWindow) printWindow.close();
        window.location.href = data.redirectUrl;
        return;
      }

      // If subscription check passed, proceed with report generation
      if (data.success) {
        generateReport(printWindow);
      } else {
        if (printWindow) printWindow.close();
        console.error(
          "Report access denied:",
          data.error || "The subscription check was unsuccessful.",
        );
      }
    })
    .catch((error) => {
      if (printWindow) printWindow.close();
      console.error("Error checking subscription for report:", error);
    });

  // Helper function to wait for all images to load
  function waitForImages(container) {
    const images = container.querySelectorAll("img");
    const promises = Array.from(images).map((img) => {
      if (img.complete) return Promise.resolve();
      return new Promise((resolve) => {
        img.onload = resolve;
        img.onerror = resolve; // Continue even if image fails
      });
    });
    return Promise.all(promises);
  }

  // Helper function to generate aspect descriptions HTML
  function generateAspectDescriptionsHTML() {
    if (!window.natalPlanets?.length || !window.planetsWithRenderedAspects) {
      return "";
    }

    const aspectsHTML = [];
    const processedAspects = new Set(); // To avoid duplicate aspects

    window.natalPlanets.forEach((planet) => {
      // Skip custom points in report
      if (planet.isCustomPoint) return;
      if (
        !planet.aspects ||
        !window.planetsWithRenderedAspects.has(planet.name.toLowerCase())
      )
        return;

      planet.aspects.forEach((aspect) => {
        // Only include aspects that are rendered in the aspectarian
        if (!window.planetsWithRenderedAspects.has(aspect.planet.toLowerCase()))
          return;

        // Skip aspects to custom points in report. Return and Composite
        // reports leave custom points out of their list, so also check the
        // name the server gives them (Custom_01_Name)
        const targetPlanet = window.natalPlanets.find(
          (p) => p.name.toLowerCase() === aspect.planet.toLowerCase(),
        );
        if (targetPlanet?.isCustomPoint || /^Custom_\d{2}_/.test(aspect.planet))
          return;

        // Create unique key to avoid duplicates (e.g., Sun-Moon and Moon-Sun)
        const planet1Lower = planet.name.toLowerCase();
        const planet2Lower = aspect.planet.toLowerCase();
        const aspectKey =
          [planet1Lower, planet2Lower].sort().join("-") + "-" + aspect.type;
        if (processedAspects.has(aspectKey)) return;
        processedAspects.add(aspectKey);

        // Normalize planet names for JSON lookup
        const normalizeKey = (name) => {
          let key = name.toLowerCase().replace(/\s+/g, " ");
          if (key === "ascendant symbol") return "ascendant";
          if (key === "descendant symbol") return "descendant";
          return key;
        };

        const getDisplayName = (name) => {
          let key = name.toLowerCase().replace(/\s+/g, " ");
          if (key === "ascendant symbol") return "Ascendant";
          if (key === "descendant symbol") return "Descendant";
          return name;
        };

        const planet1Key = normalizeKey(planet.name);
        const planet2Key = normalizeKey(aspect.planet);
        const planet1Display = getDisplayName(planet.name);
        const planet2Display = getDisplayName(aspect.planet);
        const aspectType = aspect.type.toLowerCase();

        // Get description
        const description =
          planetAspectDescriptions[planet1Key]?.[planet2Key]?.[aspectType] ||
          planetAspectDescriptions[planet2Key]?.[planet1Key]?.[aspectType] ||
          "No description available";

        const aspectTypeDisplay =
          aspectType.charAt(0).toUpperCase() + aspectType.slice(1);

        // Format orb
        const orbNum = parseFloat(aspect.orb);
        const deg = Math.floor(orbNum);
        const min = Math.round((orbNum - deg) * 60);
        const orbText = `(${deg}° ${min}')`;

        // Get icon files
        let planet1IconFile = planet1Key.replace(/[\s-]+/g, "");
        if (planet1IconFile === "ascendant")
          planet1IconFile = "ascendantsymbol";

        let planet2IconFile = planet2Key.replace(/[\s-]+/g, "");
        if (planet2IconFile === "ascendant")
          planet2IconFile = "ascendantsymbol";

        const planet1ImageSrc =
          planetImageCache[planet1IconFile] ||
          `/images/planets/${planet1IconFile}.svg`;
        const planet2ImageSrc =
          planetImageCache[planet2IconFile] ||
          `/images/planets/${planet2IconFile}.svg`;
        const aspectImageSrc = `/images/aspects/${aspectType}.svg`;

        aspectsHTML.push(`
          <div style="margin-bottom: 48px;">
            <h2 style="margin: 0 0 12px 0; font-size: 24px; font-weight: bold; display: flex; align-items: center; gap: 10px;">
              <img src="${planet1ImageSrc}" alt="${planet1Display}" width="36" height="36" style="margin-left: -4px; margin-right: -4px;" />
              ${planet1Display}
              <img src="${aspectImageSrc}" alt="${aspectTypeDisplay}" width="30" height="30" style="margin: 0 -4px;" />
              <img src="${planet2ImageSrc}" alt="${planet2Display}" width="36" height="36" style="margin-left: -4px; margin-right: -4px;" />
              ${planet2Display} ${orbText}
            </h2>
            <p style="margin: 0;"><strong>${aspectTypeDisplay}:</strong> ${description}</p>
          </div>
        `);
      });
    });

    if (aspectsHTML.length > 0) {
      return `
        <h2 style="margin: 24px 0 24px; font-size: 24px; font-weight: bold; page-break-before: always;">Aspects</h2>
        ${aspectsHTML.join("")}
      `;
    }

    return "";
  }

  // Helper function to generate synastry aspect descriptions HTML
  function generateSynastryAspectDescriptionsHTML() {
    if (!window.person1Planets?.length || !window.synastryPlanets?.length) {
      return "";
    }

    // Get aspect settings
    const { allowedAspects, allowedPlanets } = getCurrentAspectPrefs();

    // Filter planets based on user settings (exclude custom points from report)
    // For heliocentric charts, treat "Earth" as equivalent to "Sun" since Earth replaces Sun
    const person1Filtered = window.person1Planets.filter(
      (p) =>
        (allowedPlanets.includes(p.name) ||
          (p.name === "Earth" && allowedPlanets.includes("Sun"))) &&
        !p.isCustomPoint,
    );
    const person2Filtered = window.synastryPlanets.filter(
      (p) =>
        (allowedPlanets.includes(p.name) ||
          (p.name === "Earth" && allowedPlanets.includes("Sun"))) &&
        !p.isCustomPoint,
    );

    const ASPECT_MASTER = [
      { deg: 0, type: "conjunction", orb: 10 },
      { deg: 180, type: "opposition", orb: 10 },
      { deg: 120, type: "trine", orb: 8 },
      { deg: 90, type: "square", orb: 8 },
      { deg: 60, type: "sextile", orb: 6 },
      { deg: 30, type: "semisextile", orb: 3 },
      { deg: 150, type: "quincunx", orb: 3 },
    ];

    // Get user orb settings
    document
      .querySelectorAll("#aspect-settings select.aspect-orb")
      .forEach((sel) => {
        const t = sel.dataset.aspect?.toLowerCase();
        const row = ASPECT_MASTER.find((a) => a.type === t);
        if (row) row.orb = +sel.value;
      });

    // Append user-defined custom aspects so the description panel also
    // includes them (built-ins still win via array order + first-match).
    if (
      typeof activeCustomAspects !== "undefined" &&
      Array.isArray(activeCustomAspects)
    ) {
      activeCustomAspects
        .filter((a) => a.enabled)
        .forEach((a) => {
          ASPECT_MASTER.push({
            deg: a.angle,
            type: `custom${a.angle}`,
            orb: a.orb,
            isCustom: true,
            customAngle: a.angle,
          });
        });
    }

    // Restrict to allowed aspect types (customs bypass this filter — they
    // are opted-in individually via the custom-aspects UI)
    const ASPECTS = ASPECT_MASTER.filter(
      (a) => a.isCustom || allowedAspects.includes(a.type),
    );

    // Calculate aspects between Person 1 and Person 2
    const norm = (v) => ((v % 360) + 360) % 360;
    const delta = (a, b) => {
      const d = Math.abs(norm(a) - norm(b));
      return d > 180 ? 360 - d : d;
    };
    const findAsp = (aDeg, bDeg) => {
      const d = delta(aDeg, bDeg);
      for (const asp of ASPECTS) {
        const orb = Math.abs(d - asp.deg);
        if (orb <= asp.orb) {
          return { ...asp, orb };
        }
      }
      return null;
    };

    const aspectsHTML = [];

    person1Filtered.forEach((planet1) => {
      person2Filtered.forEach((planet2) => {
        const aspect = findAsp(planet1.position, planet2.position);
        if (!aspect) return;

        // Normalize planet names for JSON lookup
        const normalizeKey = (name) => {
          let key = name.toLowerCase().replace(/\s+/g, " ");
          if (key === "ascendant symbol") return "ascendant";
          if (key === "descendant symbol") return "descendant";
          return key;
        };

        const getDisplayName = (name) => {
          let key = name.toLowerCase().replace(/\s+/g, " ");
          if (key === "ascendant symbol") return "Ascendant";
          if (key === "descendant symbol") return "Descendant";
          return name;
        };

        const planet1Key = normalizeKey(planet1.name);
        const planet2Key = normalizeKey(planet2.name);
        const planet1Display = getDisplayName(planet1.name);
        const planet2Display = getDisplayName(planet2.name);
        const aspectType = aspect.type.toLowerCase();
        const isCustomAspect = aspect.isCustom === true;

        // Get description (custom aspects fall through to a generic note
        // since planetAspectDescriptions has no key for them)
        const description = isCustomAspect
          ? `Custom aspect at ${aspect.customAngle}°.`
          : planetAspectDescriptions[planet1Key]?.[planet2Key]?.[aspectType] ||
            planetAspectDescriptions[planet2Key]?.[planet1Key]?.[aspectType] ||
            "No description available";

        const aspectTypeDisplay = isCustomAspect
          ? `${aspect.customAngle}°`
          : aspectType.charAt(0).toUpperCase() + aspectType.slice(1);

        // Format orb
        const deg = Math.floor(aspect.orb);
        const min = Math.round((aspect.orb - deg) * 60);
        const orbText = `(${deg}° ${min}')`;

        // Get icon files
        let planet1IconFile = planet1Key.replace(/[\s-]+/g, "");
        if (planet1IconFile === "ascendant")
          planet1IconFile = "ascendantsymbol";

        let planet2IconFile = planet2Key.replace(/[\s-]+/g, "");
        if (planet2IconFile === "ascendant")
          planet2IconFile = "ascendantsymbol";

        const planet1ImageSrc =
          planetImageCache[planet1IconFile] ||
          `/images/planets/${planet1IconFile}.svg`;
        const planet2ImageSrc =
          planetImageCache[planet2IconFile] ||
          `/images/planets/${planet2IconFile}.svg`;
        // Custom aspects have no SVG glyph on disk — use a text badge
        // (matches the wheel + aspectarian style)
        const aspectIconHTML = isCustomAspect
          ? `<span style="display:inline-block;min-width:30px;font-family:Arial,sans-serif;font-size:22px;color:#2c3d4f;margin:0 -4px;text-align:center;">${aspect.customAngle}°</span>`
          : `<img src="/images/aspects/${aspectType}.svg" alt="${aspectTypeDisplay}" width="30" height="30" style="margin: 0 -4px;" />`;

        // Custom aspects have no meaningful description text — the <p>
        // would just repeat the header's badge and add no new info. Omit
        // it entirely for customs (mirrors the popup treatment).
        const descriptionParagraph = isCustomAspect
          ? ""
          : `<p style="margin: 0;"><strong>${aspectTypeDisplay}:</strong> ${description}</p>`;

        aspectsHTML.push(`
          <div style="margin-bottom: 48px;">
            <h2 style="margin: 0 0 12px 0; font-size: 24px; font-weight: bold; display: flex; align-items: center; gap: 10px;">
              <img src="${planet1ImageSrc}" alt="${planet1Display}" width="36" height="36" style="margin-left: -4px; margin-right: -4px;" />
              ${planet1Display}
              ${aspectIconHTML}
              <img src="${planet2ImageSrc}" alt="${planet2Display}" width="36" height="36" style="margin-left: -4px; margin-right: -4px;" />
              ${planet2Display} ${orbText}
            </h2>
            ${descriptionParagraph}
          </div>
        `);
      });
    });

    if (aspectsHTML.length > 0) {
      return `
        <h2 style="margin: 24px 0 24px; font-size: 24px; font-weight: bold; page-break-before: always;">Aspects</h2>
        ${aspectsHTML.join("")}
      `;
    }

    return "";
  }

  async function generateReport(preOpenedWindow) {
    // Use appropriate chart container based on report type
    const chartContainerId = window.isTriwheelReport
      ? "triwheel-chart"
      : window.isReturnReport
        ? "return-chart"
        : window.isSynastryReport
          ? "synastry-chart"
          : window.isCompositeReport
            ? "composite-chart"
            : window.isCompositeBlankReport
              ? "composite-chart-blank"
              : window.isGraphReport
                ? "graph"
                : "natal-chart";
    const chartContainer = document.getElementById(chartContainerId);
    if (!chartContainer) return;

    document.getElementById("showReport")?.remove();

    // A previous report can still be attached while its print dialog is open.
    // Remove it before building the next report so the chart clone cannot
    // contain a second copy of the same descriptions.
    chartContainer
      .querySelectorAll("#reportDescriptions")
      .forEach((previousReport) => previousReport.remove());

    function getUniqueReportPlanets(planets) {
      const seen = new Set();
      return planets.filter((planet) => {
        const key = planet.isGraphItem
          ? JSON.stringify(planet)
          : [
              planet.chartType || "natal",
              planet.reportSection || "",
              String(planet.name || "").toLowerCase(),
              planet.sign || "",
              planet.houseNatal ?? planet.house ?? "",
            ].join("|");
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }

    // Check if Safari - iOS devices are always Safari, or check for Safari on desktop
    const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
    const isSafari =
      isIOS || /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

    // Check if mobile
    const isMobileDevice = /iPhone|iPad|iPod|Android/i.test(
      navigator.userAgent,
    );

    // For non-Safari mobile, add content to DOM early and wait longer for rendering
    if (isMobileDevice && !isSafari) {
      // Add class for CSS overrides
      document.body.classList.add("mobile-report-print");

      // Create report content just like desktop but add it early
      const report = document.createElement("div");
      report.id = "reportDescriptions";
      report.style.padding = "20px";
      report.style.fontSize = "20px";
      report.style.lineHeight = "1.4em";
      report.style.pageBreakBefore = "always";

      // Add planet descriptions (exclude custom points from report)
      if (window.natalPlanets?.length > 0) {
        const sortedPlanets = getUniqueReportPlanets(window.natalPlanets)
          .filter((p) => !p.isCustomPoint)
          .sort((a, b) => {
            const aKey = a.name.toLowerCase();
            const bKey = b.name.toLowerCase();
            if (aKey === "ascendant symbol") return -1;
            if (bKey === "ascendant symbol") return 1;
            return 0;
          });

        let currentSection = null;
        sortedPlanets.forEach((planet) => {
          // Handle graph items differently
          if (planet.isGraphItem) {
            const monthNames = [
              "January",
              "February",
              "March",
              "April",
              "May",
              "June",
              "July",
              "August",
              "September",
              "October",
              "November",
              "December",
            ];
            const dateStr = planet.date
              ? `${planet.date.day} ${monthNames[planet.date.month - 1]} ${
                  planet.date.year
                }`
              : "";
            const chartTypeLabel =
              planet.chartType === "transit" ? "Transiting" : "Progressed";

            if (planet.itemType === "aspect") {
              const planet1Key = planet.name.toLowerCase().replace(/\s+/g, " ");
              const planet2Key = planet.planet2
                .toLowerCase()
                .replace(/\s+/g, " ");
              const aspectType = planet.aspectType.toLowerCase();

              const description =
                planetAspectDescriptions[planet1Key]?.[planet2Key]?.[
                  aspectType
                ] ||
                planetAspectDescriptions[planet2Key]?.[planet1Key]?.[
                  aspectType
                ] ||
                "No description available";

              const aspectTypeDisplay =
                planet.aspectType.charAt(0).toUpperCase() +
                planet.aspectType.slice(1);

              // Determine planet2 type label (like "Natal", "Transiting", etc.)
              let planet2TypeLabel = "";
              if (planet.planet2Type === "natal") {
                planet2TypeLabel = "Natal ";
              } else if (planet.planet2Type === "transit") {
                planet2TypeLabel = "Transiting ";
              } else if (planet.planet2Type === "progressed") {
                planet2TypeLabel = "Progressed ";
              }

              // Only show orb for non-graph reports (graph items don't have orb)
              const orbText =
                planet.orb !== undefined
                  ? ` (${Math.floor(planet.orb)}° ${Math.round(
                      (planet.orb - Math.floor(planet.orb)) * 60,
                    )}')`
                  : "";

              const planet1IconFile = planet1Key.replace(/[\s-]+/g, "");
              const planet2IconFile = planet2Key.replace(/[\s-]+/g, "");
              const planet1ImageSrc =
                planetImageCache[planet1IconFile] ||
                `/images/planets/${planet1IconFile}.svg`;
              const planet2ImageSrc =
                planetImageCache[planet2IconFile] ||
                `/images/planets/${planet2IconFile}.svg`;
              const aspectImageSrc = `/images/aspects/${aspectType}.svg`;

              report.innerHTML += `
                <div style="margin-bottom: 48px;">
                  <h2 style="margin: 0 0 12px 0; font-size: 24px; font-weight: bold; display: flex; align-items: center; gap: 10px;">
                    <img src="${planet1ImageSrc}" alt="${
                      planet.name
                    }" width="36" height="36" style="margin-left: -4px; margin-right: -4px;" />
                    ${chartTypeLabel} ${planet.name}
                    <img src="${aspectImageSrc}" alt="${aspectTypeDisplay}" width="30" height="30" style="margin: 0 -4px;" />
                    <img src="${planet2ImageSrc}" alt="${
                      planet.planet2
                    }" width="36" height="36" style="margin-left: -4px; margin-right: -4px;" />
                    ${planet2TypeLabel}${planet.planet2}${orbText}
                  </h2>
                  <p style="margin: 0;"><strong>${aspectTypeDisplay}:</strong> ${description}</p>
                  ${
                    dateStr
                      ? `<p style="margin: 6px 0 0 0; font-size: 16px; color: #666;">Exact: ${dateStr}</p>`
                      : ""
                  }
                </div>
              `;
            } else if (planet.itemType === "house_ingress") {
              const planetKey = planet.name.toLowerCase().replace(/\s+/g, " ");
              const houseDescriptions =
                planet.chartType === "progressed"
                  ? progressedPlanetHouseDescriptions
                  : transitPlanetHouseDescriptions;
              const description =
                houseDescriptions[planetKey]?.[planet.house] ||
                "No description available";

              const planetIconFile = planetKey.replace(/[\s-]+/g, "");
              const planetImageSrc =
                planetImageCache[planetIconFile] ||
                `/images/planets/${planetIconFile}.svg`;

              report.innerHTML += `
                <div style="margin-bottom: 48px;">
                  <h2 style="margin: 0 0 12px 0; font-size: 24px; font-weight: bold; display: flex; align-items: center; gap: 10px;">
                    <img src="${planetImageSrc}" alt="${
                      planet.name
                    }" width="36" height="36" style="margin-left: -4px; margin-right: -4px;" />
                    ${chartTypeLabel} ${planet.name} in House ${planet.house}
                  </h2>
                  <p style="margin: 0;">${description}</p>
                  ${
                    dateStr
                      ? `<p style="margin: 6px 0 0 0; font-size: 16px; color: #666;">Date: ${dateStr}</p>`
                      : ""
                  }
                </div>
              `;
            } else if (planet.itemType === "station") {
              const planetKey = planet.name.toLowerCase().replace(/\s+/g, " ");
              const description =
                graphPlanetRetroDescriptions[planetKey]?.station ||
                "No description available";

              const planetIconFile = planetKey.replace(/[\s-]+/g, "");
              const planetImageSrc =
                planetImageCache[planetIconFile] ||
                `/images/planets/${planetIconFile}.svg`;

              report.innerHTML += `
                <div style="margin-bottom: 48px;">
                  <h2 style="margin: 0 0 12px 0; font-size: 24px; font-weight: bold; display: flex; align-items: center; gap: 10px;">
                    <img src="${planetImageSrc}" alt="${
                      planet.name
                    }" width="36" height="36" style="margin-left: -4px; margin-right: -4px;" />
                    ${chartTypeLabel} ${planet.name} Station
                  </h2>
                  <p style="margin: 0;">${description}</p>
                  ${
                    dateStr
                      ? `<p style="margin: 6px 0 0 0; font-size: 16px; color: #666;">Date: ${dateStr}</p>`
                      : ""
                  }
                </div>
              `;
            } else if (planet.itemType === "sign_ingress") {
              const planetKey = planet.name.toLowerCase().replace(/\s+/g, " ");
              const planetIconFile = planetKey.replace(/[\s-]+/g, "");
              const planetImageSrc =
                planetImageCache[planetIconFile] ||
                `/images/planets/${planetIconFile}.svg`;

              report.innerHTML += `
                <div style="margin-bottom: 48px;">
                  <h2 style="margin: 0 0 12px 0; font-size: 24px; font-weight: bold; display: flex; align-items: center; gap: 10px;">
                    <img src="${planetImageSrc}" alt="${
                      planet.name
                    }" width="36" height="36" style="margin-left: -4px; margin-right: -4px;" />
                    ${chartTypeLabel} ${planet.name} enters ${planet.sign}
                  </h2>
                  ${
                    dateStr
                      ? `<p style="margin: 6px 0 0 0; font-size: 16px; color: #666;">Date: ${dateStr}</p>`
                      : ""
                  }
                </div>
              `;
            }
            return; // Skip the regular planet handling
          }

          // Add section header if reportSection changes
          if (planet.reportSection && planet.reportSection !== currentSection) {
            currentSection = planet.reportSection;
            report.innerHTML += `
              <h2 style="margin: 24px 0 24px; font-size: 24px; font-weight: bold; page-break-before: always;">
                ${currentSection}
              </h2>
            `;
          }

          let planetKey = planet.name.toLowerCase();
          let displayName = planet.name;
          if (planetKey === "ascendant symbol") {
            planetKey = "ascendant";
            displayName = "Ascendant";
          } else if (planetKey === "descendant symbol") {
            planetKey = "descendant";
            displayName = "Descendant";
          }

          // Select appropriate description set based on chart type
          const chartType = planet.chartType || "natal";
          let signDescriptions = planetSignDescriptions;
          let houseDescriptions = planetHouseDescriptions;
          if (chartType === "progressed") {
            signDescriptions = progressedPlanetSignDescriptions;
            houseDescriptions = progressedPlanetHouseDescriptions;
          } else if (chartType === "transit") {
            signDescriptions = transitPlanetSignDescriptions;
            houseDescriptions = transitPlanetHouseDescriptions;
          } else if (chartType === "solar_return") {
            signDescriptions = solarReturnPlanetSignDescriptions;
            houseDescriptions = solarReturnPlanetHouseDescriptions;
          } else if (chartType === "lunar_return") {
            signDescriptions = lunarReturnPlanetSignDescriptions;
            houseDescriptions = lunarReturnPlanetHouseDescriptions;
          } else if (chartType === "synastry") {
            signDescriptions = synastryPlanetSignDescriptions;
            houseDescriptions = synastryPlanetHouseDescriptions;
          } else if (chartType === "composite") {
            signDescriptions = compositePlanetSignDescriptions;
            houseDescriptions = compositePlanetHouseDescriptions;
          }

          const signKey = planet.sign.toLowerCase();
          const signDesc =
            signDescriptions[planetKey]?.[signKey] ||
            "No description available";

          const isAngle =
            planetKey === "ascendant" ||
            planetKey === "descendant" ||
            planetKey === "midheaven" ||
            planetKey === "imum coeli";

          // Use houseNatal (natal-relative house) if available, otherwise use house
          const houseToUse = planet.houseNatal || planet.house;

          const houseLabel =
            !isAngle && houseToUse ? `House ${houseToUse}` : "";

          const fullLabel =
            houseLabel !== ""
              ? `${displayName} in ${planet.sign} ${houseLabel}`
              : `${displayName} in ${planet.sign}`;

          // Skip sign description for Galactic Center (doesn't change signs)
          const signLine =
            planetKey === "galactic center"
              ? ""
              : `<strong>${displayName} in ${planet.sign}:</strong> ${signDesc}`;

          const houseLine =
            !isAngle && houseToUse && houseDescriptions[planetKey]?.[houseToUse]
              ? `<strong>${displayName} in House ${houseToUse}:</strong> ${houseDescriptions[planetKey][houseToUse]}`
              : "";

          const planetIconFile =
            planetKey === "ascendant"
              ? "ascendantsymbol"
              : planetKey.replace(/[\s-]+/g, "");

          const planetImageSrc =
            planetImageCache[planetIconFile] ||
            `/images/planets/${planetIconFile}.svg`;

          report.innerHTML += `
            <div style="margin-bottom: 48px;">
              <h2 style="margin: 0 0 12px 0; font-size: 24px; font-weight: bold; display: flex; align-items: center; gap: 10px;">
                <img src="${planetImageSrc}" alt="${displayName}" width="36" height="36" style="margin-left: -4px; margin-right: -4px;" />
                ${fullLabel}
              </h2>
              ${
                signLine ? `<p style="margin: 0 0 12px 0;">${signLine}</p>` : ""
              }
              ${houseLine ? `<p style="margin: 0;">${houseLine}</p>` : ""}
            </div>
          `;
        });
      }

      // Add aspect descriptions (skip for graph reports)
      if (!window.isGraphReport) {
        const aspectDescHTML = window.isSynastryReport
          ? generateSynastryAspectDescriptionsHTML()
          : generateAspectDescriptionsHTML();
        if (aspectDescHTML) {
          report.innerHTML += aspectDescHTML;
        }
      }

      // Add to chart container
      chartContainer.appendChild(report);

      // Add aspectarian visual at the end (skip for triwheel and graph reports)
      if (!window.isTriwheelReport && !window.isGraphReport) {
        // For synastry reports, use synastry aspectarian (Person 1 vs Person 2)
        // Filter out custom points from report aspectarian
        if (window.isSynastryReport) {
          const filteredPerson1 =
            window.person1Planets?.filter((p) => !p.isCustomPoint) || [];
          const filteredSynastry =
            window.synastryPlanets?.filter((p) => !p.isCustomPoint) || [];
          showAspectarianSynastry(filteredPerson1, filteredSynastry);
        } else {
          const filteredPlanets =
            window.natalPlanets?.filter((p) => !p.isCustomPoint) || [];
          showAspectarian(filteredPlanets);
        }
        const tooltip = document.querySelector("#tooltip");
        const clonedAspect = tooltip
          ?.querySelector(".planet-tooltip-instance .tooltip-content")
          ?.cloneNode(true);

        if (clonedAspect) {
          const aspectarianHeader = document.createElement("h2");
          aspectarianHeader.textContent = "Aspectarian";
          aspectarianHeader.style.margin = "24px 0 12px";
          aspectarianHeader.style.fontSize = "24px";
          aspectarianHeader.style.fontWeight = "bold";
          aspectarianHeader.style.pageBreakBefore = "always";
          report.appendChild(aspectarianHeader);
          report.appendChild(clonedAspect);
        }

        // Hide tooltip
        if (tooltip) tooltip.style.opacity = "0";
      }

      // Create a temporary report section (like other tabs)
      // IMPORTANT: At this point, chartContainer contains both the chart SVG and the full report with aspectarian
      const reportSection = document.createElement("div");
      reportSection.id = "showReport";
      reportSection.style.display = "none";
      // Just copy everything from chartContainer - it already has the proper structure
      reportSection.innerHTML = `
        <div style="width: 100%;">
          ${chartContainer.innerHTML}
        </div>
      `;

      // Add to body at the same level as other sections (not inside showNatal)
      document.body.appendChild(reportSection);

      // Hide all existing sections (replicate hideAllSections functionality)
      const sectionsToHide = [
        "showNatal",
        "showTriwheel",
        "showGraph",
        "showReturn",
        "showCommunity",
        "showSettings",
        "showSynastry",
        "showComposite",
        "showHelp",
        "showAccount",
        "showMap",
      ];
      sectionsToHide.forEach((id) => {
        const element = document.getElementById(id);
        if (element) element.style.display = "none";
      });

      // Show only the report section
      reportSection.style.display = "block";

      // Push a history state so back button returns to chart instead of leaving page
      window.history.pushState({ reportView: true }, "", window.location.href);

      // Handle browser back button
      const handlePopState = (e) => {
        // If going back from report view, handle it
        if (document.getElementById("showReport")) {
          returnToMain();
        }
      };
      window.addEventListener("popstate", handlePopState, { once: true });

      // Add click handler to MAIN button to return to chart
      const mainButton = document.getElementById("natal-button");
      const originalMainHandler = mainButton.onclick;
      const returnToMain = () => {
        // Clean up the popstate listener if it hasn't fired
        window.removeEventListener("popstate", handlePopState);

        // FIRST: Remove report section immediately to prevent any interactions
        const existingReport = document.getElementById("showReport");
        if (existingReport) existingReport.remove();

        // Clean up the report content from inside natal-chart (original, not the copy)
        const reportInNatalChart = chartContainer.querySelector(
          "#reportDescriptions",
        );
        if (reportInNatalChart) reportInNatalChart.remove();

        // Clean up the report that was added to the original chart container
        if (report && report.parentNode) {
          report.remove();
        }

        // Remove print classes
        document.body.classList.remove("mobile-print-active");
        document.body.classList.remove("mobile-report-print");

        // THEN: Wait a tiny bit before showing main page to ensure click event is dead
        setTimeout(() => {
          // Show natal section
          const natalSection = document.getElementById("showNatal");
          if (natalSection) natalSection.style.display = "block";

          // Hide other sections
          sectionsToHide
            .filter((id) => id !== "showNatal")
            .forEach((id) => {
              const element = document.getElementById(id);
              if (element) element.style.display = "none";
            });
        }, 100);
      };

      // Make MAIN button return to chart view
      mainButton.addEventListener("click", returnToMain, { once: true });

      // Add class for print CSS
      document.body.classList.add("mobile-print-active");

      // Force layout recalculation
      document.body.offsetHeight;

      // Wait then print
      setTimeout(() => {
        window.print();

        // Return to main when user interacts with page after printing
        let returned = false;

        const handleInteraction = (e) => {
          // Ignore if clicking the MAIN button (let its handler work)
          if (e.target && e.target.id === "natal-button") return;

          if (!returned) {
            returned = true;
            document.removeEventListener("click", handleInteraction);
            document.removeEventListener("touchstart", handleInteraction);
            returnToMain();
          }
        };

        // Wait a bit for print dialog to open, then listen for interaction
        setTimeout(() => {
          document.addEventListener("click", handleInteraction);
          document.addEventListener("touchstart", handleInteraction);
        }, 500); // Wait 500ms for print dialog to open
      }, 500);

      return;
    }

    // Safari workaround (both desktop and mobile)
    if (isSafari) {
      // First, generate the aspectarian to get its HTML (skip for triwheel and graph reports)
      let aspectarianHTML = "";
      if (!window.isTriwheelReport && !window.isGraphReport) {
        // For synastry reports, use synastry aspectarian (Person 1 vs Person 2)
        // Filter out custom points from report aspectarian
        if (window.isSynastryReport) {
          const filteredPerson1 =
            window.person1Planets?.filter((p) => !p.isCustomPoint) || [];
          const filteredSynastry =
            window.synastryPlanets?.filter((p) => !p.isCustomPoint) || [];
          showAspectarianSynastry(filteredPerson1, filteredSynastry);
        } else {
          const filteredPlanets =
            window.natalPlanets?.filter((p) => !p.isCustomPoint) || [];
          showAspectarian(filteredPlanets);
        }
        const tooltip = document.querySelector("#tooltip");
        aspectarianHTML =
          tooltip?.querySelector(".planet-tooltip-instance .tooltip-content")
            ?.outerHTML || "";
        // Hide the tooltip after capturing
        if (tooltip) tooltip.style.opacity = "0";
      }

      // Create report content
      const report = document.createElement("div");
      report.id = "reportDescriptions";
      report.style.padding = "20px";
      report.style.fontSize = "20px";
      report.style.lineHeight = "1.4em";

      // Add planet descriptions first (exclude custom points from report)
      if (window.natalPlanets?.length > 0) {
        const sortedPlanets = getUniqueReportPlanets(window.natalPlanets)
          .filter((p) => !p.isCustomPoint)
          .sort((a, b) => {
            const aKey = a.name.toLowerCase();
            const bKey = b.name.toLowerCase();
            if (aKey === "ascendant symbol") return -1;
            if (bKey === "ascendant symbol") return 1;
            return 0;
          });

        let currentSection = null;
        sortedPlanets.forEach((planet) => {
          // Handle graph items differently
          if (planet.isGraphItem) {
            const monthNames = [
              "January",
              "February",
              "March",
              "April",
              "May",
              "June",
              "July",
              "August",
              "September",
              "October",
              "November",
              "December",
            ];
            const dateStr = planet.date
              ? `${planet.date.day} ${monthNames[planet.date.month - 1]} ${
                  planet.date.year
                }`
              : "";
            const chartTypeLabel =
              planet.chartType === "transit" ? "Transiting" : "Progressed";

            if (planet.itemType === "aspect") {
              const planet1Key = planet.name.toLowerCase().replace(/\s+/g, " ");
              const planet2Key = planet.planet2
                .toLowerCase()
                .replace(/\s+/g, " ");
              const aspectType = planet.aspectType.toLowerCase();

              const description =
                planetAspectDescriptions[planet1Key]?.[planet2Key]?.[
                  aspectType
                ] ||
                planetAspectDescriptions[planet2Key]?.[planet1Key]?.[
                  aspectType
                ] ||
                "No description available";

              const aspectTypeDisplay =
                planet.aspectType.charAt(0).toUpperCase() +
                planet.aspectType.slice(1);

              // Determine planet2 type label (like "Natal", "Transiting", etc.)
              let planet2TypeLabel = "";
              if (planet.planet2Type === "natal") {
                planet2TypeLabel = "Natal ";
              } else if (planet.planet2Type === "transit") {
                planet2TypeLabel = "Transiting ";
              } else if (planet.planet2Type === "progressed") {
                planet2TypeLabel = "Progressed ";
              }

              // Only show orb for non-graph reports (graph items don't have orb)
              const orbText =
                planet.orb !== undefined
                  ? ` (${Math.floor(planet.orb)}° ${Math.round(
                      (planet.orb - Math.floor(planet.orb)) * 60,
                    )}')`
                  : "";

              const planet1IconFile = planet1Key.replace(/[\s-]+/g, "");
              const planet2IconFile = planet2Key.replace(/[\s-]+/g, "");
              const planet1ImageSrc =
                planetImageCache[planet1IconFile] ||
                `/images/planets/${planet1IconFile}.svg`;
              const planet2ImageSrc =
                planetImageCache[planet2IconFile] ||
                `/images/planets/${planet2IconFile}.svg`;
              const aspectImageSrc = `/images/aspects/${aspectType}.svg`;

              report.innerHTML += `
                <div style="margin-bottom: 48px;">
                  <h2 style="margin: 0 0 12px 0; font-size: 24px; font-weight: bold; display: flex; align-items: center; gap: 10px;">
                    <img src="${planet1ImageSrc}" alt="${
                      planet.name
                    }" width="36" height="36" style="margin-left: -4px; margin-right: -4px;" />
                    ${chartTypeLabel} ${planet.name}
                    <img src="${aspectImageSrc}" alt="${aspectTypeDisplay}" width="30" height="30" style="margin: 0 -4px;" />
                    <img src="${planet2ImageSrc}" alt="${
                      planet.planet2
                    }" width="36" height="36" style="margin-left: -4px; margin-right: -4px;" />
                    ${planet2TypeLabel}${planet.planet2}${orbText}
                  </h2>
                  <p style="margin: 0;"><strong>${aspectTypeDisplay}:</strong> ${description}</p>
                  ${
                    dateStr
                      ? `<p style="margin: 6px 0 0 0; font-size: 16px; color: #666;">Exact: ${dateStr}</p>`
                      : ""
                  }
                </div>
              `;
            } else if (planet.itemType === "house_ingress") {
              const planetKey = planet.name.toLowerCase().replace(/\s+/g, " ");
              const houseDescriptions =
                planet.chartType === "progressed"
                  ? progressedPlanetHouseDescriptions
                  : transitPlanetHouseDescriptions;
              const description =
                houseDescriptions[planetKey]?.[planet.house] ||
                "No description available";

              const planetIconFile = planetKey.replace(/[\s-]+/g, "");
              const planetImageSrc =
                planetImageCache[planetIconFile] ||
                `/images/planets/${planetIconFile}.svg`;

              report.innerHTML += `
                <div style="margin-bottom: 48px;">
                  <h2 style="margin: 0 0 12px 0; font-size: 24px; font-weight: bold; display: flex; align-items: center; gap: 10px;">
                    <img src="${planetImageSrc}" alt="${
                      planet.name
                    }" width="36" height="36" style="margin-left: -4px; margin-right: -4px;" />
                    ${chartTypeLabel} ${planet.name} in House ${planet.house}
                  </h2>
                  <p style="margin: 0;">${description}</p>
                  ${
                    dateStr
                      ? `<p style="margin: 6px 0 0 0; font-size: 16px; color: #666;">Date: ${dateStr}</p>`
                      : ""
                  }
                </div>
              `;
            } else if (planet.itemType === "station") {
              const planetKey = planet.name.toLowerCase().replace(/\s+/g, " ");
              const description =
                graphPlanetRetroDescriptions[planetKey]?.station ||
                "No description available";

              const planetIconFile = planetKey.replace(/[\s-]+/g, "");
              const planetImageSrc =
                planetImageCache[planetIconFile] ||
                `/images/planets/${planetIconFile}.svg`;

              report.innerHTML += `
                <div style="margin-bottom: 48px;">
                  <h2 style="margin: 0 0 12px 0; font-size: 24px; font-weight: bold; display: flex; align-items: center; gap: 10px;">
                    <img src="${planetImageSrc}" alt="${
                      planet.name
                    }" width="36" height="36" style="margin-left: -4px; margin-right: -4px;" />
                    ${chartTypeLabel} ${planet.name} Station
                  </h2>
                  <p style="margin: 0;">${description}</p>
                  ${
                    dateStr
                      ? `<p style="margin: 6px 0 0 0; font-size: 16px; color: #666;">Date: ${dateStr}</p>`
                      : ""
                  }
                </div>
              `;
            } else if (planet.itemType === "sign_ingress") {
              const planetKey = planet.name.toLowerCase().replace(/\s+/g, " ");
              const planetIconFile = planetKey.replace(/[\s-]+/g, "");
              const planetImageSrc =
                planetImageCache[planetIconFile] ||
                `/images/planets/${planetIconFile}.svg`;

              report.innerHTML += `
                <div style="margin-bottom: 48px;">
                  <h2 style="margin: 0 0 12px 0; font-size: 24px; font-weight: bold; display: flex; align-items: center; gap: 10px;">
                    <img src="${planetImageSrc}" alt="${
                      planet.name
                    }" width="36" height="36" style="margin-left: -4px; margin-right: -4px;" />
                    ${chartTypeLabel} ${planet.name} enters ${planet.sign}
                  </h2>
                  ${
                    dateStr
                      ? `<p style="margin: 6px 0 0 0; font-size: 16px; color: #666;">Date: ${dateStr}</p>`
                      : ""
                  }
                </div>
              `;
            }
            return; // Skip the regular planet handling
          }

          // Add section header if reportSection changes
          if (planet.reportSection && planet.reportSection !== currentSection) {
            currentSection = planet.reportSection;
            report.innerHTML += `
              <h2 style="margin: 24px 0 24px; font-size: 24px; font-weight: bold; page-break-before: always;">
                ${currentSection}
              </h2>
            `;
          }

          let planetKey = planet.name.toLowerCase();
          let displayName = planet.name;
          if (planetKey === "ascendant symbol") {
            planetKey = "ascendant";
            displayName = "Ascendant";
          } else if (planetKey === "descendant symbol") {
            planetKey = "descendant";
            displayName = "Descendant";
          }

          // Select appropriate description set based on chart type
          const chartType = planet.chartType || "natal";
          let signDescriptions = planetSignDescriptions;
          let houseDescriptions = planetHouseDescriptions;
          if (chartType === "progressed") {
            signDescriptions = progressedPlanetSignDescriptions;
            houseDescriptions = progressedPlanetHouseDescriptions;
          } else if (chartType === "transit") {
            signDescriptions = transitPlanetSignDescriptions;
            houseDescriptions = transitPlanetHouseDescriptions;
          } else if (chartType === "solar_return") {
            signDescriptions = solarReturnPlanetSignDescriptions;
            houseDescriptions = solarReturnPlanetHouseDescriptions;
          } else if (chartType === "lunar_return") {
            signDescriptions = lunarReturnPlanetSignDescriptions;
            houseDescriptions = lunarReturnPlanetHouseDescriptions;
          } else if (chartType === "synastry") {
            signDescriptions = synastryPlanetSignDescriptions;
            houseDescriptions = synastryPlanetHouseDescriptions;
          } else if (chartType === "composite") {
            signDescriptions = compositePlanetSignDescriptions;
            houseDescriptions = compositePlanetHouseDescriptions;
          }

          const signKey = planet.sign.toLowerCase();
          const signDesc =
            signDescriptions[planetKey]?.[signKey] ||
            "No description available";

          const isAngle =
            planetKey === "ascendant" ||
            planetKey === "descendant" ||
            planetKey === "midheaven" ||
            planetKey === "imum coeli";

          // Use houseNatal (natal-relative house) if available, otherwise use house
          const houseToUse = planet.houseNatal || planet.house;

          const houseLabel =
            !isAngle && houseToUse ? `House ${houseToUse}` : "";

          const fullLabel =
            houseLabel !== ""
              ? `${displayName} in ${planet.sign} ${houseLabel}`
              : `${displayName} in ${planet.sign}`;

          // Skip sign description for Galactic Center (doesn't change signs)
          const signLine =
            planetKey === "galactic center"
              ? ""
              : `<strong>${displayName} in ${planet.sign}:</strong> ${signDesc}`;

          const houseLine =
            !isAngle && houseToUse && houseDescriptions[planetKey]?.[houseToUse]
              ? `<strong>${displayName} in House ${houseToUse}:</strong> ${houseDescriptions[planetKey][houseToUse]}`
              : "";

          const planetIconFile =
            planetKey === "ascendant"
              ? "ascendantsymbol"
              : planetKey.replace(/[\s-]+/g, "");

          const planetImageSrc =
            planetImageCache[planetIconFile] ||
            `/images/planets/${planetIconFile}.svg`;

          report.innerHTML += `
            <div style="margin-bottom: 48px;">
              <h2 style="margin: 0 0 12px 0; font-size: 24px; font-weight: bold; display: flex; align-items: center; gap: 10px;">
                <img src="${planetImageSrc}" alt="${displayName}" width="36" height="36" style="margin-left: -4px; margin-right: -4px;" />
                ${fullLabel}
              </h2>
              ${
                signLine ? `<p style="margin: 0 0 12px 0;">${signLine}</p>` : ""
              }
              ${houseLine ? `<p style="margin: 0;">${houseLine}</p>` : ""}
            </div>
          `;
        });
      }

      // Add aspect descriptions (skip for graph reports)
      if (!window.isGraphReport) {
        const aspectDescHTML = window.isSynastryReport
          ? generateSynastryAspectDescriptionsHTML()
          : generateAspectDescriptionsHTML();
        if (aspectDescHTML) {
          report.innerHTML += aspectDescHTML;
        }
      }

      // Add aspectarian visual at the end
      if (aspectarianHTML) {
        report.innerHTML += `
          <h2 style="margin: 48px 0 12px; font-size: 24px; font-weight: bold; page-break-before: always;">Aspectarian</h2>
          ${aspectarianHTML}
        `;
      }

      // Use pre-opened window if provided, otherwise open new one
      const printWindow =
        preOpenedWindow ||
        window.open("", "PrintChart", "width=1000,height=1200");
      if (printWindow) {
        // Clear the loading message if using pre-opened window
        if (preOpenedWindow) {
          printWindow.document.open();
        }
        // Clone the chart
        const chartClone = chartContainer.cloneNode(true);
        chartClone
          .querySelectorAll("#reportDescriptions")
          .forEach((previousReport) => previousReport.remove());

        // Make birth-details and system-details visible
        // These are SVG elements, so we need to remove display:none and set visibility
        const birthDetails = chartClone.querySelectorAll(
          ".birth-details, .birth-details-left, .birth-details-right, .birth-details-center",
        );
        const systemDetails = chartClone.querySelectorAll(".system-details");
        birthDetails.forEach((el) => {
          el.style.removeProperty("display");
          el.setAttribute("visibility", "visible");
          el.style.opacity = "1";
        });
        systemDetails.forEach((el) => {
          el.style.removeProperty("display");
          el.setAttribute("visibility", "visible");
          el.style.opacity = "1";
        });

        // For synastry and composite, extend the viewBox upward to show title (like safariPrintView.js does)
        if (
          window.isSynastryReport ||
          window.isCompositeReport ||
          window.isCompositeBlankReport
        ) {
          const svgElement = chartClone.querySelector("svg");
          if (svgElement) {
            const currentViewBox = svgElement.getAttribute("viewBox");
            if (currentViewBox) {
              const parts = currentViewBox.split(" ");
              const x = parseFloat(parts[0]);
              const y = parseFloat(parts[1]) - 180; // Extend top to show title
              const width = parseFloat(parts[2]);
              const height = parseFloat(parts[3]) + 180; // Balance by extending height
              svgElement.setAttribute(
                "viewBox",
                `${x} ${y} ${width} ${height}`,
              );
            }
          }
        }

        // Build the print document
        printWindow.document.write(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>Print Report</title>
            <link rel="stylesheet" href="/css/styles.css">
            <style>
              body { 
                margin: 0; 
                padding: 20px;
                ${
                  isMobileDevice
                    ? ""
                    : `
                display: flex;
                flex-direction: column;
                justify-content: center;
                align-items: center;
                min-height: 100vh;
                `
                }
              }
              #natal-chart, #triwheel-chart, #return-chart, #synastry-chart, #composite-chart, #composite-chart-blank, #graph {
                position: static !important;
                display: block !important;
                width: 100% !important;
                max-width: 100% !important;
                ${
                  !isMobileDevice
                    ? window.isGraphReport
                      ? "transform: scale(0.8); transform-origin: top center; margin: 0 auto 50px auto;"
                      : "transform: scale(0.8); transform-origin: center; margin: -10% auto 50px auto;"
                    : "margin-bottom: 50px;"
                }
              }
              ${
                !isMobileDevice &&
                (window.isSynastryReport ||
                  window.isCompositeReport ||
                  window.isCompositeBlankReport)
                  ? `
              #synastry-chart .birth-details text,
              #synastry-chart .birth-details-left text,
              #synastry-chart .birth-details-right text,
              #synastry-chart .birth-details-center text,
              #composite-chart .birth-details text,
              #composite-chart .birth-details-left text,
              #composite-chart .birth-details-right text,
              #composite-chart .birth-details-center text,
              #composite-chart-blank .birth-details text,
              #composite-chart-blank .birth-details-left text,
              #composite-chart-blank .birth-details-right text,
              #composite-chart-blank .birth-details-center text {
                font-size: 24px !important;
              }
              `
                  : ""
              }
              #graph {
                ${
                  window.isGraphReport
                    ? "max-height: none; margin-bottom: 100px;"
                    : "max-height: 800px;"
                }
                overflow: visible;
                page-break-inside: avoid;
              }
              ${
                window.isGraphReport
                  ? `
              #reportDescriptions {
                margin-top: 50px;
                padding-top: 50px;
                border-top: 2px solid #ccc;
              }
              `
                  : ""
              }
              ${
                !isMobileDevice
                  ? `
              @media print {
                #natal-chart, #triwheel-chart, #return-chart, #synastry-chart, #composite-chart, #composite-chart-blank, #graph {
                  transform: scale(0.9);
                  ${
                    window.isGraphReport
                      ? "transform-origin: top center; margin: 0 auto 50px auto;"
                      : "margin: -5% auto 50px auto;"
                  }
                }
                ${
                  window.isSynastryReport ||
                  window.isCompositeReport ||
                  window.isCompositeBlankReport
                    ? `
                #synastry-chart .birth-details text,
                #synastry-chart .birth-details-left text,
                #synastry-chart .birth-details-right text,
                #synastry-chart .birth-details-center text,
                #composite-chart .birth-details text,
                #composite-chart .birth-details-left text,
                #composite-chart .birth-details-right text,
                #composite-chart .birth-details-center text,
                #composite-chart-blank .birth-details text,
                #composite-chart-blank .birth-details-left text,
                #composite-chart-blank .birth-details-right text,
                #composite-chart-blank .birth-details-center text {
                  font-size: 24px !important;
                }
                `
                    : ""
                }
                ${
                  window.isGraphReport
                    ? `
                #graph {
                  max-height: none;
                  page-break-after: always;
                  margin-bottom: 0;
                }
                #reportDescriptions {
                  page-break-before: always;
                }
                `
                    : `
                #graph {
                  max-height: 750px;
                  page-break-after: always;
                }
                `
                }
              }
              `
                  : ""
              }
              ${
                isMobileDevice
                  ? `
              /* Mobile Safari specific adjustments */
              ${
                window.isGraphReport
                  ? `
              /* Prevent graph report descriptions from bleeding into graph on mobile Safari */
              #graph {
                margin-bottom: 50px;
              }
              #reportDescriptions {
                margin-top: 50px;
                padding-top: 50px;
                border-top: 2px solid #ccc;
              }
              `
                  : ""
              }
              @media print {
                #natal-chart svg, #triwheel-chart svg, #return-chart svg {
                  margin-top: -4%;
                  margin-bottom: -4%;
                  transform: scale(0.9);
                  transform-origin: center;
                }
                ${
                  window.isGraphReport
                    ? `
                /* Prevent graph report descriptions from bleeding into graph on mobile Safari print */
                #graph {
                  page-break-after: always;
                  margin-bottom: 0;
                }
                #reportDescriptions {
                  page-break-before: always;
                  margin-top: 100px;
                }
                `
                    : ""
                }
              }
              `
                  : ""
              }
              /* Always show birth and system details (SVG elements) */
              .birth-details, .birth-details-left, .birth-details-right, .birth-details-center,
              .system-details { 
                display: block !important; 
                visibility: visible !important;
                opacity: 1 !important;
              }
              /* Scale down report content slightly */
              #reportDescriptions {
                transform: scale(0.85);
                transform-origin: top center;
              }
              /* Make aspectarian grid smaller */
              .tooltip-content {
                transform: scale(0.75);
                transform-origin: top left;
                margin-bottom: -20%; /* Negative margin to compensate for scale */
              }
              @media print {
                /* Reset layout for proper print pagination */
                body {
                  display: block !important;
                  min-height: 0 !important;
                }
                body * { visibility: visible !important; }
                #reportDescriptions {
                  transform: none !important; /* Remove scale - it breaks pagination */
                  font-size: 16px; /* Reduce font size instead of scaling */
                  ${isMobileDevice ? "margin-top: 128px !important;" : ""}
                }
              }
              /* Close button */
              .close-window-button {
                position: fixed;
                top: 12px;
                right: 10px;
                padding: 12px 24px;
                background-color: #666;
                color: white;
                border: none;
                border-radius: 6px;
                font-size: 16px;
                font-weight: bold;
                cursor: pointer;
                z-index: 10000;
                box-shadow: 0 2px 8px rgba(0,0,0,0.2);
              }
              .close-window-button:hover {
                background-color: #555;
              }
              @media print {
                .close-window-button { display: none !important; }
              }
              /* Print button for Safari */
              .print-trigger-button {
                position: fixed;
                top: 66px;
                right: 10px;
                padding: 12px 24px;
                background-color: #4A90E2;
                color: white;
                border: none;
                border-radius: 6px;
                font-size: 16px;
                font-weight: bold;
                cursor: pointer;
                z-index: 10000;
                box-shadow: 0 2px 8px rgba(0,0,0,0.2);
              }
              .print-trigger-button:hover {
                background-color: #357ABD;
              }
              @media print {
                .print-trigger-button { display: none !important; }
              }
              ${
                isMobileDevice
                  ? `
              /* Larger buttons for Safari mobile */
              .close-window-button,
              .print-trigger-button {
                padding: 16px 32px !important;
                font-size: 20px !important;
              }
              
              .print-trigger-button {
                top: 80px !important;
              }
              `
                  : ""
              }
            </style>
          </head>
          <body>
            <button class="close-window-button" onclick="if(window.opener){window.opener.focus();}window.close()">Close View</button>
            <button class="print-trigger-button" onclick="window.print()">Print View</button>
            ${chartClone.outerHTML}
            ${report.outerHTML}
            <script>
              // Auto-close after print
              window.onafterprint = function() {
                window.close();
              };
              // Also close on Escape key
              document.addEventListener('keydown', function(e) {
                if (e.key === 'Escape') {
                  window.close();
                }
              });
            </script>
          </body>
          </html>
        `);
        printWindow.document.close();

        // For Safari, don't auto-print - user must click the "Tap to Print" button
        // This allows printing to work in PWAs where auto-print is blocked
      }
      return;
    }

    // Save original inline styles to restore later
    const originalStyles = {
      position: chartContainer.style.position,
      transform: chartContainer.style.transform,
    };

    // Compute how far from top the chart is visually
    const offsetTop =
      chartContainer.getBoundingClientRect().top + window.scrollY;

    // Shift the chart upward to remove top print gap
    chartContainer.style.position = "relative";
    const extraOffset = -500;
    chartContainer.style.transform = `translateY(-${
      offsetTop + extraOffset
    }px)`;

    // Add report block at the end
    const report = document.createElement("div");
    report.id = "reportDescriptions";
    report.style.marginTop = window.isTriwheelReport ? "0px" : "100px";
    report.style.padding = "20px";
    report.style.fontSize = "20px";
    report.style.lineHeight = "1.4em";

    if (window.natalPlanets?.length > 0) {
      // For graph reports, keep exact order - do NOT sort
      // Exclude custom points from report
      const sortedPlanets = window.isGraphReport
        ? getUniqueReportPlanets(window.natalPlanets).filter(
            (p) => !p.isCustomPoint,
          )
        : getUniqueReportPlanets(window.natalPlanets)
            .filter((p) => !p.isCustomPoint)
            .sort((a, b) => {
              const aKey = a.name.toLowerCase();
              const bKey = b.name.toLowerCase();

              if (aKey === "ascendant symbol") return -1;
              if (bKey === "ascendant symbol") return 1;
              return 0;
            });

      let currentSection = null;
      sortedPlanets.forEach((planet) => {
        // Handle graph items differently
        if (planet.isGraphItem) {
          const monthNames = [
            "January",
            "February",
            "March",
            "April",
            "May",
            "June",
            "July",
            "August",
            "September",
            "October",
            "November",
            "December",
          ];

          // Format all transits - mirror the graph exactly
          let datesStr = "";
          if (planet.transits && planet.transits.length > 0) {
            if (planet.itemType === "house_ingress") {
              // For house ingresses: alternate ingress/egress
              datesStr = planet.transits
                .map((transit, index) => {
                  const label = index % 2 === 0 ? "ingress" : "egress";
                  return `${label}: ${transit.date.day} ${
                    monthNames[transit.date.month - 1]
                  } ${transit.date.year}`;
                })
                .join(", ");
            } else if (planet.itemType === "station") {
              // For stations: use stationType (direct/retrograde) instead of contact
              datesStr = planet.transits
                .map((transit) => {
                  const label = transit.stationType || transit.contact;
                  return `${label}: ${transit.date.day} ${
                    monthNames[transit.date.month - 1]
                  } ${transit.date.year}`;
                })
                .join(", ");
            } else {
              // For all other types: use contact type as-is (replace "start" with "orb")
              // If exact contacts exist, exclude orb contacts
              const hasExact = planet.transits.some(
                (t) => t.contact === "exact",
              );
              datesStr = planet.transits
                .filter((transit) => {
                  // If exact exists, filter out orb/start/end contacts
                  if (hasExact) {
                    return transit.contact === "exact";
                  }
                  return true;
                })
                .map((transit) => {
                  const label =
                    transit.contact === "start" || transit.contact === "end"
                      ? "orb"
                      : transit.contact;
                  return `${label}: ${transit.date.day} ${
                    monthNames[transit.date.month - 1]
                  } ${transit.date.year}`;
                })
                .join(", ");
            }
          }

          const chartTypeLabel =
            planet.chartType === "transit" ? "Transiting" : "Progressed";

          if (planet.itemType === "aspect") {
            const planet1Key = planet.name.toLowerCase().replace(/\s+/g, " ");
            const planet2Key = planet.planet2
              .toLowerCase()
              .replace(/\s+/g, " ");
            const aspectType = planet.aspectType.toLowerCase();

            const description =
              planetAspectDescriptions[planet1Key]?.[planet2Key]?.[
                aspectType
              ] ||
              planetAspectDescriptions[planet2Key]?.[planet1Key]?.[
                aspectType
              ] ||
              "No description available";

            const aspectTypeDisplay =
              planet.aspectType.charAt(0).toUpperCase() +
              planet.aspectType.slice(1);

            // Determine planet2 type label
            let planet2TypeLabel = "";
            if (planet.planet2Type === "natal") {
              planet2TypeLabel = "Natal ";
            } else if (planet.planet2Type === "transit") {
              planet2TypeLabel = "Transiting ";
            } else if (planet.planet2Type === "progressed") {
              planet2TypeLabel = "Progressed ";
            }

            let planet1IconFile = planet1Key.replace(/[\s-]+/g, "");
            if (planet1IconFile === "ascendant")
              planet1IconFile = "ascendantsymbol";

            let planet2IconFile = planet2Key.replace(/[\s-]+/g, "");
            if (planet2IconFile === "ascendant")
              planet2IconFile = "ascendantsymbol";

            const planet1ImageSrc =
              planetImageCache[planet1IconFile] ||
              `/images/planets/${planet1IconFile}.svg`;
            const planet2ImageSrc =
              planetImageCache[planet2IconFile] ||
              `/images/planets/${planet2IconFile}.svg`;
            const aspectImageSrc = `/images/aspects/${aspectType}.svg`;

            report.innerHTML += `
              <div style="margin-bottom: 48px;">
                <h2 style="margin: 0 0 12px 0; font-size: 24px; font-weight: bold; display: flex; align-items: center; gap: 10px;">
                  <img src="${planet1ImageSrc}" alt="${
                    planet.name
                  }" width="36" height="36" style="margin-left: -4px; margin-right: -4px;" />
                  ${chartTypeLabel} ${planet.name}
                  <img src="${aspectImageSrc}" alt="${aspectTypeDisplay}" width="30" height="30" style="margin: 0 -4px;" />
                  <img src="${planet2ImageSrc}" alt="${
                    planet.planet2
                  }" width="36" height="36" style="margin-left: -4px; margin-right: -4px;" />
                  ${planet2TypeLabel}${planet.planet2}
                </h2>
                <p style="margin: 0;"><strong>${aspectTypeDisplay}:</strong> ${description}</p>
                ${
                  datesStr
                    ? `<p style="margin: 6px 0 0 0; font-size: 16px; color: #666;">${datesStr}</p>`
                    : ""
                }
              </div>
            `;
          } else if (planet.itemType === "house_ingress") {
            const planetKey = planet.name.toLowerCase().replace(/\s+/g, " ");
            const houseDescriptions =
              planet.chartType === "progressed"
                ? progressedPlanetHouseDescriptions
                : transitPlanetHouseDescriptions;
            const description =
              houseDescriptions[planetKey]?.[planet.house] ||
              "No description available";

            const planetIconFile = planetKey.replace(/[\s-]+/g, "");
            const planetImageSrc =
              planetImageCache[planetIconFile] ||
              `/images/planets/${planetIconFile}.svg`;

            report.innerHTML += `
              <div style="margin-bottom: 48px;">
                <h2 style="margin: 0 0 12px 0; font-size: 24px; font-weight: bold; display: flex; align-items: center; gap: 10px;">
                  <img src="${planetImageSrc}" alt="${
                    planet.name
                  }" width="36" height="36" style="margin-left: -4px; margin-right: -4px;" />
                  ${chartTypeLabel} ${planet.name} in House ${planet.house}
                </h2>
                <p style="margin: 0;">${description}</p>
                ${
                  datesStr
                    ? `<p style="margin: 6px 0 0 0; font-size: 16px; color: #666;">${datesStr}</p>`
                    : ""
                }
              </div>
            `;
          } else if (planet.itemType === "station") {
            const planetKey = planet.name.toLowerCase().replace(/\s+/g, " ");
            const description =
              graphPlanetRetroDescriptions[planetKey]?.station ||
              "No description available";

            const planetIconFile = planetKey.replace(/[\s-]+/g, "");
            const planetImageSrc =
              planetImageCache[planetIconFile] ||
              `/images/planets/${planetIconFile}.svg`;

            report.innerHTML += `
              <div style="margin-bottom: 48px;">
                <h2 style="margin: 0 0 12px 0; font-size: 24px; font-weight: bold; display: flex; align-items: center; gap: 10px;">
                  <img src="${planetImageSrc}" alt="${
                    planet.name
                  }" width="36" height="36" style="margin-left: -4px; margin-right: -4px;" />
                  ${chartTypeLabel} ${planet.name} Station
                </h2>
                <p style="margin: 0;">${description}</p>
                ${
                  datesStr
                    ? `<p style="margin: 6px 0 0 0; font-size: 16px; color: #666;">${datesStr}</p>`
                    : ""
                }
              </div>
            `;
          } else if (planet.itemType === "sign_ingress") {
            const planetKey = planet.name.toLowerCase().replace(/\s+/g, " ");
            const planetIconFile = planetKey.replace(/[\s-]+/g, "");
            const planetImageSrc =
              planetImageCache[planetIconFile] ||
              `/images/planets/${planetIconFile}.svg`;

            report.innerHTML += `
              <div style="margin-bottom: 48px;">
                <h2 style="margin: 0 0 12px 0; font-size: 24px; font-weight: bold; display: flex; align-items: center; gap: 10px;">
                  <img src="${planetImageSrc}" alt="${
                    planet.name
                  }" width="36" height="36" style="margin-left: -4px; margin-right: -4px;" />
                  ${chartTypeLabel} ${planet.name} enters ${planet.sign}
                </h2>
                ${
                  datesStr
                    ? `<p style="margin: 6px 0 0 0; font-size: 16px; color: #666;">${datesStr}</p>`
                    : ""
                }
              </div>
            `;
          }
          return; // Skip the regular planet handling
        }

        // Add section header if reportSection changes
        if (planet.reportSection && planet.reportSection !== currentSection) {
          currentSection = planet.reportSection;
          report.innerHTML += `
            <h2 style="margin: 24px 0 24px; font-size: 24px; font-weight: bold; page-break-before: always;">
              ${currentSection}
            </h2>
          `;
        }

        let planetKey = planet.name.toLowerCase();
        let displayName = planet.name;
        if (planetKey === "ascendant symbol") {
          planetKey = "ascendant";
          displayName = "Ascendant";
        } else if (planetKey === "descendant symbol") {
          planetKey = "descendant";
          displayName = "Descendant";
        }

        // Select appropriate description set based on chart type
        const chartType = planet.chartType || "natal";
        let signDescriptions = planetSignDescriptions;
        let houseDescriptions = planetHouseDescriptions;
        if (chartType === "progressed") {
          signDescriptions = progressedPlanetSignDescriptions;
          houseDescriptions = progressedPlanetHouseDescriptions;
        } else if (chartType === "transit") {
          signDescriptions = transitPlanetSignDescriptions;
          houseDescriptions = transitPlanetHouseDescriptions;
        } else if (chartType === "solar_return") {
          signDescriptions = solarReturnPlanetSignDescriptions;
          houseDescriptions = solarReturnPlanetHouseDescriptions;
        } else if (chartType === "lunar_return") {
          signDescriptions = lunarReturnPlanetSignDescriptions;
          houseDescriptions = lunarReturnPlanetHouseDescriptions;
        } else if (chartType === "synastry") {
          signDescriptions = synastryPlanetSignDescriptions;
          houseDescriptions = synastryPlanetHouseDescriptions;
        } else if (chartType === "composite") {
          signDescriptions = compositePlanetSignDescriptions;
          houseDescriptions = compositePlanetHouseDescriptions;
        }

        const signKey = planet.sign.toLowerCase();
        const signDesc =
          signDescriptions[planetKey]?.[signKey] || "No description available";

        const isAngle =
          planetKey === "ascendant" ||
          planetKey === "descendant" ||
          planetKey === "midheaven" ||
          planetKey === "imum coeli";

        // Use houseNatal (natal-relative house) if available, otherwise use house
        const houseToUse = planet.houseNatal || planet.house;

        const houseLabel = !isAngle && houseToUse ? `House ${houseToUse}` : "";

        const fullLabel =
          houseLabel !== ""
            ? `${displayName} in ${planet.sign} ${houseLabel}`
            : `${displayName} in ${planet.sign}`;

        // Skip sign description for Galactic Center (doesn't change signs)
        const signLine =
          planetKey === "galactic center"
            ? ""
            : `<strong>${displayName} in ${planet.sign}:</strong> ${signDesc}`;

        const houseLine =
          !isAngle && houseToUse && houseDescriptions[planetKey]?.[houseToUse]
            ? `<strong>${displayName} in House ${houseToUse}:</strong> ${houseDescriptions[planetKey][houseToUse]}`
            : "";

        const planetIconFile =
          planetKey === "ascendant"
            ? "ascendantsymbol"
            : planetKey.replace(/[\s-]+/g, "");

        // Use preloaded data URI if available, otherwise fallback to direct path
        const planetImageSrc =
          planetImageCache[planetIconFile] ||
          `/images/planets/${planetIconFile}.svg`;

        report.innerHTML += `
          <div style="margin-bottom: 48px;">
            <h2 style="margin: 0 0 12px 0; font-size: 24px; font-weight: bold; display: flex; align-items: center; gap: 10px;">
              <img src="${planetImageSrc}" alt="${displayName}" width="36" height="36" style="margin-left: -4px; margin-right: -4px;" />
              ${fullLabel}
            </h2>
            ${signLine ? `<p style="margin: 0 0 12px 0;">${signLine}</p>` : ""}
            ${houseLine ? `<p style="margin: 0;">${houseLine}</p>` : ""}
          </div>
        `;
      });
    } else {
      report.innerHTML = "<p>No planet data available.</p>";
    }

    // Add aspect descriptions (skip for graph reports)
    if (!window.isGraphReport) {
      const aspectDescHTML = window.isSynastryReport
        ? generateSynastryAspectDescriptionsHTML()
        : generateAspectDescriptionsHTML();
      if (aspectDescHTML) {
        report.innerHTML += aspectDescHTML;
      }
    }

    // For graph reports, add page break and extreme margin/padding solution
    if (window.isGraphReport) {
      // Remove any existing elements from previous runs
      const existingBreaks = chartContainer.querySelectorAll(
        ".graph-report-page-break",
      );
      existingBreaks.forEach((el) => el.remove());
      const existingStyles = document.querySelector(
        "#graph-report-print-styles",
      );
      if (existingStyles) existingStyles.remove();

      // Create page break element
      const pageBreak = document.createElement("div");
      pageBreak.className = "graph-report-page-break";
      pageBreak.style.cssText = `
        page-break-after: always;
        break-after: page;
        height: 1px;
        visibility: hidden;
        margin: 0;
        padding: 0;
      `;
      chartContainer.appendChild(pageBreak);

      // Add report with class for CSS targeting
      report.classList.add("graph-report-content");
      chartContainer.appendChild(report);

      // Add print styles with extreme margin/padding to force to top
      const printStyles = document.createElement("style");
      printStyles.id = "graph-report-print-styles";
      printStyles.textContent = `
        @media print {
          .graph-report-content {
            page-break-before: always !important;
            margin-top: -9999px !important;
            padding-top: 10040px !important;
            padding-left: 20px !important;
            padding-right: 20px !important;
            position: relative !important;
            transform: none !important;
          }
        }
      `;
      document.head.appendChild(printStyles);
    } else {
      chartContainer.appendChild(report);
    }

    // Aspectarian print (skip for triwheel and graph reports)
    if (!window.isTriwheelReport && !window.isGraphReport) {
      // build the aspectarian tooltip off–screen
      // For synastry reports, use synastry aspectarian (Person 1 vs Person 2)
      // Filter out custom points from report aspectarian
      if (window.isSynastryReport) {
        const filteredPerson1 =
          window.person1Planets?.filter((p) => !p.isCustomPoint) || [];
        const filteredSynastry =
          window.synastryPlanets?.filter((p) => !p.isCustomPoint) || [];
        showAspectarianSynastry(filteredPerson1, filteredSynastry);
      } else {
        const filteredPlanets =
          window.natalPlanets?.filter((p) => !p.isCustomPoint) || [];
        showAspectarian(filteredPlanets);
      }

      // clone just the inner matrix - only if it exists
      const aspectarianElement = document.querySelector(
        "#tooltip .planet-tooltip-instance .tooltip-content",
      );

      if (aspectarianElement) {
        const clonedAspect = aspectarianElement.cloneNode(true);

        // make a header for aspectarian
        const aspectarianHeader = document.createElement("h2");
        aspectarianHeader.textContent = "Aspectarian";
        aspectarianHeader.style.margin = "24px 0 12px";
        aspectarianHeader.style.fontSize = "24px";
        aspectarianHeader.style.fontWeight = "bold";
        aspectarianHeader.style.pageBreakBefore = "always";

        // append header + matrix at the end (after aspect descriptions)
        report.appendChild(aspectarianHeader);
        report.appendChild(clonedAspect);
      }
    }

    // Wait for all images in the report to load before printing
    setTimeout(async () => {
      await waitForImages(report);

      // Store cleanup function
      const cleanupReport = () => {
        // hide tooltip & restore styles
        const tooltip = document.querySelector("#tooltip");
        if (tooltip) {
          tooltip.style.opacity = 0;
          // Clear tooltip content to prevent invisible blocking elements
          tooltip.innerHTML = "";
        }

        // Restore original styles
        chartContainer.style.position = originalStyles.position;
        chartContainer.style.transform = originalStyles.transform;

        // Remove report
        if (report && report.parentNode) {
          report.remove();
        }

        // Cleanup graph report elements
        if (window.isGraphReport) {
          const pageBreaks = chartContainer.querySelectorAll(
            ".graph-report-page-break",
          );
          pageBreaks.forEach((el) => el.remove());
          const printStyles = document.querySelector(
            "#graph-report-print-styles",
          );
          if (printStyles) printStyles.remove();
        }
      };

      // Set up print event listeners for proper cleanup
      const handleAfterPrint = () => {
        // Clean up after print dialog closes
        cleanupReport();
        // Remove the event listeners
        window.removeEventListener("afterprint", handleAfterPrint);
        window.removeEventListener("focus", handleWindowFocus);
      };

      // Fallback for browsers that don't support afterprint (including some Safari versions)
      const handleWindowFocus = () => {
        // Small delay to ensure print dialog has closed
        setTimeout(() => {
          cleanupReport();
          window.removeEventListener("afterprint", handleAfterPrint);
          window.removeEventListener("focus", handleWindowFocus);
        }, 100);
      };

      // Listen for print completion
      window.addEventListener("afterprint", handleAfterPrint);

      // Fallback: Also listen for window focus (for Safari and other browsers)
      // This fires when the print dialog is dismissed
      window.addEventListener("focus", handleWindowFocus);

      // Start the print dialog
      window.print();

      // Ultimate fallback: Remove after 30 seconds if events never fire
      // This prevents memory leaks if user leaves dialog open indefinitely
      setTimeout(() => {
        if (report && report.parentNode) {
          cleanupReport();
          window.removeEventListener("afterprint", handleAfterPrint);
          window.removeEventListener("focus", handleWindowFocus);
        }
      }, 30000);
    }, 50);
  }
});

// Generate Triwheel Report
window.generateTriwheelReport = function (preOpenedWindow) {
  // Define planet orders based on requirements
  const progressedOrder = [
    "Sun",
    "Earth",
    "Moon",
    "Mercury",
    "Venus",
    "Mars",
    "Ascendant Symbol",
    "Midheaven",
    "Descendant",
    "Imum Coeli",
  ];
  const yearlyOrder = [
    "Jupiter",
    "Saturn",
    "Uranus",
    "Neptune",
    "Pluto",
    "Chiron",
    "North Node",
    "South Node",
    "Ceres",
    "Vesta",
    "Pallas",
    "Juno",
    "Lilith",
    "Priapus",
    "Part of Fortune",
    "Part of Spirit",
    "Vertex",
    "Anti-Vertex",
    // Galactic Center excluded - doesn't transit (stationary point)
  ];
  const monthlyOrder = ["Sun", "Earth", "Moon", "Mercury", "Venus", "Mars"];

  // Build organized planet lists (only activated planets)
  const progressedPlacements = progressedOrder
    .map((name) => window.progressedPlanets?.find((p) => p.name === name))
    .filter((p) => p);

  const yearlyPlacements = yearlyOrder
    .map((name) => window.transitPlanets?.find((p) => p.name === name))
    .filter((p) => p);

  const monthlyPlacements = monthlyOrder
    .map((name) => window.transitPlanets?.find((p) => p.name === name))
    .filter((p) => p);

  // Save original natalPlanets
  const originalNatalPlanets = window.natalPlanets;

  // Create combined list for report (no aspects, no section headers yet - we'll handle in rendering)
  const combinedPlanets = [
    ...progressedPlacements.map((p) => ({
      ...p,
      reportSection: "Progressed Placements",
      chartType: "progressed",
    })),
    ...yearlyPlacements.map((p) => ({
      ...p,
      reportSection: "Yearly Transits",
      chartType: "transit",
    })),
    ...monthlyPlacements.map((p) => ({
      ...p,
      reportSection: "Monthly Transits",
      chartType: "transit",
    })),
  ];

  window.natalPlanets = combinedPlanets;
  window.isTriwheelReport = true;

  // Call the existing generateReport function (defined in natalReport event listener scope)
  // We need to trigger the natal report generation programmatically
  const natalReportButton = document.getElementById("natalReport");
  if (natalReportButton) {
    // Temporarily store the pre-opened window and triwheel flag
    window.triwheelReportWindow = preOpenedWindow;
    natalReportButton.click();

    // Clean up after a delay
    setTimeout(() => {
      delete window.triwheelReportWindow;
      window.natalPlanets = originalNatalPlanets;
      window.isTriwheelReport = false;
    }, 2000);
  }
};

// Generate Return Report
window.generateReturnReport = function (preOpenedWindow) {
  // Determine the return type. Planetary returns (mercury_return etc.) have
  // no description sets yet, so they fall through to natal descriptions
  const adjustType = document.getElementById("adjustType")?.value || "Solar";
  const chartType = adjustType.toLowerCase() + "_return";

  // Define planet order in standard natal order
  const returnOrder = [
    "Sun",
    "Earth",
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
    "North Node",
    "South Node",
    "Ceres",
    "Vesta",
    "Pallas",
    "Juno",
    "Lilith",
    "Priapus",
    "Part of Fortune",
    "Part of Spirit",
    "Vertex",
    "Anti-Vertex",
    "Galactic Center",
    "Ascendant Symbol",
    "Midheaven",
    "Descendant",
    "Imum Coeli",
  ];

  // Build organized planet list (only activated planets in standard order)
  // Add chartType to each planet so report generation uses return descriptions
  const returnPlacements = returnOrder
    .map((name) => {
      const planet = window.returnPlanets?.find((p) => p.name === name);
      if (planet) {
        return {
          ...planet,
          chartType: chartType,
        };
      }
      return null;
    })
    .filter((p) => p);

  // Save original natalPlanets
  const originalNatalPlanets = window.natalPlanets;

  // Set window.natalPlanets to returnPlanets for report generation
  window.natalPlanets = returnPlacements;
  window.isReturnReport = true;

  // Call the existing generateReport function (defined in natalReport event listener scope)
  // We need to trigger the natal report generation programmatically
  const natalReportButton = document.getElementById("natalReport");
  if (natalReportButton) {
    // Temporarily store the pre-opened window and return flag
    window.returnReportWindow = preOpenedWindow;
    natalReportButton.click();

    // Clean up after a delay
    setTimeout(() => {
      delete window.returnReportWindow;
      window.natalPlanets = originalNatalPlanets;
      window.isReturnReport = false;
    }, 2000);
  }
};

// Generate Synastry Report
window.generateSynastryReport = function (preOpenedWindow) {
  // Define planet order in standard natal order
  const planetOrder = [
    "Sun",
    "Earth",
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
    "North Node",
    "South Node",
    "Ceres",
    "Vesta",
    "Pallas",
    "Juno",
    "Lilith",
    "Priapus",
    "Part of Fortune",
    "Part of Spirit",
    "Vertex",
    "Anti-Vertex",
    "Galactic Center",
    "Ascendant Symbol",
    "Midheaven",
    "Descendant",
    "Imum Coeli",
  ];

  // Build synastry planets (outer wheel only - Person 2 planets in Person 1's houses)
  // This matches what the user sees when clicking outer wheel planets
  const synastryPlacements = planetOrder
    .map((name) => {
      const planet = window.synastryPlanets?.find((p) => p.name === name);
      if (planet) {
        // Calculate houseNatal (Person 2's planet position in Person 1's houses)
        // This is the same calculation that happens when clicking outer wheel planets
        let houseNatal = planet.house; // Default to natal house
        if (window.chart1HouseCusps && window.calculateHousePosition) {
          houseNatal = window.calculateHousePosition(
            planet.position,
            window.chart1HouseCusps,
          );
        }

        return {
          ...planet,
          houseNatal: houseNatal, // Override with Chart 1 relative house position
          chartType: "synastry", // Use synastry descriptions
        };
      }
      return null;
    })
    .filter((p) => p);

  // Save original natalPlanets (Person 1) for synastry aspects and aspectarian
  const originalNatalPlanets = window.natalPlanets;
  window.person1Planets = originalNatalPlanets; // Store Person 1 for aspects calculation

  // Set window.natalPlanets to synastry planets for report generation
  window.natalPlanets = synastryPlacements;
  window.isSynastryReport = true;

  // Call the existing generateReport function (defined in natalReport event listener scope)
  // We need to trigger the natal report generation programmatically
  const natalReportButton = document.getElementById("natalReport");
  if (natalReportButton) {
    // Temporarily store the pre-opened window and synastry flag
    window.synastryReportWindow = preOpenedWindow;
    natalReportButton.click();

    // Clean up after a delay
    setTimeout(() => {
      delete window.synastryReportWindow;
      window.natalPlanets = originalNatalPlanets;
      window.isSynastryReport = false;
    }, 2000);
  }
};

// Generate Composite Report
window.generateCompositeReport = function (preOpenedWindow) {
  // Check if composite-chart-blank is visible (synastry not calculated yet)
  const blankChart = document.getElementById("composite-chart-blank");
  const compositeChart = document.getElementById("composite-chart");
  const isBlankComposite =
    blankChart &&
    blankChart.style.display !== "none" &&
    (!compositeChart || compositeChart.style.display === "none");

  // If using blank composite, use natal planets instead
  if (isBlankComposite) {
    // Don't set isCompositeReport flag for blank composite - use natal report
    // This will make generateReport use "composite-chart-blank" and natal descriptions
    window.isCompositeBlankReport = true;

    // Trigger the existing natal report mechanism
    const natalReportButton = document.getElementById("natalReport");
    if (natalReportButton) {
      window.compositeReportWindow = preOpenedWindow;
      natalReportButton.click();

      // Clean up after a delay
      setTimeout(() => {
        delete window.compositeReportWindow;
        window.isCompositeBlankReport = false;
      }, 2000);
    }
    return;
  }

  // Regular composite report (synastry has been calculated)
  // Define planet order in standard natal order
  const planetOrder = [
    "Sun",
    "Earth",
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
    "North Node",
    "South Node",
    "Ceres",
    "Vesta",
    "Pallas",
    "Juno",
    "Lilith",
    "Priapus",
    "Part of Fortune",
    "Part of Spirit",
    "Vertex",
    "Anti-Vertex",
    "Galactic Center",
    "Ascendant Symbol",
    "Midheaven",
    "Descendant",
    "Imum Coeli",
  ];

  // Build composite placements list
  const compositePlacements = planetOrder
    .map((name) => {
      const planet = window.compositePlanets?.find((p) => p.name === name);
      if (planet) {
        // Calculate correct house position using composite house cusps
        let compositeHouse = planet.house; // Default to existing house
        if (window.compositeHouseCusps && window.calculateHousePosition) {
          compositeHouse = window.calculateHousePosition(
            planet.position,
            window.compositeHouseCusps,
          );
        }

        return {
          ...planet,
          houseNatal: compositeHouse, // Use houseNatal to override the display house
          chartType: "composite",
        };
      }
      return null;
    })
    .filter((p) => p);

  // Save original natalPlanets
  const originalNatalPlanets = window.natalPlanets;

  // Set window.natalPlanets to composite planets for report generation
  window.natalPlanets = compositePlacements;
  window.isCompositeReport = true;

  // Call the existing generateReport function (defined in natalReport event listener scope)
  // We need to trigger the natal report generation programmatically
  const natalReportButton = document.getElementById("natalReport");
  if (natalReportButton) {
    // Temporarily store the pre-opened window and composite flag
    window.compositeReportWindow = preOpenedWindow;
    natalReportButton.click();

    // Clean up after a delay
    setTimeout(() => {
      delete window.compositeReportWindow;
      window.natalPlanets = originalNatalPlanets;
      window.isCompositeReport = false;
    }, 2000);
  }
};

window.generateGraphReport = function (preOpenedWindow) {
  // If no graph data, silently return (shows blank page like View button does)
  if (!window.graphGroupedAspects || window.graphGroupedAspects.length === 0) {
    if (preOpenedWindow) preOpenedWindow.close();
    return;
  }

  // Add title to graph SVG for report generation
  const graphElement = document.getElementById("graph");
  const svg = graphElement?.querySelector("svg");
  let addedTitle = false;
  let originalViewBox = null;

  if (svg && window.graphFormData?.natalData?.name) {
    // Store original viewBox
    originalViewBox = svg.getAttribute("viewBox");
    const viewBoxParts = originalViewBox.split(" ");
    const currentY = parseFloat(viewBoxParts[1]);
    const currentHeight = parseFloat(viewBoxParts[3]);

    // Check if mobile for responsive sizing
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    const titleSpace = isMobile ? 80 : 160;
    const titleYPosition = isMobile ? currentY - 40 : currentY - 80;
    const nameFontSize = isMobile ? "18px" : "52px";
    const dateFontSize = isMobile ? "14px" : "40px";
    const dateYOffset = isMobile ? "25" : "60";

    // Add space at top for title
    svg.setAttribute(
      "viewBox",
      `${viewBoxParts[0]} ${currentY - titleSpace} ${viewBoxParts[2]} ${
        currentHeight + titleSpace
      }`,
    );

    // Create title
    const natalData = window.graphFormData.natalData;
    const startDay = window.graphFormData.startDay || "";
    const startMonth = window.graphFormData.startMonth || "";
    const startYear = window.graphFormData.startYear || "";
    const startHour = (window.graphFormData.startHour || "00").padStart(2, "0");
    const startMinute = (window.graphFormData.startMinute || "00").padStart(
      2,
      "0",
    );
    const endDay = window.graphFormData.endDay || "";
    const endMonth = window.graphFormData.endMonth || "";
    const endYear = window.graphFormData.endYear || "";
    const endHour = (window.graphFormData.endHour || "00").padStart(2, "0");
    const endMinute = (window.graphFormData.endMinute || "00").padStart(2, "0");

    const titleGroup = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "g",
    );
    titleGroup.setAttribute("class", "temp-report-title");
    titleGroup.setAttribute(
      "transform",
      `translate(${parseFloat(viewBoxParts[2]) / 2}, ${titleYPosition})`,
    );

    // Add name
    const nameText = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "text",
    );
    nameText.setAttribute("text-anchor", "middle");
    nameText.setAttribute("font-family", "Segoe UI, sans-serif");
    nameText.setAttribute("font-size", nameFontSize);
    nameText.setAttribute("font-weight", "bold");
    nameText.setAttribute("fill", "#222");
    nameText.textContent = `${natalData.name} - Transit Graph`;
    titleGroup.appendChild(nameText);

    // Add dates
    const dateText = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "text",
    );
    dateText.setAttribute("y", dateYOffset);
    dateText.setAttribute("text-anchor", "middle");
    dateText.setAttribute("font-family", "Segoe UI, sans-serif");
    dateText.setAttribute("font-size", dateFontSize);
    dateText.setAttribute("fill", "#222");
    dateText.textContent = `${startDay} ${startMonth} ${startYear} ${startHour}:${startMinute} - ${endDay} ${endMonth} ${endYear} ${endHour}:${endMinute}`;
    titleGroup.appendChild(dateText);

    // Insert at beginning
    svg.insertBefore(titleGroup, svg.firstChild);
    addedTitle = true;
  }

  // Process graphGroupedAspects to create pseudo-planet objects
  // These will be used by the report generation system
  const graphReportItems = [];

  // Mirror the graph exactly - collect ALL transits for each grouped line
  window.graphGroupedAspects.forEach(([aspectText, aspects]) => {
    const firstAspect = aspects[0].aspect;

    // Determine item type
    const isStation =
      firstAspect.type === "Direct" || firstAspect.type === "Retrograde";
    const isIngress = firstAspect.type === "Ingress";

    // Collect ALL transits from ALL aspects in this grouped line
    const allTransits = [];
    aspects.forEach(({ aspect }) => {
      aspect.transits.forEach((transit) => {
        const transitData = {
          contact: transit.contact,
          date: transit.date,
        };

        // For stations, store whether this is direct or retrograde
        if (isStation) {
          transitData.stationType = aspect.type.toLowerCase(); // "direct" or "retrograde"
        }

        allTransits.push(transitData);
      });
    });

    // Get the moving planet (transiting or progressed)
    const movingPlanet =
      firstAspect.transitingPlanet || firstAspect.progressedPlanet;
    const isTransiting = !!firstAspect.transitingPlanet;
    const chartType = isTransiting ? "transit" : "progressed";

    // Create pseudo-planet object - store ALL transit data
    const graphItem = {
      name: movingPlanet,
      chartType: chartType,
      transits: allTransits,
      isGraphItem: true,
    };

    if (isStation) {
      graphItem.itemType = "station";
      // Don't store stationType in graphItem - it's now in each transit
    } else if (isIngress) {
      const target =
        firstAspect.natalPlanet ||
        firstAspect.transitingPlanet2 ||
        firstAspect.progressedPlanet2;
      const houseMatch = target?.match(/House (\d+)/);

      if (houseMatch) {
        graphItem.itemType = "house_ingress";
        graphItem.house = parseInt(houseMatch[1]);
      } else {
        graphItem.itemType = "sign_ingress";
        graphItem.sign = target;
      }
    } else {
      graphItem.itemType = "aspect";
      graphItem.planet2 =
        firstAspect.natalPlanet ||
        firstAspect.transitingPlanet2 ||
        firstAspect.progressedPlanet2;
      graphItem.aspectType = firstAspect.type;

      // Determine planet2 type
      if (firstAspect.natalPlanet) {
        graphItem.planet2Type = "natal";
      } else if (firstAspect.transitingPlanet2) {
        graphItem.planet2Type = "transit";
      } else if (firstAspect.progressedPlanet2) {
        graphItem.planet2Type = "progressed";
      }
    }

    graphReportItems.push(graphItem);
  });

  // Save original natalPlanets
  const originalNatalPlanets = window.natalPlanets;

  // Set window.natalPlanets to graph report items
  window.natalPlanets = graphReportItems;
  window.isGraphReport = true;

  // Call the existing generateReport function
  const natalReportButton = document.getElementById("natalReport");
  if (natalReportButton) {
    // Temporarily store the pre-opened window
    window.graphReportWindow = preOpenedWindow;
    natalReportButton.click();

    // Clean up after a delay
    setTimeout(() => {
      delete window.graphReportWindow;
      window.natalPlanets = originalNatalPlanets;
      window.isGraphReport = false;

      // Remove temporary title from SVG
      if (addedTitle && svg) {
        if (originalViewBox) {
          svg.setAttribute("viewBox", originalViewBox);
        }
        const tempTitle = svg.querySelector(".temp-report-title");
        if (tempTitle) tempTitle.remove();
      }
    }, 2000);
  }
};
