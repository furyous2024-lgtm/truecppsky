"use strict";

import { sharedNatal } from "./sharedNatal.js";

// Disable context menu on the graph area globally (covers right-click drags)
document.addEventListener(
  "contextmenu",
  (e) => {
    if (e.target.closest("#graph")) {
      e.preventDefault();
    }
  },
  true
);

// Hide tooltip on click
// Desktop
document.addEventListener("click", (e) => {
  if (e.button === 0) {
    d3.select(".tooltip").style("opacity", 0).html("");
  }
});
// Touchscreen
document.addEventListener("touchstart", (e) => {
  if (!e.target.closest(".tooltip")) {
    d3.select(".tooltip").style("opacity", 0).html("");
  }
});

// Planet symbol image paths
const planetSymbols = {
  Sun: "/images/planets/sun.svg",
  Moon: "/images/planets/moon.svg",
  Mercury: "/images/planets/mercury.svg",
  Venus: "/images/planets/venus.svg",
  Mars: "/images/planets/mars.svg",
  Jupiter: "/images/planets/jupiter.svg",
  Saturn: "/images/planets/saturn.svg",
  Uranus: "/images/planets/uranus.svg",
  Neptune: "/images/planets/neptune.svg",
  Pluto: "/images/planets/pluto.svg",
  Chiron: "/images/planets/chiron.svg",
  Midheaven: "/images/planets/midheaven.svg",
  Ascendant: "/images/planets/ascendantsymbol.svg",
  "North Node": "/images/planets/northnode.svg",
};

// Aspect symbol image paths
const aspectSymbols = {
  Conjunction: "/images/aspects/conjunction.svg",
  Opposition: "/images/aspects/opposition.svg",
  Square: "/images/aspects/square.svg",
  Trine: "/images/aspects/trine.svg",
  Sextile: "/images/aspects/sextile.svg",
  Semisextile: "/images/aspects/semisextile.svg",
  Quincunx: "/images/aspects/quincunx.svg",
};

// Sign symbol image paths (colorized for sign ingresses)
const signSymbols = {
  Aries: "/images/signs/colorized/aries.svg",
  Taurus: "/images/signs/colorized/taurus.svg",
  Gemini: "/images/signs/colorized/gemini.svg",
  Cancer: "/images/signs/colorized/cancer.svg",
  Leo: "/images/signs/colorized/leo.svg",
  Virgo: "/images/signs/colorized/virgo.svg",
  Libra: "/images/signs/colorized/libra.svg",
  Scorpio: "/images/signs/colorized/scorpio.svg",
  Ophiuchus: "/images/signs/colorized/ophiuchus.svg",
  Sagittarius: "/images/signs/colorized/sagittarius.svg",
  Capricorn: "/images/signs/colorized/capricorn.svg",
  Aquarius: "/images/signs/colorized/aquarius.svg",
  Pisces: "/images/signs/colorized/pisces.svg",
};

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
};

// Aspect colors
const aspectColors = {
  Conjunction: "black",
  Opposition: "red",
  Square: "red",
  Trine: "blue",
  Sextile: "blue",
  Semisextile: "darkolivegreen",
  Quincunx: "darkolivegreen",
};

// Station colors
const stationColors = {
  retrograde: "deeppink",
  direct: "deepskyblue",
};

// Load planet aspect descriptions
let planetAspectDescriptions = {};
let progressedPlanetHouseDescriptions = {};
let transitPlanetHouseDescriptions = {};
let graphPlanetRetroDescriptions = {};

Promise.all([
  fetch("/json/planetAspectDescriptions.json").then((res) => res.json()),
  fetch("/json/progressedPlanetHouseDescriptions.json").then((res) =>
    res.json()
  ),
  fetch("/json/transitPlanetHouseDescriptions.json").then((res) => res.json()),
  fetch("/json/graphPlanetRetroDescriptions.json").then((res) => res.json()),
])
  .then(([aspects, progressedHouses, transitHouses, retro]) => {
    planetAspectDescriptions = aspects;
    progressedPlanetHouseDescriptions = progressedHouses;
    transitPlanetHouseDescriptions = transitHouses;
    graphPlanetRetroDescriptions = retro;
  })
  .catch((err) => console.error("Failed to load descriptions:", err));

// Show aspect interpretation popup
function showAspectDetails(planet1Name, planet2Name, aspectType, orb, status) {
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
  const planet1Display = getDisplayName(planet1Name);
  const planet2Display = getDisplayName(planet2Name);

  // Get description from planetAspectDescriptions
  const description =
    planetAspectDescriptions[planet1Key]?.[planet2Key]?.[aspectType] ||
    planetAspectDescriptions[planet2Key]?.[planet1Key]?.[aspectType] ||
    "No description available";

  const aspectTypeDisplay =
    aspectType.charAt(0).toUpperCase() + aspectType.slice(1);

  // Get planet icon keys - handle special cases
  let planet1IconKey = planet1Key.replace(/[\s-]+/g, "");
  if (planet1IconKey === "ascendant") planet1IconKey = "ascendantsymbol";

  let planet2IconKey = planet2Key.replace(/[\s-]+/g, "");
  if (planet2IconKey === "ascendant") planet2IconKey = "ascendantsymbol";

  // Get planet icons with proper margins
  const planet1Icon = `<img src="/images/planets/${planet1IconKey}.svg" width="28" height="28" style="vertical-align:middle;margin:-6px 2px 0 0"/>`;
  const planet2Icon = `<img src="/images/planets/${planet2IconKey}.svg" width="28" height="28" style="vertical-align:middle;margin:-6px 2px 0 0"/>`;
  const aspectIcon = `<img src="/images/aspects/${aspectType}.svg" width="24" height="24" style="vertical-align:middle;margin:-2px -2px 0 4px"/>`;

  const isMobile = window.innerWidth < 600;
  const fs = isMobile ? "16px" : "20px";

  c
    .append("div")
    .attr("class", "aspect-details")
    .attr(
      "style",
      `white-space:normal;word-wrap:break-word;font-size:${fs};max-width:90vw;overflow-wrap:break-word;padding:10px;`
    ).html(`
      <h3 style="margin:0 0 10px 0;">${planet1Icon}${planet1Display}${aspectIcon}${planet2Icon}${planet2Display}</h3>
      <p style="margin:0;"><strong>${aspectTypeDisplay}:</strong> ${description}</p>
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

// Show house placement interpretation popup
function showHouseDetails(planetName, houseNumber, chartType) {
  const tooltip = d3.select("#tooltip");

  // Clear and create new popup
  tooltip.html("");

  const tp = tooltip
    .append("div")
    .attr("class", "planet-tooltip-instance")
    .style("pointer-events", "auto");

  const c = tp.append("div").attr("class", "tooltip-content");

  // Normalize planet name to match JSON keys
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

  const planetKey = normalizeKey(planetName);
  const planetDisplay = getDisplayName(planetName);

  // Select appropriate description set based on chart type
  let houseDescriptions =
    chartType === "progressed"
      ? progressedPlanetHouseDescriptions
      : transitPlanetHouseDescriptions;

  // Get description from house descriptions
  const description =
    houseDescriptions[planetKey]?.[houseNumber] || "No description available";

  // Get planet icon key - handle special cases
  let planetIconKey = planetKey.replace(/[\s-]+/g, "");
  if (planetIconKey === "ascendant") planetIconKey = "ascendantsymbol";

  // Get planet icon
  const planetIcon = `<img src="/images/planets/${planetIconKey}.svg" width="28" height="28" style="vertical-align:middle;margin:-6px 4px 0 -4px"/>`;

  const isMobile = window.innerWidth < 600;
  const fs = isMobile ? "16px" : "20px";

  c
    .append("div")
    .attr("class", "planet-details")
    .attr(
      "style",
      `white-space:normal;word-wrap:break-word;font-size:${fs};max-width:90vw;overflow-wrap:break-word;padding:10px;`
    ).html(`
      <h3 style="margin:0 0 10px 0;">${planetIcon}${planetDisplay} in House ${houseNumber}</h3>
      <p style="margin:0;">${description}</p>
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

// Show station (retrograde/direct) interpretation popup
function showStationDetails(planetName, chartType) {
  const tooltip = d3.select("#tooltip");

  // Clear and create new popup
  tooltip.html("");

  const tp = tooltip
    .append("div")
    .attr("class", "planet-tooltip-instance")
    .style("pointer-events", "auto");

  const c = tp.append("div").attr("class", "tooltip-content");

  // Normalize planet name to match JSON keys
  const normalizeKey = (name) => {
    let key = name.toLowerCase().replace(/\s+/g, " ");
    if (key === "north node") return "north node";
    if (key === "south node") return "south node";
    return key;
  };

  const getDisplayName = (name) => {
    return name;
  };

  const planetKey = normalizeKey(planetName);
  const planetDisplay = getDisplayName(planetName);

  // Get description from retro descriptions
  const description =
    graphPlanetRetroDescriptions[planetKey]?.station ||
    "No description available";

  // Get planet icon key - handle special cases
  let planetIconKey = planetKey.replace(/[\s-]+/g, "");
  if (planetIconKey === "ascendant") planetIconKey = "ascendantsymbol";

  // Get planet icon
  const planetIcon = `<img src="/images/planets/${planetIconKey}.svg" width="28" height="28" style="vertical-align:middle;margin:-6px 4px 0 -4px"/>`;

  const isMobile = window.innerWidth < 600;
  const fs = isMobile ? "16px" : "20px";

  const chartTypeDisplay =
    chartType === "progressed" ? "Progressed" : "Transiting";

  c
    .append("div")
    .attr("class", "planet-details")
    .attr(
      "style",
      `white-space:normal;word-wrap:break-word;font-size:${fs};max-width:90vw;overflow-wrap:break-word;padding:10px;`
    ).html(`
      <h3 style="margin:0 0 10px 0;">${planetIcon}${chartTypeDisplay} ${planetDisplay} Station</h3>
      <p style="margin:0;">${description}</p>
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

// Global variables for red line and date label
let verticalLine = null;
let verticalText = null;

// Calculate button
document.getElementById("graphForm").addEventListener("submit", async function (e) {
  e.preventDefault();
  document.getElementById("loading-overlay").style.display = "block";

  // Ensure natal chart is calculated with current settings before running the graph
  // This prevents issues where the user runs the graph without applying settings first
  const natalForm = document.getElementById("natalForm");
  if (natalForm) {
    // Flag to prevent natal form from hiding the overlay (graph needs it to stay visible)
    window._graphNeedsOverlay = true;
    await new Promise((resolve) => {
      document.addEventListener("natalChartComplete", resolve, { once: true });
      natalForm.requestSubmit();
    });
  }

  const formData = new FormData(this);
  const formDataObj = Object.fromEntries(formData);
  const natalData = JSON.parse(localStorage.getItem("natalData"));
  const combinedData = { ...formDataObj, natalData };

  // Retrieve selected settings from DOM
  const selectedPlanetsNatal = Array.from(
    document.querySelectorAll(
      '#graph-planet-settings input[name="planetNatal"]:checked'
    )
  ).map((checkbox) => checkbox.value);
  const selectedPlanetsProgressed = Array.from(
    document.querySelectorAll(
      '#graph-planet-settings input[name="planetProgressed"]:checked'
    )
  ).map((checkbox) => checkbox.value);
  const selectedPlanetsTransit = Array.from(
    document.querySelectorAll(
      '#graph-planet-settings input[name="planetTransit"]:checked'
    )
  ).map((checkbox) => checkbox.value);
  const selectedTransitingAspects = Array.from(
    document.querySelectorAll(
      '#graph-aspect-settings input[name="transitingAspects"]:checked'
    )
  ).map((checkbox) => checkbox.value);
  const selectedTransitingTypes = Array.from(
    document.querySelectorAll(
      '#graph-type-settings input[name="transitingTypes"]:checked'
    )
  ).map((checkbox) => checkbox.value);
  const selectedZodiacSystem = document.querySelector(
    '#system-settings select[name="zodiacSystem"]'
  ).value;
  const selectedAyanamsaSystem = document.querySelector(
    '#system-settings select[name="ayanamsaSystem"]'
  ).value;
  const customAyanamsa = document.querySelector(
    '#system-settings input[name="customAyanamsa"]'
  ).value;
  const selectedHouseSystem = document.querySelector(
    '#system-settings select[name="houseSystem"]'
  ).value;
  const selectedCoordinateSystem = document.querySelector(
    '#system-settings select[name="coordinateSystem"]'
  ).value;

  combinedData.selectedPlanetsNatal = selectedPlanetsNatal;
  combinedData.selectedPlanetsProgressed = selectedPlanetsProgressed;
  combinedData.selectedPlanetsTransit = selectedPlanetsTransit;
  combinedData.selectedTransitingAspects = selectedTransitingAspects;
  combinedData.selectedTransitingTypes = selectedTransitingTypes;
  combinedData.graphAspectOrbs = Object.fromEntries(
    Array.from(
      document.querySelectorAll("#aspect-settings select.aspect-orb")
    ).map((select) => [select.dataset.aspect, Number(select.value)])
  );
  combinedData.selectedZodiacSystem = selectedZodiacSystem;
  combinedData.selectedAyanamsaSystem = selectedAyanamsaSystem;
  if (selectedAyanamsaSystem === "Custom") {
    combinedData.customAyanamsa = customAyanamsa;
  }
  combinedData.selectedHouseSystem = selectedHouseSystem;
  combinedData.selectedCoordinateSystem = selectedCoordinateSystem;

  const graphApiUrl =
    typeof window.trueskyApiUrl === "function"
      ? window.trueskyApiUrl("/api/transit-graph")
      : "/api/transit-graph";
  fetch(graphApiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(combinedData),
    credentials: "same-origin",
  })
    .then(async (response) => {
      document.getElementById("loading-overlay").style.display = "none";
      window._graphNeedsOverlay = false;
      const responseText = await response.text();
      let payload;
      try {
        payload = JSON.parse(responseText);
      } catch (_) {
        throw new Error(
          "The Transit Graph API returned an invalid response. Check the API URL and try again."
        );
      }
      if (!response.ok) {
        if (payload.redirectUrl) {
          window.location.href = payload.redirectUrl;
          return new Promise(() => {});
        }
        throw new Error(
          payload.error || "An unexpected server error occurred."
        );
      }
      return payload;
    })
    .then((payload) => {
      const data = Array.isArray(payload)
        ? payload
        : Array.isArray(payload?.aspects)
        ? payload.aspects
        : Array.isArray(payload?.data)
        ? payload.data
        : Array.isArray(payload?.data?.aspects)
        ? payload.data.aspects
        : null;
      if (!data) {
        throw new Error(
          payload?.error ||
            "The Transit Graph API did not return an aspects list. Verify that the configured backend supports Transit Graph calculations."
        );
      }
      if (
        data.some(
          (aspect) =>
            !aspect ||
            !Array.isArray(aspect.transits) ||
            aspect.transits.some(
              (transit) =>
                !transit?.date ||
                !Number.isFinite(Number(transit.date.year)) ||
                !Number.isFinite(Number(transit.date.month)) ||
                !Number.isFinite(Number(transit.date.day))
            )
        )
      ) {
        throw new Error(
          "The Transit Graph API returned aspects in an unsupported format."
        );
      }
      document.querySelector(".errorMessageGraph").textContent = "";
      // console.log(data);

      // Store graph form data globally for print view
      window.graphFormData = combinedData;

      const aspectContainer = document.getElementById("graph");
      aspectContainer.innerHTML = "";
      const aspectsWithTransits = data.filter(
        (aspect) => aspect.transits.length > 0
      );
      if (aspectsWithTransits.length === 0) {
        window.graphGroupedAspects = [];
        aspectContainer.textContent =
          "No transits were found for the selected date range and settings.";
        return;
      }

      // Gather dates for x-axis
      const dates = [];
      aspectsWithTransits.forEach((aspect) => {
        aspect.transits.forEach((transit) => {
          const { year, month, day, hour, minute, second } = transit.date;
          dates.push(
            new Date(year, month - 1, day, hour || 0, minute || 0, second || 0)
          );
        });
      });
      // Use user's input dates for graph domain (not transit data dates)
      const monthNames = ["January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"];
      const minDate = new Date(
        parseInt(combinedData.startYear),
        monthNames.indexOf(combinedData.startMonth),
        parseInt(combinedData.startDay),
        parseInt(combinedData.startHour) || 0,
        parseInt(combinedData.startMinute) || 0
      );
      const maxDate = new Date(
        parseInt(combinedData.endYear),
        monthNames.indexOf(combinedData.endMonth),
        parseInt(combinedData.endDay),
        parseInt(combinedData.endHour) || 0,
        parseInt(combinedData.endMinute) || 0
      );
      const timeFrameInDays = (maxDate - minDate) / (1000 * 60 * 60 * 24);

      // Group aspects by type/text
      const groupedAspects = {};
      aspectsWithTransits.forEach((aspect) => {
        const planetPrefix1 = aspect.transitingPlanet ? "Tr" : "Pr";
        const planet1 = aspect.transitingPlanet || aspect.progressedPlanet;
        let planetPrefix2 = "";
        let planet2 = "";
        if (aspect.type !== "Ingress") {
          if (aspect.natalPlanet) {
            // For natal planets, use " Na" as prefix.
            planetPrefix2 = " Na";
            planet2 = aspect.natalPlanet;
          } else {
            planetPrefix2 = aspect.transitingPlanet2
              ? " Tr"
              : aspect.progressedPlanet2
              ? " Pr"
              : "";
            planet2 =
              aspect.transitingPlanet2 || aspect.progressedPlanet2 || "";
          }
        } else {
          planet2 =
            aspect.natalPlanet ||
            aspect.transitingPlanet2 ||
            aspect.progressedPlanet2 ||
            "";
        }
        let tokens = [planetPrefix1, planet1];

        if (aspect.type === "Direct" || aspect.type === "Retrograde") {
          tokens.push("Station");
        } else if (aspect.type === "Ingress") {
          if (planet2) {
            // If the second planet is North Node, push its name and abbreviation as separate tokens
            if (planetPrefix2 && planet2.toLowerCase() === "north node") {
              tokens.push(planet2);
              tokens.push(planetPrefix2.trim());
            } else if (planetPrefix2) {
              tokens.push(`${planet2} ${planetPrefix2}`);
            } else {
              tokens.push(planet2);
            }
          }
        } else {
          tokens.push(aspect.type);
          if (planet2) {
            if (planetPrefix2 && planet2.toLowerCase() === "north node") {
              tokens.push(planet2);
              tokens.push(planetPrefix2.trim());
            } else if (planetPrefix2) {
              tokens.push(`${planet2} ${planetPrefix2}`);
            } else {
              tokens.push(planet2);
            }
          }
        }
        const aspectText = tokens.join(" ");
        if (!groupedAspects[aspectText]) groupedAspects[aspectText] = [];
        groupedAspects[aspectText].push({ aspect, tokens });
      });

      const groupedAspectsArray = Object.entries(groupedAspects);

      // Store groupedAspectsArray globally for report generation (preserves display order)
      window.graphGroupedAspects = groupedAspectsArray;

      // Setup SVG dimensions and scales
      const width = aspectContainer.offsetWidth;
      const height = groupedAspectsArray.length * 40;
      const margin = { top: 40, right: 0, bottom: 0, left: 200 };

      const svgElement = d3
        .select("#graph")
        .append("svg")
        .attr(
          "viewBox",
          `0 0 ${width + margin.left + margin.right} ${
            height + margin.top + margin.bottom
          }`
        )
        .attr("preserveAspectRatio", "xMidYMid meet");

      // Store graph data for print handlers
      window.graphFormData = window.graphFormData || {};
      window.graphFormData.svgWidth = width + margin.left + margin.right;
      window.graphFormData.svgHeight = height + margin.top + margin.bottom;

      const svg = svgElement
        .append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);
      const x = d3
        .scaleTime()
        .domain([minDate, maxDate])
        .range([0, width - margin.right]);
      const y = d3
        .scaleBand()
        .range([0, height])
        .domain(groupedAspectsArray.map((d, i) => i))
        .padding(0.1);

      // Prepare tooltip element (already in the DOM)
      const tooltip = d3.select(".tooltip");
      tooltip.style("opacity", 0).html("");
      const oldDateElement = document.getElementById("fixedDateText");
      if (oldDateElement && oldDateElement._stickyListener) {
        window.removeEventListener("scroll", oldDateElement._stickyListener);
      }
      d3.select("#fixedDateText").remove();

      let verticalLine = null;
      let verticalText = null;

      svg
        .append("clipPath")
        .attr("id", "clipXAxis")
        .append("rect")
        .attr("x", 0)
        .attr("y", -margin.top)
        .attr("width", width - margin.right)
        .attr("height", height + margin.top);

      const xAxisGroup = svg.append("g").attr("clip-path", "url(#clipXAxis)");

      // Draw grid lines and labels based on the timeframe
      if (timeFrameInDays < 32) {
        const currentDate = new Date(minDate);
        currentDate.setHours(0, 0, 0, 0);
        while (currentDate <= maxDate) {
          xAxisGroup
            .append("line")
            .attr("x1", x(currentDate))
            .attr("y1", 0)
            .attr("x2", x(currentDate))
            .attr("y2", height)
            .attr("stroke", "lightgray")
            .attr("stroke-width", 1);
          xAxisGroup
            .append("text")
            .attr("x", x(currentDate))
            .attr("y", -10)
            .attr("text-anchor", "middle")
            .style("font-family", "Segoe UI, sans-serif")
            .style("font-size", "18px")
            .style("fill", "black")
            .text(d3.timeFormat("%d")(currentDate));
          currentDate.setDate(currentDate.getDate() + 1);
        }
      } else if (timeFrameInDays < 367) {
        const currentDate = new Date(minDate);
        currentDate.setDate(1);
        while (currentDate <= maxDate) {
          xAxisGroup
            .append("line")
            .attr("x1", x(currentDate))
            .attr("y1", 0)
            .attr("x2", x(currentDate))
            .attr("y2", height)
            .attr("stroke", "lightgray")
            .attr("stroke-width", 1);
          xAxisGroup
            .append("text")
            .attr("x", x(currentDate))
            .attr("y", -10)
            .attr("text-anchor", "middle")
            .style("font-family", "Segoe UI, sans-serif")
            .style("font-size", "18px")
            .style("fill", "black")
            .text(d3.timeFormat("%b")(currentDate));
          currentDate.setMonth(currentDate.getMonth() + 1);
        }
      } else {
        const currentDate = new Date(minDate);
        currentDate.setMonth(0, 1);
        while (currentDate <= maxDate) {
          xAxisGroup
            .append("line")
            .attr("x1", x(currentDate))
            .attr("y1", 0)
            .attr("x2", x(currentDate))
            .attr("y2", height)
            .attr("stroke", "lightgray")
            .attr("stroke-width", 1);
          xAxisGroup
            .append("text")
            .attr("x", x(currentDate))
            .attr("y", -10)
            .attr("text-anchor", "middle")
            .style("font-family", "Segoe UI, sans-serif")
            .style("font-size", "18px")
            .style("fill", "black")
            .text(d3.timeFormat("%Y")(currentDate));
          currentDate.setFullYear(currentDate.getFullYear() + 1);
        }
      }

      // Plot aspect labels and transit lines
      groupedAspectsArray.forEach(([aspectText, aspects], i) => {
        const tokens = aspects[0].tokens;
        const aspectGroup = svg
          .append("g")
          .attr(
            "transform",
            `translate(${-margin.left + 10}, ${y(i) + y.bandwidth() / 2})`
          )
          .style("cursor", "pointer")
          .on("click", function (event) {
            event.stopPropagation();

            // Check if this is a house placement entry
            // House placement format: "Tr Saturn House 10" or "Pr Moon House 5"
            const houseMatch = aspectText.match(
              /(Tr|Pr)\s+(\w+(?:\s+\w+)?)\s+House\s+(\d+)/i
            );

            // Check if this is a station entry
            // Station format: "Tr Mercury Station" or "Pr Mars Station"
            const stationMatch = aspectText.match(
              /(Tr|Pr)\s+(\w+(?:\s+\w+)?)\s+Station/i
            );

            if (houseMatch) {
              // This is a house placement
              const chartTypePrefix = houseMatch[1].toLowerCase();
              const planetName = houseMatch[2];
              const houseNumber = houseMatch[3];
              const chartType =
                chartTypePrefix === "pr" ? "progressed" : "transit";
              showHouseDetails(planetName, houseNumber, chartType);
            } else if (stationMatch) {
              // This is a station
              const chartTypePrefix = stationMatch[1].toLowerCase();
              const planetName = stationMatch[2];
              const chartType =
                chartTypePrefix === "pr" ? "progressed" : "transit";
              showStationDetails(planetName, chartType);
            } else {
              // This is an aspect
              const firstAspect = aspects[0].aspect;
              const planet1 =
                firstAspect.transitingPlanet || firstAspect.progressedPlanet;
              let planet2 = "";
              if (
                firstAspect.type !== "Ingress" &&
                firstAspect.type !== "Direct" &&
                firstAspect.type !== "Retrograde"
              ) {
                planet2 =
                  firstAspect.natalPlanet ||
                  firstAspect.transitingPlanet2 ||
                  firstAspect.progressedPlanet2 ||
                  "";
              }
              const aspectType = firstAspect.type.toLowerCase();

              // Only show popup for actual aspects (not stations or ingresses)
              if (
                planet2 &&
                aspectType !== "direct" &&
                aspectType !== "retrograde" &&
                aspectType !== "ingress"
              ) {
                // Use first transit for orb info
                const firstTransit = firstAspect.transits[0];
                const orb = firstTransit.orb || "0";
                showAspectDetails(
                  planet1,
                  planet2,
                  aspectType,
                  orb,
                  "applying"
                );
              }
            }
          });
        let currentX = 0;
        const symbolSize = 28;
        const signSymbolSize = 22; // Signs are smaller than planets (matches tooltip ratio)
        const symbolSpacing = 0;
        const textSpacing = 5;
        tokens.forEach((token) => {
          // First, check if the full token matches a planet, aspect, or sign symbol.
          if (planetSymbols[token]) {
            aspectGroup
              .append("image")
              .attr("xlink:href", planetSymbols[token])
              .attr("x", currentX)
              .attr("y", -symbolSize / 2)
              .attr("width", symbolSize)
              .attr("height", symbolSize);
            currentX += symbolSize + symbolSpacing;
          } else if (aspectSymbols[token]) {
            aspectGroup
              .append("image")
              .attr("xlink:href", aspectSymbols[token])
              .attr("x", currentX)
              .attr("y", -symbolSize / 2)
              .attr("width", symbolSize)
              .attr("height", symbolSize);
            currentX += symbolSize + symbolSpacing;
          } else if (signSymbols[token]) {
            aspectGroup
              .append("image")
              .attr("xlink:href", signSymbols[token])
              .attr("x", currentX)
              .attr("y", -signSymbolSize / 2)
              .attr("width", signSymbolSize)
              .attr("height", signSymbolSize);
            currentX += signSymbolSize + symbolSpacing;
          } else {
            // If the full token doesn't match, then split it into subTokens.
            const subTokens = token.split(" ");
            subTokens.forEach((subToken) => {
              if (planetSymbols[subToken]) {
                aspectGroup
                  .append("image")
                  .attr("xlink:href", planetSymbols[subToken])
                  .attr("x", currentX)
                  .attr("y", -symbolSize / 2)
                  .attr("width", symbolSize)
                  .attr("height", symbolSize);
                currentX += symbolSize + symbolSpacing;
              } else if (aspectSymbols[subToken]) {
                aspectGroup
                  .append("image")
                  .attr("xlink:href", aspectSymbols[subToken])
                  .attr("x", currentX)
                  .attr("y", -symbolSize / 2)
                  .attr("width", symbolSize)
                  .attr("height", symbolSize);
                currentX += symbolSize + symbolSpacing;
              } else if (signSymbols[subToken]) {
                aspectGroup
                  .append("image")
                  .attr("xlink:href", signSymbols[subToken])
                  .attr("x", currentX)
                  .attr("y", -signSymbolSize / 2)
                  .attr("width", signSymbolSize)
                  .attr("height", signSymbolSize);
                currentX += signSymbolSize + symbolSpacing;
              } else {
                let fontSize = "18px";
                if (
                  token.includes("Na") ||
                  token.includes("Tr") ||
                  token.includes("Pr")
                ) {
                  fontSize = "16px";
                }
                const textElement = aspectGroup
                  .append("text")
                  .attr("x", currentX)
                  .attr("y", 0)
                  .attr("dy", ".35em")
                  .attr("text-anchor", "start")
                  .text(subToken)
                  .style("font-family", "Segoe UI, sans-serif")
                  .style("font-size", fontSize)
                  .style("font-weight", "bold")
                  .style("fill", "#555");
                const textWidth = textElement.node().getComputedTextLength();
                currentX += textWidth + textSpacing;
              }
            });
          }
        });
        svg
          .append("line")
          .attr("x1", -margin.left + 10)
          .attr("y1", y(i) + y.bandwidth())
          .attr("x2", width - margin.right)
          .attr("y2", y(i) + y.bandwidth())
          .attr("stroke", "lightgray")
          .attr("stroke-width", 1);
        aspects.forEach(({ aspect }) => {
          const firstTransit = aspect.transits[0];
          const lastTransit = aspect.transits[aspect.transits.length - 1];
          const firstDate = new Date(
            firstTransit.date.year,
            firstTransit.date.month - 1,
            firstTransit.date.day,
            firstTransit.date.hour || 0,
            firstTransit.date.minute || 0,
            firstTransit.date.second || 0
          );
          const lastDate = new Date(
            lastTransit.date.year,
            lastTransit.date.month - 1,
            lastTransit.date.day,
            lastTransit.date.hour || 0,
            lastTransit.date.minute || 0,
            lastTransit.date.second || 0
          );
          let color = "blue";
          if (aspect.type === "Ingress") {
            const planet = (
              aspect.transitingPlanet || aspect.progressedPlanet
            ).toLowerCase();
            color = planetColors[planet] || "gray";
          } else if (aspect.type === "Direct" || aspect.type === "Retrograde") {
            color = stationColors[aspect.type.toLowerCase()] || "green";
          } else {
            color = aspectColors[aspect.type] || "blue";
          }
          svg
            .append("line")
            .attr("x1", x(firstDate))
            .attr("y1", y(i) + y.bandwidth() / 2 - 10)
            .attr("x2", x(lastDate))
            .attr("y2", y(i) + y.bandwidth() / 2 - 10)
            .attr("stroke", color)
            .attr("stroke-width", 3);
          aspect.transits.forEach((transit) => {
            const { year, month, day, hour, minute, second } = transit.date;
            const date = new Date(
              year,
              month - 1,
              day,
              hour || 0,
              minute || 0,
              second || 0
            );
            const contactSymbol =
              transit.contact === "orb" ||
              transit.contact === "start" ||
              transit.contact === "end"
                ? "O"
                : "X";
            if (contactSymbol === "X" && aspect.type !== "Ingress") {
              let symbolColor = color;
              if (aspect.type === "Direct" || aspect.type === "Retrograde") {
                symbolColor =
                  stationColors[aspect.type.toLowerCase()] || "green";
              }
              svg
                .append("text")
                .attr("x", x(date))
                .attr("y", y(i) + y.bandwidth() / 2 - 10)
                .attr("dy", ".35em")
                .attr("text-anchor", "middle")
                .style("font-family", "Segoe UI, sans-serif")
                .style("font-size", "20px")
                .style("font-weight", "bold")
                .text(contactSymbol)
                .style("fill", symbolColor);
              svg
                .append("text")
                .attr("x", x(date))
                .attr("y", y(i) + y.bandwidth() / 2 + 7)
                .attr("dy", ".35em")
                .attr("text-anchor", "middle")
                .style("font-family", "Segoe UI, sans-serif")
                .style("font-size", "16px")
                .style("font-weight", "bold")
                .style("fill", "#444")
                .text(
                  timeFrameInDays < 32
                    ? d3.timeFormat("%H:%M")(date)
                    : d3.timeFormat("%d%b")(date)
                );
            } else if (contactSymbol === "X" && aspect.type === "Ingress") {
              svg
                .append("text")
                .attr("x", x(date))
                .attr("y", y(i) + y.bandwidth() / 2 + 7)
                .attr("dy", ".35em")
                .attr("text-anchor", "middle")
                .style("font-family", "Segoe UI, sans-serif")
                .style("font-size", "16px")
                .style("font-weight", "bold")
                .style("fill", "#444")
                .text(
                  timeFrameInDays < 32
                    ? d3.timeFormat("%H:%M")(date)
                    : d3.timeFormat("%d%b")(date)
                );
            }
          });
        });
      });

      // Drag & Interaction
      // Create overlay to capture mouse events (its native contextmenu is already prevented globally)
      const overlay = svg
        .append("rect")
        .attr("class", "overlay")
        .attr("width", width - margin.right)
        .attr("height", height)
        .style("fill", "none")
        .style("pointer-events", "all");

      let isDragging = false;
      let isRightDrag = false;

      overlay.on("mousedown", (event) => {
        if (event.button === 0) {
          isRightDrag = true; // Reusing this variable for left-click behavior
        }
        isDragging = true;
        showRedLine(event);
      });

      overlay.on("mousemove", (event) => {
        if (isDragging) {
          showRedLine(event);
        }
      });

      d3.select(window).on("mouseup", (event) => {
        if (isDragging) {
          isDragging = false;
          if (isRightDrag && event.button === 0) {
            showTooltip(event);
          }
          if (isRightDrag) {
            isRightDrag = false;
          }
        }
      });

      // Touch Events for Mobile/Tablet
      let touchStartPos = null;
      let touchMoved = false;
      let lastTouchPos = null; // Track last touch position for touchend
      const moveThreshold = 10; // pixels

      overlay.on("touchstart", (event) => {
        const touch = event.touches[0];
        touchStartPos = [touch.clientX, touch.clientY];
        lastTouchPos = [touch.clientX, touch.clientY]; // Save initial position
        touchMoved = false;
        showRedLine(event);
      });

      overlay.on("touchmove", (event) => {
        const touch = event.touches[0];
        lastTouchPos = [touch.clientX, touch.clientY]; // Update last position
        if (touchStartPos) {
          const dx = touch.clientX - touchStartPos[0];
          const dy = touch.clientY - touchStartPos[1];
          if (Math.sqrt(dx * dx + dy * dy) > moveThreshold) {
            touchMoved = true;
          }
        }
        showRedLine(event);
      });

      overlay.on("touchend", (event) => {
        if (!touchMoved && touchStartPos && lastTouchPos) {
          // Simple tap - show tooltip with saved position
          // Pass the last touch position to calculate the date correctly
          showTooltipWithPosition(lastTouchPos[0], lastTouchPos[1]);
        }
        touchStartPos = null;
        touchMoved = false;
        lastTouchPos = null;
      });

      // Show red date line and date label
      function showRedLine(event) {
        // For both mouse and touch events, use d3.pointer on the inner group.
        let [mouseX] = d3.pointer(
          event.touches && event.touches.length ? event.touches[0] : event,
          svg.node()
        );
        const date = x.invert(mouseX);
        if (verticalLine) verticalLine.remove();
        if (verticalText) {
          const dateElement = document.getElementById("fixedDateText");
          if (dateElement && dateElement._stickyListener) {
            window.removeEventListener("scroll", dateElement._stickyListener);
          }
          d3.select("#fixedDateText").remove();
        }
        verticalLine = svg
          .append("line")
          .attr("class", "red-line")
          .attr("x1", x(date))
          .attr("x2", x(date))
          .attr("y1", 0)
          .attr("y2", height)
          .attr("stroke", "red")
          .attr("stroke-width", 1);

        // For the label, use event.clientX (or the first touch's clientX)
        let clientX = event.clientX;
        if (event.touches && event.touches.length) {
          clientX = event.touches[0].clientX;
        }
        // Get the graph container's bounding box if needed
        const graphRect = document
          .getElementById("graph")
          .getBoundingClientRect();

        verticalText = d3
          .select("#graph")
          .append("div")
          .attr("id", "fixedDateText")
          .style("position", "absolute")
          .style("top", "0px") // always at the top of the #graph container
          .style("left", `${clientX}px`)
          .style("transform", "translateX(-50%)")
          .style("background", "rgba(255, 255, 255, 0.8)")
          .style("padding", "5px 10px")
          .style("border", "1px solid red")
          .style("border-radius", "4px")
          .style("font-family", "Segoe UI, sans-serif")
          .style("font-size", "16px")
          .style("color", "red")
          .style("font-weight", "bold")
          .style("z-index", "5")
          .style("white-space", "nowrap") // Prevent text wrapping
          .text(d3.timeFormat("%d %b %Y")(date));

        // Add scroll listener to make date sticky when scrolling past graph top
        const dateElement = document.getElementById("fixedDateText");
        const makeSticky = () => {
          const graphRect = document
            .getElementById("graph")
            .getBoundingClientRect();
          if (graphRect.top < 0) {
            // Graph top is above viewport, make date sticky
            dateElement.style.position = "fixed";
            dateElement.style.top = "0px";
          } else {
            // Graph top is visible, keep date at graph top
            dateElement.style.position = "absolute";
            dateElement.style.top = "0px";
          }
        };

        // Attach scroll listener and run once to set initial state
        window.addEventListener("scroll", makeSticky);
        makeSticky();

        // Store listener reference to remove it when line is removed
        dateElement._stickyListener = makeSticky;
      }

      // Show tooltip with specific client coordinates (for touch events)
      function showTooltipWithPosition(clientX, clientY) {
        const tooltip = d3.select(".tooltip");
        tooltip.html(
          '<div id="triwheel-loading-overlay"><div class="triwheel-spinner"></div></div>'
        );

        // Convert client coordinates to SVG coordinates
        const svgElement = d3.select("#graph svg").node();
        const pt = svgElement.createSVGPoint();
        pt.x = clientX;
        pt.y = clientY;

        // Transform to SVG coordinate space
        const svgP = pt.matrixTransform(svgElement.getScreenCTM().inverse());

        // Account for the group transform (margin.left offset)
        const mouseX = svgP.x - margin.left;
        const date = x.invert(mouseX);

        // Continue with the rest of the tooltip logic
        showTooltipForDate(date);
      }

      // Show tooltip (for right click or long press)
      function showTooltip(event) {
        const tooltip = d3.select(".tooltip");
        tooltip.html(
          '<div id="triwheel-loading-overlay"><div class="triwheel-spinner"></div></div>'
        );

        // For regular mouse events, use d3.pointer
        const [mouseX] = d3.pointer(event, svg.node());
        const date = x.invert(mouseX);

        // Continue with the rest of the tooltip logic
        showTooltipForDate(date);
      }

      // Common tooltip logic for a specific date
      function showTooltipForDate(date) {
        const triwheelDay = document.getElementById("triwheelDayGraph");
        const triwheelMonth = document.getElementById("triwheelMonthGraph");
        const triwheelYear = document.getElementById("triwheelYearGraph");
        const triwheelHour = document.getElementById("triwheelHourGraph");
        const triwheelMinute = document.getElementById("triwheelMinuteGraph");
        if (
          triwheelDay &&
          triwheelMonth &&
          triwheelYear &&
          triwheelHour &&
          triwheelMinute
        ) {
          triwheelDay.value = date.getDate().toString().padStart(2, "0");
          triwheelMonth.value = d3.timeFormat("%B")(date);
          triwheelYear.value = date.getFullYear();
          triwheelHour.value = date.getHours().toString().padStart(2, "0");
          triwheelMinute.value = date.getMinutes().toString().padStart(2, "0");
          const triwheelLocation = document.getElementById(
            "triwheelLocationGraph"
          );
          const graphLocation = document.getElementById("graphLocation");
          if (triwheelLocation && graphLocation) {
            triwheelLocation.value = graphLocation.value;
          }
          const triwheelForm = document.getElementById("triwheelFormGraph");
          if (triwheelForm) {
            triwheelForm.dataset.autoSubmit = "true";
            triwheelForm.requestSubmit();
          }
        }

        const tooltip = d3.select(".tooltip");

        // Display tooltip content when triwheel rendering is complete
        const displayTooltipContent = () => {
          tooltip.html("");

          // Get viewport width for close button sizing
          const viewportWidth = window.innerWidth;

          // Add close button to tooltip (not inside content, so it won't scale)
          const closeButton = tooltip
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
            .on("click", () => {
              tooltip.style("opacity", 0);
            });

          const tooltipContent = tooltip
            .append("div")
            .attr("class", "tooltip-content");
          const triwheelSVG = document.querySelector("#triwheel-graph svg");
          let clonedTriwheel = null;
          if (triwheelSVG) {
            clonedTriwheel = triwheelSVG.cloneNode(true);
            clonedTriwheel.setAttribute("width", "600px");
            clonedTriwheel.setAttribute("height", "600px");
          }
          if (clonedTriwheel) {
            tooltipContent.node().appendChild(clonedTriwheel);
          }

          // Responsive scaling
          let scale = 1;
          const viewportHeight = window.innerHeight;
          // viewportWidth already defined above

          // Width-based scaling (matching existing CSS)
          if (viewportWidth <= 600) {
            scale = 0.45; // Matches CSS @media (max-width: 600px)
          } else if (viewportWidth <= 800) {
            scale = 0.75; // Matches CSS @media (max-width: 800px)
          }

          // Additional landscape mobile check (height-based)
          if (viewportHeight < 500 && viewportWidth > viewportHeight) {
            scale = Math.min(scale, 0.5); // Use smaller of the two scales
          } else if (viewportHeight < 700 && viewportWidth > viewportHeight) {
            scale = Math.min(scale, 0.7); // Use smaller of the two scales
          }

          // Apply scale to the tooltip content
          if (scale < 1) {
            tooltipContent.style("zoom", scale);
          }

          // Center the tooltip
          tooltip
            .style("position", "fixed")
            .style("top", "50%")
            .style("left", "50%")
            .style("transform", "translate(-50%, -50%)")
            .style("opacity", 0.95);
        };

        // Wait for triwheel rendering to complete before displaying
        let hasDisplayed = false;
        const onTriwheelComplete = () => {
          if (!hasDisplayed) {
            hasDisplayed = true;
            clearTimeout(fallbackTimeout);
            document.removeEventListener(
              "triwheelGraphComplete",
              onTriwheelComplete
            );
            displayTooltipContent();
          }
        };

        // Listen for the completion event
        document.addEventListener("triwheelGraphComplete", onTriwheelComplete);

        // Fallback timeout (8 seconds) in case event never fires
        const fallbackTimeout = setTimeout(() => {
          if (!hasDisplayed) {
            hasDisplayed = true;
            document.removeEventListener(
              "triwheelGraphComplete",
              onTriwheelComplete
            );
            displayTooltipContent();
          }
        }, 8000);
      }

      // Adjust chart on window resize
      window.addEventListener("resize", () => {
        const newWidth = aspectContainer.offsetWidth;
        if (newWidth <= 0) return;
        const newHeight = groupedAspectsArray.length * 40;
        d3.select("#graph svg").attr(
          "viewBox",
          `0 0 ${newWidth + margin.left + margin.right} ${
            newHeight + margin.top + margin.bottom
          }`
        );
        x.range([0, newWidth - margin.right]);
      });
    })
    .catch((error) => {
      document.getElementById("loading-overlay").style.display = "none";
      window._graphNeedsOverlay = false;
      const errorContainer = document.querySelector(".errorMessageGraph");
      if (errorContainer) {
        errorContainer.textContent =
          error.message || "Unexpected error. Please check your connection.";
        // Clear error after 5 seconds
        setTimeout(() => {
          errorContainer.textContent = "";
        }, 5000);
      }
    });
});

// Hidden triwheel for drag rendering
document.addEventListener("DOMContentLoaded", function () {
  const svgContainer = d3.select("#triwheel-graph");
  const signInner = 2.27;
  const houseOuter = 7.5;
  const houseInner = 9;
  const houseNumber = `16px`;
  const planetCircle = 5;
  const innerWheel = 0.55;
  const middleWheel = 0.765;
  const innerPlanet = 0.8;
  const centerPlanet = 3.25;
  const outerPlanet = 2.44;
  const removeHouseTicks = true;
  sharedNatal(
    svgContainer,
    signInner,
    houseOuter,
    houseInner,
    houseNumber,
    planetCircle,
    innerWheel,
    middleWheel,
    innerPlanet,
    centerPlanet,
    outerPlanet,
    removeHouseTicks,
    "triwheelGraph"
  );
  d3.select("body")
    .append("div")
    .attr("class", "tooltip")
    .style("position", "fixed")
    .style("pointer-events", "none")
    .style("opacity", 0)
    .style("background", "rgba(255, 255, 255, 0.95)")
    .style("border", "1px solid #ccc")
    .style("padding", "20px")
    .style("border-radius", "8px")
    .style("box-shadow", "0px 0px 15px rgba(0,0,0,0.2)")
    .style("display", "flex")
    .style("flex-direction", "column")
    .style("align-items", "center")
    .style("justify-content", "center")
    .style("z-index", 10)
    .style("transform", "translate(-50%, -50%)")
    .style("top", "50%")
    .style("left", "50%");
});

// Print graph
document.getElementById("graphPrint").addEventListener("click", function () {
  // If no graph data, silently return (nothing happens on click)
  if (!window.graphGroupedAspects || window.graphGroupedAspects.length === 0) {
    return;
  }

  // Check if Safari
  const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

  if (isSafari) {
    // Safari - open graph in new window for printing
    const graphElement = document.getElementById("graph");
    if (!graphElement) return;

    // Check if mobile Safari
    const isMobile = /iPhone|iPad|iPod/i.test(navigator.userAgent);

    // Clone the graph
    const graphClone = graphElement.cloneNode(true);

    // Add title to the cloned SVG
    const svg = graphClone.querySelector("svg");
    if (svg && window.graphFormData?.natalData?.name) {
      const natalData = window.graphFormData.natalData;
      const startDay = window.graphFormData.startDay || "";
      const startMonth = window.graphFormData.startMonth || "";
      const startYear = window.graphFormData.startYear || "";
      const startHour = (window.graphFormData.startHour || "00").padStart(
        2,
        "0"
      );
      const startMinute = (window.graphFormData.startMinute || "00").padStart(
        2,
        "0"
      );
      const endDay = window.graphFormData.endDay || "";
      const endMonth = window.graphFormData.endMonth || "";
      const endYear = window.graphFormData.endYear || "";
      const endHour = (window.graphFormData.endHour || "00").padStart(2, "0");
      const endMinute = (window.graphFormData.endMinute || "00").padStart(
        2,
        "0"
      );

      // Get current viewBox and adjust it
      const viewBox = svg.getAttribute("viewBox");
      const viewBoxParts = viewBox.split(" ");
      const currentY = parseFloat(viewBoxParts[1]);
      const currentHeight = parseFloat(viewBoxParts[3]);

      // Add space at top for title
      svg.setAttribute(
        "viewBox",
        `${viewBoxParts[0]} ${currentY - 120} ${viewBoxParts[2]} ${
          currentHeight + 120
        }`
      );

      // Create title group
      const titleGroup = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "g"
      );
      titleGroup.setAttribute(
        "transform",
        `translate(${parseFloat(viewBoxParts[2]) / 2}, ${currentY - 60})`
      );

      // Add name
      const nameText = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "text"
      );
      nameText.setAttribute("text-anchor", "middle");
      nameText.setAttribute("font-family", "Segoe UI, sans-serif");
      nameText.setAttribute("font-size", isMobile ? "18px" : "48px");
      nameText.setAttribute("font-weight", "bold");
      nameText.setAttribute("fill", "#222");
      nameText.textContent = `${natalData.name} - Transit Graph`;
      titleGroup.appendChild(nameText);

      // Add dates
      const dateText = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "text"
      );
      dateText.setAttribute("y", isMobile ? "25" : "50");
      dateText.setAttribute("text-anchor", "middle");
      dateText.setAttribute("font-family", "Segoe UI, sans-serif");
      dateText.setAttribute("font-size", isMobile ? "14px" : "36px");
      dateText.setAttribute("fill", "#222");
      dateText.textContent = `${startDay} ${startMonth} ${startYear} ${startHour}:${startMinute} - ${endDay} ${endMonth} ${endYear} ${endHour}:${endMinute}`;
      titleGroup.appendChild(dateText);

      // Insert at beginning of SVG
      svg.insertBefore(titleGroup, svg.firstChild);
    }

    // Open print window
    const printWindow = window.open("", "PrintGraph", "width=1200,height=800");
    if (!printWindow) {
      console.error("Failed to open print window - may be blocked");
      return;
    }

    // Build the print window HTML
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Transit Graph</title>
        <style>
          body {
            margin: 0;
            padding: 20px;
            background: white;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          }
          
          #graph {
            width: 100%;
            height: auto;
          }
          
          #graph svg {
            width: 100%;
            height: auto;
            max-width: 100%;
          }
          
          .close-window-button, .print-trigger-button {
            position: fixed;
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
          
          .close-window-button {
            top: 10px;
            background-color: #666;
          }
          
          .print-trigger-button {
            top: 66px;
          }
          
          .close-window-button:hover {
            background-color: #555;
          }
          
          .print-trigger-button:hover {
            background-color: #357ABD;
          }
          
          ${
            isMobile
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
          
          @media print {
            .close-window-button, .print-trigger-button {
              display: none !important;
            }

            body {
              padding: 0;
              margin: 0;
            }
          }
        </style>
      </head>
      <body>
        <button class="close-window-button" onclick="if(window.opener){window.opener.focus();}window.close()">Close View</button>
        <button class="print-trigger-button" onclick="window.print()">Print View</button>
        ${graphClone.outerHTML}
        <script>
          // Auto-close after print
          window.onafterprint = function() {
            window.close();
          };
          
          // Close on Escape key
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
  } else {
    // Non-Safari - add title temporarily during print
    const graphElement = document.getElementById("graph");
    if (!graphElement) return;

    const svg = graphElement.querySelector("svg");
    if (!svg || !window.graphFormData?.natalData?.name) {
      // No title data, just print as-is
      const y = graphElement.getBoundingClientRect().top + window.pageYOffset;
      window.scrollTo(0, y);
      window.print();
      return;
    }

    // Store original viewBox
    const originalViewBox = svg.getAttribute("viewBox");
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
      }`
    );

    // Create title
    const natalData = window.graphFormData.natalData;
    const startDay = window.graphFormData.startDay || "";
    const startMonth = window.graphFormData.startMonth || "";
    const startYear = window.graphFormData.startYear || "";
    const startHour = (window.graphFormData.startHour || "00").padStart(2, "0");
    const startMinute = (window.graphFormData.startMinute || "00").padStart(
      2,
      "0"
    );
    const endDay = window.graphFormData.endDay || "";
    const endMonth = window.graphFormData.endMonth || "";
    const endYear = window.graphFormData.endYear || "";
    const endHour = (window.graphFormData.endHour || "00").padStart(2, "0");
    const endMinute = (window.graphFormData.endMinute || "00").padStart(2, "0");

    const titleGroup = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "g"
    );
    titleGroup.setAttribute("class", "temp-print-title");
    titleGroup.setAttribute(
      "transform",
      `translate(${parseFloat(viewBoxParts[2]) / 2}, ${titleYPosition})`
    );

    // Add name
    const nameText = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "text"
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
      "text"
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

    // Scroll and print
    const y = graphElement.getBoundingClientRect().top + window.pageYOffset;
    window.scrollTo(0, y);

    // Add afterprint listener to restore
    const restoreGraph = function () {
      svg.setAttribute("viewBox", originalViewBox);
      const tempTitle = svg.querySelector(".temp-print-title");
      if (tempTitle) tempTitle.remove();
      window.removeEventListener("afterprint", restoreGraph);
    };
    window.addEventListener("afterprint", restoreGraph);

    window.print();
  }
});

// Graph report
document.getElementById("graphReport")?.addEventListener("click", function () {
  // For Safari, open window immediately to avoid popup blocking
  const isSafari =
    /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

  let printWindow = null;
  if (isSafari) {
    printWindow = window.open("", "PrintChart", "width=1000,height=1200");
    if (printWindow) {
      printWindow.document.write(
        "<html><body><p>Loading report...</p></body></html>"
      );
    }
  }

  window.generateGraphReport(printWindow);
});

// Fix zoom bug on mobile by forcing viewport recalculation after any print
if (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent)) {
  window.addEventListener("afterprint", function () {
    const graphElement = document.getElementById("graph");
    if (graphElement) {
      // Force viewport recalculation by temporarily changing zoom
      const originalZoom = document.body.style.zoom || "1";
      document.body.style.zoom = "0.99";

      setTimeout(() => {
        document.body.style.zoom = originalZoom;
        // Also dispatch resize for good measure
        window.dispatchEvent(new Event("resize"));
      }, 10);
    }
  });
}
