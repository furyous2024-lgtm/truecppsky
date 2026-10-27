"use strict";

// A default location belongs to the signed-in account. Firestore is the durable
// source of truth; a UID-scoped local cache protects the current browser while
// auth/network requests are starting or temporarily unavailable.
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
const TRUE_SKY_LOCATION_CACHE_PREFIX = "trueSky.defaultLocation.account.v2.";
const TRUE_SKY_LOCATION_LAST_UID_KEY = "trueSky.defaultLocation.lastUid";
const TRUE_SKY_LOCATION_LAST_VALUE_KEY = "trueSky.defaultLocation.lastValue";
const TRUE_SKY_LOCATION_ANONYMOUS_CACHE_KEY = "trueSky.defaultLocation.anonymous";

let locationLoadGeneration = 0;
let locationSaveInProgress = false;
window.TrueSkyDefaultLocationLoaded = false;

function normalizeLocation(value) {
  return decodeHtmlEntities(String(value || "").trim());
}

function getKnownFirebaseUser() {
  try {
    const auth = window.firebase && typeof window.firebase.auth === "function"
      ? window.firebase.auth()
      : null;
    if (auth && auth.currentUser && auth.currentUser.uid) return auth.currentUser;
  } catch (_) {}

  const user = window.TrueSkyAuth && window.TrueSkyAuth.currentUser;
  return user && user.uid ? user : null;
}

function waitForFirebaseUser(timeoutMs = 3500) {
  const knownUser = getKnownFirebaseUser();
  if (knownUser) return Promise.resolve(knownUser);

  let auth = null;
  try {
    if (window.firebase && typeof window.firebase.auth === "function") {
      auth = window.firebase.auth();
    }
  } catch (_) {}
  if (!auth || typeof auth.onAuthStateChanged !== "function") {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    let done = false;
    let unsubscribe = null;
    let timeoutId = null;

    const finish = (user) => {
      if (done) return;
      done = true;
      if (timeoutId !== null) clearTimeout(timeoutId);
      if (unsubscribe) unsubscribe();
      resolve(user && user.uid ? user : getKnownFirebaseUser());
    };

    timeoutId = setTimeout(() => finish(getKnownFirebaseUser()), timeoutMs);
    try {
      unsubscribe = auth.onAuthStateChanged(
        (user) => finish(user || null),
        () => finish(null),
      );
      // Defensive handling in case an implementation invokes the callback
      // synchronously before returning its unsubscribe function.
      if (done && unsubscribe) unsubscribe();
    } catch (_) {
      finish(null);
    }
  });
}

function getFirestore() {
  try {
    if (window.firebase && typeof window.firebase.firestore === "function") {
      return window.firebase.firestore();
    }
  } catch (error) {
    console.warn("Não foi possível inicializar o Firestore para a localização padrão:", error);
  }
  return null;
}

function withTimeout(promise, timeoutMs, message) {
  let timeoutId = null;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message || "Tempo limite excedido.")), timeoutMs);
  });
  return Promise.race([Promise.resolve(promise), timeout]).finally(() => {
    if (timeoutId !== null) clearTimeout(timeoutId);
  });
}

function readCachedDefaultLocation(uid) {
  try {
    if (uid) {
      const scoped = localStorage.getItem(TRUE_SKY_LOCATION_CACHE_PREFIX + uid);
      if (scoped && scoped.trim()) return normalizeLocation(scoped);

      // This last-value shortcut is still UID-bound, so it cannot silently use
      // the previous account's location after an account switch.
      const lastUid = localStorage.getItem(TRUE_SKY_LOCATION_LAST_UID_KEY);
      const lastValue = localStorage.getItem(TRUE_SKY_LOCATION_LAST_VALUE_KEY);
      if (lastUid === uid && lastValue && lastValue.trim()) return normalizeLocation(lastValue);
      return "";
    }

    const anonymous = localStorage.getItem(TRUE_SKY_LOCATION_ANONYMOUS_CACHE_KEY);
    return anonymous && anonymous.trim() ? normalizeLocation(anonymous) : "";
  } catch (_) {
    return "";
  }
}

function cacheDefaultLocation(value, uid) {
  const clean = normalizeLocation(value);
  if (!clean) return;
  try {
    if (uid) {
      localStorage.setItem(TRUE_SKY_LOCATION_CACHE_PREFIX + uid, clean);
      localStorage.setItem(TRUE_SKY_LOCATION_LAST_UID_KEY, uid);
      localStorage.setItem(TRUE_SKY_LOCATION_LAST_VALUE_KEY, clean);
    } else {
      localStorage.setItem(TRUE_SKY_LOCATION_ANONYMOUS_CACHE_KEY, clean);
    }
  } catch (error) {
    console.warn("Não foi possível manter o cache local da localização padrão:", error);
  }
}

function applyAccountDefaultLocation(value) {
  const normalized = normalizeLocation(value) || TRUE_SKY_FALLBACK_LOCATION;
  window.TrueSkyAccountDefaultLocation = normalized;

  const accountInput = document.getElementById("defaultLocation");
  if (accountInput) accountInput.value = normalized;

  TRUE_SKY_LOCATION_FIELD_IDS.forEach((id) => {
    const field = document.getElementById(id);
    if (field) field.value = normalized;
  });

  // Clear coordinates from an older chart so the location can be resolved again.
  const latitude = document.getElementById("natalLatitude");
  const longitude = document.getElementById("natalLongitude");
  if (latitude) latitude.value = "";
  if (longitude) longitude.value = "";

  return normalized;
}

async function readCloudDefaultLocation(user) {
  const db = getFirestore();
  if (!db || !user || !user.uid) return "";
  const snapshot = await withTimeout(
    db.collection("users").doc(user.uid).get(),
    3500,
    "Tempo limite ao carregar a localização padrão da conta.",
  );
  if (!snapshot || !snapshot.exists) return "";
  const data = snapshot.data() || {};
  return normalizeLocation(data.defaultLocation || data.default_location || "");
}

async function writeCloudDefaultLocation(user, value) {
  const db = getFirestore();
  if (!db || !user || !user.uid) throw new Error("Conta Firebase indisponível.");
  const clean = normalizeLocation(value);
  if (!clean) throw new Error("Informe uma cidade válida para salvar.");

  let updatedAt = new Date().toISOString();
  try {
    if (window.firebase.firestore.FieldValue && window.firebase.firestore.FieldValue.serverTimestamp) {
      updatedAt = window.firebase.firestore.FieldValue.serverTimestamp();
    }
  } catch (_) {}

  await withTimeout(
    db.collection("users").doc(user.uid).set({
      defaultLocation: clean,
      default_location: clean,
      defaultLocationUpdatedAt: updatedAt,
    }, { merge: true }),
    5000,
    "Tempo limite ao salvar a localização padrão no Firebase.",
  );
  return clean;
}

async function readLegacyServerDefaultLocation() {
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timeoutId = controller
    ? setTimeout(() => controller.abort(), 2500)
    : null;
  try {
    const response = await fetch("/api/default-location", {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Accept": "application/json" },
      ...(controller ? { signal: controller.signal } : {}),
    });
    if (!response.ok) {
      console.warn("Não foi possível carregar a localização antiga do servidor:", response.status);
      return "";
    }
    const data = await response.json();
    return normalizeLocation(data.defaultLocation || data.default_location || "");
  } catch (error) {
    if (error && error.name !== "AbortError") {
      console.warn("Falha ao carregar a localização antiga do servidor:", error);
    }
    return "";
  } finally {
    if (timeoutId !== null) clearTimeout(timeoutId);
  }
}

async function saveLegacyServerDefaultLocation(value) {
  const response = await fetch("/save-default-location", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    credentials: "same-origin",
    cache: "no-store",
    body: JSON.stringify({ defaultLocation: value }),
  });
  let data = {};
  try { data = await response.json(); } catch (_) {}
  if (!response.ok || !data.success) {
    throw new Error(data.error || `O servidor recusou o salvamento (${response.status}).`);
  }
  return normalizeLocation(data.defaultLocation || value);
}

function isCurrentLocationLoad(generation) {
  return generation === locationLoadGeneration && !locationSaveInProgress;
}

async function loadAccountDefaultLocation() {
  if (locationSaveInProgress) {
    return normalizeLocation(window.TrueSkyAccountDefaultLocation || "");
  }

  const generation = ++locationLoadGeneration;
  const user = await waitForFirebaseUser(3500);
  if (!isCurrentLocationLoad(generation)) {
    return normalizeLocation(window.TrueSkyAccountDefaultLocation || "");
  }

  const uid = user && user.uid ? user.uid : "";
  let cachedLocation = readCachedDefaultLocation(uid);
  if (cachedLocation) {
    // Display the saved local copy immediately while Firestore refreshes it.
    applyAccountDefaultLocation(cachedLocation);
  }

  if (uid && getFirestore()) {
    try {
      const cloudLocation = await readCloudDefaultLocation(user);
      if (!isCurrentLocationLoad(generation)) {
        return normalizeLocation(window.TrueSkyAccountDefaultLocation || "");
      }

      if (cloudLocation) {
        cacheDefaultLocation(cloudLocation, uid);
        window.TrueSkyDefaultLocationLoaded = true;
        return applyAccountDefaultLocation(cloudLocation);
      }

      // Upgrade a UID-scoped cache created during a temporary Firebase outage.
      if (cachedLocation) {
        try {
          await writeCloudDefaultLocation(user, cachedLocation);
        } catch (error) {
          console.warn("A localização está no cache deste usuário; sincronização será tentada novamente:", error);
        }
        if (!isCurrentLocationLoad(generation)) {
          return normalizeLocation(window.TrueSkyAccountDefaultLocation || "");
        }
        window.TrueSkyDefaultLocationLoaded = true;
        return applyAccountDefaultLocation(cachedLocation);
      }
    } catch (error) {
      console.warn("Não foi possível atualizar a localização padrão pelo Firebase; usando o cache/servidor:", error);
    }
  }

  if (!isCurrentLocationLoad(generation)) {
    return normalizeLocation(window.TrueSkyAccountDefaultLocation || "");
  }

  if (cachedLocation) {
    window.TrueSkyDefaultLocationLoaded = true;
    return applyAccountDefaultLocation(cachedLocation);
  }

  // Migration path for locations saved by older versions, which used the Render
  // filesystem. Once recovered, copy the value to the account document in Firestore.
  const legacyLocation = await readLegacyServerDefaultLocation();
  if (!isCurrentLocationLoad(generation)) {
    return normalizeLocation(window.TrueSkyAccountDefaultLocation || "");
  }

  if (legacyLocation) {
    cacheDefaultLocation(legacyLocation, uid);
    const applied = applyAccountDefaultLocation(legacyLocation);
    if (uid) {
      try {
        await writeCloudDefaultLocation(user, legacyLocation);
      } catch (error) {
        console.warn("A localização antiga foi recuperada, mas ainda não foi sincronizada com o Firebase:", error);
      }
    }
    if (!isCurrentLocationLoad(generation)) {
      return normalizeLocation(window.TrueSkyAccountDefaultLocation || "");
    }
    window.TrueSkyDefaultLocationLoaded = true;
    return applied;
  }

  // Never replace a known saved city with New York just because an API call was
  // empty/slow. New York is used only when the account has no cloud, cache or legacy value.
  const finalLocation = readCachedDefaultLocation(uid) || TRUE_SKY_FALLBACK_LOCATION;
  if (!isCurrentLocationLoad(generation)) {
    return normalizeLocation(window.TrueSkyAccountDefaultLocation || "");
  }
  window.TrueSkyDefaultLocationLoaded = true;
  return applyAccountDefaultLocation(finalLocation);
}

window.TrueSkyApplyAccountDefaultLocation = () => {
  const user = getKnownFirebaseUser();
  const cached = readCachedDefaultLocation(user && user.uid ? user.uid : "");
  const current = normalizeLocation(window.TrueSkyAccountDefaultLocation || cached);
  // A settings initializer can call this while auth is still resolving. In that
  // case, leave the current form intact rather than forcing the hard-coded city.
  if (!current && !window.TrueSkyDefaultLocationLoaded) return "";
  return applyAccountDefaultLocation(current || TRUE_SKY_FALLBACK_LOCATION);
};

function scheduleDefaultLocationLoad() {
  if (locationSaveInProgress) return;
  window.TrueSkyDefaultLocationLoaded = false;
  window.TrueSkyDefaultLocationReady = loadAccountDefaultLocation();
}

window.TrueSkyDefaultLocationReady = loadAccountDefaultLocation();

window.addEventListener("truesky-auth-changed", (event) => {
  if (locationSaveInProgress) return;
  const user = event.detail && event.detail.user;
  if (user && user.uid) {
    scheduleDefaultLocationLoad();
  } else {
    // Invalidate pending requests so a previous user's slow response cannot win.
    locationLoadGeneration += 1;
    window.TrueSkyDefaultLocationLoaded = true;
    window.TrueSkyDefaultLocationReady = Promise.resolve(
      applyAccountDefaultLocation(TRUE_SKY_FALLBACK_LOCATION),
    );
  }
});

window.addEventListener("truesky-firebase-ready", () => {
  scheduleDefaultLocationLoad();
});

document.addEventListener("DOMContentLoaded", () => {
  const saveBtn = document.getElementById("saveDefaultLocationBtn");
  const input = document.getElementById("defaultLocation");
  const messageBox = document.getElementById("defaultLocationMessage");
  let messageTimer = null;
  let saveBusy = false;

  if (!saveBtn || !input || !messageBox) return;

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
    if (saveBusy) return;
    saveBusy = true;
    locationSaveInProgress = true;
    // Invalidate all older reads immediately. Their late responses must not undo this save.
    locationLoadGeneration += 1;
    saveBtn.disabled = true;
    clearMessage();

    let cloudSaved = false;
    let serverSaved = false;
    let location = "";
    let user = null;

    try {
      location = normalizeLocation(input.value);
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

      user = await waitForFirebaseUser(3500);
      const uid = user && user.uid ? user.uid : "";

      // Write to the UID-scoped cache before network requests so an interrupted
      // refresh cannot discard the user's explicit selection.
      cacheDefaultLocation(location, uid);
      applyAccountDefaultLocation(location);
      showLoading();

      if (uid && getFirestore()) {
        try {
          await writeCloudDefaultLocation(user, location);
          cloudSaved = true;
        } catch (error) {
          console.warn("Firebase não confirmou o salvamento da localização; tentando a rota de compatibilidade:", error);
        }
      }

      // Legacy endpoint is only a fallback. Successful account saves go to Firestore,
      // avoiding the ephemeral Render filesystem as the sole source of truth.
      if (!cloudSaved) {
        try {
          await saveLegacyServerDefaultLocation(location);
          serverSaved = true;
        } catch (error) {
          console.warn("Não foi possível salvar a localização no servidor de compatibilidade:", error);
        }
      }

      if (cloudSaved) {
        cacheDefaultLocation(location, uid);
        applyAccountDefaultLocation(location);
        hideSpinner();
        showMessage("Default location saved to your account.");
        setTimeout(() => window.location.reload(), 900);
      } else if (serverSaved) {
        cacheDefaultLocation(location, uid);
        applyAccountDefaultLocation(location);
        hideLoading();
        showMessage("Location saved as a fallback. Account sync is unavailable; this browser's saved copy will be used until Firebase sync succeeds.");
      } else {
        // Keep the selection in the visible form and local cache, but do not claim
        // the account/cloud save succeeded when both network writes failed.
        cacheDefaultLocation(location, uid);
        applyAccountDefaultLocation(location);
        hideLoading();
        showMessage("The city was kept in this browser, but account saving failed. Check your connection and try again.");
      }
    } catch (error) {
      hideLoading();
      console.error("Falha ao salvar a localização padrão:", error);
      if (location) {
        cacheDefaultLocation(location, user && user.uid ? user.uid : "");
        applyAccountDefaultLocation(location);
      }
      showMessage(error.message || "Request failed.");
    } finally {
      hideLoading();
      saveBtn.disabled = false;
      saveBusy = false;
      locationSaveInProgress = false;
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
    messageTimer = setTimeout(() => { messageBox.textContent = ""; }, 6000);
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
  if (Array.isArray(locations) && locations.includes(trimmed)) return true;
  const latLongRegex = /^.+:\s*-?\d+(\.\d+)?,\s*-?\d+(\.\d+)?$/;
  return latLongRegex.test(trimmed);
}
