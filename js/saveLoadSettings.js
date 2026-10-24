"use strict";

// Decode HTML entities for proper display of settings names
function decodeHtmlEntities(str) {
  if (!str) return str;
  const textarea = document.createElement("textarea");
  textarea.innerHTML = str;
  return textarea.value;
}

// Custom points data and state
let customPointsData = [];
let activeCustomPoints = []; // Array of {num, name, display, aspect}

// Custom aspects state (max 5, user-defined angle in degrees 0-180).
// Kept in a SEPARATE array (not merged with aspectSettings.aspects) so
// existing users' settings JSON is untouched when this field is absent.
let activeCustomAspects = []; // Array of {angle, orb, enabled}

function syncCustomAyanamsaField() {
  const select = document.querySelector(
    '#system-settings select[name="ayanamsaSystem"]',
  );
  const input = document.querySelector(
    '#system-settings input[name="customAyanamsa"]',
  );
  const label = document.querySelector("#system-settings .custom-ayanamsa-label");
  const field = document.querySelector("#system-settings .custom-ayanamsa-field");
  if (!select || !input || !field || !label) return;

  const customSelected = select.value === "Custom";
  input.required = customSelected;
  field.hidden = !customSelected;
  label.hidden = !customSelected;
}

// Load custom points JSON on page load
fetch("/json/customPoints.json")
  .then((res) => res.json())
  .then((data) => {
    customPointsData = data;
  })
  .catch((err) => {
    console.error("Failed to load custom points data");
  });

// Helper to clear error messages after a delay (default 5 seconds)
let clearSettingsMessageTimeoutId;
const clearSettingsMessage = (delay = 5000) => {
  if (clearSettingsMessageTimeoutId) {
    clearTimeout(clearSettingsMessageTimeoutId);
  }
  clearSettingsMessageTimeoutId = setTimeout(() => {
    const errorElem = document.querySelector(".errorMessageSettings");
    if (errorElem) {
      errorElem.textContent = "";
    }
  }, delay);
};

// On page load, fetch recent settings & prevent the form from submitting on enter key press
document.addEventListener("DOMContentLoaded", () => {
  const settingsForm = document.querySelector(".settings-form");
  if (settingsForm) {
    settingsForm.addEventListener("submit", (e) => {
      e.preventDefault();
    });
  }

  // Add Enter key handler for settings name input
  const settingsNameInput = document.getElementById("settingsName");
  if (settingsNameInput) {
    settingsNameInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        document.getElementById("settingsSave").click();
      }
    });
  }

  // Render editor controls first, then always initialize with the built-in Default preset.
  renderCustomPointsList();
  renderCustomAspectsList();
  initializeDefaultSettings();

  // Loading the list is read-only and must never apply a saved preset automatically.
  fetchRecentSettings();
  syncCustomAyanamsaField();
  document
    .querySelector('#system-settings select[name="ayanamsaSystem"]')
    ?.addEventListener("change", syncCustomAyanamsaField);
});

// Helper to clear custom points error message
let clearCustomPointsErrorTimeoutId;
const clearCustomPointsError = (delay = 5000) => {
  if (clearCustomPointsErrorTimeoutId) {
    clearTimeout(clearCustomPointsErrorTimeoutId);
  }
  clearCustomPointsErrorTimeoutId = setTimeout(() => {
    const errorElem = document.getElementById("customPointsError");
    if (errorElem) {
      errorElem.textContent = "";
    }
  }, delay);
};

// Render the custom points list matching planet-settings format
function renderCustomPointsList() {
  const container = document.getElementById("customPointsList");
  if (!container) return;

  container.innerHTML = "";

  // Render existing custom points in same format as planet settings
  activeCustomPoints.forEach((point, index) => {
    const slotNum = String(index + 1).padStart(2, "0");

    // Create row container to keep elements together
    const row = document.createElement("div");
    row.className = "custom-point-row";

    // Label with number and name
    const label = document.createElement("label");
    label.innerHTML = `<span class="custom-point-number">${slotNum}</span><span class="custom-point-name" title="${point.name}">${point.name}</span>`;
    row.appendChild(label);

    // Display checkbox
    const displayCb = document.createElement("input");
    displayCb.type = "checkbox";
    displayCb.checked = point.display;
    displayCb.title = "Show on wheel";
    displayCb.addEventListener("change", (e) => {
      activeCustomPoints[index].display = e.target.checked;
    });
    row.appendChild(displayCb);

    // Aspect checkbox
    const aspectCb = document.createElement("input");
    aspectCb.type = "checkbox";
    aspectCb.checked = point.aspect;
    aspectCb.title = "Show aspects";
    aspectCb.addEventListener("change", (e) => {
      activeCustomPoints[index].aspect = e.target.checked;
    });
    row.appendChild(aspectCb);

    // Delete button
    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "custom-point-delete";
    deleteBtn.textContent = "X";
    deleteBtn.title = "Remove";
    deleteBtn.addEventListener("click", () => {
      const isConfirming = deleteBtn.dataset.confirming === "true";
      if (isConfirming) {
        activeCustomPoints.splice(index, 1);
        renderCustomPointsList();
      } else {
        deleteBtn.textContent = "✓";
        deleteBtn.dataset.confirming = "true";
        setTimeout(() => {
          if (deleteBtn.dataset.confirming === "true") {
            deleteBtn.textContent = "X";
            deleteBtn.dataset.confirming = "false";
          }
        }, 5000);
      }
    });
    row.appendChild(deleteBtn);

    container.appendChild(row);
  });

  // Add input row for adding new custom point (if under limit)
  if (activeCustomPoints.length < 5) {
    const slotNum = String(activeCustomPoints.length + 1).padStart(2, "0");
    const inputRow = document.createElement("div");
    inputRow.className = "custompoint-input-row";
    inputRow.innerHTML = `
      <span class="custom-point-number">${slotNum}</span>
      <span class="custom-point-input-wrapper">
        <input
          type="text"
          id="customPointInput"
          class="custom-point-input"
          placeholder="Custom Point"
          autocomplete="off"
          spellcheck="false"
          maxlength="40"
        />
        <span id="customPointGhost" class="custom-point-ghost"></span>
      </span>
      <button type="button" id="customPointConfirm" class="custom-point-confirm" title="Add">✓</button>
    `;
    container.appendChild(inputRow);

    // Setup ghost text autocomplete behavior
    const input = inputRow.querySelector("#customPointInput");
    const ghost = inputRow.querySelector("#customPointGhost");
    const confirmBtn = inputRow.querySelector("#customPointConfirm");
    let currentMatch = null;

    input.addEventListener("input", () => {
      const query = input.value.trim();
      const queryLower = query.toLowerCase();
      const errorElem = document.getElementById("customPointsError");

      // Clear any previous error while typing
      if (errorElem) errorElem.textContent = "";

      if (!query) {
        ghost.textContent = "";
        currentMatch = null;
        return;
      }

      // Prefer the shortest match starting with the query; JSON order as tiebreaker.
      // This makes short canonical names ("Pan") reachable even when a longer name
      // ("Pandora") appears earlier in the source list.
      let partial = null;
      for (const p of customPointsData) {
        if (!p.name.toLowerCase().startsWith(queryLower)) continue;
        if (!partial || p.name.length < partial.name.length) {
          partial = p;
        }
      }

      if (partial) {
        // Show ghost text: user's input + remaining characters in lighter color
        ghost.textContent = query + partial.name.slice(query.length);
        currentMatch = partial;
      } else {
        // No match
        ghost.textContent = "";
        currentMatch = null;
      }
    });

    // Tab or Right arrow key to accept ghost text
    input.addEventListener("keydown", (e) => {
      if (
        (e.key === "Tab" || e.key === "ArrowRight") &&
        currentMatch &&
        ghost.textContent
      ) {
        e.preventDefault();
        input.value = currentMatch.name;
        ghost.textContent = "";
      }
      if (e.key === "Enter") {
        e.preventDefault();
        confirmBtn.click();
      }
    });

    // Confirm button click
    confirmBtn.addEventListener("click", () => {
      const errorElem = document.getElementById("customPointsError");
      const query = input.value.trim();

      // Check if input is empty
      if (!query) {
        return;
      }

      // Check if no valid match found
      if (!currentMatch) {
        if (errorElem) {
          errorElem.textContent = "No match found";
          clearCustomPointsError();
        }
        return;
      }

      // Check if already added
      const alreadyAdded = activeCustomPoints.some(
        (p) => p.num === currentMatch.num,
      );
      if (alreadyAdded) {
        if (errorElem) {
          errorElem.textContent = `${currentMatch.name} already added`;
          clearCustomPointsError();
        }
        return;
      }

      const newPoint = {
        num: currentMatch.num,
        name: currentMatch.name,
        display: true,
        aspect: false,
      };

      activeCustomPoints.push(newPoint);
      renderCustomPointsList();
    });
  }
}

// Helper to clear custom aspects error message
let clearCustomAspectsErrorTimeoutId;
const clearCustomAspectsError = (delay = 5000) => {
  if (clearCustomAspectsErrorTimeoutId) {
    clearTimeout(clearCustomAspectsErrorTimeoutId);
  }
  clearCustomAspectsErrorTimeoutId = setTimeout(() => {
    const errorElem = document.getElementById("customAspectsError");
    if (errorElem) {
      errorElem.textContent = "";
    }
  }, delay);
};

// Render the custom aspects list. Mirrors renderCustomPointsList structure
// so the UX matches: max 5 entries, per-row enable checkbox, per-row orb
// select, delete button with confirm-tap. Angle input is a number field
// accepting 0-180 degrees (inclusive) with step 0.01 for finer aspects
// like the septile (~51.43°).
function renderCustomAspectsList() {
  const container = document.getElementById("customAspectsList");
  if (!container) return;

  container.innerHTML = "";

  // Existing custom aspects
  activeCustomAspects.forEach((asp, index) => {
    const row = document.createElement("div");
    row.className = "custom-aspect-row";

    // Label: just the aspect degree in bold. Unlike custom points whose
    // on-chart identity is "01"/"02", a custom aspect's on-chart identity
    // is its degree — so showing "01" here would be redundant clutter.
    const label = document.createElement("label");
    label.innerHTML =
      `<span class="custom-aspect-degree-label" title="Custom aspect ${asp.angle}°">${asp.angle}°</span>`;
    row.appendChild(label);

    // Orb select (1-10 degrees, mirroring the built-in aspect orb options)
    const orbSelect = document.createElement("select");
    orbSelect.className = "custom-aspect-orb";
    orbSelect.title = "Orb";
    for (let i = 1; i <= 10; i++) {
      const opt = document.createElement("option");
      opt.value = String(i);
      opt.textContent = `${i}°`;
      if (i === asp.orb) opt.selected = true;
      orbSelect.appendChild(opt);
    }
    orbSelect.addEventListener("change", (e) => {
      activeCustomAspects[index].orb = Number(e.target.value);
    });
    row.appendChild(orbSelect);

    // Enable checkbox (whether this custom aspect is active in charts)
    const enableCb = document.createElement("input");
    enableCb.type = "checkbox";
    // Distinct name so it does NOT get scooped up by the
    // '#aspect-settings input[name="aspects"]:checked' query that builds
    // selectedAspects. See risk-analysis in earlier chat: reusing
    // name="aspects" would leak custom entries into selectedAspects and
    // the server would silently drop them.
    enableCb.name = "customAspectEnabled";
    enableCb.checked = asp.enabled;
    enableCb.title = "Enable this custom aspect";
    enableCb.addEventListener("change", (e) => {
      activeCustomAspects[index].enabled = e.target.checked;
    });
    row.appendChild(enableCb);

    // Delete button (same confirm-then-remove pattern as custom points)
    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "custom-aspect-delete";
    deleteBtn.textContent = "X";
    deleteBtn.title = "Remove";
    deleteBtn.addEventListener("click", () => {
      const isConfirming = deleteBtn.dataset.confirming === "true";
      if (isConfirming) {
        activeCustomAspects.splice(index, 1);
        renderCustomAspectsList();
      } else {
        deleteBtn.textContent = "✓";
        deleteBtn.dataset.confirming = "true";
        setTimeout(() => {
          if (deleteBtn.dataset.confirming === "true") {
            deleteBtn.textContent = "X";
            deleteBtn.dataset.confirming = "false";
          }
        }, 5000);
      }
    });
    row.appendChild(deleteBtn);

    container.appendChild(row);
  });

  // Add-new input row (if under max)
  if (activeCustomAspects.length < 5) {
    const inputRow = document.createElement("div");
    inputRow.className = "customaspect-input-row";
    // Uses type=text (not type=number) so we can enforce constraints on
    // every keystroke — HTML5 type=number's `step` and `max` only validate
    // at form submit, letting users type "999999.9999" indefinitely into
    // the visible field. Mirrors the customPoint input pattern (also
    // type=text). maxlength=6 fits "180.99"; the input listener enforces
    // digits + one decimal + ≤2 decimal places + value ≤180.
    inputRow.innerHTML = `
      <span class="custom-aspect-degree-label">Custom Aspect</span>
      <input
        type="text"
        inputmode="decimal"
        id="customAspectInput"
        class="custom-aspect-degree"
        placeholder="0-180"
        maxlength="6"
        autocomplete="off"
        spellcheck="false"
      />
      <button type="button" id="customAspectConfirm" class="custom-aspect-confirm" title="Add">✓</button>
    `;
    container.appendChild(inputRow);

    const input = inputRow.querySelector("#customAspectInput");
    const confirmBtn = inputRow.querySelector("#customAspectConfirm");

    // Live-clamp typed input: strip non-numeric, enforce single decimal
    // point, cap decimal places at 2, cap value at 180. Runs on every
    // keystroke so the visible value never shows a malformed number.
    input.addEventListener("input", () => {
      const errorElem = document.getElementById("customAspectsError");
      if (errorElem) errorElem.textContent = "";

      let v = input.value;
      // Strip anything that isn't a digit or a dot
      v = v.replace(/[^0-9.]/g, "");
      // Collapse multiple decimal points down to just the first
      const firstDot = v.indexOf(".");
      if (firstDot !== -1) {
        v = v.slice(0, firstDot + 1) + v.slice(firstDot + 1).replace(/\./g, "");
        // Cap to 2 decimal places
        const parts = v.split(".");
        if (parts[1] && parts[1].length > 2) {
          v = parts[0] + "." + parts[1].slice(0, 2);
        }
      }
      // Cap the numeric value at 180 (parseFloat gracefully ignores a
      // trailing "." like "180." while still typing)
      if (v && v !== "." ) {
        const num = parseFloat(v);
        if (!isNaN(num) && num > 180) {
          v = "180";
        }
      }
      if (v !== input.value) input.value = v;
    });

    // Enter to confirm
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        confirmBtn.click();
      }
    });

    confirmBtn.addEventListener("click", () => {
      const errorElem = document.getElementById("customAspectsError");
      const raw = input.value.trim();

      if (!raw) return;

      const angle = parseFloat(raw);

      if (isNaN(angle) || angle < 0 || angle > 180) {
        if (errorElem) {
          errorElem.textContent = "Angle must be between 0 and 180";
          clearCustomAspectsError();
        }
        return;
      }

      // Normalize to 2 decimals for consistent duplicate-detection and
      // display. 72.100 and 72.10 collapse to 72.1.
      const normalized = Math.round(angle * 100) / 100;

      // Reject duplicates (an already-defined identical angle)
      const alreadyAdded = activeCustomAspects.some(
        (a) => a.angle === normalized,
      );
      if (alreadyAdded) {
        if (errorElem) {
          errorElem.textContent = `${normalized}° already added`;
          clearCustomAspectsError();
        }
        return;
      }

      activeCustomAspects.push({
        angle: normalized,
        orb: 3, // matches Semisextile/Quincunx default; safe conservative choice
        enabled: true,
      });
      renderCustomAspectsList();
    });
  }
}

// Track delete confirmation state for settings.
const deleteConfirmationStateSettings = new Map();
const LOCAL_PRESETS_KEY = "truesky_named_presets_v1";
let firebaseRecentSettingsCache = [];

function readLocalPresets() {
  try {
    const parsed = JSON.parse(localStorage.getItem(LOCAL_PRESETS_KEY) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) =>
      item && typeof item.id === "string" &&
      typeof item.settings_name === "string" &&
      typeof item.settings_json === "string",
    ).map((item) => ({ ...item, source: "local" }));
  } catch (err) {
    console.warn("Não foi possível ler os presets locais do True Sky.", err);
    return [];
  }
}

function saveLocalPreset(settingsName, settingsJson) {
  const name = String(settingsName || "My Preferences").trim() || "My Preferences";
  const now = new Date().toISOString();
  const presets = readLocalPresets();
  const existing = presets.find((item) =>
    item.settings_name === name && item.settings_json === settingsJson,
  );
  const record = existing
    ? { ...existing, updated_at: now, source: "local" }
    : {
        id: `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        source: "local",
        settings_name: name,
        settings_json: settingsJson,
        created_at: now,
        updated_at: now,
      };
  const next = [record, ...presets.filter((item) => item.id !== record.id)]
    .slice(0, 100)
    .map(({ source, ...item }) => item);
  localStorage.setItem(LOCAL_PRESETS_KEY, JSON.stringify(next));
  return record;
}

function removeLocalPreset(id) {
  const next = readLocalPresets().filter((item) => item.id !== id)
    .map(({ source, ...item }) => item);
  localStorage.setItem(LOCAL_PRESETS_KEY, JSON.stringify(next));
}

// Render Firebase presets together with locally saved presets, deduplicating the
// same name + JSON when a save succeeded in both places.
function updateRecentSettings(settingsList) {
  firebaseRecentSettingsCache = Array.isArray(settingsList) ? settingsList.slice() : [];
  const recentSettingsList = document.getElementById("recentSettingsList");
  if (!recentSettingsList) return;
  recentSettingsList.innerHTML = "";
  deleteConfirmationStateSettings.clear();

  const candidates = [
    ...firebaseRecentSettingsCache.map((item) => ({ ...item, source: "firebase" })),
    ...readLocalPresets(),
  ];
  const seen = new Set();
  const mergedSettings = candidates.filter((item) => {
    const key = `${item.settings_name || ""}\u0000${item.settings_json || ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a, b) => {
    const aDate = Date.parse(a.updated_at || a.created_at || "") || 0;
    const bDate = Date.parse(b.updated_at || b.created_at || "") || 0;
    return bDate - aDate;
  }).slice(0, 100);

  mergedSettings.forEach((setting) => {
    const li = document.createElement("li");
    li.dataset.presetSource = setting.source || "firebase";

    const settingText = document.createElement("span");
    settingText.textContent = decodeHtmlEntities(setting.settings_name);

    // A preset is applied only after the user clicks it. Selecting it must not
    // write preferences, update timestamps, or otherwise persist a new choice.
    li.addEventListener("click", (event) => {
      if (event.target.closest(".deleteChartButton")) return;
      const loadingOverlay = document.getElementById("loading-overlay");
      if (loadingOverlay) loadingOverlay.style.display = "block";
      try {
        const settings = JSON.parse(setting.settings_json);
        if (!settings || typeof settings !== "object") {
          throw new Error("Este preset contém configurações inválidas.");
        }
        loadSettingsIntoForm(settings);
        const nameField = document.getElementById("settingsName");
        if (nameField) nameField.value = decodeHtmlEntities(setting.settings_name);
        const errorElem = document.querySelector(".errorMessageSettings");
        if (errorElem) errorElem.textContent = "";
        document.getElementById("natalForm")?.requestSubmit();
      } catch (err) {
        const errorElem = document.querySelector(".errorMessageSettings");
        if (errorElem) {
          errorElem.textContent = err.message || "Não foi possível carregar este preset.";
          clearSettingsMessage();
        }
        console.error("Falha ao aplicar preset:", err);
      } finally {
        if (loadingOverlay) loadingOverlay.style.display = "none";
      }
    });

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.textContent = "X";
    deleteBtn.className = "deleteChartButton";
    deleteBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      const isConfirming = deleteConfirmationStateSettings.get(setting.id);
      if (isConfirming) {
        deleteSetting(setting);
        deleteConfirmationStateSettings.delete(setting.id);
      } else {
        deleteBtn.textContent = "✓";
        deleteBtn.style.height = "29px";
        deleteBtn.style.width = "30px";
        deleteConfirmationStateSettings.set(setting.id, true);
        setTimeout(() => {
          if (deleteConfirmationStateSettings.get(setting.id)) {
            deleteBtn.textContent = "X";
            deleteBtn.style.height = "";
            deleteBtn.style.width = "";
            deleteConfirmationStateSettings.delete(setting.id);
          }
        }, 5000);
      }
    });

    li.appendChild(settingText);
    li.appendChild(deleteBtn);
    recentSettingsList.appendChild(li);
  });
}

// Local preference copies are namespaced by Firebase UID, so users on a shared
// browser never overwrite one another's device settings.
const LOCAL_SETTINGS_PREFIX = "truesky_user_settings_v1:";
const LOCAL_DEVICE_SETTINGS_KEY = LOCAL_SETTINGS_PREFIX + "device";

function getCurrentFirebaseUser() {
  try {
    return window.firebase && window.firebase.auth
      ? window.firebase.auth().currentUser
      : null;
  } catch (_) {
    return null;
  }
}

function waitForFirebaseUser(timeoutMs = 5000) {
  const current = getCurrentFirebaseUser();
  if (current) return Promise.resolve(current);
  try {
    const auth = window.firebase && window.firebase.auth ? window.firebase.auth() : null;
    if (!auth) return Promise.resolve(null);
    return new Promise((resolve) => {
      let settled = false;
      let unsubscribe = null;
      const timeout = setTimeout(() => finish(null), timeoutMs);
      function finish(user) {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        try { if (unsubscribe) unsubscribe(); } catch (_) {}
        resolve(user || null);
      }
      unsubscribe = auth.onAuthStateChanged((user) => finish(user));
    });
  } catch (_) {
    return Promise.resolve(null);
  }
}

function writeLocalPreferences(uid, settingsName, settingsJson) {
  // Keep a device copy for immediate recovery and an account-specific copy for each Firebase user.
  const record = {
    schemaVersion: 1,
    uid: uid || null,
    settings_name: String(settingsName || "My Preferences").trim() || "My Preferences",
    settings_json: settingsJson,
    updated_at: new Date().toISOString(),
  };
  const serialized = JSON.stringify(record);
  localStorage.setItem(LOCAL_DEVICE_SETTINGS_KEY, serialized);
  if (uid) localStorage.setItem(LOCAL_SETTINGS_PREFIX + uid, serialized);
  return record;
}

function setFirebaseSettingsStatus(message, type = "info") {
  const status = document.getElementById("settingsFirebaseStatus");
  if (!status) return;
  status.textContent = message || "";
  status.dataset.state = type;
}

const EXPLICIT_SETTINGS_MARKER = "__trueSkyExplicitlySaved";

function serializeExplicitSettings() {
  const settings = getSettingsData();
  // The marker distinguishes settings saved with an explicit button click from
  // older records created by the removed autosave behavior.
  settings[EXPLICIT_SETTINGS_MARKER] = true;
  return JSON.stringify(settings);
}

// Fetch only the list of saved presets. Saved preferences are deliberately NOT
// restored automatically: every new page load starts with the Default preset.
let preferenceLoadSequence = 0;
async function fetchRecentSettings(options = {}) {
  const sequence = ++preferenceLoadSequence;
  const hasExplicitUser = Object.prototype.hasOwnProperty.call(options, "user");
  const user = hasExplicitUser ? options.user : getCurrentFirebaseUser();

  if (!user) {
    if (sequence === preferenceLoadSequence) updateRecentSettings([]);
    return;
  }

  try {
    const recentSettings = await window.TrueSkyFirebaseSettings.list();
    if (sequence !== preferenceLoadSequence) return;
    updateRecentSettings(recentSettings || []);
  } catch (err) {
    if (sequence !== preferenceLoadSequence) return;
    updateRecentSettings([]);
    setFirebaseSettingsStatus(
      "Não foi possível carregar a lista de presets do Firebase: " + (err.message || "erro de conexão"),
      "warning",
    );
  }
}

// Make startup calculation independent of the order in which DOMContentLoaded
// listeners run. preloadedCharts.js normally fills these fields, but this guard
// ensures every automatically submitted chart has a complete date even if that
// module runs later or fails to initialize one of its fields.
function ensureStartupChartFields() {
  const now = new Date();
  const month = now.toLocaleString("en-US", { month: "long" });
  const day = String(now.getDate());
  const year = String(now.getFullYear());
  const hour = String(now.getHours()).padStart(2, "0");
  const minute = String(now.getMinutes()).padStart(2, "0");
  const fallbackLocation =
    document.getElementById("defaultLocation")?.value?.trim() ||
    "New York City, New York, United States";

  const defaults = {
    natalName: "Today",
    natalDay: day,
    natalMonth: month,
    natalYear: year,
    natalHour: hour,
    natalMinute: minute,
    natalLocation: fallbackLocation,
    triwheelDay: day,
    triwheelMonth: month,
    triwheelYear: year,
    triwheelHour: hour,
    triwheelMinute: minute,
    triwheelLocation: fallbackLocation,
    graphStartDay: day,
    graphStartMonth: month,
    graphStartYear: String(now.getFullYear() - 1),
    graphStartHour: hour,
    graphStartMinute: minute,
    graphEndDay: day,
    graphEndMonth: month,
    graphEndYear: String(now.getFullYear() + 1),
    graphEndHour: hour,
    graphEndMinute: minute,
    graphLocation: fallbackLocation,
  };

  Object.entries(defaults).forEach(([id, value]) => {
    const field = document.getElementById(id);
    if (field && String(field.value ?? "").trim() === "") {
      field.value = value;
    }
  });

  // Validate the main chart's year before calling requestSubmit(), so a missing
  // year can never be forwarded to Swiss Ephemeris during automatic startup.
  const yearValue = String(document.getElementById("natalYear")?.value ?? "").trim();
  return /^-?\d{1,6}$/.test(yearValue);
}

// Do not let a slow default-location request prevent the page from opening its
// initial chart. The location can settle for up to 2.5 seconds; after that the
// built-in fallback is used so the initial calculation can proceed.
async function waitForDefaultLocationReady(timeoutMs = 2500) {
  const deadline = Date.now() + timeoutMs;
  const waitFor = async (promise) => {
    if (!promise || typeof promise.then !== "function") return;
    const remaining = deadline - Date.now();
    if (remaining <= 0) return;
    let timeoutId;
    await Promise.race([
      Promise.resolve(promise).catch(() => {}),
      new Promise((resolve) => { timeoutId = setTimeout(resolve, remaining); }),
    ]);
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  };

  const first = window.TrueSkyDefaultLocationReady;
  await waitFor(first);
  const latest = window.TrueSkyDefaultLocationReady;
  if (latest && latest !== first) await waitFor(latest);
}

// Wait until natal.js has initialized sharedNatal and attached the client-side
// submit handler. Without this barrier, requestSubmit() can run earlier in the same
// DOMContentLoaded dispatch and fall through to the form's native POST, which reloads
// this page and repeats the same initialization indefinitely.
function waitForNatalSubmitHandler(timeoutMs = 15000) {
  if (window.__trueSkyNatalSubmitHandlerReady === true) return Promise.resolve(true);

  return new Promise((resolve) => {
    let finished = false;
    let timeoutId = null;
    const eventName = "truesky-natal-submit-ready";
    const finish = (ready) => {
      if (finished) return;
      finished = true;
      if (timeoutId !== null) clearTimeout(timeoutId);
      window.removeEventListener(eventName, onReady);
      resolve(Boolean(ready));
    };
    const onReady = () => finish(window.__trueSkyNatalSubmitHandlerReady === true);

    window.addEventListener(eventName, onReady);
    timeoutId = setTimeout(
      () => finish(window.__trueSkyNatalSubmitHandlerReady === true),
      timeoutMs,
    );
    // Close the race where the module becomes ready between the first check
    // and registration of the event listener.
    if (window.__trueSkyNatalSubmitHandlerReady === true) finish(true);
  });
}

// Each page initialization resets the form to the built-in default preset.
// The account's default location is still loaded separately and is never stored
// inside a settings preset.
function initializeDefaultSettings() {
  try {
    resetFormToDefaults();
    const nameField = document.getElementById("settingsName");
    if (nameField) nameField.value = "Default Settings";
    setFirebaseSettingsStatus(
      "Preset padrão aplicado. Clique em um preset salvo para selecioná-lo; as alterações só são salvas pelos botões Save Settings.",
      "info",
    );
  } catch (err) {
    console.error("Não foi possível inicializar o preset padrão:", err);
  }

  (async () => {
    try {
      // Wait briefly for the account location, but never block the initial chart
      // indefinitely if the backend is waking up or the request fails.
      await waitForDefaultLocationReady(2500);
      if (typeof window.TrueSkyApplyAccountDefaultLocation === "function") {
        window.TrueSkyApplyAccountDefaultLocation();
      }
    } catch (locationError) {
      console.warn("Não foi possível aplicar a localização padrão da conta antes do cálculo.", locationError);
    }
    // Only calculate after the JavaScript submit handler is confirmed ready.
    // If the chart module failed to initialize, do not fall back to a native form
    // submission that would navigate away and recreate the initialization loop.
    const submitHandlerReady = await waitForNatalSubmitHandler();
    const natalForm = document.getElementById("natalForm");
    const startupFieldsReady = ensureStartupChartFields();
    if (submitHandlerReady && natalForm && startupFieldsReady) {
      // The form now has a valid year/date even when preloadedCharts.js has not
      // run its DOMContentLoaded callback yet. Submit only through the JS handler.
      natalForm.requestSubmit();
    } else {
      const message = !startupFieldsReady
        ? "O cálculo inicial foi cancelado porque o ano do mapa não é válido. Verifique o campo Year e tente novamente."
        : "O cálculo automático não foi iniciado porque o módulo do cálculo não terminou de inicializar. Recarregue a página e tente novamente.";
      setFirebaseSettingsStatus(message, "warning");
      console.error(message);
    }
  })();
}

// Authentication changes refresh the list only; they never replace the active
// form with a saved preset or auto-submit another calculation.
window.addEventListener("truesky-auth-changed", (event) => {
  const user = event.detail && event.detail.user ? event.detail.user : null;
  fetchRecentSettings({ user });
});

// Browsers can restore a page from the back-forward cache without rerunning DOMContentLoaded.
// Treat that as a fresh visit too: start from Default and only apply a preset after a click.
window.addEventListener("pageshow", (event) => {
  if (event.persisted) {
    initializeDefaultSettings();
    fetchRecentSettings();
  }
});

// Save Settings: this is an explicit user action. It stores a local preset and,
// when signed in, stores both the named Firebase preset and account preferences.
async function savePresetAndPreferencesToFirebase(name, settingsJson) {
  const result = await window.TrueSkyFirebaseSettings.savePresetAndPreferences(name, settingsJson);
  if (Array.isArray(result.presets)) updateRecentSettings(result.presets);
  const failures = [];
  if (!result.presetSaved) failures.push("preset: " + (result.presetError?.message || "não foi possível salvar na lista"));
  if (!result.preferencesSaved) failures.push("preferências da conta: " + (result.preferencesError?.message || "não foi possível sincronizar"));
  return {
    saved: result.presetSaved && result.preferencesSaved,
    error: failures.length ? new Error(failures.join("; ")) : null,
  };
}

function persistLocalSettings(name, settingsJson, uid) {
  let preferencesSaved = false;
  let presetSaved = false;
  let firstError = null;
  try {
    writeLocalPreferences(uid || null, name, settingsJson);
    preferencesSaved = true;
  } catch (err) {
    firstError = err;
  }
  try {
    saveLocalPreset(name, settingsJson);
    presetSaved = true;
    updateRecentSettings(firebaseRecentSettingsCache);
  } catch (err) {
    if (!firstError) firstError = err;
  }
  return { saved: preferencesSaved && presetSaved, preferencesSaved, presetSaved, error: firstError };
}

const saveSettingsButton = document.getElementById("settingsSave");
if (saveSettingsButton) {
  saveSettingsButton.addEventListener("click", async (event) => {
    const settingsNameField = document.getElementById("settingsName");
    const settingsName = settingsNameField?.value.trim();
    const errorElem = document.querySelector(".errorMessageSettings");
    if (!settingsName) {
      if (errorElem) errorElem.textContent = "Settings name required";
      clearSettingsMessage();
      return;
    }

    let settingsJson;
    try {
      settingsJson = serializeExplicitSettings();
    } catch (err) {
      if (errorElem) errorElem.textContent = err.message || "Não foi possível preparar as preferências.";
      clearSettingsMessage();
      return;
    }

    const saveButton = event.currentTarget;
    saveButton.disabled = true;
    let user = getCurrentFirebaseUser();
    const localResult = persistLocalSettings(settingsName, settingsJson, user?.uid || null);
    let cloudResult = { saved: false, error: null };

    try {
      if (!user) user = await waitForFirebaseUser(1800);
      if (!user || !user.uid) {
        cloudResult.error = new Error("Entre na conta Firebase para sincronizar o preset na nuvem.");
      } else {
        // Bind the device copy to this account too if authentication arrived late.
        try { writeLocalPreferences(user.uid, settingsName, settingsJson); } catch (err) {
          console.warn("Falha ao associar a cópia local à conta:", err);
        }
        cloudResult = await savePresetAndPreferencesToFirebase(settingsName, settingsJson);
      }
    } catch (err) {
      cloudResult.error = err;
    } finally {
      saveButton.disabled = false;
    }

    if (errorElem) {
      if (localResult.saved && cloudResult.saved) {
        errorElem.textContent = "";
      } else if (localResult.saved && cloudResult.error) {
        errorElem.textContent = "Preset salvo neste dispositivo. Firebase: " + (cloudResult.error.message || "não foi possível sincronizar.");
      } else if (!localResult.saved && cloudResult.saved) {
        errorElem.textContent = "Preset salvo no Firebase, mas houve falha local: " + (localResult.error?.message || "erro de armazenamento.");
      } else {
        const errors = [localResult.error?.message, cloudResult.error?.message].filter(Boolean);
        errorElem.textContent = errors.join(" | ") || "Não foi possível salvar as preferências.";
      }
      clearSettingsMessage();
    }
    if (localResult.error) console.error("Falha ao salvar preferências/preset localmente:", localResult.error);
    if (cloudResult.error) console.warn("Falha ao sincronizar o preset no Firebase:", cloudResult.error);
  });
}

// Save Settings Firebase also saves the named preset shown in the popup/list,
// in addition to the account's current preferences.
const saveFirebaseSettingsButton = document.getElementById("settingsSaveFirebase");
if (saveFirebaseSettingsButton) {
  saveFirebaseSettingsButton.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    const name = document.getElementById("settingsName")?.value.trim() || "My Preferences";
    button.disabled = true;
    button.textContent = "Saving Settings...";
    setFirebaseSettingsStatus("Salvando o preset e as preferências da conta…", "info");

    let settingsJson;
    try {
      settingsJson = serializeExplicitSettings();
    } catch (err) {
      setFirebaseSettingsStatus("Não foi possível preparar as configurações: " + (err.message || "erro desconhecido"), "error");
      button.disabled = false;
      button.textContent = "Save Settings Firebase";
      return;
    }

    const userAtStart = getCurrentFirebaseUser();
    const localResult = persistLocalSettings(name, settingsJson, userAtStart?.uid || null);
    let cloudResult = { saved: false, error: null };

    try {
      const user = userAtStart || await waitForFirebaseUser();
      if (!user || !user.uid) {
        cloudResult.error = new Error("Você precisa entrar na conta Firebase para sincronizar na nuvem.");
      } else {
        try { writeLocalPreferences(user.uid, name, settingsJson); } catch (err) {
          console.warn("Falha ao associar a cópia local à conta:", err);
        }
        cloudResult = await savePresetAndPreferencesToFirebase(name, settingsJson);
      }
    } catch (err) {
      cloudResult.error = err;
    }

    if (localResult.saved && cloudResult.saved) {
      setFirebaseSettingsStatus("Preset e preferências salvos neste dispositivo e sincronizados no Firebase.", "success");
    } else if (localResult.saved && cloudResult.error) {
      setFirebaseSettingsStatus("Preset salvo neste dispositivo. Firebase: " + (cloudResult.error.message || "não foi possível sincronizar."), "warning");
    } else if (cloudResult.saved && !localResult.saved) {
      setFirebaseSettingsStatus("Preset e preferências salvos no Firebase, mas a cópia local falhou: " + (localResult.error?.message || "erro de armazenamento."), "warning");
    } else {
      const errors = [localResult.error?.message, cloudResult.error?.message].filter(Boolean);
      setFirebaseSettingsStatus("Não foi possível salvar todas as configurações: " + (errors.join(" | ") || "erro desconhecido"), "error");
    }

    const status = document.getElementById("settingsFirebaseStatus");
    if (status) status.dataset.savedAt = new Date().toISOString();
    button.disabled = false;
    button.textContent = "Save Settings Firebase";
  });
}

// Preferences are intentionally not saved on change. Only explicit Save buttons persist them.

document.getElementById("settingsApply").addEventListener("click", () => {
  // Clear any existing error message
  const errorElem = document.querySelector(".errorMessageSettings");
  if (errorElem) errorElem.textContent = "";

  // Clear the settings name to indicate these are unsaved/modified settings
  document.getElementById("settingsName").value = "";

  // Trigger the natal chart calculation by submitting the natal form
  const natalForm = document.getElementById("natalForm");
  if (natalForm) {
    natalForm.requestSubmit();
  }
});

// Apply Default Settings button click handler
document
  .getElementById("settingsApplyDefaults")
  .addEventListener("click", () => {
    // Clear any existing error message
    const errorElem = document.querySelector(".errorMessageSettings");
    if (errorElem) errorElem.textContent = "";

    // Reset all form elements to their default values as defined in the HTML
    resetFormToDefaults();

    // Set the settings name to "Default Settings"
    document.getElementById("settingsName").value = "Default Settings";

    // Trigger the natal chart calculation by submitting the natal form
    const natalForm = document.getElementById("natalForm");
    if (natalForm) {
      natalForm.requestSubmit();
    }
  });

// Delete a preset from its actual source. This is separate from applying a preset.
async function deleteSetting(setting) {
  const loadingOverlay = document.getElementById("loading-overlay");
  if (loadingOverlay) loadingOverlay.style.display = "block";
  try {
    if (setting && setting.source === "local") {
      removeLocalPreset(setting.id);
      updateRecentSettings(firebaseRecentSettingsCache);
    } else {
      const recentSettings = await window.TrueSkyFirebaseSettings.remove(setting.id);
      updateRecentSettings(recentSettings);
    }
    const errorElem = document.querySelector(".errorMessageSettings");
    if (errorElem) errorElem.textContent = "";
  } catch (err) {
    console.error(err);
    const errorElem = document.querySelector(".errorMessageSettings");
    if (errorElem) {
      errorElem.textContent = err.message || "Error deleting settings.";
      clearSettingsMessage();
    }
  } finally {
    if (loadingOverlay) loadingOverlay.style.display = "none";
  }
}

// Load settings into the form
function loadSettingsIntoForm(settings) {
  // Load wheel settings for planets
  for (const planet in settings.wheelSettings.planets) {
    const displayCheckbox = document.querySelector(
      `input[name="planet"][value="${planet}"]`,
    );
    // Map saved keys to the aspect checkbox value if needed
    let aspectValue = planet;
    if (planet === "True_Node") {
      aspectValue = "North Node";
    } else if (planet === "Ascendant_Symbol") {
      aspectValue = "Ascendant Symbol";
    }
    const aspectCheckbox = document.querySelector(
      `input[name="planetAspects"][value="${aspectValue}"]`,
    );
    if (displayCheckbox) {
      displayCheckbox.checked = settings.wheelSettings.planets[planet].display;
    }
    if (aspectCheckbox) {
      aspectCheckbox.checked = settings.wheelSettings.planets[planet].aspect;
    }
  }

  // Backwards compatibility: Reset new points to defaults if not present in saved settings
  // These points were added later and old saved settings won't have them
  const newPoints = [
    { planet: "Vertex", aspect: "Vertex" },
    { planet: "Anti-Vertex", aspect: "Anti-Vertex" },
    { planet: "Priapus", aspect: "Priapus" },
    { planet: "Part of Spirit", aspect: "Part of Spirit" },
    { planet: "Galactic Center", aspect: "Galactic Center" },
  ];
  newPoints.forEach(({ planet, aspect }) => {
    if (!settings.wheelSettings.planets[planet]) {
      const displayCheckbox = document.querySelector(
        `input[name="planet"][value="${planet}"]`,
      );
      const aspectCheckbox = document.querySelector(
        `input[name="planetAspects"][value="${aspect}"]`,
      );
      if (displayCheckbox) displayCheckbox.checked = false;
      if (aspectCheckbox) aspectCheckbox.checked = false;
    }
  });

  // Load the degrees setting
  const degreesCheckbox = document.querySelector('input[name="degrees"]');
  if (degreesCheckbox) {
    degreesCheckbox.checked = settings.wheelSettings.degrees;
  }

  // Load true nodes/lilith settings (with backwards compatibility for old saved settings)
  // Old settings won't have these keys, so default to trueNodes=true, trueLilith=false
  const trueNodesCheckbox = document.querySelector('input[name="trueNodes"]');
  if (trueNodesCheckbox) {
    trueNodesCheckbox.checked =
      settings.wheelSettings.trueNodes !== undefined
        ? settings.wheelSettings.trueNodes
        : true; // default for old settings
  }
  const trueLilithCheckbox = document.querySelector('input[name="trueLilith"]');
  if (trueLilithCheckbox) {
    trueLilithCheckbox.checked =
      settings.wheelSettings.trueLilith !== undefined
        ? settings.wheelSettings.trueLilith
        : false; // default for old settings
  }
  const draconicCheckbox = document.querySelector('input[name="draconic"]');
  if (draconicCheckbox) {
    draconicCheckbox.checked =
      settings.wheelSettings.draconic !== undefined
        ? settings.wheelSettings.draconic
        : false; // default for old settings
  }
  const fixedStarsCheckbox = document.querySelector('input[name="fixedStars"]');
  if (fixedStarsCheckbox) {
    fixedStarsCheckbox.checked =
      settings.wheelSettings.fixedStars !== undefined
        ? settings.wheelSettings.fixedStars
        : false; // default for old settings
  }
  const fixedStarsMagnitudeSelect = document.querySelector(
    'select[name="fixedStarsMagnitude"]',
  );
  if (fixedStarsMagnitudeSelect) {
    fixedStarsMagnitudeSelect.value =
      settings.wheelSettings.fixedStarsMagnitude !== undefined
        ? Number(settings.wheelSettings.fixedStarsMagnitude).toFixed(1)
        : "2.0"; // default for old settings
  }
  const fixedStarsLatitudeSelect = document.querySelector(
    'select[name="fixedStarsLatitude"]',
  );
  if (fixedStarsLatitudeSelect) {
    fixedStarsLatitudeSelect.value =
      settings.wheelSettings.fixedStarsLatitude !== undefined
        ? String(settings.wheelSettings.fixedStarsLatitude)
        : "30"; // default for old settings
  }

  // Load custom points (with backwards compatibility - old settings won't have this)
  if (
    settings.wheelSettings.customPoints &&
    Array.isArray(settings.wheelSettings.customPoints)
  ) {
    activeCustomPoints = settings.wheelSettings.customPoints.map((p) => ({
      num: p.num,
      name: p.name,
      display: p.display !== false,
      aspect: p.aspect === true,
    }));
  } else {
    activeCustomPoints = [];
  }
  renderCustomPointsList();

  // Load aspect settings
  for (const aspect in settings.aspectSettings.aspects) {
    const aspectCheckbox = document.querySelector(
      `input[name="aspects"][value="${aspect}"]`,
    );
    if (aspectCheckbox) {
      aspectCheckbox.checked = settings.aspectSettings.aspects[aspect];
    }

    // Orbs
    if (settings.aspectSettings.orbs) {
      for (const [aspect, orb] of Object.entries(
        settings.aspectSettings.orbs,
      )) {
        const sel = document.querySelector(
          `#aspect-settings select.aspect-orb[data-aspect="${aspect}"]`,
        );
        if (sel) sel.value = String(orb);
      }
    }
  }

  // Load custom aspects (with backwards compatibility - old settings won't
  // have this field). Uses strict Array.isArray check so any accidental
  // non-array value in older saves is treated as absent, preserving current
  // no-custom-aspects behavior for the 10K+ existing users.
  if (
    settings.aspectSettings &&
    Array.isArray(settings.aspectSettings.customAspects)
  ) {
    activeCustomAspects = settings.aspectSettings.customAspects
      .filter(
        (a) =>
          a &&
          typeof a.angle === "number" &&
          a.angle >= 0 &&
          a.angle <= 180,
      )
      .slice(0, 5) // hard cap: never load more than 5 even if a saved file has more
      .map((a) => ({
        angle: Math.round(a.angle * 100) / 100,
        orb: typeof a.orb === "number" && a.orb >= 1 && a.orb <= 10
          ? Math.round(a.orb)
          : 3,
        enabled: a.enabled !== false,
      }));
  } else {
    activeCustomAspects = [];
  }
  renderCustomAspectsList();

  // Load system settings, migrating older profiles that stored ayanamsa in zodiacSystem.
  const zodiacSelect = document.querySelector(`select[name="zodiacSystem"]`);
  const ayanamsaSelect = document.querySelector(
    `select[name="ayanamsaSystem"]`,
  );
  const savedSystemSettings = settings.systemSettings || {};
  const savedZodiac = savedSystemSettings.zodiacSystem || "Tropical";
  const zodiacOptions = Array.from(zodiacSelect?.options || []).map(
    (option) => option.value,
  );
  const ayanamsaOptions = Array.from(ayanamsaSelect?.options || []).map(
    (option) => option.value,
  );
  const legacyAyanamsa = ayanamsaOptions.includes(savedZodiac);
  const zodiacValue = zodiacOptions.includes(savedZodiac)
    ? savedZodiac
    : "Tropical";
  let ayanamsaValue = savedSystemSettings.ayanamsaSystem;
  if (!ayanamsaValue && legacyAyanamsa) {
    ayanamsaValue = savedZodiac;
  } else if (!ayanamsaValue && savedZodiac === "13 Equal") {
    ayanamsaValue = "Galact. Center = 0 Sag";
  }

  if (zodiacSelect) {
    zodiacSelect.value = zodiacValue;
  }
  if (ayanamsaSelect) {
    ayanamsaSelect.value = ayanamsaOptions.includes(ayanamsaValue)
      ? ayanamsaValue
      : "Tropical";
  }
  const customAyanamsaInput = document.querySelector(
    'input[name="customAyanamsa"]',
  );
  if (customAyanamsaInput) {
    customAyanamsaInput.value = savedSystemSettings.customAyanamsa ?? "0";
  }
  const houseSelect = document.querySelector(`select[name="houseSystem"]`);
  if (houseSelect) {
    houseSelect.value = savedSystemSettings.houseSystem;
  }
  const coordSelect = document.querySelector(`select[name="coordinateSystem"]`);
  if (coordSelect) {
    coordSelect.value = savedSystemSettings.coordinateSystem;
  }
  const ascendantOverrideSelect = document.querySelector(
    'select[name="ascendantOverride"]',
  );
  if (ascendantOverrideSelect) {
    ascendantOverrideSelect.value =
      savedSystemSettings.ascendantOverride || "Normal";
  }
  syncCustomAyanamsaField();

  // Restore the location mode and coordinate/time-zone values from saved preferences.
  const savedLocation = settings.locationSettings;
  if (savedLocation && typeof savedLocation === "object") {
    const locationFields = {
      location: document.querySelector('#natalForm [name="location"]'),
      lat: document.querySelector('#natalForm [name="lat"]'),
      long: document.querySelector('#natalForm [name="long"]'),
      timezone: document.querySelector('#natalForm [name="timezone"]'),
      utcMode: document.querySelector('#natalForm [name="utcMode"]'),
      utcOffset: document.querySelector('#natalForm [name="utcOffset"]'),
    };
    Object.entries(locationFields).forEach(([key, element]) => {
      if (element && savedLocation[key] !== undefined && savedLocation[key] !== null) {
        element.value = String(savedLocation[key]);
      }
    });
    const coordinateToggle = document.querySelector('#natalForm [name="useCoordinates"]');
    if (coordinateToggle) coordinateToggle.checked = savedLocation.useCoordinates === true || savedLocation.useCoordinates === "true";
    locationFields.lat && (locationFields.lat.dataset.manual = coordinateToggle?.checked ? "true" : "false");
    locationFields.long && (locationFields.long.dataset.manual = coordinateToggle?.checked ? "true" : "false");
    locationFields.utcMode?.dispatchEvent(new Event("change", { bubbles: true }));
  }

  // Load graph planet settings
  for (const planet in settings.graphSettings.planetSettings) {
    const graphPlanet = settings.graphSettings.planetSettings[planet];
    // Map saved keys to the correct checkbox values for progressed/transit
    // (natal uses True_Node but progressed/transit use "North Node" in the HTML)
    let progressedTransitValue = planet;
    if (planet === "True_Node") {
      progressedTransitValue = "North Node";
    }
    const natalCheckbox = document.querySelector(
      `input[name="planetNatal"][value="${planet}"]`,
    );
    const progressedCheckbox = document.querySelector(
      `input[name="planetProgressed"][value="${progressedTransitValue}"]`,
    );
    const transitCheckbox = document.querySelector(
      `input[name="planetTransit"][value="${progressedTransitValue}"]`,
    );
    if (natalCheckbox) natalCheckbox.checked = graphPlanet.natal;
    if (progressedCheckbox) progressedCheckbox.checked = graphPlanet.progressed;
    if (transitCheckbox) transitCheckbox.checked = graphPlanet.transit;
  }

  // Load graph aspect settings
  for (const aspect in settings.graphSettings.graphAspectSettings) {
    const aspectValue = settings.graphSettings.graphAspectSettings[aspect];
    const aspectCheckbox = document.querySelector(
      `input[name="transitingAspects"][value="${aspect}"]`,
    );
    if (aspectCheckbox) aspectCheckbox.checked = aspectValue;
  }

  // Load graph type settings
  for (const type in settings.graphSettings.graphTypeSettings) {
    const typeValue = settings.graphSettings.graphTypeSettings[type];
    const typeCheckbox = document.querySelector(
      `input[name="transitingTypes"][value="${type}"]`,
    );
    if (typeCheckbox) typeCheckbox.checked = typeValue;
  }

  // Backwards compatibility: Reset Sign Ingresses to unchecked if not present in saved settings
  // This type was added later and old saved settings won't have it
  if (!settings.graphSettings?.graphTypeSettings?.["Sign Ingresses"]) {
    const signIngressCheckbox = document.querySelector(
      'input[name="transitingTypes"][value="Sign Ingresses"]',
    );
    if (signIngressCheckbox) signIngressCheckbox.checked = false;
  }

  // Backwards compatibility: Reset Progressed Stations to unchecked if not present in saved settings
  // This type was added later and old saved settings won't have it
  if (!settings.graphSettings?.graphTypeSettings?.["Progressed Stations"]) {
    const progressedStationsCheckbox = document.querySelector(
      'input[name="transitingTypes"][value="Progressed Stations"]',
    );
    if (progressedStationsCheckbox) progressedStationsCheckbox.checked = false;
  }
}

// Gather settings from the form into an object following your structure
function getSettingsData() {
  return {
    wheelSettings: {
      planets: {
        Sun: {
          display: document.querySelector('input[name="planet"][value="Sun"]')
            .checked,
          aspect: document.querySelector(
            'input[name="planetAspects"][value="Sun"]',
          ).checked,
        },
        Moon: {
          display: document.querySelector('input[name="planet"][value="Moon"]')
            .checked,
          aspect: document.querySelector(
            'input[name="planetAspects"][value="Moon"]',
          ).checked,
        },
        Mercury: {
          display: document.querySelector(
            'input[name="planet"][value="Mercury"]',
          ).checked,
          aspect: document.querySelector(
            'input[name="planetAspects"][value="Mercury"]',
          ).checked,
        },
        Venus: {
          display: document.querySelector('input[name="planet"][value="Venus"]')
            .checked,
          aspect: document.querySelector(
            'input[name="planetAspects"][value="Venus"]',
          ).checked,
        },
        Mars: {
          display: document.querySelector('input[name="planet"][value="Mars"]')
            .checked,
          aspect: document.querySelector(
            'input[name="planetAspects"][value="Mars"]',
          ).checked,
        },
        Jupiter: {
          display: document.querySelector(
            'input[name="planet"][value="Jupiter"]',
          ).checked,
          aspect: document.querySelector(
            'input[name="planetAspects"][value="Jupiter"]',
          ).checked,
        },
        Saturn: {
          display: document.querySelector(
            'input[name="planet"][value="Saturn"]',
          ).checked,
          aspect: document.querySelector(
            'input[name="planetAspects"][value="Saturn"]',
          ).checked,
        },
        Uranus: {
          display: document.querySelector(
            'input[name="planet"][value="Uranus"]',
          ).checked,
          aspect: document.querySelector(
            'input[name="planetAspects"][value="Uranus"]',
          ).checked,
        },
        Neptune: {
          display: document.querySelector(
            'input[name="planet"][value="Neptune"]',
          ).checked,
          aspect: document.querySelector(
            'input[name="planetAspects"][value="Neptune"]',
          ).checked,
        },
        Pluto: {
          display: document.querySelector('input[name="planet"][value="Pluto"]')
            .checked,
          aspect: document.querySelector(
            'input[name="planetAspects"][value="Pluto"]',
          ).checked,
        },
        Chiron: {
          display: document.querySelector(
            'input[name="planet"][value="Chiron"]',
          ).checked,
          aspect: document.querySelector(
            'input[name="planetAspects"][value="Chiron"]',
          ).checked,
        },
        True_Node: {
          display: document.querySelector(
            'input[name="planet"][value="True_Node"]',
          ).checked,
          aspect: document.querySelector(
            'input[name="planetAspects"][value="North Node"]',
          ).checked,
        },
        Ascendant_Symbol: {
          display: document.querySelector(
            'input[name="planet"][value="Ascendant_Symbol"]',
          ).checked,
          aspect: document.querySelector(
            'input[name="planetAspects"][value="Ascendant Symbol"]',
          ).checked,
        },
        Midheaven: {
          display: document.querySelector(
            'input[name="planet"][value="Midheaven"]',
          ).checked,
          aspect: document.querySelector(
            'input[name="planetAspects"][value="Midheaven"]',
          ).checked,
        },
        "South Node": {
          display: document.querySelector(
            'input[name="planet"][value="South Node"]',
          ).checked,
          aspect: document.querySelector(
            'input[name="planetAspects"][value="South Node"]',
          ).checked,
        },
        Descendant: {
          display: document.querySelector(
            'input[name="planet"][value="Descendant"]',
          ).checked,
          aspect: document.querySelector(
            'input[name="planetAspects"][value="Descendant"]',
          ).checked,
        },
        "Imum Coeli": {
          display: document.querySelector(
            'input[name="planet"][value="Imum Coeli"]',
          ).checked,
          aspect: document.querySelector(
            'input[name="planetAspects"][value="Imum Coeli"]',
          ).checked,
        },
        Ceres: {
          display: document.querySelector('input[name="planet"][value="Ceres"]')
            .checked,
          aspect: document.querySelector(
            'input[name="planetAspects"][value="Ceres"]',
          ).checked,
        },
        Vesta: {
          display: document.querySelector('input[name="planet"][value="Vesta"]')
            .checked,
          aspect: document.querySelector(
            'input[name="planetAspects"][value="Vesta"]',
          ).checked,
        },
        Pallas: {
          display: document.querySelector(
            'input[name="planet"][value="Pallas"]',
          ).checked,
          aspect: document.querySelector(
            'input[name="planetAspects"][value="Pallas"]',
          ).checked,
        },
        Juno: {
          display: document.querySelector('input[name="planet"][value="Juno"]')
            .checked,
          aspect: document.querySelector(
            'input[name="planetAspects"][value="Juno"]',
          ).checked,
        },
        Lilith: {
          display: document.querySelector(
            'input[name="planet"][value="Lilith"]',
          ).checked,
          aspect: document.querySelector(
            'input[name="planetAspects"][value="Lilith"]',
          ).checked,
        },
        Priapus: {
          display: document.querySelector(
            'input[name="planet"][value="Priapus"]',
          ).checked,
          aspect: document.querySelector(
            'input[name="planetAspects"][value="Priapus"]',
          ).checked,
        },
        "Part of Fortune": {
          display: document.querySelector(
            'input[name="planet"][value="Part of Fortune"]',
          ).checked,
          aspect: document.querySelector(
            'input[name="planetAspects"][value="Part of Fortune"]',
          ).checked,
        },
        "Part of Spirit": {
          display: document.querySelector(
            'input[name="planet"][value="Part of Spirit"]',
          ).checked,
          aspect: document.querySelector(
            'input[name="planetAspects"][value="Part of Spirit"]',
          ).checked,
        },
        Vertex: {
          display: document.querySelector(
            'input[name="planet"][value="Vertex"]',
          ).checked,
          aspect: document.querySelector(
            'input[name="planetAspects"][value="Vertex"]',
          ).checked,
        },
        "Anti-Vertex": {
          display: document.querySelector(
            'input[name="planet"][value="Anti-Vertex"]',
          ).checked,
          aspect: document.querySelector(
            'input[name="planetAspects"][value="Anti-Vertex"]',
          ).checked,
        },
        "Galactic Center": {
          display: document.querySelector(
            'input[name="planet"][value="Galactic Center"]',
          ).checked,
          aspect: document.querySelector(
            'input[name="planetAspects"][value="Galactic Center"]',
          ).checked,
        },
      },
      degrees: document.querySelector('input[name="degrees"]').checked,
      trueNodes: document.querySelector('input[name="trueNodes"]').checked,
      trueLilith: document.querySelector('input[name="trueLilith"]').checked,
      draconic: document.querySelector('input[name="draconic"]').checked,
      fixedStars: document.querySelector('input[name="fixedStars"]').checked,
      fixedStarsMagnitude: parseFloat(
        document.querySelector('select[name="fixedStarsMagnitude"]').value,
      ),
      fixedStarsLatitude: parseFloat(
        document.querySelector('select[name="fixedStarsLatitude"]').value,
      ),
      customPoints: activeCustomPoints.map((p) => ({
        num: p.num,
        name: p.name,
        display: p.display,
        aspect: p.aspect,
      })),
    },
    aspectSettings: {
      aspects: {
        Conjunction: document.querySelector(
          'input[name="aspects"][value="Conjunction"]',
        ).checked,
        Opposition: document.querySelector(
          'input[name="aspects"][value="Opposition"]',
        ).checked,
        Square: document.querySelector('input[name="aspects"][value="Square"]')
          .checked,
        Trine: document.querySelector('input[name="aspects"][value="Trine"]')
          .checked,
        Sextile: document.querySelector(
          'input[name="aspects"][value="Sextile"]',
        ).checked,
        Semisextile: document.querySelector(
          'input[name="aspects"][value="Semisextile"]',
        ).checked,
        Quincunx: document.querySelector(
          'input[name="aspects"][value="Quincunx"]',
        ).checked,
      },
      orbs: Array.from(
        document.querySelectorAll("#aspect-settings select.aspect-orb"),
      ).reduce((obj, sel) => {
        obj[sel.dataset.aspect] = Number(sel.value); // { Conjunction: 10, … }
        return obj;
      }, {}),
      // Custom aspects: additive field. Old code that ignores it is
      // unaffected; new code reads it via Array.isArray on load.
      customAspects: activeCustomAspects.map((a) => ({
        angle: a.angle,
        orb: a.orb,
        enabled: a.enabled,
      })),
    },
    systemSettings: {
      zodiacSystem: document.querySelector('select[name="zodiacSystem"]').value,
      ayanamsaSystem: document.querySelector(
        'select[name="ayanamsaSystem"]',
      ).value,
      customAyanamsa: document.querySelector(
        'input[name="customAyanamsa"]',
      ).value,
      houseSystem: document.querySelector('select[name="houseSystem"]').value,
      coordinateSystem: document.querySelector(
        'select[name="coordinateSystem"]',
      ).value,
      ascendantOverride: document.querySelector(
        'select[name="ascendantOverride"]',
      ).value,
    },
    locationSettings: {
      location: document.getElementById("natalLocation")?.value || "",
      lat: document.querySelector('#natalForm [name="lat"]')?.value || "",
      long: document.querySelector('#natalForm [name="long"]')?.value || "",
      timezone: document.querySelector('#natalForm [name="timezone"]')?.value || "",
      utcMode: document.querySelector('#natalForm [name="utcMode"]')?.value || "auto",
      utcOffset: document.querySelector('#natalForm [name="utcOffset"]')?.value || "0",
      useCoordinates: document.querySelector('#natalForm [name="useCoordinates"]')?.checked === true,
    },
    graphSettings: {
      planetSettings: {
        Sun: {
          natal: document.querySelector(
            'input[name="planetNatal"][value="Sun"]',
          ).checked,
          progressed: document.querySelector(
            'input[name="planetProgressed"][value="Sun"]',
          ).checked,
          transit: document.querySelector(
            'input[name="planetTransit"][value="Sun"]',
          ).checked,
        },
        Moon: {
          natal: document.querySelector(
            'input[name="planetNatal"][value="Moon"]',
          ).checked,
          progressed: document.querySelector(
            'input[name="planetProgressed"][value="Moon"]',
          ).checked,
          transit: document.querySelector(
            'input[name="planetTransit"][value="Moon"]',
          ).checked,
        },
        Mercury: {
          natal: document.querySelector(
            'input[name="planetNatal"][value="Mercury"]',
          ).checked,
          progressed: document.querySelector(
            'input[name="planetProgressed"][value="Mercury"]',
          ).checked,
          transit: document.querySelector(
            'input[name="planetTransit"][value="Mercury"]',
          ).checked,
        },
        Venus: {
          natal: document.querySelector(
            'input[name="planetNatal"][value="Venus"]',
          ).checked,
          progressed: document.querySelector(
            'input[name="planetProgressed"][value="Venus"]',
          ).checked,
          transit: document.querySelector(
            'input[name="planetTransit"][value="Venus"]',
          ).checked,
        },
        Mars: {
          natal: document.querySelector(
            'input[name="planetNatal"][value="Mars"]',
          ).checked,
          progressed: document.querySelector(
            'input[name="planetProgressed"][value="Mars"]',
          ).checked,
          transit: document.querySelector(
            'input[name="planetTransit"][value="Mars"]',
          ).checked,
        },
        Jupiter: {
          natal: document.querySelector(
            'input[name="planetNatal"][value="Jupiter"]',
          ).checked,
          progressed: document.querySelector(
            'input[name="planetProgressed"][value="Jupiter"]',
          ).checked,
          transit: document.querySelector(
            'input[name="planetTransit"][value="Jupiter"]',
          ).checked,
        },
        Saturn: {
          natal: document.querySelector(
            'input[name="planetNatal"][value="Saturn"]',
          ).checked,
          progressed: document.querySelector(
            'input[name="planetProgressed"][value="Saturn"]',
          ).checked,
          transit: document.querySelector(
            'input[name="planetTransit"][value="Saturn"]',
          ).checked,
        },
        Uranus: {
          natal: document.querySelector(
            'input[name="planetNatal"][value="Uranus"]',
          ).checked,
          progressed: document.querySelector(
            'input[name="planetProgressed"][value="Uranus"]',
          ).checked,
          transit: document.querySelector(
            'input[name="planetTransit"][value="Uranus"]',
          ).checked,
        },
        Neptune: {
          natal: document.querySelector(
            'input[name="planetNatal"][value="Neptune"]',
          ).checked,
          progressed: document.querySelector(
            'input[name="planetProgressed"][value="Neptune"]',
          ).checked,
          transit: document.querySelector(
            'input[name="planetTransit"][value="Neptune"]',
          ).checked,
        },
        Pluto: {
          natal: document.querySelector(
            'input[name="planetNatal"][value="Pluto"]',
          ).checked,
          progressed: document.querySelector(
            'input[name="planetProgressed"][value="Pluto"]',
          ).checked,
          transit: document.querySelector(
            'input[name="planetTransit"][value="Pluto"]',
          ).checked,
        },
        Chiron: {
          natal: document.querySelector(
            'input[name="planetNatal"][value="Chiron"]',
          ).checked,
          progressed: document.querySelector(
            'input[name="planetProgressed"][value="Chiron"]',
          ).checked,
          transit: document.querySelector(
            'input[name="planetTransit"][value="Chiron"]',
          ).checked,
        },
        True_Node: {
          natal: document.querySelector(
            'input[name="planetNatal"][value="True_Node"]',
          ).checked,
          progressed: document.querySelector(
            'input[name="planetProgressed"][value="North Node"]',
          ).checked,
          transit: document.querySelector(
            'input[name="planetTransit"][value="North Node"]',
          ).checked,
        },
        Ascendant_Symbol: {
          natal: document.querySelector(
            'input[name="planetNatal"][value="Ascendant_Symbol"]',
          ).checked,
          progressed: document.querySelector(
            'input[name="planetProgressed"][value="Ascendant_Symbol"]',
          ).checked,
          transit: document.querySelector(
            'input[name="planetTransit"][value="Ascendant_Symbol"]',
          ).checked,
        },
        Midheaven: {
          natal: document.querySelector(
            'input[name="planetNatal"][value="Midheaven"]',
          ).checked,
          progressed: document.querySelector(
            'input[name="planetProgressed"][value="Midheaven"]',
          ).checked,
          transit: document.querySelector(
            'input[name="planetTransit"][value="Midheaven"]',
          ).checked,
        },
      },
      graphAspectSettings: {
        Conjunction: document.querySelector(
          'input[name="transitingAspects"][value="Conjunction"]',
        ).checked,
        Opposition: document.querySelector(
          'input[name="transitingAspects"][value="Opposition"]',
        ).checked,
        Square: document.querySelector(
          'input[name="transitingAspects"][value="Square"]',
        ).checked,
        Trine: document.querySelector(
          'input[name="transitingAspects"][value="Trine"]',
        ).checked,
        Sextile: document.querySelector(
          'input[name="transitingAspects"][value="Sextile"]',
        ).checked,
        Semisextile: document.querySelector(
          'input[name="transitingAspects"][value="Semisextile"]',
        ).checked,
        Quincunx: document.querySelector(
          'input[name="transitingAspects"][value="Quincunx"]',
        ).checked,
      },
      graphTypeSettings: {
        "Progressed to Natal": document.querySelector(
          'input[name="transitingTypes"][value="Progressed to Natal"]',
        ).checked,
        "Transiting to Natal": document.querySelector(
          'input[name="transitingTypes"][value="Transiting to Natal"]',
        ).checked,
        "Progressed to Progressed": document.querySelector(
          'input[name="transitingTypes"][value="Progressed to Progressed"]',
        ).checked,
        "Transiting to Transiting": document.querySelector(
          'input[name="transitingTypes"][value="Transiting to Transiting"]',
        ).checked,
        Stations: document.querySelector(
          'input[name="transitingTypes"][value="Stations"]',
        ).checked,
        "Progressed Stations": document.querySelector(
          'input[name="transitingTypes"][value="Progressed Stations"]',
        ).checked,
        "House Ingresses": document.querySelector(
          'input[name="transitingTypes"][value="House Ingresses"]',
        ).checked,
        "Sign Ingresses": document.querySelector(
          'input[name="transitingTypes"][value="Sign Ingresses"]',
        ).checked,
      },
    },
  };
}

// Reset form to default values as defined in the HTML
function resetFormToDefaults() {
  // Reset planet display checkboxes (most are checked by default)
  document.querySelector('input[name="planet"][value="Sun"]').checked = true;
  document.querySelector('input[name="planet"][value="Moon"]').checked = true;
  document.querySelector('input[name="planet"][value="Mercury"]').checked =
    true;
  document.querySelector('input[name="planet"][value="Venus"]').checked = true;
  document.querySelector('input[name="planet"][value="Mars"]').checked = true;
  document.querySelector('input[name="planet"][value="Jupiter"]').checked =
    true;
  document.querySelector('input[name="planet"][value="Saturn"]').checked = true;
  document.querySelector('input[name="planet"][value="Uranus"]').checked = true;
  document.querySelector('input[name="planet"][value="Neptune"]').checked =
    true;
  document.querySelector('input[name="planet"][value="Pluto"]').checked = true;
  document.querySelector('input[name="planet"][value="Chiron"]').checked = true;
  document.querySelector('input[name="planet"][value="True_Node"]').checked =
    true;
  document.querySelector('input[name="planet"][value="South Node"]').checked =
    true;
  document.querySelector(
    'input[name="planet"][value="Ascendant_Symbol"]',
  ).checked = true;
  document.querySelector('input[name="planet"][value="Midheaven"]').checked =
    true;
  document.querySelector('input[name="planet"][value="Descendant"]').checked =
    false;
  document.querySelector('input[name="planet"][value="Imum Coeli"]').checked =
    false;
  document.querySelector('input[name="planet"][value="Ceres"]').checked = true;
  document.querySelector('input[name="planet"][value="Vesta"]').checked = false;
  document.querySelector('input[name="planet"][value="Pallas"]').checked =
    false;
  document.querySelector('input[name="planet"][value="Juno"]').checked = false;
  document.querySelector('input[name="planet"][value="Lilith"]').checked =
    false;
  document.querySelector('input[name="planet"][value="Priapus"]').checked =
    false;
  document.querySelector(
    'input[name="planet"][value="Part of Fortune"]',
  ).checked = false;
  document.querySelector(
    'input[name="planet"][value="Part of Spirit"]',
  ).checked = false;
  document.querySelector('input[name="planet"][value="Vertex"]').checked =
    false;
  document.querySelector('input[name="planet"][value="Anti-Vertex"]').checked =
    false;
  document.querySelector(
    'input[name="planet"][value="Galactic Center"]',
  ).checked = false;

  // Reset planet aspect checkboxes (most are checked by default)
  document.querySelector('input[name="planetAspects"][value="Sun"]').checked =
    true;
  document.querySelector('input[name="planetAspects"][value="Moon"]').checked =
    true;
  document.querySelector(
    'input[name="planetAspects"][value="Mercury"]',
  ).checked = true;
  document.querySelector('input[name="planetAspects"][value="Venus"]').checked =
    true;
  document.querySelector('input[name="planetAspects"][value="Mars"]').checked =
    true;
  document.querySelector(
    'input[name="planetAspects"][value="Jupiter"]',
  ).checked = true;
  document.querySelector(
    'input[name="planetAspects"][value="Saturn"]',
  ).checked = true;
  document.querySelector(
    'input[name="planetAspects"][value="Uranus"]',
  ).checked = true;
  document.querySelector(
    'input[name="planetAspects"][value="Neptune"]',
  ).checked = true;
  document.querySelector('input[name="planetAspects"][value="Pluto"]').checked =
    true;
  document.querySelector(
    'input[name="planetAspects"][value="Chiron"]',
  ).checked = false;
  document.querySelector(
    'input[name="planetAspects"][value="North Node"]',
  ).checked = false;
  document.querySelector(
    'input[name="planetAspects"][value="South Node"]',
  ).checked = false;
  document.querySelector(
    'input[name="planetAspects"][value="Ascendant Symbol"]',
  ).checked = false;
  document.querySelector(
    'input[name="planetAspects"][value="Midheaven"]',
  ).checked = false;
  document.querySelector(
    'input[name="planetAspects"][value="Descendant"]',
  ).checked = false;
  document.querySelector(
    'input[name="planetAspects"][value="Imum Coeli"]',
  ).checked = false;
  document.querySelector('input[name="planetAspects"][value="Ceres"]').checked =
    false;
  document.querySelector('input[name="planetAspects"][value="Vesta"]').checked =
    false;
  document.querySelector(
    'input[name="planetAspects"][value="Pallas"]',
  ).checked = false;
  document.querySelector('input[name="planetAspects"][value="Juno"]').checked =
    false;
  document.querySelector(
    'input[name="planetAspects"][value="Lilith"]',
  ).checked = false;
  document.querySelector(
    'input[name="planetAspects"][value="Priapus"]',
  ).checked = false;
  document.querySelector(
    'input[name="planetAspects"][value="Part of Fortune"]',
  ).checked = false;
  document.querySelector(
    'input[name="planetAspects"][value="Part of Spirit"]',
  ).checked = false;
  document.querySelector(
    'input[name="planetAspects"][value="Vertex"]',
  ).checked = false;
  document.querySelector(
    'input[name="planetAspects"][value="Anti-Vertex"]',
  ).checked = false;
  document.querySelector(
    'input[name="planetAspects"][value="Galactic Center"]',
  ).checked = false;

  // Reset degrees checkbox (checked by default)
  document.querySelector('input[name="degrees"]').checked = true;

  // Reset true nodes/lilith/draconic checkboxes (trueNodes checked, others unchecked by default)
  document.querySelector('input[name="trueNodes"]').checked = true;
  document.querySelector('input[name="trueLilith"]').checked = false;
  document.querySelector('input[name="draconic"]').checked = false;
  document.querySelector('input[name="fixedStars"]').checked = false;
  document.querySelector('select[name="fixedStarsMagnitude"]').value = "2.0";
  document.querySelector('select[name="fixedStarsLatitude"]').value = "30";

  // Reset custom points
  activeCustomPoints = [];
  renderCustomPointsList();

  // Reset custom aspects (defaults to no user-defined aspects, matching
  // the pre-feature state — safe for the 10K existing users)
  activeCustomAspects = [];
  renderCustomAspectsList();

  // Reset aspect checkboxes (all checked by default)
  document.querySelector('input[name="aspects"][value="Conjunction"]').checked =
    true;
  document.querySelector('input[name="aspects"][value="Opposition"]').checked =
    true;
  document.querySelector('input[name="aspects"][value="Square"]').checked =
    true;
  document.querySelector('input[name="aspects"][value="Trine"]').checked = true;
  document.querySelector('input[name="aspects"][value="Sextile"]').checked =
    true;
  document.querySelector('input[name="aspects"][value="Semisextile"]').checked =
    true;
  document.querySelector('input[name="aspects"][value="Quincunx"]').checked =
    true;

  // Reset orb settings to default values
  document.querySelector('select.aspect-orb[data-aspect="Conjunction"]').value =
    "10";
  document.querySelector('select.aspect-orb[data-aspect="Opposition"]').value =
    "10";
  document.querySelector('select.aspect-orb[data-aspect="Square"]').value = "8";
  document.querySelector('select.aspect-orb[data-aspect="Trine"]').value = "8";
  document.querySelector('select.aspect-orb[data-aspect="Sextile"]').value =
    "6";
  document.querySelector('select.aspect-orb[data-aspect="Semisextile"]').value =
    "3";
  document.querySelector('select.aspect-orb[data-aspect="Quincunx"]').value =
    "3";

  // Reset system settings to default values (first option is default)
  document.querySelector('select[name="zodiacSystem"]').value = "Tropical";
  document.querySelector('select[name="ayanamsaSystem"]').value = "Tropical";
  document.querySelector('input[name="customAyanamsa"]').value = "0";
  syncCustomAyanamsaField();
  document.querySelector('select[name="houseSystem"]').value = "Placidus";
  document.querySelector('select[name="coordinateSystem"]').value =
    "Geocentric";
  document.querySelector('select[name="ascendantOverride"]').value = "Normal";

  // Reset graph planet settings
  document.querySelector('input[name="planetNatal"][value="Sun"]').checked =
    true;
  document.querySelector(
    'input[name="planetProgressed"][value="Sun"]',
  ).checked = true;
  document.querySelector('input[name="planetTransit"][value="Sun"]').checked =
    false;
  document.querySelector('input[name="planetNatal"][value="Moon"]').checked =
    true;
  document.querySelector(
    'input[name="planetProgressed"][value="Moon"]',
  ).checked = true;
  document.querySelector('input[name="planetTransit"][value="Moon"]').checked =
    false;
  document.querySelector('input[name="planetNatal"][value="Mercury"]').checked =
    true;
  document.querySelector(
    'input[name="planetProgressed"][value="Mercury"]',
  ).checked = true;
  document.querySelector(
    'input[name="planetTransit"][value="Mercury"]',
  ).checked = false;
  document.querySelector('input[name="planetNatal"][value="Venus"]').checked =
    true;
  document.querySelector(
    'input[name="planetProgressed"][value="Venus"]',
  ).checked = true;
  document.querySelector('input[name="planetTransit"][value="Venus"]').checked =
    false;
  document.querySelector('input[name="planetNatal"][value="Mars"]').checked =
    true;
  document.querySelector(
    'input[name="planetProgressed"][value="Mars"]',
  ).checked = true;
  document.querySelector('input[name="planetTransit"][value="Mars"]').checked =
    false;
  document.querySelector('input[name="planetNatal"][value="Jupiter"]').checked =
    true;
  document.querySelector(
    'input[name="planetProgressed"][value="Jupiter"]',
  ).checked = true;
  document.querySelector(
    'input[name="planetTransit"][value="Jupiter"]',
  ).checked = true;
  document.querySelector('input[name="planetNatal"][value="Saturn"]').checked =
    true;
  document.querySelector(
    'input[name="planetProgressed"][value="Saturn"]',
  ).checked = true;
  document.querySelector(
    'input[name="planetTransit"][value="Saturn"]',
  ).checked = true;
  document.querySelector('input[name="planetNatal"][value="Uranus"]').checked =
    false;
  document.querySelector(
    'input[name="planetProgressed"][value="Uranus"]',
  ).checked = false;
  document.querySelector(
    'input[name="planetTransit"][value="Uranus"]',
  ).checked = true;
  document.querySelector('input[name="planetNatal"][value="Neptune"]').checked =
    false;
  document.querySelector(
    'input[name="planetProgressed"][value="Neptune"]',
  ).checked = false;
  document.querySelector(
    'input[name="planetTransit"][value="Neptune"]',
  ).checked = true;
  document.querySelector('input[name="planetNatal"][value="Pluto"]').checked =
    false;
  document.querySelector(
    'input[name="planetProgressed"][value="Pluto"]',
  ).checked = false;
  document.querySelector('input[name="planetTransit"][value="Pluto"]').checked =
    true;
  document.querySelector('input[name="planetNatal"][value="Chiron"]').checked =
    false;
  document.querySelector(
    'input[name="planetProgressed"][value="Chiron"]',
  ).checked = false;
  document.querySelector(
    'input[name="planetTransit"][value="Chiron"]',
  ).checked = true;
  document.querySelector(
    'input[name="planetNatal"][value="True_Node"]',
  ).checked = false;
  document.querySelector(
    'input[name="planetProgressed"][value="North Node"]',
  ).checked = false;
  document.querySelector(
    'input[name="planetTransit"][value="North Node"]',
  ).checked = true;
  document.querySelector(
    'input[name="planetNatal"][value="Ascendant_Symbol"]',
  ).checked = true;
  document.querySelector(
    'input[name="planetProgressed"][value="Ascendant_Symbol"]',
  ).checked = false;
  document.querySelector(
    'input[name="planetTransit"][value="Ascendant_Symbol"]',
  ).checked = false;
  document.querySelector(
    'input[name="planetNatal"][value="Midheaven"]',
  ).checked = true;
  document.querySelector(
    'input[name="planetProgressed"][value="Midheaven"]',
  ).checked = false;
  document.querySelector(
    'input[name="planetTransit"][value="Midheaven"]',
  ).checked = false;

  // Reset graph aspect settings (all checked by default)
  document.querySelector(
    'input[name="transitingAspects"][value="Conjunction"]',
  ).checked = true;
  document.querySelector(
    'input[name="transitingAspects"][value="Opposition"]',
  ).checked = true;
  document.querySelector(
    'input[name="transitingAspects"][value="Square"]',
  ).checked = true;
  document.querySelector(
    'input[name="transitingAspects"][value="Trine"]',
  ).checked = true;
  document.querySelector(
    'input[name="transitingAspects"][value="Sextile"]',
  ).checked = true;
  document.querySelector(
    'input[name="transitingAspects"][value="Semisextile"]',
  ).checked = true;
  document.querySelector(
    'input[name="transitingAspects"][value="Quincunx"]',
  ).checked = true;

  // Reset graph type settings (all checked by default)
  document.querySelector(
    'input[name="transitingTypes"][value="Progressed to Natal"]',
  ).checked = true;
  document.querySelector(
    'input[name="transitingTypes"][value="Transiting to Natal"]',
  ).checked = true;
  document.querySelector(
    'input[name="transitingTypes"][value="Progressed to Progressed"]',
  ).checked = true;
  document.querySelector(
    'input[name="transitingTypes"][value="Transiting to Transiting"]',
  ).checked = true;
  document.querySelector(
    'input[name="transitingTypes"][value="Stations"]',
  ).checked = true;
  document.querySelector(
    'input[name="transitingTypes"][value="Progressed Stations"]',
  ).checked = true;
  document.querySelector(
    'input[name="transitingTypes"][value="House Ingresses"]',
  ).checked = true;
  document.querySelector(
    'input[name="transitingTypes"][value="Sign Ingresses"]',
  ).checked = true;
}
