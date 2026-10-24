"use strict";

// Decode HTML entities for proper display of default location.
function decodeHtmlEntities(str) {
  if (!str) return str;
  const textarea = document.createElement("textarea");
  textarea.innerHTML = str;
  return textarea.value;
}

const TRUE_SKY_FALLBACK_LOCATION = "New York City, New York, United States";
const TRUE_SKY_LOCATION_FIELD_IDS = [
  "natalLocation",
  "triwheelLocation",
  "graphLocation",
  "triwheelLocationGraph",
  "returnLocation",
  "synastryLocation",
  "mapRelocationLocation",
];

function applyAccountDefaultLocation(value) {
  const normalized = decodeHtmlEntities(String(value || "").trim()) || TRUE_SKY_FALLBACK_LOCATION;
  window.TrueSkyAccountDefaultLocation = normalized;

  const accountInput = document.getElementById("defaultLocation");
  if (accountInput) accountInput.value = normalized;

  TRUE_SKY_LOCATION_FIELD_IDS.forEach((id) => {
    const field = document.getElementById(id);
    if (field) field.value = normalized;
  });

  // Remove coordinates left over from a previously used chart location. The account
  // location is the source of truth for a new page load, so coordinates are resolved again.
  const latitude = document.getElementById("natalLatitude");
  const longitude = document.getElementById("natalLongitude");
  if (latitude) latitude.value = "";
  if (longitude) longitude.value = "";

  return normalized;
}

async function loadAccountDefaultLocation() {
  let accountLocation = "";
  try {
    // A sleeping or unreachable backend must not hold up chart startup forever.
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2200);
    try {
      const response = await fetch("/api/default-location", {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Accept": "application/json" },
        signal: controller.signal,
      });
      if (response.ok) {
        const data = await response.json();
        accountLocation = String(data.defaultLocation || data.default_location || "").trim();
      } else {
        console.warn("Não foi possível carregar a localização padrão da conta:", response.status);
      }
    } finally {
      // Keep the deadline active until the response body has also been read.
      clearTimeout(timeoutId);
    }
  } catch (error) {
    if (error?.name !== "AbortError") {
      console.warn("Falha ao carregar a localização padrão da conta:", error);
    }
  }

  // Never use a location left in a chart form as a fallback. If the account has not
  // configured one yet, start from the application's standard default.
  return applyAccountDefaultLocation(accountLocation || TRUE_SKY_FALLBACK_LOCATION);
}

// Expose a readiness promise so settings restoration cannot submit a chart before
// the account's default location has replaced stale values in the forms.
window.TrueSkyApplyAccountDefaultLocation = () =>
  applyAccountDefaultLocation(window.TrueSkyAccountDefaultLocation || TRUE_SKY_FALLBACK_LOCATION);
window.TrueSkyDefaultLocationReady = loadAccountDefaultLocation();

window.addEventListener("truesky-auth-changed", (event) => {
  const user = event.detail && event.detail.user;
  if (user && user.uid) {
    window.TrueSkyDefaultLocationReady = loadAccountDefaultLocation();
  } else {
    // Prevent a previous account's location from leaking into the signed-out page/session.
    window.TrueSkyDefaultLocationReady = Promise.resolve(
      applyAccountDefaultLocation(TRUE_SKY_FALLBACK_LOCATION),
    );
  }
});

window.addEventListener("truesky-firebase-ready", () => {
  window.TrueSkyDefaultLocationReady = loadAccountDefaultLocation();
});

document.addEventListener("DOMContentLoaded", () => {
  const saveBtn = document.getElementById("saveDefaultLocationBtn");
  const input = document.getElementById("defaultLocation");
  const messageBox = document.getElementById("defaultLocationMessage");
  let messageTimer = null;

  if (!saveBtn || !input || !messageBox) return;

  // Keep the account field and chart forms synchronized with the latest account value.
  if (input.value) input.value = decodeHtmlEntities(input.value);

  const showLoading = () => {
    const overlay = document.getElementById("loading-overlay");
    if (overlay) {
      overlay.style.display = "block";
      const spinner = overlay.querySelector(".spinner");
      if (spinner) spinner.style.display = "";
    }
  };

  const hideLoading = () => {
    const overlay = document.getElementById("loading-overlay");
    if (overlay) overlay.style.display = "none";
  };

  const hideSpinner = () => {
    const spinner = document.querySelector("#loading-overlay .spinner");
    if (spinner) spinner.style.display = "none";
  };

  async function saveDefaultLocation() {
    clearMessage();
    const location = input.value.trim();
    if (!location) {
      showMessage("Please enter a location to save.");
      return;
    }

    let locations = [];
    try {
      const response = await fetch("/locations.json", { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
      locations = await response.json();
    } catch (error) {
      console.error("Error loading atlas locations:", error);
      showMessage("Could not validate location. Please try again later.");
      return;
    }

    if (!isValidLocationInput(location, locations)) {
      showMessage("Please select a valid location.");
      return;
    }

    showLoading();
    try {
      const response = await fetch("/save-default-location", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ defaultLocation: location }),
        credentials: "same-origin",
      });
      const data = await response.json();

      if (data.redirectUrl) {
        hideLoading();
        window.location.href = data.redirectUrl;
        return;
      }

      if (data.success) {
        // Apply the newly saved account default immediately, without reusing the previous chart location.
        applyAccountDefaultLocation(data.defaultLocation || location);
        hideSpinner();
        showMessage("Default location saved. Updating...");
        setTimeout(() => window.location.reload(), 1200);
      } else {
        hideLoading();
        showMessage(data.error || "Error saving location.");
      }
    } catch (error) {
      hideLoading();
      console.error(error);
      showMessage("Request failed.");
    }
  }

  saveBtn.addEventListener("click", saveDefaultLocation);
  input.addEventListener("keydown", (event) => {
    const suggestionsBox = input.nextElementSibling;
    const firstSuggestion = suggestionsBox?.querySelector(".suggestion-item");
    if (event.key === "Enter") {
      if (suggestionsBox?.style.display === "block" && firstSuggestion) {
        event.preventDefault();
        input.value = firstSuggestion.textContent;
        suggestionsBox.style.display = "none";
      } else {
        event.preventDefault();
        saveDefaultLocation();
      }
    }
  });

  input.addEventListener("focus", () => input.select());

  function showMessage(text) {
    messageBox.textContent = text;
    if (messageTimer) clearTimeout(messageTimer);
    messageTimer = setTimeout(() => { messageBox.textContent = ""; }, 4000);
  }

  function clearMessage() {
    messageBox.textContent = "";
    if (messageTimer) {
      clearTimeout(messageTimer);
      messageTimer = null;
    }
  }
});

function isValidLocationInput(inputValue, locations) {
  const trimmed = inputValue.trim();
  if (locations.includes(trimmed)) return true;
  const latLongRegex = /^.+:\s*-?\d+(\.\d+)?,\s*-?\d+(\.\d+)?$/;
  return latLongRegex.test(trimmed);
}
