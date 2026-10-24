"use strict";

// Main-page profile manager. Saves the birth form + current wheel/settings and
// uses the Node/Render backend when available. It also mirrors to localStorage
// so profiles still work offline or while testing with file://.
(function () {
  const PROFILE_KEY = "astroMainUserProfiles.v1";

  function $(id) { return document.getElementById(id); }
  function now() { return new Date().toISOString(); }
  function safeJson(value, fallback) { try { return JSON.parse(value); } catch (_) { return fallback; } }
  function readProfiles() { return safeJson(localStorage.getItem(PROFILE_KEY), []); }
  function writeProfiles(list) { localStorage.setItem(PROFILE_KEY, JSON.stringify(list || [])); }
  function message(text, isSettings = false) {
    const el = document.querySelector(isSettings ? ".errorMessageSettings" : ".errorMessage");
    if (el) {
      el.textContent = text;
      setTimeout(() => { if (el.textContent === text) el.textContent = ""; }, 4000);
    }
  }
  function ensureHidden(name) {
    const form = $("natalForm");
    if (!form) return null;
    let input = form.querySelector(`[name="${name}"]`);
    if (!input) {
      input = document.createElement("input");
      input.type = "hidden";
      input.name = name;
      form.appendChild(input);
    }
    return input;
  }
  function getHiddenValue(name) {
    return document.querySelector(`#natalForm [name="${name}"]`)?.value || "";
  }
  function getFormSnapshot() {
    const storedNatalData = safeJson(localStorage.getItem("natalData"), null) || {};
    return {
      name: $("natalName")?.value || storedNatalData.name || "",
      day: $("natalDay")?.value || storedNatalData.day || "",
      month: $("natalMonth")?.value || storedNatalData.month || "",
      year: $("natalYear")?.value || storedNatalData.year || "",
      hour: $("natalHour")?.value || storedNatalData.hour || storedNatalData.hourString || "",
      minute: $("natalMinute")?.value || storedNatalData.minute || storedNatalData.minuteString || "",
      location: $("natalLocation")?.value || storedNatalData.location || "",
      lat: getHiddenValue("lat") || getHiddenValue("latitude") || storedNatalData.lat || storedNatalData.latitude || "",
      long: getHiddenValue("long") || getHiddenValue("longitude") || storedNatalData.long || storedNatalData.lon || storedNatalData.longitude || "",
      utc: getHiddenValue("utcOffset") || getHiddenValue("utc") || storedNatalData.utcOffset || storedNatalData.utc || "",
      utcOffset: getHiddenValue("utcOffset") || getHiddenValue("utc") || storedNatalData.utcOffset || storedNatalData.utc || "",
      timezone: getHiddenValue("timezone") || getHiddenValue("timezoneName") || storedNatalData.timezone || storedNatalData.timezoneName || "",
      timezoneName: getHiddenValue("timezone") || getHiddenValue("timezoneName") || storedNatalData.timezone || storedNatalData.timezoneName || "",
      utcMode: getHiddenValue("utcMode") || storedNatalData.utcMode || "auto",
    };
  }
  function applySavedChartGeo(chart) {
    const lat = chart?.lat ?? chart?.latitude;
    const lon = chart?.long ?? chart?.lon ?? chart?.lng ?? chart?.longitude;
    const utc = chart?.utcOffset ?? chart?.utc ?? chart?.timezoneOffset ?? chart?.utc_offset;
    const timezone = chart?.timezone ?? chart?.timezoneName ?? "";
    const utcMode = chart?.utcMode ?? chart?.timezoneMode ?? "auto";
    const pairs = { lat, latitude: lat, long: lon, longitude: lon, utcOffset: utc, utc, timezone, timezoneName: timezone, utcMode };
    Object.entries(pairs).forEach(([name, value]) => {
      const input = ensureHidden(name);
      if (input && value !== undefined && value !== null && String(value).trim() !== "") input.value = String(value);
    });
    const locInput = $("natalLocation");
    if (locInput) {
      if (timezone) locInput.dataset.selectedTimezone = String(timezone);
      locInput.dataset.utcMode = String(utcMode || "auto");
    window.TrueSkyLocationControls?.setUtcMode?.(locInput.closest("form"), locInput, utcMode || "auto");
      if (utc !== undefined && utc !== null && String(utc).trim() !== "") locInput.dataset.selectedUtcFallback = String(utc);
      if (lat !== undefined && lat !== null && lon !== undefined && lon !== null) {
        locInput.dataset.selectedLat = String(lat);
        locInput.dataset.selectedLon = String(lon);
      }
    }
  }
  function fillForm(snapshot) {
    if (!snapshot) return;
    if ($("natalName")) $("natalName").value = snapshot.name || "";
    if ($("natalDay")) $("natalDay").value = snapshot.day || "";
    if ($("natalMonth")) $("natalMonth").value = snapshot.month || "";
    if ($("natalYear")) $("natalYear").value = snapshot.year || "";
    if ($("natalHour")) $("natalHour").value = snapshot.hour || "";
    if ($("natalMinute")) $("natalMinute").value = String(snapshot.minute || "").padStart(2, "0");
    if ($("natalLocation")) $("natalLocation").value = snapshot.location || "";
    applySavedChartGeo(snapshot);
  }
  function settingsSnapshot() {
    if (typeof getSettingsData === "function") return getSettingsData();
    return safeJson(localStorage.getItem("settingsData"), {});
  }
  function loadSettings(settings) {
    if (settings && typeof loadSettingsIntoForm === "function") loadSettingsIntoForm(settings);
  }
  function mergeLocalProfiles(incoming) {
    const map = new Map();
    [...readProfiles(), ...(incoming || [])].forEach((p) => {
      if (!p) return;
      const item = {
        id: p.id || `profile_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
        profileName: p.profileName || p.profile_name || "Main Profile",
        chart: p.chart || {},
        settings: p.settings || {},
        natalData: p.natalData || null,
        created_at: p.created_at || now(),
        updated_at: p.updated_at || p.created_at || now(),
      };
      const key = String(item.id);
      const old = map.get(key);
      if (!old || String(item.updated_at).localeCompare(String(old.updated_at)) >= 0) map.set(key, item);
    });
    const list = [...map.values()].sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at))).slice(0, 100);
    writeProfiles(list);
    return list;
  }
  function renderProfiles(profiles = readProfiles()) {
    const list = $("mainProfilesList");
    if (!list) return;
    list.innerHTML = "";
    [...profiles]
      .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)))
      .forEach((profile) => {
        const li = document.createElement("li");
        const span = document.createElement("span");
        span.textContent = `${profile.profileName} — ${profile.chart?.name || "Untitled"} ${profile.chart?.day || ""} ${profile.chart?.month || ""} ${profile.chart?.year || ""}`;
        span.style.cursor = "pointer";
        span.addEventListener("click", () => {
          if ($("mainProfileName")) $("mainProfileName").value = profile.profileName || "";
          fillForm(profile.chart);
          if (profile.natalData) localStorage.setItem("natalData", JSON.stringify({ ...profile.natalData, ...profile.chart }));
          loadSettings(profile.settings);
          fetch("/update-profile-timestamp", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: profile.id }),
            credentials: "same-origin",
          }).catch(() => {});
          $("natalCalculate")?.click();
          message("Profile loaded.");
        });
        const del = document.createElement("button");
        del.type = "button";
        del.textContent = "X";
        del.className = "deleteChartButton";
        del.addEventListener("click", (event) => {
          event.stopPropagation();
          const localNext = readProfiles().filter((p) => p.id !== profile.id);
          writeProfiles(localNext);
          renderProfiles(localNext);
          fetch("/delete-profile", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: profile.id }),
            credentials: "same-origin",
          })
            .then((r) => r.json())
            .then((data) => { if (data.success) renderProfiles(mergeLocalProfiles(data.recentProfiles || [])); })
            .catch(() => {});
          message("Profile deleted.");
        });
        li.appendChild(span);
        li.appendChild(del);
        list.appendChild(li);
      });
  }
  function fetchProfiles() {
    fetch("/recent-profiles", { credentials: "same-origin" })
      .then((response) => response.json())
      .then((data) => {
        if (data.success) renderProfiles(mergeLocalProfiles(data.recentProfiles || []));
        else renderProfiles();
      })
      .catch(() => renderProfiles());
  }
  function saveUserProfile() {
    const chart = getFormSnapshot();
    const profileName = ($("mainProfileName")?.value || chart.name || "Main Profile").trim() || "Main Profile";
    const existing = readProfiles().find((p) => String(p.profileName || "").toLowerCase() === profileName.toLowerCase());
    const item = {
      id: existing?.id || `profile_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      profileName,
      chart,
      settings: settingsSnapshot(),
      natalData: safeJson(localStorage.getItem("natalData"), null),
      created_at: existing?.created_at || now(),
      updated_at: now(),
    };
    const localNext = [item, ...readProfiles().filter((p) => p.id !== item.id)].slice(0, 100);
    writeProfiles(localNext);
    renderProfiles(localNext);
    window.dispatchEvent(new CustomEvent("mainProfilesUpdated", { detail: { profiles: localNext } }));

    fetch("/save-profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(item),
      credentials: "same-origin",
    })
      .then((response) => response.json())
      .then((data) => {
        if (data.success) {
          const merged = mergeLocalProfiles(data.recentProfiles || []);
          renderProfiles(merged);
          message("User profile saved.");
        } else {
          message(data.error || "Profile saved locally, but server save failed.");
        }
      })
      .catch(() => message("Profile saved locally. Server storage is not reachable."));
  }
  async function saveSettingsProfileFromMain() {
    const field = $("settingsName");
    const mainName = ($("mainProfileName")?.value || $("natalName")?.value || "Main Settings").trim();
    if (field && !field.value.trim()) field.value = mainName;
    if (typeof getSettingsData !== "function") {
      message("Settings are not ready yet.");
      return;
    }
    const payload = { settingsName: field?.value || mainName, settings_json: JSON.stringify(getSettingsData()) };
    try {
      const recentSettings = await window.TrueSkyFirebaseSettings.save(
        payload.settingsName,
        payload.settings_json,
      );
      if (typeof updateRecentSettings === "function") updateRecentSettings(recentSettings);
      message("Settings saved to Firebase.");
    } catch (error) {
      console.error(error);
      message(error.message || "Error saving settings to Firebase.", true);
    }
  }
  document.addEventListener("DOMContentLoaded", () => {
    $("mainSaveUserProfile")?.addEventListener("click", saveUserProfile);
    $("mainSaveSettingsProfile")?.addEventListener("click", saveSettingsProfileFromMain);
    fetchProfiles();
  });
})();
