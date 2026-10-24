// With enter key press
"use strict";

(function () {
  let locations = [];
  let debounceTimer = null;
  let locationPrefixBuckets = new Map();
  let locationAreaPrefixBuckets = new Map();
  let knownCountrySearchTerms = new Set();
  let knownRegionSearchTerms = new Set();
  let knownCitySearchTerms = new Set();
  let locationOrderIndex = new Map();

  // English name aliases for cities where GeoNames uses local names
  // Maps English name -> GeoNames asciiname (what's in our data)
  const ENGLISH_ALIASES = {
    nuremberg: "nuernberg",
    cologne: "koeln",
    hanover: "hannover",
    brunswick: "braunschweig",
    gothenburg: "goeteborg",
    antwerp: "antwerpen",
    seville: "sevilla",
    lucerne: "luzern",
    zurich: "zuerich",
    munich: "muenchen", // GeoNames has "Munich" but adding for completeness
    dusseldorf: "duesseldorf",
    munster: "muenster",
    wurzburg: "wuerzburg",
    tubingen: "tuebingen",
    gottingen: "goettingen",
    lubeck: "luebeck",
    osnabruck: "osnabrueck",
    saarbrucken: "saarbruecken",
  };

  // Get alias for a search term if one exists (supports partial matches)
  // e.g., "nurem" matches "nuremberg" -> returns "nuernberg"
  function getAlias(term) {
    const lower = term.toLowerCase();
    // First try exact match
    if (ENGLISH_ALIASES[lower]) {
      return ENGLISH_ALIASES[lower];
    }
    // Then try partial match (term is prefix of an alias key)
    for (const [english, local] of Object.entries(ENGLISH_ALIASES)) {
      if (english.startsWith(lower)) {
        return local;
      }
    }
    return null;
  }

  // Convert DMS (Degrees, Minutes, Seconds) to Decimal Degrees
  function dmsToDecimal(degrees, minutes, seconds, direction) {
    // Clamp input values to valid ranges
    let d = Math.min(
      Math.max(parseInt(degrees) || 0, 0),
      direction === "N" || direction === "S" ? 90 : 180,
    );
    let m = Math.min(Math.max(parseInt(minutes) || 0, 0), 59);
    let s = Math.min(Math.max(parseInt(seconds) || 0, 0), 59);

    let decimal = d + m / 60 + s / 3600;

    // Clamp final result to valid coordinate bounds
    const maxValue = direction === "N" || direction === "S" ? 90 : 180;
    decimal = Math.min(decimal, maxValue);

    if (direction === "S" || direction === "W") {
      decimal = -decimal;
    }

    // Round to 6 decimal places (11cm precision)
    return Math.round(decimal * 1000000) / 1000000;
  }

  // Normalize text for flexible matching (handles hyphens, spaces, accents, abbreviations)
  function normalizeForSearch(text) {
    return text
      .replace(/GJ/g, "Đ") // Repair historical import corruption: uppercase Đ (U+0110) was rendered as "GJ" in some Vietnamese/Croatian city names. Case-sensitive so legitimate lowercase "gj" in Chinese romanizations (Yangjiang, Zhangjiang) is untouched.
      .replace(/, ình Định Province/g, ", Bình Định Province") // Repair: the 23 "Bình Định Province" entries had a dropped leading B. Match the post-comma form so legitimate "Bình Định" is never double-replaced.
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // Remove accents (é -> e, ô -> o)
      .replace(/đ/g, "d") // NFD does not decompose Vietnamese đ (U+0111), so map it explicitly so queries like "Nam Dinh" match "Nam Định".
      .replace(/[-'']/g, " ") // Convert hyphens and apostrophes to spaces
      .replace(/\bst\.?\s/g, "saint ") // Normalize "St" and "St." to "Saint"
      .replace(/\bste\.?\s/g, "sainte ") // Normalize "Ste" and "Ste." to "Sainte"
      .replace(/\bmt\.?\s/g, "mount ") // Normalize "Mt" and "Mt." to "Mount"
      .replace(/\bft\.?\s/g, "fort ") // Normalize "Ft" and "Ft." to "Fort"
      .replace(/\s+/g, " ") // Collapse multiple spaces
      .trim();
  }

  // Equivalent country labels are indexed together so users can search in Portuguese,
  // English, or by a common country name without losing city-level resolution.
  const COUNTRY_SEARCH_GROUPS = [
    ["brazil", "brasil"],
    ["palestine", "palestina", "palesitina", "palestinian territory", "palestinian territories", "state of palestine", "west bank and gaza"],
    ["united states", "estados unidos", "united states of america", "usa", "u s a", "eua"],
    ["united kingdom", "reino unido", "uk", "britain", "great britain", "england"],
    ["germany", "alemanha"],
    ["france", "franca"],
    ["spain", "espanha"],
    ["italy", "italia"],
    ["netherlands", "holanda", "paises baixos"],
    ["switzerland", "suica"],
    ["sweden", "suecia"],
    ["norway", "noruega"],
    ["denmark", "dinamarca"],
    ["finland", "finlandia"],
    ["greece", "grecia"],
    ["austria", "austria"],
    ["belgium", "belgica"],
    ["poland", "polonia"],
    ["czechia", "republica tcheca", "republica checa", "czech republic"],
    ["hungary", "hungria"],
    ["romania", "romenia"],
    ["russia", "russia"],
    ["ukraine", "ucrania"],
    ["turkey", "turquia", "turkiye"],
    ["ireland", "irlanda"],
    ["portugal", "portugal"],
    ["new zealand", "nova zelandia"],
    ["south africa", "africa do sul"],
    ["saudi arabia", "arabia saudita"],
    ["united arab emirates", "emirados arabes unidos"],
    ["qatar", "catar"],
    ["lebanon", "libano"],
    ["jordan", "jordania"],
    ["iraq", "iraque"],
    ["iran", "ira"],
    ["egypt", "egito"],
    ["morocco", "marrocos"],
    ["algeria", "argelia"],
    ["tunisia", "tunisia"],
    ["ethiopia", "etiopia"],
    ["ivory coast", "costa do marfim"],
    ["nigeria", "nigeria"],
    ["kenya", "quenia"],
    ["tanzania", "tanzania"],
    ["south korea", "coreia do sul", "republic of korea"],
    ["north korea", "coreia do norte", "democratic people s republic of korea"],
    ["japan", "japao"],
    ["china", "china"],
    ["india", "india"],
    ["indonesia", "indonesia"],
    ["malaysia", "malasia"],
    ["thailand", "tailandia"],
    ["vietnam", "vietna", "viet nam"],
    ["philippines", "filipinas"],
    ["nepal", "nepal"],
    ["pakistan", "paquistao"],
    ["bangladesh", "bangladesh"],
    ["sri lanka", "ceilan"],
    ["mexico", "mexico"],
    ["guatemala", "guatemala"],
    ["costa rica", "costa rica"],
    ["dominican republic", "republica dominicana"],
    ["colombia", "colombia"],
    ["ecuador", "equador"],
    ["peru", "peru"],
    ["bolivia", "bolivia"],
    ["chile", "chile"],
    ["uruguay", "uruguai"],
    ["paraguay", "paraguai"],
    ["venezuela", "venezuela"],
    ["argentina", "argentina"],
  ];

  // Portuguese name for Bethlehem is Belém. Keep the actual GeoNames label as the
  // selectable value so the resolver still receives an unambiguous place name.
  const CITY_SEARCH_SYNONYMS = {
    munich: ["munique", "muenchen"],
    muenchen: ["munich", "munique"],
    london: ["londres"],
    newyork: ["nova york", "nova iorque", "new york city"],
    "new york": ["nova york", "nova iorque", "new york city"],
    "new york city": ["nova york", "nova iorque", "new york"],
    rome: ["roma"],
    tokyo: ["toquio"],
    beijing: ["pequim"],
    moscow: ["moscou"],
    venice: ["veneza"],
    milan: ["milao"],
    naples: ["napoles"],
    florence: ["florenca"],
    athens: ["atenas"],
    stockholm: ["estocolmo"],
    warsaw: ["varsovia"],
    prague: ["praga"],
    copenhagen: ["copenhague"],
    amsterdam: ["amsterda"],
    brussels: ["bruxelas"],
    zurich: ["zurique", "zuerich"],
    zuerich: ["zurique", "zurich"],
    geneva: ["genebra"],
    helsinki: ["helsinque"],
    vienna: ["viena"],
    istanbul: ["istambul"],
    ankara: ["ancara"],
    "new delhi": ["nova deli"],
    mumbai: ["bombaim"],
    kolkata: ["calcuta"],
    bangkok: ["bangcoc"],
    singapore: ["singapura"],
    "ho chi minh city": ["saigon"],
    "mexico city": ["cidade do mexico"],
    "cape town": ["cidade do cabo"],
    johannesburg: ["joanesburgo"],
    riyadh: ["riade"],
    mecca: ["meca"],
    baghdad: ["bagda"],
    beirut: ["beirute"],
    damascus: ["damasco"],
    "tel aviv": ["telavive"],
    "sao francisco": ["san francisco"],
    "los angeles": ["los angeles"],
  };

  function getCountrySearchTerms(country) {
    const normalized = normalizeForSearch(country);
    const group = COUNTRY_SEARCH_GROUPS.find((terms) => terms.includes(normalized));
    return group || [normalized];
  }

  function addPrefixKeys(index, values, location, keysForLocation) {
    values.forEach((value) => {
      const normalized = normalizeForSearch(value);
      [2, 3].forEach((length) => {
        if (normalized.length < length) return;
        const key = normalized.slice(0, length);
        if (keysForLocation.has(key)) return;
        keysForLocation.add(key);
        if (!index.has(key)) index.set(key, []);
        index.get(key).push(location);
      });
    });
  }

  function buildLocationPrefixIndex(allLocations) {
    const cityBuckets = new Map();
    const areaBuckets = new Map();
    const countryTermsFound = new Set();
    const regionTermsFound = new Set();
    const cityTermsFound = new Set();
    const orderIndex = new Map();
    allLocations.forEach((location, index) => {
      if (!orderIndex.has(location)) orderIndex.set(location, index);
      const parts = String(location).split(",").map((part) => part.trim());
      const cityName = parts[0] || "";
      const regionName = parts[1] || "";
      const countryName = parts[parts.length - 1] || "";
      const regionParts = parts.slice(1, -1);
      const cityKeys = new Set();
      const areaKeys = new Set();
      const normalizedCityName = normalizeForSearch(cityName);
      const cityValues = [cityName, ...(CITY_SEARCH_SYNONYMS[normalizedCityName] || [])];
      // Only Bethlehem in the West Bank gets the Portuguese "Belém" search alias;
      // other towns called Bethlehem should not crowd out Belém do Pará in results.
      if (normalizedCityName === "bethlehem" && getCountrySearchTerms(countryName).includes("palestine")) {
        cityValues.push("belem");
      }
      addPrefixKeys(cityBuckets, cityValues, location, cityKeys);
      cityValues.forEach((value) => { if (normalizeForSearch(value)) cityTermsFound.add(normalizeForSearch(value)); });
      addPrefixKeys(areaBuckets, regionParts, location, areaKeys);
      regionParts.forEach((region) => { if (normalizeForSearch(region)) regionTermsFound.add(normalizeForSearch(region)); });
      const countryTerms = getCountrySearchTerms(countryName);
      addPrefixKeys(areaBuckets, countryTerms, location, areaKeys);
      countryTerms.forEach((term) => { if (term) countryTermsFound.add(term); });
    });
    locationPrefixBuckets = cityBuckets;
    locationAreaPrefixBuckets = areaBuckets;
    knownCountrySearchTerms = countryTermsFound;
    knownRegionSearchTerms = regionTermsFound;
    knownCitySearchTerms = cityTermsFound;
    locationOrderIndex = orderIndex;
  }

  function getIndexedLocationPool(query, allLocations) {
    const queryParts = String(query || "").split(",");
    const cityText = queryParts[0].trim();
    const normalizedCity = normalizeForSearch(cityText);
    if (normalizedCity.length < 2 || !locationPrefixBuckets.size) return allLocations;
    const prefixLength = normalizedCity.length >= 3 ? 3 : 2;
    const direct = locationPrefixBuckets.get(normalizedCity.slice(0, prefixLength)) || [];
    const alias = getAlias(normalizedCity);
    const aliasPrefix = alias ? alias.slice(0, Math.min(3, alias.length)) : "";
    const aliased = aliasPrefix ? (locationPrefixBuckets.get(aliasPrefix) || []) : [];
    const areaText = queryParts.length > 1 ? queryParts[1].trim() : normalizedCity;
    const normalizedArea = normalizeForSearch(areaText);
    const areaPrefixLength = normalizedArea.length >= 3 ? 3 : 2;
    const area = normalizedArea.length >= 2
      ? (locationAreaPrefixBuckets.get(normalizedArea.slice(0, areaPrefixLength)) || [])
      : [];
    if (!direct.length && !aliased.length && !area.length) return allLocations;
    return Array.from(new Set([...direct, ...aliased, ...area]))
      .sort((a, b) => (locationOrderIndex.get(a) ?? Number.MAX_SAFE_INTEGER) - (locationOrderIndex.get(b) ?? Number.MAX_SAFE_INTEGER));
  }

  function cityMatchesQuery(normalizedCity, normalizedQuery, countryName = "") {
    if (!normalizedQuery) return false;
    if (normalizedCity.startsWith(normalizedQuery)) return true;
    if (normalizedQuery === "belem" && normalizedCity === "bethlehem" && getCountrySearchTerms(countryName).includes("palestine")) return true;
    const alias = getAlias(normalizedQuery);
    if (alias && normalizedCity.startsWith(alias)) return true;
    for (const [base, synonyms] of Object.entries(CITY_SEARCH_SYNONYMS)) {
      const variants = [base, ...synonyms];
      if (variants.some((variant) => variant.startsWith(normalizedQuery)) && variants.includes(normalizedCity)) {
        return true;
      }
    }
    return false;
  }

  function countryMatchesQuery(countryName, query) {
    const normalizedQuery = normalizeForSearch(query);
    if (!normalizedQuery) return false;
    return getCountrySearchTerms(countryName).some((term) =>
      !!term && (term.startsWith(normalizedQuery) || normalizedQuery.startsWith(term)),
    );
  }

  function getLocationSuggestions(query, allLocations, forceFullScan = false) {
    const candidates = forceFullScan ? allLocations : getIndexedLocationPool(query, allLocations);
    const trimmedQuery = String(query || "").trim();
    const normalizedQuery = normalizeForSearch(trimmedQuery);
    if (normalizedQuery.length < 2) return [];

    // Comma search: match a city plus any region or country alias, e.g. "Bethlehem, Palestine".
    if (trimmedQuery.includes(",")) {
      const parts = trimmedQuery.split(",").map((part) => part.trim());
      const cityPart = normalizeForSearch(parts[0] || "");
      const areaPart = normalizeForSearch(parts[1] || "");
      if (cityPart && areaPart) {
        const matches = candidates.map((location, order) => {
          const locationParts = String(location).split(",").map((part) => part.trim());
          const cityName = locationParts[0] || "";
          const regionName = locationParts[1] || "";
          const countryName = locationParts[locationParts.length - 1] || "";
          const normalizedCity = normalizeForSearch(cityName);
          const cityMatch = cityMatchesQuery(normalizedCity, cityPart, countryName);
          const regionMatch = normalizeForSearch(regionName).startsWith(areaPart) || normalizeForSearch(regionName).includes(areaPart);
          const countryMatch = countryMatchesQuery(countryName, areaPart);
          if (!cityMatch || (!regionMatch && !countryMatch)) return null;
          let score = 100;
          if (normalizedCity === cityPart) score += 80;
          else if (!normalizedCity.startsWith(cityPart)) score -= 25; // synonym/alias result
          if (regionMatch) score += normalizeForSearch(regionName) === areaPart ? 20 : 5;
          if (countryMatch) score += getCountrySearchTerms(countryName).includes(areaPart) ? 20 : 5;
          return { location, score, order };
        }).filter(Boolean).sort((a, b) => b.score - a.score || a.order - b.order);
        const topMatches = matches.slice(0, 12).map((item) => item.location);
        return topMatches.length || forceFullScan
          ? topMatches
          : getLocationSuggestions(query, allLocations, true);
      }
    }

    const queryAlias = getAlias(normalizedQuery);
    const queryWords = normalizedQuery.replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
    const countryQueryContext = knownCountrySearchTerms.has(normalizedQuery) ||
      (normalizedQuery.length >= 3 && !knownCitySearchTerms.has(normalizedQuery) && Array.from(knownCountrySearchTerms).some((term) => term.startsWith(normalizedQuery)));
    const exactRegionQuery = knownRegionSearchTerms.has(normalizedQuery);
    const matches = candidates.map((location, order) => {
      const locationParts = String(location).split(",").map((part) => part.trim());
      const cityName = locationParts[0] || "";
      const regionName = locationParts[1] || "";
      const countryName = locationParts[locationParts.length - 1] || "";
      const normalizedCity = normalizeForSearch(cityName);
      const normalizedRegion = normalizeForSearch(regionName);
      const cityMatch = cityMatchesQuery(normalizedCity, normalizedQuery, countryName);
      const regionMatch = normalizedRegion.startsWith(normalizedQuery) || normalizedRegion.includes(normalizedQuery);
      const countryMatch = countryMatchesQuery(countryName, normalizedQuery);
      const normalizedLocation = normalizeForSearch(location);
      const allWordsMatch = queryWords.length > 1 && queryWords.every((word) =>
        normalizedLocation.replace(/[^a-z0-9]/g, "").includes(word),
      );
      if (!cityMatch && !regionMatch && !countryMatch && !allWordsMatch) return null;

      let score = 0;
      if (countryMatch && countryQueryContext) {
        // A country typed by itself should show cities in that country, not an unrelated
        // town with the same name (for example, Palestine, Texas or Brazil, Indiana).
        score = 260;
        if (normalizeForSearch(cityName) === "bethlehem" && getCountrySearchTerms(countryName).includes("palestine")) score += 90;
      } else if (regionMatch && exactRegionQuery) {
        // Searching a state/province should prioritize settlements in that region.
        score = 230 + (normalizedRegion === normalizedQuery ? 10 : 0);
      } else if (cityMatch) {
        const exactSynonymMatch = (CITY_SEARCH_SYNONYMS[normalizedCity] || []).includes(normalizedQuery);
        const palestinianBethlehemAlias = normalizedQuery === "belem" && normalizedCity === "bethlehem" && getCountrySearchTerms(countryName).includes("palestine");
        if (countryQueryContext && !countryMatch) {
          score = normalizedCity === normalizedQuery ? 35 : 20;
        } else if (palestinianBethlehemAlias) {
          score = 220;
        } else if (exactSynonymMatch) {
          score = 220;
        } else if (exactRegionQuery && !regionMatch) {
          score = normalizedCity === normalizedQuery ? 150 : 100;
        } else {
          score += normalizedCity === normalizedQuery ? 200 : (normalizedCity.startsWith(normalizedQuery) ? 130 : 70);
        }
        if (normalizedQuery === "belem" && normalizedCity === "belem" && normalizedRegion === "para" && countryName.toLowerCase() === "brazil") score += 30;
        if (queryAlias && normalizedCity === queryAlias) score += 15;
      } else if (regionMatch) {
        score += normalizedRegion === normalizedQuery ? 85 : 70;
      } else if (countryMatch) {
        score += getCountrySearchTerms(countryName).includes(normalizedQuery) ? 90 : 65;
      } else if (allWordsMatch) {
        score += 25;
      }
      return { location, score, order };
    }).filter(Boolean).sort((a, b) => b.score - a.score || a.order - b.order);

    const topMatches = matches.slice(0, 12).map((item) => item.location);
    return topMatches.length || forceFullScan
      ? topMatches
      : getLocationSuggestions(query, allLocations, true);
  }

  document.addEventListener("DOMContentLoaded", async () => {
    if (locations.length === 0) {
      try {
        const response = await fetch("/locations.json");
        if (!response.ok)
          throw new Error(`HTTP error! Status: ${response.status}`);
        locations = await response.json();
        buildLocationPrefixIndex(locations);
      } catch (error) {
        console.error("Error loading locations:", error);
        return;
      }
    }

    const locationInputs = document.querySelectorAll(".location");

    locationInputs.forEach((input) => {
      input.addEventListener("input", (event) => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(processLocationInput, 150, event.target);
      });

      input.addEventListener("keydown", (event) => {
        if (event.key !== "Enter") return;

        const suggestionsBox = input.nextElementSibling;
        const firstSuggestion =
          suggestionsBox.querySelector(".suggestion-item");

        if (suggestionsBox.style.display === "block" && firstSuggestion) {
          event.preventDefault();
          input.value = firstSuggestion.textContent;
          suggestionsBox.style.display = "none";
          input.dispatchEvent(new Event("change", { bubbles: true }));
        } else {
          suggestionsBox.style.display = "none";
        }
      });
    });

    // Click listener to hide suggestions when clicking outside
    document.addEventListener("click", (event) => {
      const isClickInsideAnyInput = Array.from(locationInputs).some(
        (input) =>
          input.contains(event.target) ||
          input.nextElementSibling.contains(event.target),
      );

      if (!isClickInsideAnyInput) {
        document.querySelectorAll(".suggestions-box").forEach((box) => {
          box.style.display = "none";
        });
      }
    });

    // Clear focus on all input fields after any form with class "form" is submitted
    document.querySelectorAll(".form").forEach((form) => {
      form.addEventListener("submit", (event) => {
        event.preventDefault(); // Remove this line if you want to proceed with submission
        form.querySelectorAll("input, select").forEach((element) => {
          element.blur();
        });
      });
    });
  });

  // All work extracted to named function
  function processLocationInput(input) {
    const query = input.value.trim().toLowerCase();
    const suggestionsBox = input.nextElementSibling;

    if (query.length < 2) {
      suggestionsBox.innerHTML = "";
      suggestionsBox.style.display = "none";
      return;
    }

    const suggestions = getLocationSuggestions(query, locations);

    // Generate HTML for suggestion items
    let suggestionsHtml = suggestions
      .map((location) => `<div class="suggestion-item">${location}</div>`)
      .join("");

    // If there are fewer than 5 suggestions, add the DMS input fields
    if (suggestions.length < 5) {
      suggestionsHtml += `
        <div class="lat-long-container">
          <input type="text" placeholder="custom place" class="custom-location-input" maxlength="80" />
          <input type="text" inputmode="numeric" placeholder="°" class="lat-deg" maxlength="2" />
          <input type="text" inputmode="numeric" placeholder="'" class="lat-min" maxlength="2" />
          <input type="text" inputmode="numeric" placeholder="&quot;" class="lat-sec" maxlength="2" />
          <select class="lat-dir">
            <option value="N">N</option>
            <option value="S">S</option>
          </select>
          <input type="text" inputmode="numeric" placeholder="°" class="long-deg" maxlength="3" />
          <input type="text" inputmode="numeric" placeholder="'" class="long-min" maxlength="2" />
          <input type="text" inputmode="numeric" placeholder="&quot;" class="long-sec" maxlength="2" />
          <select class="long-dir">
            <option value="E">E</option>
            <option value="W">W</option>
          </select>
          <button type="button" class="lat-long-button">&#10003;</button>
        </div>`;
    }

    suggestionsBox.innerHTML = suggestionsHtml;
    suggestionsBox.style.display = "block";

    // Attach click handlers to suggestion items
    suggestionsBox.querySelectorAll(".suggestion-item").forEach((item) => {
      item.addEventListener("click", () => {
        input.value = item.textContent;
        suggestionsBox.style.display = "none";
        input.dispatchEvent(new Event("change", { bubbles: true }));
      });
    });

    // Attach event listeners to the DMS inputs if they exist
    const latLongContainer = suggestionsBox.querySelector(
      ".lat-long-container",
    );
    if (latLongContainer) {
      const latDeg = latLongContainer.querySelector(".lat-deg");
      const latMin = latLongContainer.querySelector(".lat-min");
      const latSec = latLongContainer.querySelector(".lat-sec");
      const latDir = latLongContainer.querySelector(".lat-dir");
      const longDeg = latLongContainer.querySelector(".long-deg");
      const longMin = latLongContainer.querySelector(".long-min");
      const longSec = latLongContainer.querySelector(".long-sec");
      const longDir = latLongContainer.querySelector(".long-dir");
      const useButton = latLongContainer.querySelector(".lat-long-button");

      const dmsInputs = [latDeg, latMin, latSec, longDeg, longMin, longSec];

      // Validate and clamp DMS input values
      latDeg.addEventListener("input", (e) => {
        let val = parseInt(e.target.value);
        if (val > 90) e.target.value = 90;
        if (val < 0) e.target.value = 0;
      });
      latMin.addEventListener("input", (e) => {
        let val = parseInt(e.target.value);
        if (val > 59) e.target.value = 59;
        if (val < 0) e.target.value = 0;
      });
      latSec.addEventListener("input", (e) => {
        let val = parseInt(e.target.value);
        if (val > 59) e.target.value = 59;
        if (val < 0) e.target.value = 0;
      });
      longDeg.addEventListener("input", (e) => {
        let val = parseInt(e.target.value);
        if (val > 180) e.target.value = 180;
        if (val < 0) e.target.value = 0;
      });
      longMin.addEventListener("input", (e) => {
        let val = parseInt(e.target.value);
        if (val > 59) e.target.value = 59;
        if (val < 0) e.target.value = 0;
      });
      longSec.addEventListener("input", (e) => {
        let val = parseInt(e.target.value);
        if (val > 59) e.target.value = 59;
        if (val < 0) e.target.value = 0;
      });

      // For Enter key event on DMS inputs
      dmsInputs.forEach((field) => {
        field.addEventListener("keydown", (e) => {
          if (e.key === "Enter") {
            const customLocation = latLongContainer
              .querySelector(".custom-location-input")
              .value.trim();
            const latD = latDeg.value.trim();
            const latM = latMin.value.trim();
            const latS = latSec.value.trim();
            const longD = longDeg.value.trim();
            const longM = longMin.value.trim();
            const longS = longSec.value.trim();

            if (
              customLocation &&
              latD &&
              latM &&
              latS &&
              longD &&
              longM &&
              longS
            ) {
              const latDecimal = dmsToDecimal(latD, latM, latS, latDir.value);
              const longDecimal = dmsToDecimal(
                longD,
                longM,
                longS,
                longDir.value,
              );
              event.preventDefault();
              const form = input.closest("form");
              const latitudeInput = form?.querySelector('[name="lat"]');
              const longitudeInput = form?.querySelector('[name="long"]');
              if (latitudeInput) latitudeInput.value = latDecimal;
              if (longitudeInput) longitudeInput.value = longDecimal;
              input.value = `${latDecimal}, ${longDecimal}`;
              suggestionsBox.style.display = "none";
              const coordinateToggle = form?.querySelector('[name="useCoordinates"]');
              if (coordinateToggle) {
                coordinateToggle.checked = true;
                coordinateToggle.dispatchEvent(new Event("change", { bubbles: true }));
              } else {
                input.dispatchEvent(new Event("change", { bubbles: true }));
              }
            }
          }
        });
      });

      // For the click event on the "Use" button
      useButton.addEventListener("click", () => {
        const customLocation = latLongContainer
          .querySelector(".custom-location-input")
          .value.trim();
        const latD = latDeg.value.trim();
        const latM = latMin.value.trim();
        const latS = latSec.value.trim();
        const longD = longDeg.value.trim();
        const longM = longMin.value.trim();
        const longS = longSec.value.trim();

        if (customLocation && latD && latM && latS && longD && longM && longS) {
          const latDecimal = dmsToDecimal(latD, latM, latS, latDir.value);
          const longDecimal = dmsToDecimal(longD, longM, longS, longDir.value);
          const form = input.closest("form");
          const latitudeInput = form?.querySelector('[name="lat"]');
          const longitudeInput = form?.querySelector('[name="long"]');
          if (latitudeInput) latitudeInput.value = latDecimal;
          if (longitudeInput) longitudeInput.value = longDecimal;
          input.value = `${latDecimal}, ${longDecimal}`;
          suggestionsBox.style.display = "none";
          const coordinateToggle = form?.querySelector('[name="useCoordinates"]');
          if (coordinateToggle) {
            coordinateToggle.checked = true;
            coordinateToggle.dispatchEvent(new Event("change", { bubbles: true }));
          } else {
            input.dispatchEvent(new Event("change", { bubbles: true }));
          }
        }
      });
    }
  }
})();
