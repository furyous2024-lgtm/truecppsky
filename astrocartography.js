"use strict";

// Astrocartography client module
// ------------------------------------------------------------------
// On Calculate:
//   1. Read SETTINGS planet checkboxes (filtered to PLANET_COLORS keys)
//   2. Read MAIN natal form fields (name/date/time/location)
//   3. POST /astrocartography -> { gmst, planets: [{name, ra, dec}] }
//   4. Load /images/misc/world-map.svg into #astro-map (once)
//   5. Compute MC/IC/AC/DC line geometry client-side, draw paths + legend
//   6. Insert zoom control row (Zoom In / Reset / Zoom Out) under the map
//
// On View: window.print()
//
// On map click (drag-to-pan stays usable; wheel/pinch zoom disabled):
//   1. Convert click point to (lat, lon)
//   2. Populate hidden #mapRelocationForm fields with natal data + new location
//   3. requestSubmit, await mapRelocationComplete event
//   4. Clone the rendered SVG from #map-relocation-chart into a tooltip

import { sharedNatal } from "./sharedNatal.js";
import { prepareSwissRequest } from "./js/localSwiss.js";

// Disable browser context menu on the map AND detect double-right-click
// to zoom out (symmetric with d3.zoom's built-in double-LEFT-click zoom-
// IN). Pattern mirrors graph.js:5-14 (context menu suppression) for
// conformity with the rest of the app.
let lastRightClickAt = 0;
const DBL_RCLICK_THRESHOLD_MS = 500;
document.addEventListener(
  "contextmenu",
  (e) => {
    // Either view's container counts — both World and Sky support the
    // double-right-click zoom-out gesture.
    if (!e.target.closest("#astro-map") && !e.target.closest("#sky-map")) return;
    e.preventDefault();
    const now = Date.now();
    if (now - lastRightClickAt < DBL_RCLICK_THRESHOLD_MS) {
      // Double right-click — zoom out by 0.5x on whichever view is active
      // (same call the − button uses). Guarded so right-clicking before
      // either view is initialized is a silent no-op.
      const ctx = getActiveViewCtx();
      if (ctx.zoomBehavior && ctx.svg) {
        ctx.svg.transition().duration(250).call(ctx.zoomBehavior.scaleBy, 0.5);
      }
      lastRightClickAt = 0; // Reset so triple-click doesn't fire twice
    } else {
      lastRightClickAt = now;
    }
  },
  true,
);

// Two-finger double-tap on mobile — symmetric with the desktop double-
// right-click zoom-out above. iOS Safari and Android Chrome do NOT
// synthesize contextmenu from a two-finger tap (Windows touchscreens do,
// which is why the gesture works on touchscreen PCs through the handler
// above). This handler closes the parity gap by detecting two-finger
// taps directly from touch events. Document-level + passive so it never
// preventDefaults — page scroll, click-to-relocate, single-finger pan,
// pinch, and Sky's custom touchstart.skypan handler all continue to work
// unchanged. Pinches are excluded by the midpoint-movement threshold so
// they don't accidentally fire the zoom-out.
let twoFingerTapStartAt = 0;
let twoFingerTapStartMidX = 0;
let twoFingerTapStartMidY = 0;
let lastTwoFingerTapAt = 0;
const TWO_FINGER_TAP_DURATION_MAX_MS = 300;
const TWO_FINGER_TAP_MOVEMENT_MAX_PX = 10;
const DBL_TAP_THRESHOLD_MS = 500;

function midpointOfTouches(touchList) {
  let sumX = 0;
  let sumY = 0;
  for (let i = 0; i < touchList.length; i++) {
    sumX += touchList[i].clientX;
    sumY += touchList[i].clientY;
  }
  return { x: sumX / touchList.length, y: sumY / touchList.length };
}

document.addEventListener(
  "touchstart",
  (e) => {
    if (!e.target.closest("#astro-map") && !e.target.closest("#sky-map")) return;
    if (e.touches.length === 2) {
      const mid = midpointOfTouches(e.touches);
      twoFingerTapStartAt = Date.now();
      twoFingerTapStartMidX = mid.x;
      twoFingerTapStartMidY = mid.y;
    } else {
      twoFingerTapStartAt = 0;
    }
  },
  { passive: true },
);

document.addEventListener(
  "touchmove",
  (e) => {
    if (twoFingerTapStartAt === 0) return;
    if (e.touches.length !== 2) {
      twoFingerTapStartAt = 0;
      return;
    }
    const mid = midpointOfTouches(e.touches);
    const dx = mid.x - twoFingerTapStartMidX;
    const dy = mid.y - twoFingerTapStartMidY;
    if (Math.sqrt(dx * dx + dy * dy) > TWO_FINGER_TAP_MOVEMENT_MAX_PX) {
      // Pinch or pan — not a stationary tap. Cancel detection so the
      // gesture doesn't trigger zoom-out on lift.
      twoFingerTapStartAt = 0;
    }
  },
  { passive: true },
);

document.addEventListener(
  "touchend",
  (e) => {
    if (twoFingerTapStartAt === 0) return;
    // Wait until ALL fingers are lifted (touchend fires once per finger).
    if (e.touches.length !== 0) return;
    const duration = Date.now() - twoFingerTapStartAt;
    twoFingerTapStartAt = 0;
    if (duration > TWO_FINGER_TAP_DURATION_MAX_MS) return;
    const now = Date.now();
    if (now - lastTwoFingerTapAt < DBL_TAP_THRESHOLD_MS) {
      const ctx = getActiveViewCtx();
      if (ctx.zoomBehavior && ctx.svg) {
        ctx.svg.transition().duration(250).call(ctx.zoomBehavior.scaleBy, 0.5);
      }
      lastTwoFingerTapAt = 0;
    } else {
      lastTwoFingerTapAt = now;
    }
  },
  { passive: true },
);

document.addEventListener(
  "touchcancel",
  () => {
    twoFingerTapStartAt = 0;
  },
  { passive: true },
);

// ---- Constants ---------------------------------------------------

// Planet name -> line color. Mirrors the canonical PLANET_MAP keys
// in src/astrocartography.js (the server filter is the source of truth).
const PLANET_COLORS = {
  // Colors mirror the planet SVG icons in public/images/planets/{name}.svg
  // so MAP lines match the chart wheel. Each SVG color is softened by
  // mixing 40% white with the base color (formula: mixed = 0.4*255 + 0.6*svg),
  // which preserves the hue identity (Sun=yellow, Mars=red, etc.) but
  // reduces visual intensity. Strong saturated lines on a desaturated
  // map background read as harsh; softened lines are legible without
  // dominating.
  //
  // Note: asteroids (Chiron, Ceres, Vesta, Pallas, Juno) all share #979797
  // gray in the app SVG icons (distinguished by symbol shape, not color).
  // Both nodes share #000000 black. We use the same matching gray/dark
  // here — when multiple asteroids are enabled, their lines will look
  // similar (same trade-off as the chart wheels, where they look similar).
  Sun: "#d2cf66",         // softened from #b4af00 (olive yellow)
  // Earth appears only in Heliocentric mode — the MAP server swaps
  // SE_SUN → SE_EARTH and labels the response "Earth" (mirroring the
  // chart engine at calculate-natal.js:295-296 + the swe_get_planet_name
  // labeling that ends up in window.natalPlanets). Color softened from
  // earth.svg's #9ac77d green using the same 40%-white mix formula as
  // the rest of the palette.
  Earth: "#c2ddb1",       // softened from #9ac77d (Earth green)
  Moon: "#6698d7",        // softened from #0053bd (royal blue)
  Mercury: "#c5c5c5",     // exact SVG silver, already light — not softened
  Venus: "#66b567",       // softened from #008401 (deep green)
  Mars: "#d56666",        // softened from #b90000 (dark red)
  Jupiter: "#ff9e66",     // softened from #ff5e00 (vivid orange)
  Saturn: "#b98f71",      // softened from #8b4513 (saddle brown)
  Uranus: "#66c7d3",      // softened from #00a2b5 (teal)
  Neptune: "#666ad4",     // softened from #0007b8 (deep blue)
  Pluto: "#9866dd",       // softened from #5300c7 (purple)
  // Asteroids and nodes are lighter than Mercury (#c5c5c5) so they don't
  // visually compete with it. Same gray/dark hue family as the SVG icons,
  // just lighter values.
  Chiron: "#dadada",      // light gray (lighter than Mercury)
  Ceres: "#dadada",       // light gray
  Vesta: "#dadada",       // light gray
  Pallas: "#dadada",      // light gray
  Juno: "#dadada",        // light gray
  True_Node: "#888888",   // soft dark gray (lighter than original #666666)
  "South Node": "#888888",// soft dark gray
  // Lilith + Priapus glyphs are black in the chart wheel — World-map line
  // color matches exactly. On the Sky view a black orb would disappear
  // against the dark navy background, so SKY_ORB_COLOR_OVERRIDE below
  // remaps Lilith/Priapus to a light gray for the orb gradient only.
  Lilith: "#000000",
  Priapus: "#000000",
  // Angles. Sky-view only — the World map's server filter drops these because
  // they're not real planetary bodies (no swisseph constant). They reach the
  // Sky view via augmentSkyPlanetsWithAngles, which reads their ecliptic
  // position from window.natalPlanets and projects to RA/Dec. Same neutral
  // gray family as the nodes so glyphs read as "non-planet reference points".
  "Ascendant Symbol": "#a8a8a8",
  Midheaven: "#a8a8a8",
  Descendant: "#a8a8a8",
  "Imum Coeli": "#a8a8a8",
};

// Sky-view orb color override. PLANET_COLORS is also used to fill the
// orb radial gradient on Sky planet glyphs, and a few entries (Lilith,
// Priapus) are intentionally black to match the chart-wheel symbol
// color on the World map — but black on the Sky's dark navy background
// would render an invisible orb. Listed names get a light-gray orb on
// Sky only; everything not in this map uses its PLANET_COLORS value
// for both the World line and the Sky orb. Sky lookup uses
// skyOrbColor() below.
const SKY_ORB_COLOR_OVERRIDE = {
  Lilith: "#c8c8c8",
  Priapus: "#c8c8c8",
};

function skyOrbColor(planetName) {
  return SKY_ORB_COLOR_OVERRIDE[planetName] || PLANET_COLORS[planetName];
}

// Display name for the legend. "True_Node" is the SETTINGS form value
// kept for compatibility, but the astrologically correct user-facing name
// is "North Node" — "True" vs "Mean" is the calculation METHOD, not which
// node it is. (Controlled by the separate `trueNodes` checkbox.)
const PLANET_DISPLAY_NAME = {
  True_Node: "North Node",
};

function displayNameFor(name) {
  return PLANET_DISPLAY_NAME[name] || name;
}

// SETTINGS planet name -> filename in /images/planets/*.svg. Matches the
// same SVG assets used by the natal/triwheel/etc. chart wheels so the MAP
// glyph-on-line is visually identical to the chart-wheel glyph for the
// same planet. Falls back to lowercased name with spaces/underscores
// stripped (Sun → sun, "Imum Coeli" → imumcoeli, "Ascendant Symbol" →
// ascendantsymbol) — same normalization sharedNatal.js uses for planet
// glyph image URLs.
function planetSvgFile(name) {
  if (name === "True_Node") return "northnode";
  if (name === "South Node") return "southnode";
  return name.toLowerCase().replace(/[\s_]+/g, "");
}

// Line type -> SVG stroke-dasharray pattern (legible at all zoom levels).
// Pairing logic: MC and AC are solid; IC and DC are dashed. Combined with
// the line's shape (MC/IC are vertical, AC/DC are curved) this gives four
// visually distinct combinations — vertical-solid, vertical-dashed,
// curved-solid, curved-dashed — matching the docs in formHelp.hbs.
const LINE_DASH = {
  MC: "",
  IC: "6 4",
  AC: "",
  DC: "6 4",
};

// Planet symbol size on the map (viewBox units). Each symbol is anchored at
// its end-of-line position by an outer <g transform="translate(cx,cy)"> and
// kept screen-pixel-constant during zoom by an inner <g class="astro-symbol-
// scale"> updated in the zoom callback (see attachZoom).
const SYMBOL_SIZE = 11;
const SYMBOL_HALF = SYMBOL_SIZE / 2;

// Equirectangular projection constants (must match world-map.svg viewBox)
const W = 1000;
const H = 500;

// Latitude sweep for AC/DC lines. Extended to ±80° so that the natural
// convergence of AC/DC lines near the cutoff happens off-screen for most
// planets and the line tops look complete rather than truncated.
const LAT_MIN = -80;
const LAT_MAX = 80;
const LAT_STEP = 1;

const CLICK_THROTTLE_MS = 500;

// ---- State -------------------------------------------------------

let mapInitialized = false;
let mapSvg = null;
let mapGroup = null;
let zoomBehavior = null;
let lastClickAt = 0;
let relocationInitialized = false;
let pendingClickTimer = null;
let spinnerShowTimer = null;
let errorClearTimer = null;

// Sky view state — mirrors the World-view state structure exactly so the
// two are interchangeable from the toggle's perspective.
let skyMapInitialized = false;
let skySvg = null;
let skyGroup = null;
let skyZoomBehavior = null;

// Toggle state: which view is currently visible. Always "world" on page load
// so the 10K existing live users see exactly today's behavior. Not persisted.
let currentView = "world";

// Sky background asset cache-bust. Independent from WORLD_MAP_VERSION so
// sky-map.svg updates don't force a re-fetch of world-map.svg, and vice versa.
const SKY_MAP_VERSION = "2026-10-16-star-field-v1";

// Delay between mouse-up of a single click and firing the relocation
// popup. Gives the browser time to deliver a 2nd click of a double-click
// (which we cancel) so d3.zoom's dblclick-zoom can take over cleanly
// without the tooltip flashing.
const SINGLE_CLICK_DELAY_MS = 250;

// Delay before actually showing the loading spinner. If the request
// completes faster than this (e.g. extreme-latitude silent-dismissal,
// or any fast-cached response), no spinner is ever shown, avoiding a
// half-visible flash from the .tooltip's 0.3s opacity transition.
const SPINNER_SHOW_DELAY_MS = 200;

// ---- Helpers -----------------------------------------------------

function lonToX(lon) {
  return ((lon + 180) / 360) * W;
}
function latToY(lat) {
  return ((90 - lat) / 180) * H;
}
function xToLon(x) {
  return (x / W) * 360 - 180;
}
function yToLat(y) {
  return 90 - (y / H) * 180;
}
function deg2rad(d) {
  return (d * Math.PI) / 180;
}
function rad2deg(r) {
  return (r * 180) / Math.PI;
}
function normLon(lon) {
  let x = ((lon + 180) % 360 + 360) % 360 - 180;
  if (x === -180) x = 180;
  return x;
}

function showError(msg, duration = 5000) {
  const el = document.querySelector("#showMap .errorMessageMap");
  if (!el) return;
  // Cancel any previous clear-timer so the new error gets its full duration
  // and isn't cleared early by a leftover timer from a rapid earlier click.
  // Without this, two rapid errors would share the original 5s window — the
  // second one might be visible for just ~1s before the first timer fires.
  if (errorClearTimer) {
    clearTimeout(errorClearTimer);
    errorClearTimer = null;
  }
  el.textContent = msg;
  if (duration > 0) {
    errorClearTimer = setTimeout(() => {
      el.textContent = "";
      errorClearTimer = null;
    }, duration);
  }
}

// ---- Form / SETTINGS reads --------------------------------------

function getCheckedPlanets() {
  const checked = Array.from(
    document.querySelectorAll(
      '#planet-settings input[name="planet"]:checked',
    ),
  ).map((c) => c.value);
  let valid = checked.filter((v) => v in PLANET_COLORS);
  // Antipodal-point dedup for the World map. North Node ↔ South Node and
  // Lilith ↔ Priapus are antipodal points on the celestial sphere — their
  // MC/IC/AC/DC line positions overlap exactly (Lilith's MC line is at
  // the same longitude as Priapus's IC line, etc.). Drawing both would
  // paint two color/dash combinations on top of each other at the same
  // positions (visually a mess). Prefer the "primary" body (North Node,
  // Lilith) and silently drop its antipode from World rendering. The Sky
  // view re-adds the antipodes client-side via augmentSkyPlanetsWith*.
  if (valid.includes("True_Node") && valid.includes("South Node")) {
    valid = valid.filter((v) => v !== "South Node");
  }
  if (valid.includes("Lilith") && valid.includes("Priapus")) {
    valid = valid.filter((v) => v !== "Priapus");
  }
  return valid;
}

function getNatalFormData() {
  const name = document.getElementById("natalName")?.value?.trim();
  const day = document.getElementById("natalDay")?.value?.trim();
  const month = document.getElementById("natalMonth")?.value;
  const year = document.getElementById("natalYear")?.value?.trim();
  const hour = document.getElementById("natalHour")?.value?.trim();
  const minute = document.getElementById("natalMinute")?.value?.trim();
  const location = document.getElementById("natalLocation")?.value?.trim();
  if (!day || !month || !year || hour === "" || minute === "" || !location) {
    return null;
  }
  return { name, day, month, year, hour, minute, location };
}

// ---- Server call ------------------------------------------------

async function fetchAstrocartography(natal, planets) {
  // Respect the SETTINGS True/Mean Nodes toggle so MAP's node calculation
  // matches what MAIN/TRIWHEEL/etc. use. Default to true (matches the
  // existing default behavior in chart-engine/calculate-natal.js).
  const trueNodesEl = document.querySelector(
    '.degree-settings input[name="trueNodes"]',
  );
  const trueNodes = trueNodesEl ? trueNodesEl.checked : true;

  // True Lilith toggle: SE_OSCU_APOG (osculating) vs SE_MEAN_APOG (mean).
  // Default false (mean Lilith) matches the SETTINGS checkbox default at
  // formSettings.hbs:345 and the chart-engine default at calculate-natal.js:312.
  const trueLilithEl = document.querySelector(
    '.degree-settings input[name="trueLilith"]',
  );
  const trueLilith = trueLilithEl ? trueLilithEl.checked : false;

  // Zodiac inputs drive the Sky-view zodiac band so it matches what the
  // user sees in MAIN. Same canonical DOM selectors as sharedNatal.js:1391
  // (draconic), :1427 (zodiacSystem); coordinateSystem is in the same
  // #system-settings select group. Defaults match the SETTINGS defaults so
  // a missing element resolves to the same value as the server's default.
  const zodiacSystemEl = document.querySelector(
    '#system-settings select[name="zodiacSystem"]',
  );
  const zodiacSystem = zodiacSystemEl ? zodiacSystemEl.value : "Tropical";
  const coordinateSystemEl = document.querySelector(
    '#system-settings select[name="coordinateSystem"]',
  );
  const coordinateSystem = coordinateSystemEl
    ? coordinateSystemEl.value
    : "Geocentric";
  const draconicEl = document.querySelector(
    '.degree-settings input[name="draconic"]',
  );
  const draconic = draconicEl ? draconicEl.checked : false;

  const natalForm = document.getElementById("natalForm");
  const preparedNatal = await prepareSwissRequest(
    {
      day: parseInt(natal.day, 10),
      month: natal.month,
      year: parseInt(natal.year, 10),
      hour: parseInt(natal.hour, 10),
      minute: parseInt(natal.minute, 10),
      location: natal.location,
      selectedZodiacSystem: zodiacSystem,
      selectedCoordinateSystem: coordinateSystem,
      trueNodes,
      trueLilith,
    },
    natalForm,
  );

  const res = await fetch("/astrocartography", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({
      ...preparedNatal,
      planets,
      trueNodes,
      trueLilith,
      zodiacSystem,
      draconic,
      coordinateSystem,
    }),
  });
  let data = null;
  try {
    data = await res.json();
  } catch (e) {
    /* non-JSON response */
  }
  if (data && data.redirectUrl) {
    window.location.href = data.redirectUrl;
    return null;
  }
  if (!res.ok) {
    throw new Error(data?.error || "Failed to generate map.");
  }
  return data;
}

// ---- Line math --------------------------------------------------

function mcLine(planet, gmst) {
  return normLon(planet.ra - gmst);
}
function icLine(planet, gmst) {
  return normLon(planet.ra - gmst + 180);
}

// Returns an array of polyline segments (each a list of {lon, lat})
// for the AC or DC line. type: 'AC' or 'DC'.
function acdcLine(planet, gmst, type) {
  const dec = planet.dec;
  const ra = planet.ra;
  const sign = type === "AC" ? -1 : 1;
  const samples = [];
  for (let lat = LAT_MIN; lat <= LAT_MAX; lat += LAT_STEP) {
    const arg = -Math.tan(deg2rad(lat)) * Math.tan(deg2rad(dec));
    if (arg < -1 || arg > 1) {
      samples.push(null);
      continue;
    }
    const H_deg = rad2deg(Math.acos(arg));
    const lon = normLon(ra - gmst + sign * H_deg);
    samples.push({ lon, lat });
  }
  const segments = [];
  let current = [];
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    if (!s) {
      if (current.length > 1) segments.push(current);
      current = [];
      continue;
    }
    if (current.length > 0) {
      const prev = current[current.length - 1];
      if (Math.abs(s.lon - prev.lon) > 180) {
        if (current.length > 1) segments.push(current);
        current = [];
      }
    }
    current.push(s);
  }
  if (current.length > 1) segments.push(current);
  return segments;
}

// ---- Rendering ---------------------------------------------------

// Version tag for the world map asset. Bump this when the SVG is
// regenerated (e.g. adding/removing cities) to invalidate any 7-day
// browser cache from express.js:160-162.
const WORLD_MAP_VERSION = "2026-10-16-country-map-v1";

async function ensureWorldBackground(group) {
  if (group.select("g.world-bg").size() > 0) return;
  const res = await fetch(
    "/images/misc/world-map.svg?v=" + WORLD_MAP_VERSION,
    { credentials: "same-origin" },
  );
  if (!res.ok) throw new Error("Could not load world map background.");
  const text = await res.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, "image/svg+xml");
  // Pull all top-level groups from the source SVG into a wrapper .world-bg
  const bg = group.append("g").attr("class", "world-bg");
  const groups = doc.querySelectorAll("svg > g");
  groups.forEach((g) => {
    bg.node().appendChild(document.importNode(g, true));
  });
  // Set initial city-label tier visibility for base zoom (k=1).
  // Only tier 0 (~70 highest-priority cities) visible by default;
  // tier 1/2/3 hidden. The zoom handler reveals more tiers as the
  // user zooms in.
  updateCityLabelVisibility(1);
}

// Show/hide BOTH city dots and labels by tier based on the current d3.zoom
// scale k. Hiding dots along with labels prevents "dot without name" noise
// at low zoom — every visible dot has a visible name next to it.
function updateCityLabelVisibility(k) {
  if (!mapGroup) return;
  const show = {
    1: k >= 1.5,
    2: k >= 3,
    3: k >= 6,
  };
  for (const tier of [1, 2, 3]) {
    const display = show[tier] ? null : "none";
    mapGroup
      .selectAll("g.cities .city-tier-" + tier)
      .style("display", display);
    mapGroup
      .selectAll("g.city-labels .city-tier-" + tier)
      .style("display", display);
  }
}

function clearLines(group) {
  group.selectAll("g.astro-lines").remove();
  group.selectAll("g.astro-labels").remove();
}

// Helper: append a planet-glyph <image> centered at (cx, cy) in viewBox
// units. The outer translate places the symbol; the inner astro-symbol-
// scale group is targeted by attachZoom() to keep glyph size constant in
// screen pixels regardless of zoom level (same compensation pattern used
// elsewhere for stroke-width and font-size).
function appendSymbol(group, cx, cy, svgFile) {
  const wrap = group
    .append("g")
    .attr("class", "astro-symbol")
    .attr("transform", `translate(${cx},${cy})`);
  wrap
    .append("g")
    .attr("class", "astro-symbol-scale")
    .append("image")
    .attr("x", -SYMBOL_HALF)
    .attr("y", -SYMBOL_HALF)
    .attr("width", SYMBOL_SIZE)
    .attr("height", SYMBOL_SIZE)
    .attr("href", `/images/planets/${svgFile}.svg`);
}

function drawLines(group, planets, gmst) {
  clearLines(group);
  const linesG = group.append("g").attr("class", "astro-lines");
  const labelsG = group.append("g").attr("class", "astro-labels");
  for (const p of planets) {
    const color = PLANET_COLORS[p.name] || "#444";
    const svgFile = planetSvgFile(p.name);

    // MC and IC: vertical lines. Glyph at top of MC, bottom of IC, in the
    // standard astrocartography layout (Jim Lewis). The line's dash
    // pattern still distinguishes MC from IC.
    for (const type of ["MC", "IC"]) {
      const lon = type === "MC" ? mcLine(p, gmst) : icLine(p, gmst);
      const x = lonToX(lon);
      linesG
        .append("line")
        .attr("x1", x)
        .attr("y1", 0)
        .attr("x2", x)
        .attr("y2", H)
        .attr("stroke", color)
        .attr("stroke-width", 1)
        .attr("stroke-dasharray", LINE_DASH[type])
        .attr("class", `astro-line astro-${type.toLowerCase()}`)
        .attr("data-planet", p.name)
        .attr("data-line", type);
      const cy = type === "MC" ? SYMBOL_HALF + 1 : H - SYMBOL_HALF - 1;
      appendSymbol(labelsG, x, cy, svgFile);
    }

    // AC and DC: curved polylines. Glyph anchored at the curve's topmost
    // on-screen point (smallest y = highest latitude reached) so it sits
    // at the visible top of each curve — same convention as published
    // astrocartography maps. Topmost is tracked across ALL segments
    // because the line may be split where it wraps the antimeridian.
    for (const type of ["AC", "DC"]) {
      const segments = acdcLine(p, gmst, type);
      let topPoint = null;
      for (const seg of segments) {
        const d =
          "M" +
          seg
            .map(
              (s) =>
                `${lonToX(s.lon).toFixed(2)},${latToY(s.lat).toFixed(2)}`,
            )
            .join("L");
        linesG
          .append("path")
          .attr("d", d)
          .attr("fill", "none")
          .attr("stroke", color)
          .attr("stroke-width", 1)
          .attr("stroke-dasharray", LINE_DASH[type])
          .attr("class", `astro-line astro-${type.toLowerCase()}`)
          .attr("data-planet", p.name)
          .attr("data-line", type);
        for (const s of seg) {
          const y = latToY(s.lat);
          if (topPoint === null || y < topPoint.y) {
            topPoint = { x: lonToX(s.lon), y };
          }
        }
      }
      if (topPoint) {
        // Nudge the symbol's center down by half its size so it sits ON
        // the line's apex rather than floating above it (clipped by the
        // top edge of the map if the curve reaches near y=0).
        const cy = Math.max(topPoint.y, SYMBOL_HALF + 1);
        appendSymbol(labelsG, topPoint.x, cy, svgFile);
      }
    }
  }
}

function drawLegend(group, planets) {
  group.select("g.astro-legend").remove();
  const g = group
    .append("g")
    .attr("class", "astro-legend")
    .attr("transform", `translate(10, ${H - 12 - planets.length * 11})`);
  g.append("rect")
    .attr("x", 0)
    .attr("y", 0)
    .attr("width", 78)
    .attr("height", planets.length * 11 + 4)
    .attr("fill", "rgba(255,255,255,0.85)")
    .attr("stroke", "#9aa8b8")
    .attr("stroke-width", 0.3)
    .attr("rx", 2);
  planets.forEach((p, i) => {
    const y = 10 + i * 11;
    g.append("line")
      .attr("x1", 4)
      .attr("y1", y - 2)
      .attr("x2", 18)
      .attr("y2", y - 2)
      .attr("stroke", PLANET_COLORS[p.name])
      .attr("stroke-width", 1.5);
    g.append("text")
      .attr("x", 22)
      .attr("y", y)
      .attr("font-family", "Arial, sans-serif")
      .attr("font-size", "7px")
      .attr("fill", "#333")
      .text(displayNameFor(p.name));
  });
}

// ---- Zoom + zoom control row ------------------------------------

function attachZoom() {
  if (zoomBehavior) return zoomBehavior;
  zoomBehavior = d3
    .zoom()
    .scaleExtent([1, 20])
    .translateExtent([[0, 0], [W, H]])
    // Up to 5 pixels of mouse drift between mousedown and mouseup still
    // counts as a click (i.e. fires the click event for click-to-relocate).
    // Intentional drags (>5px) suppress the click and pan instead. Without
    // this, any slight accidental movement cancels the click.
    .clickDistance(5)
    .filter((event) => {
      // Block wheel and pinch zoom; allow drag-to-pan.
      if (event.type === "wheel") return false;
      if (event.type === "touchstart") return false;
      if (event.type === "touchmove") return false;
      return true;
    })
    .on("zoom", (event) => {
      const t = event.transform;
      mapGroup.attr("transform", t.toString());
      mapGroup
        .selectAll("g.astro-lines .astro-line")
        .attr("stroke-width", 1 / t.k);
      mapGroup
        .selectAll("g.world-bg .world-countries path")
        .attr("stroke-width", 0.4 / t.k);
      // US state borders use the same base stroke width as country borders
      // so they read identically; compensate them the same way each frame.
      mapGroup
        .selectAll("g.world-bg .states path")
        .attr("stroke-width", 0.4 / t.k);
      mapGroup
        .selectAll("g.world-bg .cities circle")
        .attr("r", 1.0 / t.k);
      mapGroup
        .selectAll("g.world-bg .city-labels text")
        .attr("font-size", `${5 / Math.sqrt(t.k)}px`)
        .attr("stroke-width", 1.4 / t.k);
      mapGroup
        .selectAll("g.astro-labels text")
        .attr("font-size", `${8 / t.k}px`);
      // Keep planet-glyph symbols at a constant screen-pixel size by
      // scaling each one's inner wrapper by 1/k. Same compensation
      // pattern as the stroke-width / font-size updates above.
      mapGroup
        .selectAll("g.astro-symbol-scale")
        .attr("transform", `scale(${1 / t.k})`);
    })
    .on("end", (event) => {
      // Reveal/hide tiered city labels at the END of a pan/zoom gesture
      // rather than per-frame. Previously this ran inside the "zoom"
      // callback and was 6 selectAll().style("display") calls over the
      // ~2500 tier-1/2/3 city nodes EVERY frame — a measurable portion
      // of the choppiness on slower devices. End-of-gesture timing means
      // tier-1/2/3 city labels appear/disappear when the user lets go
      // instead of continuously during the gesture; visually this is
      // imperceptible at button-zoom speed and acceptable during drag.
      updateCityLabelVisibility(event.transform.k);
    });
  mapSvg.call(zoomBehavior);
  return zoomBehavior;
}

function buildZoomControls() {
  const astroMap = document.getElementById("astro-map");
  if (!astroMap) return;
  if (document.getElementById("astro-map-controls")) return;

  const controls = document.createElement("div");
  controls.id = "astro-map-controls";
  controls.style.cssText =
    "display:flex; align-items:center; justify-content:center; " +
    "gap:10px; margin-top:20px; margin-bottom:12px;";

  function btn(label, title, handler) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "animation-control-btn";
    b.style.cssText =
      "font-size:24px; cursor:pointer; padding:5px 15px; " +
      "border:none; border-radius:5px;";
    b.textContent = label;
    b.title = title;
    b.addEventListener("click", handler);
    return b;
  }

  controls.appendChild(
    btn("−", "Zoom out", () => {
      const ctx = getActiveViewCtx();
      if (!ctx.zoomBehavior || !ctx.svg) return;
      ctx.svg.transition().duration(250).call(ctx.zoomBehavior.scaleBy, 0.5);
    }),
  );
  controls.appendChild(
    btn("↺", "Reset zoom", () => {
      const ctx = getActiveViewCtx();
      if (!ctx.zoomBehavior || !ctx.svg) return;
      if (currentView === "sky") {
        // Sky reset: zoom-level ONLY (k → 1). Preserve the user's
        // current horizontal pan position so they keep looking at the
        // same point on the celestial sphere — just at default zoom.
        // ty is always forced to 0 — at k=1 the viewport height equals
        // the world height (H), so there's no valid vertical-pan
        // range left; carrying over a leftover ty from when the user
        // was zoomed in pushes the sky off-screen vertically.
        const current = d3.zoomTransform(ctx.svg.node());
        const dataCenterX = (W / 2 - current.x) / current.k;
        const newTx = W / 2 - dataCenterX;
        ctx.svg
          .transition()
          .duration(400)
          .call(
            ctx.zoomBehavior.transform,
            d3.zoomIdentity.translate(newTx, 0).scale(1),
          );
      } else {
        // World reset: full reset to identity (k=1, tx=ty=0).
        ctx.svg
          .transition()
          .duration(400)
          .call(ctx.zoomBehavior.transform, d3.zoomIdentity);
      }
      hideRelocationTooltip();
    }),
  );
  controls.appendChild(
    btn("+", "Zoom in", () => {
      const ctx = getActiveViewCtx();
      if (!ctx.zoomBehavior || !ctx.svg) return;
      ctx.svg.transition().duration(250).call(ctx.zoomBehavior.scaleBy, 2);
    }),
  );

  // index.hbs lays the maps out as <astro-map><sky-map>... so the
  // zoom controls need to sit AFTER #sky-map to appear below whichever
  // map is currently visible. Inserting after #astro-map (the old
  // behavior) put the controls above #sky-map in the DOM, which
  // showed them above the Sky map when that view was active.
  const skyMap = document.getElementById("sky-map");
  const anchor = skyMap || astroMap;
  anchor.parentNode.insertBefore(controls, anchor.nextSibling);
}

// ---- Click-to-relocate -----------------------------------------

function initRelocationChart() {
  if (relocationInitialized) return;
  const container = d3.select("#map-relocation-chart");
  if (container.empty()) return;
  sharedNatal(
    container,
    undefined, undefined, undefined, undefined, undefined,
    undefined, undefined, undefined, undefined, undefined, undefined,
    "mapRelocation",
  );
  relocationInitialized = true;
}

function populateRelocationForm(natal, lat, lon) {
  document.getElementById("mapRelocationName").value =
    natal.name || "Relocated";
  document.getElementById("mapRelocationDay").value = natal.day;
  document.getElementById("mapRelocationMonth").value = natal.month;
  document.getElementById("mapRelocationYear").value = natal.year;
  document.getElementById("mapRelocationHour").value = natal.hour;
  document.getElementById("mapRelocationMinute").value = natal.minute;
  document.getElementById("mapRelocationLocation").value =
    "Map Click: " + lat.toFixed(4) + ", " + lon.toFixed(4);
}

// Hide the global .tooltip used by click-to-relocate. Mirrors graph.js
// pattern (e.g. graph.js:1234): sets opacity to 0 so the .tooltip CSS
// transition fades it out, and clears html so old content doesn't leak
// to a different feature that reuses the same shared element. Also
// cancels any pending spinner-show timer so a fast response doesn't get
// followed by a spinner appearing AFTER the request already completed.
function hideRelocationTooltip() {
  if (spinnerShowTimer) {
    clearTimeout(spinnerShowTimer);
    spinnerShowTimer = null;
  }
  d3.select(".tooltip").style("opacity", 0).html("");
}

// Schedule the standard rotating spinner to appear inside the global
// .tooltip after SPINNER_SHOW_DELAY_MS. If the request completes before
// that delay (e.g. fast-error silent dismissal at extreme latitudes, or
// a very fast successful chart computation), the spinner is never shown,
// avoiding a half-visible flash from the .tooltip's 0.3s opacity
// transition. Spinner pattern lifted from public/graph.js:1140-1142 so
// it looks visually identical to GRAPH's click-to-chart loading state.
function showRelocationLoadingState() {
  if (spinnerShowTimer) clearTimeout(spinnerShowTimer);
  spinnerShowTimer = setTimeout(() => {
    spinnerShowTimer = null;
    const tooltip = d3.select(".tooltip");
    tooltip.html(
      '<div id="triwheel-loading-overlay"><div class="triwheel-spinner"></div></div>',
    );
    tooltip.style("opacity", 0.95);
  }, SPINNER_SHOW_DELAY_MS);
}

// Display the rendered relocated chart inside the global .tooltip.
// Pattern mirrors public/graph.js:1212-1281 (displayTooltipContent),
// with two intentional MAP-specific additions documented in the v1.2
// plan addendum:
//   A.4 — lat/lon header in the top-left so the user can see which
//         location they clicked (astrocartography users need this; GRAPH
//         doesn't because the clicked date is visible on the graph
//         itself).
//   A.2 — defensive re-set of position/top/left/transform inline at the
//         end, mirroring graph.js:1276-1281 in case any other code path
//         has modified the shared .tooltip element's inline styles.
function showRelocatedChartInTooltip(svgEl, lat, lon) {
  // Cancel any pending spinner-show timer so a delayed spinner doesn't
  // appear AFTER the chart has been shown and overwrite it.
  if (spinnerShowTimer) {
    clearTimeout(spinnerShowTimer);
    spinnerShowTimer = null;
  }
  const tooltip = d3.select(".tooltip");
  tooltip.html("");

  // Header intentionally omitted — the relocated chart speaks for itself.
  // The lat/lon arguments remain in the signature for any future caller
  // that might want to surface the click location elsewhere.

  // Close button: standard .tooltip-close-btn pattern from graph.js:1219-1235
  tooltip
    .append("div")
    .attr("class", "tooltip-close-btn")
    .style("position", "absolute")
    .style("top", "10px")
    .style("right", "15px")
    .style("cursor", "pointer")
    .style("pointer-events", "auto")
    .style("font-family", "Arial, sans-serif")
    .style("font-size", "40px")
    .style("font-weight", "bold")
    .style("color", "#666")
    .style("z-index", "11")
    .text("×")
    .on("click", hideRelocationTooltip);

  // Cloned chart in standard .tooltip-content wrapper
  const tooltipContent = tooltip
    .append("div")
    .attr("class", "tooltip-content");
  if (svgEl) {
    const cloned = svgEl.cloneNode(true);
    cloned.setAttribute("width", "600px");
    cloned.setAttribute("height", "600px");
    tooltipContent.node().appendChild(cloned);
  }

  // Responsive scaling — same breakpoints as graph.js:1257-1268
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  let scale = 1;
  if (viewportWidth <= 600) scale = 0.45;
  else if (viewportWidth <= 800) scale = 0.75;
  if (viewportHeight < 500 && viewportWidth > viewportHeight) {
    scale = Math.min(scale, 0.5);
  } else if (viewportHeight < 700 && viewportWidth > viewportHeight) {
    scale = Math.min(scale, 0.7);
  }
  if (scale < 1) tooltipContent.style("zoom", scale);

  // Defensive position-setting (Addendum A.2) — mirror graph.js:1276-1281
  // verbatim so the tooltip always centers correctly even if other code
  // paths have modified the shared .tooltip element's inline styles.
  tooltip
    .style("position", "fixed")
    .style("top", "50%")
    .style("left", "50%")
    .style("transform", "translate(-50%, -50%)")
    .style("opacity", 0.95);
}

async function handleMapClick(event) {
  if (event.target.closest("#astro-map-controls")) return;

  const now = Date.now();
  if (now - lastClickAt < CLICK_THROTTLE_MS) return;
  lastClickAt = now;

  const natal = getNatalFormData();
  if (!natal) {
    showError("Fill in MAIN's chart fields before relocating.");
    return;
  }

  // Convert click point from screen coords to (lat, lon)
  const pt = mapSvg.node().createSVGPoint();
  pt.x = event.clientX;
  pt.y = event.clientY;
  const svgPoint = pt.matrixTransform(mapSvg.node().getScreenCTM().inverse());
  const t = d3.zoomTransform(mapSvg.node());
  const mapX = (svgPoint.x - t.x) / t.k;
  const mapY = (svgPoint.y - t.y) / t.k;
  const lon = xToLon(mapX);
  const lat = yToLat(mapY);
  if (Math.abs(lat) > 89 || Math.abs(lon) > 180) return;

  showRelocationLoadingState();

  try {
    initRelocationChart();
    populateRelocationForm(natal, lat, lon);

    const form = document.getElementById("mapRelocationForm");
    const completionPromise = new Promise((resolve, reject) => {
      const onComplete = (event) => {
        clearTimeout(timer);
        document.removeEventListener("mapRelocationComplete", onComplete);
        // sharedNatal attaches the server error message via event.detail
        // when the calculation failed. Pass it up so the catch handler
        // can decide whether to silently dismiss or surface it.
        resolve(event && event.detail ? event.detail : null);
      };
      const timer = setTimeout(() => {
        document.removeEventListener("mapRelocationComplete", onComplete);
        reject(new Error("Relocation timed out."));
      }, 8000);
      document.addEventListener("mapRelocationComplete", onComplete);
    });

    form.requestSubmit();
    const detail = await completionPromise;

    // If the server reported a failure (sharedNatal dispatched the event
    // with an error detail), throw to land in the catch handler below.
    if (detail && detail.error) {
      throw new Error(detail.error);
    }

    const renderedSvg = document.querySelector("#map-relocation-chart svg");
    if (!renderedSvg) {
      throw new Error("Relocated chart did not render.");
    }
    showRelocatedChartInTooltip(renderedSvg, lat, lon);
  } catch (err) {
    hideRelocationTooltip();
    // "Cannot calculate houses at this latitude..." is an EXPECTED failure
    // (user clicked a polar region with Placidus/Koch/etc.). Silently
    // dismiss the spinner — don't pester the user with an error message
    // for every accidental click on Antarctica. Genuine errors (network,
    // server crash, timeout) still surface in the MAP error area.
    if (err.message && err.message.includes("Cannot calculate houses")) {
      return;
    }
    showError(err.message || "Could not relocate chart.");
  }
}

// ---- Sky view --------------------------------------------------
//
// The Sky view is a planetarium-style rendering of the celestial sphere
// for the natal moment. Same equirectangular projection as the World map,
// but on (RA, Dec) celestial coordinates instead of (lon, lat) terrestrial
// ones. Background is a static SVG asset (stars + constellations +
// ecliptic + zodiac); planet glyphs are placed client-side from the same
// /astrocartography response that powers the World view's line math.
//
// Per design (todo-astrocartography-2.md):
//   - No MC/IC/AC/DC lines (those are geographic concepts)
//   - No aspect lines
//   - No click-to-relocate (the celestial sphere has no Earth location)
//   - Both views render in parallel from one /astrocartography call

async function ensureSkyBackground(group) {
  if (group.select("g.sky-bg").size() > 0) return;
  const res = await fetch(
    "/images/misc/sky-map.svg?v=" + SKY_MAP_VERSION,
    { credentials: "same-origin" },
  );
  if (!res.ok) throw new Error("Could not load sky map background.");
  const text = await res.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, "image/svg+xml");
  const bg = group.append("g").attr("class", "sky-bg");
  // Source content goes inside <defs> with a stable id; three <use>
  // references render it at offsets -W, 0, +W. This gives the user
  // seamless left/right pan: drag past the edge and the next tile is
  // already there. Combined with the build-script's wrap-line extension,
  // constellations that cross RA=0/360 (Pisces, Cetus, Andromeda etc.)
  // appear continuous across tile boundaries.
  //
  // Perf note: <use> shares the source DOM nodes, so per-frame zoom
  // updates (selectAll on stars/lines) still walk one copy, not three.
  const defs = bg.append("defs");
  const tileSource = defs.append("g").attr("id", "sky-tile-source");
  const groups = doc.querySelectorAll("svg > g");
  groups.forEach((g) => {
    // Strip the baked-in tropical zodiac groups before they enter the
    // tile source — drawSkyZodiac() paints a dynamic replacement that
    // honors the user's zodiacSystem/draconic/coordinateSystem.
    if (
      g.classList &&
      (g.classList.contains("zodiac-boundaries") ||
        g.classList.contains("zodiac-labels"))
    ) {
      return;
    }
    tileSource.node().appendChild(document.importNode(g, true));
  });
  // Make the ecliptic solid (the baked asset draws it dashed). The
  // stroke-dasharray="3 2" attribute lives on the <g class="ecliptic">
  // parent, NOT the <path> — SVG presentation attributes on a group
  // cascade to its children. Clearing the attribute from the group
  // disinherits the dash and the path renders solid.
  // Group-level opacity damps the line so it reads as a gentle
  // reference guide rather than a bold gold curve. Tunable below.
  tileSource
    .select("g.ecliptic")
    .attr("stroke-dasharray", null)
    .attr("stroke-width", SKY_ECLIPTIC_LINE_WIDTH)
    .attr("opacity", SKY_ECLIPTIC_LINE_OPACITY);
  for (const offsetX of [-W, 0, W]) {
    bg.append("use")
      .attr("href", "#sky-tile-source")
      .attr("transform", `translate(${offsetX}, 0)`);
  }
}

// Sign-symbol size (viewBox units) for the Sky view labels. Slightly
// larger than the planet glyph size (11) because signs are simpler
// shapes that need a touch more presence to read cleanly against the
// translucent band fills.
const SKY_SIGN_SYMBOL_SIZE = 13;
const SKY_SIGN_SYMBOL_HALF = SKY_SIGN_SYMBOL_SIZE / 2;

// Resolve a sign name to its SVG asset URL. The 12 standard signs use
// the colorized variants (each sign in its MAIN color, matching the
// chart wheel pixel-for-pixel). Ophiuchus is special-cased to the
// non-colorized /images/signs/ophiuchus.svg because its colorized
// stroke is #353535 (dark gray) and would be invisible on the navy
// sky — the non-colorized version has a white stroke, the same one
// MAIN draws on top of Ophiuchus's dark gray sector for visibility.
function skySignSvgUrl(name) {
  const file = name.toLowerCase();
  if (name === "Ophiuchus") return `/images/signs/${file}.svg`;
  return `/images/signs/colorized/${file}.svg`;
}

// Append a sign glyph as an SVG <image> centered at (cx, cy). Mirrors
// the planet appendSymbol pattern so attachSkyZoom can compensate
// each sign's scale via .astro-symbol-scale.
function appendSkySignSymbol(group, cx, cy, signName) {
  const wrap = group
    .append("g")
    .attr("class", "astro-symbol")
    .attr("transform", `translate(${cx},${cy})`);
  wrap
    .append("g")
    .attr("class", "astro-symbol-scale")
    .append("image")
    .attr("x", -SKY_SIGN_SYMBOL_HALF)
    .attr("y", -SKY_SIGN_SYMBOL_HALF)
    .attr("width", SKY_SIGN_SYMBOL_SIZE)
    .attr("height", SKY_SIGN_SYMBOL_SIZE)
    .attr("href", skySignSvgUrl(signName));
}

// Per-sign fill colors for the translucent zodiac bands on the Sky view.
// Verbatim copy of the signColors palette used to paint MAIN's outer-wheel
// sectors (sharedNatal.js:1289-1303) — keep in sync if those change.
// Keys are lowercase to match the lookup convention there.
const SKY_SIGN_COLORS = {
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

// Half-width of the zodiac band in ecliptic latitude (degrees on each
// side of the ecliptic). ±15° comfortably contains every classical body
// (Moon: ±5°, planets: ±7°; outer asteroids occasionally further) and
// matches the visual width planetariums conventionally use.
const SKY_ZODIAC_BAND_BETA = 15;

// Fill opacity for the colored bands over the navy Sky background.
// Tunable — 0.12 keeps the bands as faint tints that read as their
// MAIN colors without overwhelming stars and constellation lines.
const SKY_ZODIAC_BAND_OPACITY = 0.12;

// Group opacity for the sign-glyph SVG labels. The glyphs are bright,
// saturated strokes baked into the colorized SVGs — at full opacity
// they pop more than the translucent bands behind them. 0.5 dims them
// to feel closer to the band-tint look while staying legible against
// the navy + constellations + stars beneath them. Tunable.
const SKY_ZODIAC_LABEL_OPACITY = 0.5;

// λ step (degrees) when sampling the band's top/bottom (β=const) edges.
// 1° produces ~30 samples per uniform-30° sign edge, smooth on screen.
const SKY_ZODIAC_LON_STEP = 1;

// β step (degrees) when sampling a boundary's meridian (λ=const). 1°
// across ±15° = 31 samples per boundary line; smooth even at high zoom.
const SKY_ZODIAC_LAT_STEP = 1;

// J2000 mean obliquity of the ecliptic. Same constant the sky-map.svg
// build script uses, so any TROPICAL boundary we project here lands on
// the exact pixel the baked-in zodiac used to occupy (verified
// numerically against the asset: Aries midpoint → x=961.63).
const SKY_ECLIPTIC_OBLIQUITY = (23.4393 * Math.PI) / 180;

// Project ecliptic coordinates (λ, β) to equatorial (α, δ) in degrees.
// Standard textbook transform with ε = J2000 obliquity:
//   sin(δ) = sin(β)·cos(ε) + cos(β)·sin(ε)·sin(λ)
//   α     = atan2( cos(β)·cos(ε)·sin(λ) − sin(β)·sin(ε),  cos(β)·cos(λ) )
// β=0 reduces to the ecliptic-on-equator parametric used by the
// sky-map.svg build script (verified: Aries midpoint at λ=15, β=0 →
// RA≈13.82°, x≈961.63, matching the baked asset). β=null is treated
// as 0 (the call shape used by sign-label placement).
function skyEclipticToEquatorial(lambdaDeg, betaDeg) {
  const lambda = (lambdaDeg * Math.PI) / 180;
  const beta = ((betaDeg || 0) * Math.PI) / 180;
  const eps = SKY_ECLIPTIC_OBLIQUITY;
  const sinDec =
    Math.sin(beta) * Math.cos(eps) +
    Math.cos(beta) * Math.sin(eps) * Math.sin(lambda);
  const cosDecSinRa =
    Math.cos(beta) * Math.cos(eps) * Math.sin(lambda) -
    Math.sin(beta) * Math.sin(eps);
  const cosDecCosRa = Math.cos(beta) * Math.cos(lambda);
  return {
    raDeg: rad2deg(Math.atan2(cosDecSinRa, cosDecCosRa)),
    decDeg: rad2deg(Math.asin(sinDec)),
  };
}

// Project a tropical ecliptic longitude λ (degrees, any sign) onto the
// celestial sphere's equirectangular projection used by the Sky view.
// Returns { x, y } in viewBox units (W=1000, H=500). RA is MIRRORED
// (east-is-left), matching drawSkyPlanets and the baked sky-map.svg.
// Wrapper around skyEclipticToEquatorial that mods RA to [0, 360) — the
// "normal" tile-local projection. Use buildSkyPolyline (which keeps RA
// unwrapped) when drawing polylines/polygons that may cross RA=0/360.
function skyEclipticToXY(lambdaDeg, betaDeg) {
  const { raDeg, decDeg } = skyEclipticToEquatorial(lambdaDeg, betaDeg);
  const raMod = ((raDeg % 360) + 360) % 360;
  return {
    x: W - (raMod / 360) * W,
    y: ((90 - decDeg) / 180) * H,
  };
}

// Walk a series of (λ, β) samples and produce viewBox-space (x, y)
// points with RA unwrapped — i.e. each new sample's RA is shifted by
// ±360° as needed to keep the path continuous across the antimeridian
// (RA=0/360). This lets a polygon spanning the wrap be drawn as a
// single SVG path; the 3-tile system then handles its visibility at
// the screen-edge crossing.
function buildSkyPolyline(samples) {
  const points = [];
  let prevRaDeg = null;
  for (const s of samples) {
    let { raDeg, decDeg } = skyEclipticToEquatorial(s.lambda, s.beta);
    // Normalize the FIRST sample to [0, 360) so polygons start in the
    // canonical tile. Subsequent samples are pinned to whichever
    // representative of (raDeg + 360k) is closest to the previous one.
    if (prevRaDeg === null) {
      raDeg = ((raDeg % 360) + 360) % 360;
    } else {
      while (raDeg < prevRaDeg - 180) raDeg += 360;
      while (raDeg > prevRaDeg + 180) raDeg -= 360;
    }
    prevRaDeg = raDeg;
    points.push({
      x: W - (raDeg / 360) * W,
      y: ((90 - decDeg) / 180) * H,
    });
  }
  return points;
}

function pointsToPathD(points, closed) {
  if (points.length === 0) return "";
  const head = `M${points[0].x.toFixed(2)},${points[0].y.toFixed(2)}`;
  const tail = points
    .slice(1)
    .map((p) => `L${p.x.toFixed(2)},${p.y.toFixed(2)}`)
    .join("");
  return head + tail + (closed ? "Z" : "");
}

// Linearly interpolate between two points where x equals xBoundary.
function interpolateAtX(a, b, xBoundary) {
  const t = (xBoundary - a.x) / (b.x - a.x);
  return { x: xBoundary, y: a.y + t * (b.y - a.y) };
}

// Sutherland-Hodgman clip of a CLOSED polygon against a vertical
// half-plane. side=+1 keeps x ≥ xBoundary; side=-1 keeps x ≤ xBoundary.
function clipPolygonHalfplane(points, xBoundary, side) {
  const isInside = (p) =>
    side > 0 ? p.x >= xBoundary : p.x <= xBoundary;
  const result = [];
  for (let i = 0; i < points.length; i++) {
    const curr = points[i];
    const next = points[(i + 1) % points.length];
    const currIn = isInside(curr);
    const nextIn = isInside(next);
    if (currIn) {
      result.push(curr);
      if (!nextIn) result.push(interpolateAtX(curr, next, xBoundary));
    } else if (nextIn) {
      result.push(interpolateAtX(curr, next, xBoundary));
    }
  }
  return result;
}

// Clip an OPEN polyline. Returns array of polylines (one per
// contiguous in-segment). Boundary meridians cross any given x at
// most once so we get ≤1 segment, but the routine is generic.
function clipPolylineHalfplane(points, xBoundary, side) {
  const isInside = (p) =>
    side > 0 ? p.x >= xBoundary : p.x <= xBoundary;
  const segments = [];
  let current = [];
  for (let i = 0; i < points.length; i++) {
    const curr = points[i];
    const currIn = isInside(curr);
    if (i === 0) {
      if (currIn) current.push(curr);
      continue;
    }
    const prev = points[i - 1];
    const prevIn = isInside(prev);
    if (prevIn && currIn) {
      current.push(curr);
    } else if (prevIn && !currIn) {
      current.push(interpolateAtX(prev, curr, xBoundary));
      if (current.length >= 2) segments.push(current);
      current = [];
    } else if (!prevIn && currIn) {
      current = [interpolateAtX(prev, curr, xBoundary), curr];
    }
  }
  if (current.length >= 2) segments.push(current);
  return segments;
}

function pointsXRange(points) {
  let xMin = Infinity;
  let xMax = -Infinity;
  for (const p of points) {
    if (p.x < xMin) xMin = p.x;
    if (p.x > xMax) xMax = p.x;
  }
  return [xMin, xMax];
}

function shiftPolygonX(points, dx) {
  return points.map((p) => ({ x: p.x + dx, y: p.y }));
}

// Split a closed band polygon at the antimeridian (x=0 or x=W) and
// SHIFT the wrap-around half by ±W so every returned sub-polygon
// lives entirely within [0, W] in tile-0 local coords.
//
// Why shift instead of relying on tile +W / tile -W to render the
// wrap half: the 3-tile rendering should in theory display the
// negative-x portion via tile +W's transform, but the previous user
// test showed Pisces was still not rendering after a plain non-shifted
// split. Browsers apparently don't reliably draw paths whose LOCAL
// bbox lies entirely outside the SVG viewBox even when a parent
// transform brings them into view. Shifting puts every sub-polygon's
// LOCAL bbox inside [0, W] so tile 0 alone shows the full band; the
// other two tiles just provide seamless coverage during pan.
function splitBandPolygon(points) {
  if (points.length < 3) return [];
  const [xMin, xMax] = pointsXRange(points);
  if (xMin >= 0 && xMax <= W) return [points];
  const out = [];
  if (xMin < 0) {
    const right = clipPolygonHalfplane(points, 0, +1);
    const left = clipPolygonHalfplane(points, 0, -1);
    if (right.length >= 3) out.push(right);
    if (left.length >= 3) out.push(shiftPolygonX(left, +W));
    return out;
  }
  // xMax > W
  const inside = clipPolygonHalfplane(points, W, -1);
  const outside = clipPolygonHalfplane(points, W, +1);
  if (inside.length >= 3) out.push(inside);
  if (outside.length >= 3) out.push(shiftPolygonX(outside, -W));
  return out;
}

// Same shift-into-[0,W] logic for open polylines (boundary meridians).
function splitBoundaryPolyline(points) {
  if (points.length < 2) return [];
  const [xMin, xMax] = pointsXRange(points);
  if (xMin >= 0 && xMax <= W) return [points];
  const out = [];
  if (xMin < 0) {
    for (const seg of clipPolylineHalfplane(points, 0, +1)) out.push(seg);
    for (const seg of clipPolylineHalfplane(points, 0, -1)) {
      out.push(shiftPolygonX(seg, +W));
    }
    return out;
  }
  for (const seg of clipPolylineHalfplane(points, W, -1)) out.push(seg);
  for (const seg of clipPolylineHalfplane(points, W, +1)) {
    out.push(shiftPolygonX(seg, -W));
  }
  return out;
}

// Draw the dynamic zodiac band (boundary ticks + sign glyphs) honoring
// the user's SETTINGS: zodiacSystem (Tropical or one of 10 sidereal
// variants), draconic (rotates everything so natal NN = sidereal Aries
// 0°), and coordinateSystem (Heliocentric disables draconic — gated
// server-side). The server returns { ayanamsa, signs: [{name, sidLon}] }
// and this function projects sidLon + ayanamsa onto the celestial sphere
// using the same equirectangular projection as the baked background.
//
// signs.length is 12 for all uniform-30° systems and 13 for "Midpoint
// (True Sidereal)" — the IAU constellation variant that includes
// Ophiuchus with uneven sign extents.
function drawSkyZodiac(group, zodiac) {
  group.selectAll("g.sky-zodiac").remove();
  if (!zodiac || !Array.isArray(zodiac.signs) || zodiac.signs.length === 0) {
    return;
  }

  const ay = zodiac.ayanamsa || 0;
  const signs = zodiac.signs;
  const N = signs.length;
  const B = SKY_ZODIAC_BAND_BETA;

  // Tropical ecliptic longitudes (degrees, mod 360) for each sign's
  // STARTING boundary. signs[i].sidLon is the sidereal longitude; adding
  // ayanamsa converts to tropical (= what the celestial sphere actually
  // shows). The sign ENDS at the next entry (with wraparound at i=N-1).
  const signLambdas = signs.map(
    (s) => (((s.sidLon + ay) % 360) + 360) % 360,
  );

  // Pre-compute each sign's λ span and midpoint in tropical degrees.
  // For uniform 12-sign zodiacs every span is exactly 30°; for the
  // "Midpoint (True Sidereal)" 13-sign mode each span is the unique
  // IAU-derived width (Ophiuchus is ~12.36°, Pisces ~32.13°, etc.).
  // The midpoint placement keeps glyphs visually centered within the
  // actual sign extent.
  const signSpans = [];
  for (let i = 0; i < N; i++) {
    const cur = signs[i].sidLon;
    const next = signs[(i + 1) % N].sidLon;
    let span = next - cur;
    if (span <= 0) span += 360;
    signSpans.push(span);
  }

  // Sample λ from lambdaA to lambdaA + span in fixed steps so the band
  // edges have an even sample density regardless of the sign's width.
  // Includes both endpoints.
  function lambdaSamples(lambdaA, span) {
    const out = [];
    const steps = Math.max(2, Math.ceil(span / SKY_ZODIAC_LON_STEP));
    for (let k = 0; k <= steps; k++) {
      out.push(lambdaA + (span * k) / steps);
    }
    return out;
  }

  // Sample β from βStart to βEnd inclusive at SKY_ZODIAC_LAT_STEP. The
  // sign of step is inferred from the endpoints so the same helper can
  // walk either direction along a boundary meridian.
  function betaSamples(betaStart, betaEnd) {
    const out = [];
    const dir = betaEnd >= betaStart ? 1 : -1;
    const span = Math.abs(betaEnd - betaStart);
    const steps = Math.max(2, Math.ceil(span / SKY_ZODIAC_LAT_STEP));
    for (let k = 0; k <= steps; k++) {
      out.push(betaStart + dir * (span * k) / steps);
    }
    return out;
  }

  // Build the closed polygon(s) for sign i's band. Sampled via
  // buildSkyPolyline so RA stays unwrapped, then SHIFT-SPLIT at the
  // antimeridian so each returned d-string is a closed polygon with
  // ALL coordinates inside [0, W]. Wrap-around signs (Pisces in
  // tropical, plus shifted-equivalents in sidereal modes) yield two
  // d-strings; non-wrapping signs yield one.
  function buildBandPathDs(lambdaA, span) {
    const samples = [];
    for (const b of betaSamples(-B, B)) samples.push({ lambda: lambdaA, beta: b });
    const topLambdas = lambdaSamples(lambdaA, span);
    for (let k = 1; k < topLambdas.length; k++) {
      samples.push({ lambda: topLambdas[k], beta: B });
    }
    for (const b of betaSamples(B, -B).slice(1)) {
      samples.push({ lambda: lambdaA + span, beta: b });
    }
    const bottomLambdas = lambdaSamples(lambdaA, span).reverse();
    for (let k = 1; k < bottomLambdas.length; k++) {
      samples.push({ lambda: bottomLambdas[k], beta: -B });
    }
    const points = buildSkyPolyline(samples);
    return splitBandPolygon(points).map((poly) => pointsToPathD(poly, true));
  }

  // Build the polyline(s) for a single boundary meridian (constant λ),
  // shift-split into [0, W] like the bands. The λ=0 / λ=360 meridian
  // splits across the antimeridian into two halves at opposite edges.
  function buildBoundaryPathDs(lambda) {
    const samples = betaSamples(-B, B).map((b) => ({ lambda, beta: b }));
    const points = buildSkyPolyline(samples);
    return splitBoundaryPolyline(points).map((seg) =>
      pointsToPathD(seg, false),
    );
  }

  // Tile 3× to match the wrap-around background, drawSkyPlanets, and
  // the prior tick-based implementation. Each tile draws three layers
  // in this z-order: bands (translucent fill) → boundary lines (gold) →
  // sign glyphs (gold text with halo).
  const zodiacG = group.append("g").attr("class", "sky-zodiac");
  for (const offsetX of [-W, 0, W]) {
    const tile = zodiacG
      .append("g")
      .attr("transform", `translate(${offsetX}, 0)`);

    // ---- Bands (z-order: bottom) ----
    const bandsG = tile
      .append("g")
      .attr("class", "sky-zodiac-bands")
      .attr("stroke", "none")
      .attr("fill-opacity", SKY_ZODIAC_BAND_OPACITY);
    for (let i = 0; i < N; i++) {
      const fill =
        SKY_SIGN_COLORS[signs[i].name.toLowerCase()] || "#777777";
      for (const d of buildBandPathDs(signLambdas[i], signSpans[i])) {
        bandsG.append("path").attr("d", d).attr("fill", fill);
      }
    }

    // ---- Boundary meridians (z-order: middle) ----
    // Sign-boundary perpendicular meridians (the "line between
    // constellations") are intentionally NOT drawn — the color change
    // between adjacent bands plus the gap in the degree-tick scale at
    // each boundary already convey where one sign ends and the next
    // begins. The buildBoundaryPathDs helper and the attachSkyZoom
    // selector for .sky-zodiac-boundaries are preserved so this block
    // can be restored cleanly by un-commenting:
    //
    // const ticksG = tile
    //   .append("g")
    //   .attr("class", "sky-zodiac-boundaries")
    //   .attr("stroke", "#c8a557")
    //   .attr("stroke-width", 0.6)
    //   .attr("fill", "none")
    //   .attr("stroke-linejoin", "round")
    //   .attr("stroke-linecap", "round");
    // for (let i = 0; i < N; i++) {
    //   for (const d of buildBoundaryPathDs(signLambdas[i])) {
    //     ticksG.append("path").attr("d", d);
    //   }
    // }

    // ---- Sign glyph labels (z-order: top) ----
    // SVG images sourced from /images/signs/colorized/ — the exact same
    // assets MAIN's chart wheel uses. Each sign carries its own MAIN
    // color baked into the SVG stroke (Aries red, Aquarius magenta,
    // etc.); Ophiuchus uses the non-colorized white version since its
    // colorized dark-gray would be invisible on navy. Centered on the
    // sign midpoint with the image's bottom resting just above the
    // ecliptic curve. Group-level opacity keeps the glyphs subdued —
    // close to the band-tint feel — so the constellations and stars
    // behind them stay legible. Tunable: SKY_ZODIAC_LABEL_OPACITY at
    // the top of the file.
    const labelsG = tile
      .append("g")
      .attr("class", "sky-zodiac-labels")
      .attr("opacity", SKY_ZODIAC_LABEL_OPACITY);
    for (let i = 0; i < N; i++) {
      const midLambda =
        (((signLambdas[i] + signSpans[i] / 2) % 360) + 360) % 360;
      const { x, y } = skyEclipticToXY(midLambda, 0);
      appendSkySignSymbol(labelsG, x, y - SKY_SIGN_SYMBOL_HALF - 1, signs[i].name);
    }
  }
}

// ---- Ecliptic degree ticks --------------------------------------
//
// Half-height in ecliptic latitude β of each tick size:
//   β=1.20° → ~6.7 vbox tall (10° major)
//   β=0.85° → ~4.7 vbox tall (5° medium)
//   β=0.27° → ~1.5 vbox tall (1° minor — matches SKY_ECLIPTIC_LINE_WIDTH
//                              so the minor tick reads as a small square
//                              dot the same scale as the ecliptic's own
//                              line thickness)
// All three remain well shorter than the zodiac sign-boundary lines
// (β=±15° → ~83 vbox) so the hierarchy reads clearly: boundary >>
// 10° tick > 5° tick > 1° tick.
const SKY_ECLIPTIC_TICK_BETA_MAJOR = 1.20;
const SKY_ECLIPTIC_TICK_BETA_MEDIUM = 0.85;
const SKY_ECLIPTIC_TICK_BETA_MINOR = 0.27;

// Opacity applied to the whole sky-ecliptic-ticks group. Damps all
// three tick sizes uniformly so the ruler reads transparently against
// the constellation field. Tunable in 0..1.
const SKY_ECLIPTIC_TICK_OPACITY = 0.25;

// Opacity applied to the baked ecliptic line in ensureSkyBackground.
// The ecliptic reads as a gentle reference guide rather than a bold
// gold curve. Tunable in 0..1.
const SKY_ECLIPTIC_LINE_OPACITY = 0.5;

// Stroke width (viewBox units) of the baked ecliptic line. The baked
// asset draws it at 0.5; we override here and in attachSkyZoom (which
// keeps the line screen-pixel-constant at zoom).
const SKY_ECLIPTIC_LINE_WIDTH = 1.5;

// House cusp marker lines on the Sky view — one vertical line per natal
// house cusp, drawn at the RA where the cusp's tropical ecliptic
// longitude projects. Slate-blue-grey so cusps live in the same cool
// tonal family as the constellation lines (#3d5878 in the baked SVG)
// rather than competing with the warm gold of the ecliptic. Slightly
// lighter than the constellation color so they're distinguishable.
// Low opacity keeps them as quiet reference markers — visible if
// you're looking for them, not loud enough to compete with stars or
// constellation lines for attention. Position depends on the user's
// chosen house system (Placidus, Koch, Equal, Whole Sign, etc.) via
// window.natalHouseCusps (set by sharedNatal.js after natal render).
const SKY_HOUSE_CUSP_COLOR = "#6a7d96";
const SKY_HOUSE_CUSP_OPACITY = 0.1;
const SKY_HOUSE_CUSP_WIDTH = 1;

// Project a tick at a given ecliptic longitude (β extremes ±halfBeta)
// to its geometry in viewBox space: the (cx, cy) midpoint on the
// ecliptic, the angle the tick makes with the +x axis (so we can
// translate+rotate a horizontal line to draw it), and the half-length
// of the tick in vbox units. RA on the second endpoint is unwrapped
// so the geometry stays continuous through the antimeridian — tile
// rendering then handles visibility at each screen edge.
function buildSkyTickGeometry(lambdaDeg, halfBeta) {
  const top = skyEclipticToEquatorial(lambdaDeg, +halfBeta);
  const bot = skyEclipticToEquatorial(lambdaDeg, -halfBeta);
  let topRa = ((top.raDeg % 360) + 360) % 360;
  let botRa = bot.raDeg;
  while (botRa < topRa - 180) botRa += 360;
  while (botRa > topRa + 180) botRa -= 360;
  const x1 = W - (topRa / 360) * W;
  const y1 = ((90 - top.decDeg) / 180) * H;
  const x2 = W - (botRa / 360) * W;
  const y2 = ((90 - bot.decDeg) / 180) * H;
  const dx = x2 - x1;
  const dy = y2 - y1;
  return {
    cx: (x1 + x2) / 2,
    cy: (y1 + y2) / 2,
    angle: (Math.atan2(dy, dx) * 180) / Math.PI,
    halfLength: Math.sqrt(dx * dx + dy * dy) / 2,
  };
}

// Draw the degree ticks along the ecliptic. Each integer degree within
// each sign gets a perpendicular tick mark. Three sizes — 1°/5°/10° —
// in three child groups so attachSkyZoom can compensate stroke-width
// independently (and skip the minor group entirely; see below).
//
// The 0° tick of every sign is intentionally NOT drawn — it would sit
// exactly on top of the existing 30° (or non-uniform Midpoint) sign
// boundary line, which is much larger and already marks that point.
function drawSkyEclipticTicks(group, zodiac) {
  group.selectAll("g.sky-ecliptic-ticks").remove();
  if (!zodiac || !Array.isArray(zodiac.signs) || zodiac.signs.length === 0) {
    return;
  }
  const ay = zodiac.ayanamsa || 0;
  const signs = zodiac.signs;
  const N = signs.length;

  // Sign spans in sidereal degrees (same logic as drawSkyZodiac).
  const signSpans = [];
  for (let i = 0; i < N; i++) {
    const cur = signs[i].sidLon;
    const next = signs[(i + 1) % N].sidLon;
    let span = next - cur;
    if (span <= 0) span += 360;
    signSpans.push(span);
  }

  // Group-level opacity damps all three tick sizes uniformly so the
  // ruler reads as a subtle scale rather than a bold scaffolding over
  // the constellation field. Tunable below.
  const ticksG = group
    .append("g")
    .attr("class", "sky-ecliptic-ticks")
    .attr("opacity", SKY_ECLIPTIC_TICK_OPACITY);
  // Tile 3× like everything else on the Sky view.
  for (const offsetX of [-W, 0, W]) {
    const tile = ticksG
      .append("g")
      .attr("transform", `translate(${offsetX}, 0)`);
    // Three sub-groups in z-order minor → medium → major. Stroke
    // widths bumped slightly thicker per user request. Each tick is
    // structured as <g translate+rotate><g class="sky-tick-scale"><line></g></g>
    // — outer group positions and orients the tick, inner "scale"
    // group is set to scale(1/k) per zoom frame in attachSkyZoom so
    // the tick stays screen-pixel-constant in both length AND stroke
    // width (the nested scale cancels with the outer zoom transform).
    // stroke-linecap left at SVG default "butt" (flat ends at the exact
    // line endpoints). Round caps extend the visible line by half the
    // stroke-width past each endpoint, which made the 1° ticks visibly
    // longer than the ecliptic width they're supposed to match. Butt
    // caps give precise tick lengths.
    const minorG = tile
      .append("g")
      .attr("class", "sky-tick-minor")
      .attr("stroke", "#c8a557")
      .attr("stroke-width", 0.45);
    const medG = tile
      .append("g")
      .attr("class", "sky-tick-medium")
      .attr("stroke", "#c8a557")
      .attr("stroke-width", 0.6);
    const majorG = tile
      .append("g")
      .attr("class", "sky-tick-major")
      .attr("stroke", "#c8a557")
      .attr("stroke-width", 0.8);

    for (let i = 0; i < N; i++) {
      const startSid = signs[i].sidLon;
      const span = signSpans[i];
      // Highest integer degree inside the sign (strictly less than the
      // span, so we don't double-draw the next sign's 0° boundary).
      const maxDeg = Math.floor(span - 0.001);
      for (let deg = 1; deg <= maxDeg; deg++) {
        const lambda = ((startSid + deg + ay) % 360 + 360) % 360;
        let halfBeta, g;
        if (deg % 10 === 0) {
          halfBeta = SKY_ECLIPTIC_TICK_BETA_MAJOR;
          g = majorG;
        } else if (deg % 5 === 0) {
          halfBeta = SKY_ECLIPTIC_TICK_BETA_MEDIUM;
          g = medG;
        } else {
          halfBeta = SKY_ECLIPTIC_TICK_BETA_MINOR;
          g = minorG;
        }
        const geom = buildSkyTickGeometry(lambda, halfBeta);
        const tickG = g
          .append("g")
          .attr(
            "transform",
            `translate(${geom.cx.toFixed(2)},${geom.cy.toFixed(2)}) rotate(${geom.angle.toFixed(2)})`,
          );
        tickG
          .append("g")
          .attr("class", "sky-tick-scale")
          .append("line")
          .attr("x1", (-geom.halfLength).toFixed(2))
          .attr("y1", 0)
          .attr("x2", geom.halfLength.toFixed(2))
          .attr("y2", 0);
      }
    }
  }
}

// Sky-view planet symbol size (viewBox units). Larger than the World
// map's SYMBOL_SIZE=11 because the Sky canvas is much broader. Tunable.
const SKY_PLANET_SYMBOL_SIZE = 20;
const SKY_PLANET_SYMBOL_HALF = SKY_PLANET_SYMBOL_SIZE / 2;

// Orb radius (viewBox units). Sized to fit INSIDE the glyph's bounding
// box so neighboring planet orbs never overlap — that was the root
// cause of the earlier Christmas-light effect. The orb fill is a per-
// planet radial gradient (defined once in <defs>) with a flat-top
// plateau holding opacity 1.0 from 0% to 25% of the radius before
// smoothly fading to 0 at the edge.
const SKY_PLANET_ORB_RADIUS = 8;

// Center pinpoint sits ON TOP of the gradient orb but UNDER the glyph
// — a tiny near-white dot marking the exact (RA, Dec). Small enough
// (radius 1.4) that it reads as a "bright nucleus", not a hard-edged
// circle stacked on the orb, and small enough to peek through the
// transparent center of every planet glyph.
const SKY_PLANET_PINPOINT_RADIUS = 1.4;
const SKY_PLANET_PINPOINT_COLOR = "#f2f5fa";

function skyPlanetOrbGradientId(planetName) {
  return `sky-orb-${planetSvgFile(planetName)}`;
}

// Sky-only planet symbol helper. Mirrors the shared appendSymbol used
// by the World view but at a larger size and with a gradient orb drawn
// BENEATH the glyph plus a small near-white pinpoint AT the orb's
// center. Three layers from back to front:
//   1) Soft gradient halo  — per-planet color, smooth glow
//   2) Pinpoint dot        — near-white, marks exact (RA, Dec)
//   3) Planet glyph        — identity
function appendSkyPlanetSymbol(group, cx, cy, svgFile, planetName) {
  const wrap = group
    .append("g")
    .attr("class", "astro-symbol")
    .attr("transform", `translate(${cx},${cy})`)
    .style("cursor", "pointer")
    .on("click", (event) => {
      // Trigger the same planet-interpretation popup the natal wheel shows.
      // window.showPlanetDetails is exposed by sharedNatal.js; window.natalPlanets
      // is populated when the natal chart renders. If either isn't ready yet
      // (e.g. the user reached MAP before MAIN finished), the click is a silent
      // no-op. stopPropagation keeps the click from falling through to the
      // SVG's pan/zoom layer.
      //
      // Name translation: the MAP server returns the North Node planet under
      // its form-value name "True_Node" (matches PLANET_MAP and the SETTINGS
      // checkbox), but the natal chart engine renames it to "North Node"
      // at calculate-natal.js:480 before storing in window.natalPlanets.
      // Without translating, find() would never match → silent no-op on
      // every North Node click. Every other planet name matches verbatim
      // across both sources.
      event.stopPropagation();
      if (!window.natalPlanets || !window.showPlanetDetails) return;
      const natalLookupName =
        planetName === "True_Node" ? "North Node" : planetName;
      const natalPlanet = window.natalPlanets.find(
        (p) => p.name === natalLookupName,
      );
      if (natalPlanet) {
        window.showPlanetDetails(natalPlanet, "natal");
      }
    });
  const scale = wrap.append("g").attr("class", "astro-symbol-scale");
  // 1) Gradient orb (per-planet radial gradient).
  scale
    .append("circle")
    .attr("class", "astro-orb")
    .attr("cx", 0)
    .attr("cy", 0)
    .attr("r", SKY_PLANET_ORB_RADIUS)
    .attr("fill", `url(#${skyPlanetOrbGradientId(planetName)})`);
  // 2) Pinpoint — exact position marker. Tiny, bright, near-white so
  // it stands out against any planet's gradient color.
  scale
    .append("circle")
    .attr("class", "astro-orb-pinpoint")
    .attr("cx", 0)
    .attr("cy", 0)
    .attr("r", SKY_PLANET_PINPOINT_RADIUS)
    .attr("fill", SKY_PLANET_PINPOINT_COLOR);
  // 3) Glyph.
  scale
    .append("image")
    .attr("x", -SKY_PLANET_SYMBOL_HALF)
    .attr("y", -SKY_PLANET_SYMBOL_HALF)
    .attr("width", SKY_PLANET_SYMBOL_SIZE)
    .attr("height", SKY_PLANET_SYMBOL_SIZE)
    .attr("href", `/images/planets/${svgFile}.svg`);
}

// Derive the South Node's (RA, Dec) from True_Node's and return an
// augmented planets array — Sky-view ONLY. Reason: getCheckedPlanets
// drops the South Node when both nodes are checked in SETTINGS so the
// World map doesn't paint two colors on identical antipodal lines.
// But on the Sky view the South Node sits at a totally different point
// (180° away in RA, negated Dec), so it needs to render. This helper
// reproduces what the server would compute if we'd asked it for the
// South Node — same antipode math the server uses — so Sky gets the
// glyph without changing the World-view code path at all.
function augmentSkyPlanetsWithSouthNode(planets) {
  const southNodeChecked = !!document.querySelector(
    '#planet-settings input[name="planet"][value="South Node"]:checked',
  );
  if (!southNodeChecked) return planets;
  if (planets.some((p) => p.name === "South Node")) return planets;
  const northNode = planets.find((p) => p.name === "True_Node");
  if (!northNode) return planets;
  return planets.concat([
    {
      name: "South Node",
      ra: (northNode.ra + 180) % 360,
      dec: -northNode.dec,
    },
  ]);
}

// Same antipode pattern as augmentSkyPlanetsWithSouthNode, applied to
// Lilith ↔ Priapus. getCheckedPlanets() drops Priapus from the World-map
// request when Lilith is also checked (their World lines overlap), so on
// the Sky view we recover Priapus from Lilith's (RA, Dec) — same math
// the server would use if we'd asked it for Priapus directly. Silent
// no-op in helio mode: the MAP server filters Lilith out (HELIO_ONLY_SKIP),
// so planets has no Lilith entry → find() returns undefined → we return
// planets unchanged.
function augmentSkyPlanetsWithPriapus(planets) {
  const priapusChecked = !!document.querySelector(
    '#planet-settings input[name="planet"][value="Priapus"]:checked',
  );
  if (!priapusChecked) return planets;
  if (planets.some((p) => p.name === "Priapus")) return planets;
  const lilith = planets.find((p) => p.name === "Lilith");
  if (!lilith) return planets;
  return planets.concat([
    {
      name: "Priapus",
      ra: (lilith.ra + 180) % 360,
      dec: -lilith.dec,
    },
  ]);
}

// Add the four chart angles (Ascendant, Midheaven, Descendant, Imum Coeli)
// to the Sky-view planets array when the user has them enabled in SETTINGS.
// Sky-view ONLY — the server's PLANET_MAP filter drops angle names (no
// swisseph constant), so data.planets never contains them and the World
// map naturally renders zero angle lines.
//
// Position source: window.natalPlanets (set by sharedNatal.js once MAIN's
// natal chart finishes calculating). Each angle entry there carries a
// `tropical` field — the raw tropical ecliptic longitude — which we
// convert to equatorial (RA, Dec) via the existing skyEclipticToEquatorial
// helper. Angles are points ON the ecliptic, so ecliptic latitude β = 0.
//
// Form-value vs natal-name: SETTINGS uses "Ascendant_Symbol" as the
// checkbox value, but the natal chart stores the entry under
// "Ascendant Symbol" (space, not underscore). We store the natal-name in
// the returned entry so PLANET_COLORS, planetSvgFile, and the Sky-planet
// click handler (which finds the entry in window.natalPlanets by name)
// all resolve cleanly without further translation.
function augmentSkyPlanetsWithAngles(planets) {
  if (!window.natalPlanets) return planets;
  const ANGLE_MAP = {
    Ascendant_Symbol: "Ascendant Symbol",
    Midheaven: "Midheaven",
    Descendant: "Descendant",
    "Imum Coeli": "Imum Coeli",
  };
  const additions = [];
  for (const [formValue, natalName] of Object.entries(ANGLE_MAP)) {
    const checked = !!document.querySelector(
      `#planet-settings input[name="planet"][value="${formValue}"]:checked`,
    );
    if (!checked) continue;
    if (planets.some((p) => p.name === natalName)) continue;
    const natal = window.natalPlanets.find((p) => p.name === natalName);
    if (!natal || typeof natal.tropical !== "number") continue;
    const { raDeg, decDeg } = skyEclipticToEquatorial(natal.tropical, 0);
    additions.push({ name: natalName, ra: raDeg, dec: decDeg });
  }
  return additions.length ? planets.concat(additions) : planets;
}

function clearSkyHouseCusps(group) {
  group.selectAll("g.sky-house-cusps").remove();
}

// Draw a vertical line at the RA of each natal house cusp. Position
// reflects the user's chosen house system in SETTINGS (Placidus, Koch,
// Equal, Whole Sign, etc.) because window.natalHouseCusps already
// carries the system-appropriate longitudes from the natal calc.
//
// Why we reconstruct tropical from (position + ayanamsa) instead of
// reading cusp.tropical directly: the chart engine's Whole Sign branches
// at chart-engine/src/engine/calculate-natal.js:1292-1319 mislabel their
// `tropical` field — they actually store the user-zodiac-system
// longitude there (sidereal in sidereal modes), NOT the raw tropical.
// The non-Whole-Sign branch at :1322-1329 sets it correctly. To stay
// correct across every house-system × zodiac-system combination, we
// reconstruct: `tropical = (cusp.position + ayanamsa) mod 360`. The
// `position` field is reliably the user-zodiac-system longitude in
// every branch, and `adjustPosition(p, ayanamsa) = p - ayanamsa`
// (calculate-natal.js:15-23) so adding ayanamsa back inverts the
// adjustment. For tropical mode ayanamsa=0 → no-op. For all sidereal
// modes including Midpoint (True Sidereal), the addition recovers the
// raw tropical longitude that skyEclipticToEquatorial needs.
//
// Defensive: if natal hasn't finished rendering yet (window value not
// set) or returns an empty list, this is a silent no-op — Sky view
// still renders everything else. Same 3-tile horizontal wrap-around
// pattern as drawSkyPlanets so cusps appear on whichever tile the user
// has panned to.
function drawSkyHouseCusps(group, zodiacInfo) {
  clearSkyHouseCusps(group);
  if (!window.natalHouseCusps || window.natalHouseCusps.length === 0) return;
  const ayanamsa =
    zodiacInfo && typeof zodiacInfo.ayanamsa === "number"
      ? zodiacInfo.ayanamsa
      : 0;
  const cuspsG = group.append("g").attr("class", "sky-house-cusps");
  for (const offsetX of [-W, 0, W]) {
    const tile = cuspsG
      .append("g")
      .attr("transform", `translate(${offsetX}, 0)`);
    for (const cusp of window.natalHouseCusps) {
      if (typeof cusp.position !== "number") continue;
      const tropicalLon = (((cusp.position + ayanamsa) % 360) + 360) % 360;
      const { raDeg } = skyEclipticToEquatorial(tropicalLon, 0);
      // Match drawSkyPlanets' RA-mirrored mapping: RA increases east-is-left.
      const ra360 = (((raDeg % 360) + 360) % 360);
      const cx = W - (ra360 / 360) * W;
      tile
        .append("line")
        .attr("x1", cx)
        .attr("y1", 0)
        .attr("x2", cx)
        .attr("y2", H)
        .attr("stroke", SKY_HOUSE_CUSP_COLOR)
        .attr("stroke-width", SKY_HOUSE_CUSP_WIDTH)
        .attr("opacity", SKY_HOUSE_CUSP_OPACITY);
    }
  }
}

function clearSkyPlanets(group) {
  group.selectAll("g.sky-planets").remove();
}

function drawSkyPlanets(group, planets) {
  clearSkyPlanets(group);
  const planetsG = group.append("g").attr("class", "sky-planets");
  // Tile the planet glyphs 3x horizontally to match the background's
  // 3-tile rendering — so planets appear on whichever tile the user has
  // panned to. ~10 planets * 3 = ~30 glyph nodes total, trivial cost.
  for (const offsetX of [-W, 0, W]) {
    const tile = planetsG
      .append("g")
      .attr("transform", `translate(${offsetX}, 0)`);
    for (const p of planets) {
      const svgFile = planetSvgFile(p.name);
      // Equirectangular projection with RA MIRRORED (east-is-left,
      // planisphere/Stellarium convention — see the build script for
      // the matching transform).
      const cx = W - ((((p.ra % 360) + 360) % 360) / 360) * W;
      const cy = ((90 - p.dec) / 180) * H;
      appendSkyPlanetSymbol(tile, cx, cy, svgFile, p.name);
    }
  }
}

function attachSkyZoom() {
  if (skyZoomBehavior) return skyZoomBehavior;
  skyZoomBehavior = d3
    .zoom()
    .scaleExtent([1, 4])
    // y bounds are tight ([0, H]) so the user cannot drag past the
    // celestial poles into blank space. x bounds are intentionally huge
    // because the actual horizontal bounding is the wrap-around inside
    // the "zoom" callback below — that wrap lets the user pan left/right
    // indefinitely across the 3-tile background.
    .translateExtent([[-1e9, 0], [1e9, H]])
    .clickDistance(5)
    .filter((event) => {
      // Block wheel (so the page can scroll past the map without the
      // wheel zooming it) and ALL touch events. d3.zoom's touch
      // handlers call preventDefault on touchstart/touchmove, which
      // in practice blocks page-scroll even when `touch-action: pan-y`
      // is set in CSS. To get the chart's proven mobile UX — vertical
      // drags scroll the page, horizontal drags pan the map — we
      // attach our own touch handlers below (see attachSkyZoom's
      // skySvg.on("touchstart"...) block) that detect direction and
      // only preventDefault on horizontal motion.
      if (event.type === "wheel") return false;
      if (event.type === "touchstart") return false;
      if (event.type === "touchmove") return false;
      return true;
    })
    .on("zoom", (event) => {
      const t = event.transform;
      // Wrap-around: keep tx inside [-W*k, 0] so the user can pan left or
      // right forever. The 3-tile background means tx=0 and tx=-W*k show
      // visually identical content, so the reset is imperceptible. Skip
      // this check for programmatic transforms (sourceEvent == null) so
      // we don't recurse infinitely.
      if (event.sourceEvent) {
        const wScaled = W * t.k;
        let tx = t.x;
        while (tx > 0) tx -= wScaled;
        while (tx < -wScaled) tx += wScaled;
        if (tx !== t.x) {
          skySvg.call(
            skyZoomBehavior.transform,
            d3.zoomIdentity.translate(tx, t.y).scale(t.k),
          );
          return; // The programmatic reset triggers another zoom event
                  // (with sourceEvent==null) which will render normally.
        }
      }
      skyGroup.attr("transform", t.toString());
      // Stars are the ONLY element on the Sky view that stays at
      // constant screen-pixel size under zoom. Each circle carries its
      // own data-base-r baked at SVG-build time from magnitude;
      // setting r = baseR / t.k cancels with the outer skyGroup
      // scale(t.k), so the star pattern holds its size at every zoom
      // level as a stable visual reference. Everything else
      // (constellation lines, ecliptic, ticks, planets, orbs, glyphs)
      // grows naturally with the outer transform.
      skyGroup
        .selectAll("g.sky-bg .stars circle")
        .attr("r", function () {
          const baseR = +this.getAttribute("data-base-r") || 1;
          return baseR / t.k;
        });
    });
  skySvg.call(skyZoomBehavior);

  // Custom touch-pan: d3.zoom's built-in touch handling is filtered
  // off above because it calls preventDefault on every touchstart/
  // touchmove, which blocks page scroll even with `touch-action:
  // pan-y` set in CSS. We replicate the chart's proven mobile UX
  // here: a touch drag commits to either horizontal-map-pan OR
  // vertical-page-scroll based on initial motion past a small
  // threshold, and only the horizontal branch calls preventDefault.
  // Multi-touch is ignored entirely (the touch-action: pan-y CSS
  // already blocks the browser from pinch-zooming the page on the
  // sky map svg, so pinches simply do nothing).
  // Threshold = 0: direction is committed on the very first touchmove
  // with any motion, based on whichever of |dx| / |dy| is larger.
  // Eliminates the dead-zone entirely so horizontal pan tracks the
  // finger from pixel 1. Trade-off: a vertical scroll that starts
  // with any horizontal bias (even 1 px) commits to horizontal and
  // won't release until the user lifts and re-touches.
  const TOUCH_DIRECTION_THRESHOLD_PX = 0;
  let touchStartClientX = null;
  let touchStartClientY = null;
  let touchLastClientX = null;
  let touchDirection = null; // null | "horizontal" | "vertical"

  function resetTouchState() {
    touchStartClientX = null;
    touchStartClientY = null;
    touchLastClientX = null;
    touchDirection = null;
  }

  skySvg.on("touchstart.skypan", (event) => {
    if (event.touches.length !== 1) {
      resetTouchState();
      return;
    }
    const t = event.touches[0];
    touchStartClientX = t.clientX;
    touchStartClientY = t.clientY;
    touchLastClientX = t.clientX;
    touchDirection = null;
  });

  skySvg.on("touchmove.skypan", (event) => {
    if (touchStartClientX === null) return;
    if (event.touches.length !== 1) {
      resetTouchState();
      return;
    }
    const t = event.touches[0];
    if (touchDirection === null) {
      const dx = t.clientX - touchStartClientX;
      const dy = t.clientY - touchStartClientY;
      const ax = Math.abs(dx);
      const ay = Math.abs(dy);
      if (ax < TOUCH_DIRECTION_THRESHOLD_PX && ay < TOUCH_DIRECTION_THRESHOLD_PX) {
        return; // not enough movement to decide yet
      }
      touchDirection = ax > ay ? "horizontal" : "vertical";
      if (touchDirection === "vertical") {
        // Disengage: let the browser scroll the page from here on.
        resetTouchState();
        return;
      }
    }
    if (touchDirection === "horizontal") {
      event.preventDefault();
      const deltaX = t.clientX - touchLastClientX;
      touchLastClientX = t.clientX;
      // translateBy goes through the zoom event with the wrap-around
      // + translateExtent logic above, so all existing pan behavior
      // (3-tile wrap, k-aware scaling) is preserved automatically.
      // The touch event is passed as the 4th arg so the dispatched zoom
      // event carries a non-null sourceEvent — the wrap-around branch in
      // the "zoom" handler is gated on event.sourceEvent, and without it
      // touch pans never wrapped, so the sky ran off the 3 tiles into
      // black after ~3 widths (mobile-only; desktop mouse drags set
      // sourceEvent natively and always wrapped).
      const k = d3.zoomTransform(skySvg.node()).k;
      skyZoomBehavior.translateBy(skySvg, deltaX / k, 0, event);
    }
  });

  skySvg.on("touchend.skypan touchcancel.skypan", () => {
    resetTouchState();
  });

  return skyZoomBehavior;
}

async function initSkyMapSvg() {
  if (skyMapInitialized) return;
  const container = d3.select("#sky-map");
  container.selectAll("*").remove();
  skySvg = container
    .append("svg")
    .attr("viewBox", `0 0 ${W} ${H}`)
    .attr("preserveAspectRatio", "xMidYMid meet")
    .attr("class", "sky-map-svg")
    .style("width", "100%")
    .style("height", "auto")
    .style("max-width", "100%")
    .style("background", "#0b1426")
    .style("cursor", "default");
  // One radial-gradient per planet for the orb. Stops give a flat-top
  // opacity plateau (1.0 from 0% to 25%) for a genuinely solid center,
  // then a smooth fade to fully transparent at the edge — the "slight
  // glow" the user asked for. Each gradient bakes the planet's color
  // into all stops (using currentColor through a url() reference is
  // unreliable across browsers — per-planet defs is the safe path).
  const orbDefs = skySvg.append("defs");
  for (const planetName of Object.keys(PLANET_COLORS)) {
    const color = skyOrbColor(planetName);
    const g = orbDefs
      .append("radialGradient")
      .attr("id", skyPlanetOrbGradientId(planetName));
    g.append("stop")
      .attr("offset", "0%")
      .attr("stop-color", color)
      .attr("stop-opacity", 1);
    g.append("stop")
      .attr("offset", "25%")
      .attr("stop-color", color)
      .attr("stop-opacity", 1);
    g.append("stop")
      .attr("offset", "60%")
      .attr("stop-color", color)
      .attr("stop-opacity", 0.45);
    g.append("stop")
      .attr("offset", "100%")
      .attr("stop-color", color)
      .attr("stop-opacity", 0);
  }
  skyGroup = skySvg.append("g").attr("class", "sky-map-group");
  await ensureSkyBackground(skyGroup);
  attachSkyZoom();
  // No click handler attached. Sky view click-to-relocate is intentionally
  // a no-op (the celestial sphere has no geographic location to relocate
  // to). Default browser behavior (do nothing) is exactly what's wanted.
  skyMapInitialized = true;
}

// ---- View toggle (World / Sky) ---------------------------------

function buildViewToggle() {
  const astroMap = document.getElementById("astro-map");
  if (!astroMap) return;
  if (document.getElementById("astro-view-toggle")) return;

  const row = document.createElement("div");
  row.id = "astro-view-toggle";
  // 25px top margin matches the original #astro-map breathing-room above the
  // first MAP-section element (see styles.css:776). Originally that 25px
  // sat between the menu and the world map. When the JS-inserted toggle
  // row was added it took the top position with only 8px above it, pushing
  // the section's "first visible element" tight to the menu. Restoring 25px
  // here moves the toggle (and everything below it) down to match the
  // visual spacing the rest of the section was designed around.
  row.style.cssText =
    "display:flex; align-items:center; justify-content:center; " +
    "gap:10px; margin-top:25px; margin-bottom:12px;";

  function btn(label, view) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "animation-control-btn astro-view-btn";
    b.dataset.view = view;
    b.style.cssText =
      "font-size:18px; cursor:pointer; padding:5px 18px; " +
      "border:none; border-radius:5px;";
    b.textContent = label;
    b.addEventListener("click", () => setActiveView(view));
    return b;
  }

  row.appendChild(btn("World", "world"));
  row.appendChild(btn("Sky", "sky"));
  astroMap.parentNode.insertBefore(row, astroMap);
  updateViewToggleStyling();
}

function setActiveView(view) {
  if (view !== "world" && view !== "sky") return;
  if (currentView === view) return;
  currentView = view;
  const world = document.getElementById("astro-map");
  const sky = document.getElementById("sky-map");
  if (world) world.style.display = view === "world" ? "block" : "none";
  if (sky) sky.style.display = view === "sky" ? "block" : "none";
  updateViewToggleStyling();
  // Hide any open relocation tooltip when toggling away from the World
  // view so the popup doesn't leak across views.
  if (view === "sky") hideRelocationTooltip();
}

function updateViewToggleStyling() {
  document.querySelectorAll(".astro-view-btn").forEach((b) => {
    const active = b.dataset.view === currentView;
    b.style.background = active ? "#c8a557" : "";
    b.style.color = active ? "#0b1426" : "";
    b.style.fontWeight = active ? "bold" : "";
  });
}

function getActiveViewCtx() {
  return currentView === "world"
    ? { svg: mapSvg, group: mapGroup, zoomBehavior }
    : { svg: skySvg, group: skyGroup, zoomBehavior: skyZoomBehavior };
}

function mapZodiacData(serverZodiac) {
  const natalMeta = Array.isArray(window.natalData) ? window.natalData[0] : null;
  if (!Array.isArray(natalMeta?.zodiacBoundaries)) return serverZodiac;
  return {
    ...serverZodiac,
    signs: natalMeta.zodiacBoundaries.map((item) => ({
      name: item.sign,
      sidLon: item.boundary,
    })),
  };
}

// ---- Main ------------------------------------------------------

async function initMapSvg() {
  if (mapInitialized) return;
  const container = d3.select("#astro-map");
  container.selectAll("*").remove();
  mapSvg = container
    .append("svg")
    .attr("viewBox", `0 0 ${W} ${H}`)
    .attr("preserveAspectRatio", "xMidYMid meet")
    .attr("class", "astro-map-svg")
    .style("width", "100%")
    .style("height", "auto")
    .style("max-width", "100%")
    .style("background", "#eef2f7")
    .style("cursor", "crosshair");
  mapGroup = mapSvg.append("g").attr("class", "astro-map-group");
  await ensureWorldBackground(mapGroup);
  attachZoom();
  // Delayed click handler so double-clicks don't trigger the relocation
  // popup. d3.zoom handles dblclick-to-zoom natively; we just need to
  // disambiguate single-click (relocate) from double-click (zoom in).
  mapSvg.on("click", (event) => {
    if (event.detail === 2) {
      // 2nd click of a double-click — cancel pending and skip
      if (pendingClickTimer) {
        clearTimeout(pendingClickTimer);
        pendingClickTimer = null;
      }
      return;
    }
    if (pendingClickTimer) clearTimeout(pendingClickTimer);
    // Dismiss-then-relocate UX: if the relocation popup is currently
    // visible, this click is dismissing it via the global tooltip-close
    // handler in graph.js:18-22 (which fires for every left-button click
    // and clears `.tooltip`). Don't ALSO schedule a new relocation —
    // user has to click again on the map to start a fresh relocation
    // flow. Matches the "click anywhere closes popup cleanly" pattern
    // every other tooltip in the app uses. Tooltip is visible if opacity
    // is > 0 (the relocation tooltip sets opacity 0.95 when shown).
    const tooltipNode = d3.select(".tooltip").node();
    if (
      tooltipNode &&
      tooltipNode.style.opacity !== "" &&
      parseFloat(tooltipNode.style.opacity) > 0
    ) {
      return;
    }
    pendingClickTimer = setTimeout(() => {
      pendingClickTimer = null;
      handleMapClick(event);
    }, SINGLE_CLICK_DELAY_MS);
  });

  // Safety net: if dblclick fires (slow double-click that slipped through
  // the delay window), cancel any pending click and dismiss any tooltip
  // that may already have appeared.
  mapSvg.on("dblclick.cancelclick", () => {
    if (pendingClickTimer) {
      clearTimeout(pendingClickTimer);
      pendingClickTimer = null;
    }
    hideRelocationTooltip();
  });
  // Zoom-control row (+ / ↺ / −) intentionally disabled — users found the
  // buttons more confusing than helpful, and zoom remains fully reachable
  // via the documented gestures (double-click to zoom in, double-right-
  // click or two-finger double-tap to zoom out, drag to pan). Uncomment
  // the call below to restore the row; buildZoomControls() definition is
  // still in place.
  // buildZoomControls();
  mapInitialized = true;
  // Insert the World / Sky toggle row above #astro-map. Idempotent — safe
  // to call multiple times.
  buildViewToggle();
}

async function handleView(e) {
  if (e) e.preventDefault();
  const natal = getNatalFormData();
  if (!natal) {
    showError("Generate a chart in MAIN first.");
    return;
  }
  const planets = getCheckedPlanets();
  if (planets.length === 0) {
    showError("Enable at least one planet in SETTINGS.");
    return;
  }
  // No loading-overlay manipulation here. MAP auto-renders silently after
  // the natal cascade — the same pattern triwheel/return follow. Showing
  // an overlay here would briefly flash the screen for the 10K existing
  // users whenever they Calculate a natal chart (or change a setting),
  // which is an unacceptable behavior change. The natal flow's own
  // overlay already covers the perceived "loading" period; MAP renders in
  // the background and is ready when the user navigates to it.

  try {
    await initMapSvg();
    await initSkyMapSvg();
    const data = await fetchAstrocartography(natal, planets);
    if (!data) return; // legacy safety: fetchAstrocartography returns null
    // World render (existing)
    drawLines(mapGroup, data.planets, data.gmst);
    drawLegend(mapGroup, data.planets);
    // Sky render (new) — same planet data, projected onto the celestial
    // sphere. Renders into the hidden #sky-map container; user sees it on
    // toggle. World is rendered first so a Sky-side error doesn't keep
    // the World view from appearing.
    //
    // Z-order matters here: drawSkyZodiac appends g.sky-zodiac (bands +
    // boundary lines + glyphs) before drawSkyPlanets appends g.sky-
    // planets, so planet glyphs sit on top of the translucent bands. On
    // re-render (SETTINGS change → cascade), each helper removes its
    // own group and re-appends, so the same z-order is preserved.
    // Dynamic zodiac band — honors the user's zodiacSystem/draconic/
    // coordinateSystem from SETTINGS so the Sky view's zodiac matches
    // what MAIN displays. Server returned { ayanamsa, signs } in
    // data.zodiac; defaults to Tropical/no-op if omitted.
    const skyZodiac = mapZodiacData(data.zodiac);
    drawSkyZodiac(skyGroup, skyZodiac);
    drawSkyEclipticTicks(skyGroup, skyZodiac);
    // House cusp markers — faint vertical lines at each natal cusp's RA.
    // Drawn BEFORE planets so planet glyphs sit on top of cusp lines that
    // happen to pass through their RA (most visible at AC/IC/DC/MC, where
    // the cusp is also an angle glyph). Passes data.zodiac so the cusp
    // longitudes can be converted from the user's zodiac frame back to
    // tropical for the equatorial projection (the Whole Sign branches in
    // calculate-natal.js mislabel their `tropical` field as sidereal —
    // see comment on drawSkyHouseCusps).
    drawSkyHouseCusps(skyGroup, skyZodiac);
    // Sky-only: derive the South Node's position from the North Node's
    // when the user has it checked but the server dedup dropped it.
    // World render above receives data.planets unchanged.
    drawSkyPlanets(
      skyGroup,
      augmentSkyPlanetsWithAngles(
        augmentSkyPlanetsWithPriapus(
          augmentSkyPlanetsWithSouthNode(data.planets),
        ),
      ),
    );
  } catch (err) {
    showError(err.message || "Could not generate map.");
  }
}

function handlePrint() {
  window.print();
}

// ---- Bind ------------------------------------------------------

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("mapForm");
  if (form) {
    form.addEventListener("submit", handleView);
  }
  const printBtn = document.getElementById("mapPrint");
  if (printBtn) {
    printBtn.addEventListener("click", handlePrint);
  }
});
