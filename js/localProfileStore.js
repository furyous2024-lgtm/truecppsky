"use strict";

// Local/online profile storage bridge.
// It lets saved chart profiles and settings work like AstroDienst-style saved profiles:
// - online: uses the server normally and mirrors successful responses to localStorage
// - offline/file://: serves the same endpoints from localStorage
(function () {
  const CHARTS_KEY = "astroSavedProfiles.v1";
  const SETTINGS_KEY = "astroSavedSettings.v1";
  const MAIN_PROFILES_KEY = "astroMainUserProfiles.v1";
  const DEFAULT_LOCATION_KEY = "trueSky.defaultLocation";
  const MAX_ITEMS = 5000;

  const nativeFetch = window.fetch ? window.fetch.bind(window) : null;

  function now() { return new Date().toISOString(); }
  function makeId() { return `local_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`; }
  function safeJsonParse(value, fallback) {
    try { return JSON.parse(value); } catch (_) { return fallback; }
  }
  function read(key) { return safeJsonParse(localStorage.getItem(key), []); }
  function write(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
  function recent(items) {
    return [...items]
      .sort((a, b) => String(b.updated_at || b.created_at || "").localeCompare(String(a.updated_at || a.created_at || "")))
      .slice(0, 100);
  }
  function normalizeChart(chart) {
    const out = { ...(chart || {}) };
    out.id = out.id || makeId();
    out.name = out.name || "Untitled";
    out.year = String(out.year ?? "");
    out.month = String(out.month ?? "");
    out.day = String(out.day ?? "");
    out.hour = String(out.hour ?? "0");
    out.minute = String(out.minute ?? "0").padStart(2, "0");
    out.lat = out.lat ?? out.latitude ?? "";
    out.long = out.long ?? out.lng ?? out.longitude ?? "";
    out.utc = out.utc ?? out.utcOffset ?? "";
    out.location = out.location || "";
    out.profile_type = out.profile_type || out.chart_type || "natal";
    out.created_at = out.created_at || now();
    out.updated_at = out.updated_at || out.created_at;
    return out;
  }
  function chartKey(c) {
    return [c.name, c.year, c.month, c.day, c.hour, String(c.minute).padStart(2, "0"), c.location]
      .map((v) => String(v ?? "").trim().toLowerCase()).join("|");
  }
  function mergeCharts(incoming) {
    const map = new Map();
    [...read(CHARTS_KEY), ...(incoming || [])].map(normalizeChart).forEach((c) => {
      const key = chartKey(c);
      const old = map.get(key);
      if (!old || String(c.updated_at).localeCompare(String(old.updated_at)) >= 0) map.set(key, c);
    });
    const merged = [...map.values()].slice(0, MAX_ITEMS);
    write(CHARTS_KEY, merged);
    return merged;
  }
  function mergeMainProfiles(incoming) {
    const map = new Map();
    [...read(MAIN_PROFILES_KEY), ...(incoming || [])].forEach((p) => {
      const item = { id: p.id || makeId(), profileName: p.profileName || p.profile_name || "Main Profile", chart: p.chart || {}, settings: p.settings || {}, natalData: p.natalData || null, created_at: p.created_at || now(), updated_at: p.updated_at || p.created_at || now() };
      map.set(String(item.id), item);
    });
    const merged = [...map.values()].slice(0, MAX_ITEMS);
    write(MAIN_PROFILES_KEY, merged);
    return merged;
  }
  function mergeSettings(incoming) {
    const map = new Map();
    [...read(SETTINGS_KEY), ...(incoming || [])].forEach((s) => {
      const item = { id: s.id || makeId(), settings_name: s.settings_name || s.settingsName || "Settings", settings_json: s.settings_json || "{}", created_at: s.created_at || now(), updated_at: s.updated_at || s.created_at || now() };
      map.set(String(item.id), item);
    });
    const merged = [...map.values()].slice(0, MAX_ITEMS);
    write(SETTINGS_KEY, merged);
    return merged;
  }
  function jsonResponse(obj) {
    return Promise.resolve(new Response(JSON.stringify(obj), { status: 200, headers: { "Content-Type": "application/json" } }));
  }
  async function requestBody(init) {
    if (!init || init.body == null) return {};
    if (typeof init.body === "string") return safeJsonParse(init.body, {});
    return init.body;
  }
  function pathOf(input) {
    const raw = typeof input === "string" ? input : (input && input.url) || "";
    try { return new URL(raw, location.href).pathname; } catch (_) { return raw; }
  }
  function getLocalBackendBaseUrl() {
    if (!location || !location.protocol || !location.hostname) return "";
    if (location.protocol.startsWith("http") && (location.hostname === "localhost" || location.hostname === "127.0.0.1") && location.port && location.port !== "5501") {
      return "http://localhost:5501";
    }
    return "";
  }
  async function localEndpoint(path, init, input) {
    const method = String((init && init.method) || "GET").toUpperCase();
    const body = await requestBody(init);

    if (path === "/recent-charts") return { success: true, recentCharts: recent(read(CHARTS_KEY)) };
    if (path === "/search-charts") {
      const url = new URL(typeof input === "string" ? input : ((input && input.url) || location.href), location.href);
      const q = (url.searchParams.get("query") || "").toLowerCase();
      return { success: true, recentCharts: recent(read(CHARTS_KEY)).filter((c) => !q || JSON.stringify(c).toLowerCase().includes(q)) };
    }
    if (path === "/save-chart" && method === "POST") {
      const charts = read(CHARTS_KEY).map(normalizeChart);
      const item = normalizeChart({ ...body, created_at: now(), updated_at: now() });
      const dup = charts.find((c) => chartKey(c) === chartKey(item));
      if (dup) return { success: false, error: "Chart already exists in database.", recentCharts: recent(charts) };
      if (charts.length >= MAX_ITEMS) return { success: false, error: "Chart limit reached. Maximum allowed charts is 5000.", recentCharts: recent(charts) };
      charts.unshift(item); write(CHARTS_KEY, charts);
      return { success: true, recentCharts: recent(charts) };
    }
    if (path === "/delete-chart" && method === "POST") {
      const charts = read(CHARTS_KEY).filter((c) => String(c.id) !== String(body.id));
      write(CHARTS_KEY, charts); return { success: true, recentCharts: recent(charts) };
    }
    if (path === "/update-chart-timestamp" && method === "POST") {
      const charts = read(CHARTS_KEY).map((c) => String(c.id) === String(body.id) ? { ...c, updated_at: now() } : c);
      write(CHARTS_KEY, charts); return { success: true, recentCharts: recent(charts) };
    }
    if (path === "/export-charts") return read(CHARTS_KEY);
    if (path === "/import-charts" && method === "POST") return { success: true, recentCharts: recent(mergeCharts(body.charts || body.recentCharts || [])) };

    if (path === "/recent-profiles") return { success: true, recentProfiles: recent(read(MAIN_PROFILES_KEY)) };
    if (path === "/save-profile" && method === "POST") {
      const profiles = read(MAIN_PROFILES_KEY);
      const profileName = body.profileName || body.profile_name || "Main Profile";
      const existing = profiles.find((p) => String(p.profileName || "").toLowerCase() === String(profileName).toLowerCase());
      const item = { id: existing?.id || body.id || makeId(), profileName, chart: body.chart || {}, settings: body.settings || {}, natalData: body.natalData || null, created_at: existing?.created_at || now(), updated_at: now() };
      const next = [item, ...profiles.filter((p) => String(p.id) !== String(item.id))];
      write(MAIN_PROFILES_KEY, next);
      return { success: true, recentProfiles: recent(next) };
    }
    if (path === "/delete-profile" && method === "POST") {
      const next = read(MAIN_PROFILES_KEY).filter((p) => String(p.id) !== String(body.id));
      write(MAIN_PROFILES_KEY, next);
      return { success: true, recentProfiles: recent(next) };
    }
    if (path === "/update-profile-timestamp" && method === "POST") {
      const next = read(MAIN_PROFILES_KEY).map((p) => String(p.id) === String(body.id) ? { ...p, updated_at: now() } : p);
      write(MAIN_PROFILES_KEY, next);
      return { success: true, recentProfiles: recent(next) };
    }

    if (path === "/api/default-location") {
      const defaultLocation = localStorage.getItem(DEFAULT_LOCATION_KEY) || localStorage.getItem("astroDefaultLocation.v1") || localStorage.getItem("defaultLocation") || "";
      return { success: true, defaultLocation };
    }
    if (path === "/save-default-location" && method === "POST") {
      const defaultLocation = String(body.defaultLocation || body.default_location || "").trim();
      if (!defaultLocation) return { success: false, error: "Default location is required." };
      localStorage.setItem(DEFAULT_LOCATION_KEY, defaultLocation);
      localStorage.setItem("astroDefaultLocation.v1", defaultLocation);
      localStorage.setItem("defaultLocation", defaultLocation);
      return { success: true, defaultLocation };
    }

    if (path === "/recent-settings") return { success: true, recentSettings: recent(read(SETTINGS_KEY)) };
    if (path === "/save-settings" && method === "POST") {
      const item = { id: makeId(), settings_name: body.settingsName || body.settings_name || "Settings", settings_json: body.settings_json || "{}", created_at: now(), updated_at: now() };
      const settings = [item, ...read(SETTINGS_KEY)]; write(SETTINGS_KEY, settings);
      return { success: true, recentSettings: recent(settings) };
    }
    if (path === "/delete-settings" && method === "POST") {
      const settings = read(SETTINGS_KEY).filter((s) => String(s.id) !== String(body.id));
      write(SETTINGS_KEY, settings); return { success: true, recentSettings: recent(settings) };
    }
    if (path === "/update-settings-timestamp" && method === "POST") {
      const settings = read(SETTINGS_KEY).map((s) => String(s.id) === String(body.id) ? { ...s, updated_at: now() } : s);
      write(SETTINGS_KEY, settings); return { success: true, recentSettings: recent(settings) };
    }
    return null;
  }

  async function mirror(path, response) {
    try {
      const clone = response.clone();
      const data = await clone.json();
      if (Array.isArray(data.recentCharts)) mergeCharts(data.recentCharts);
      if (Array.isArray(data.recentSettings)) mergeSettings(data.recentSettings);
      if (Array.isArray(data.recentProfiles)) mergeMainProfiles(data.recentProfiles);
    } catch (_) {}
    return response;
  }

  window.fetch = async function (input, init) {
    const path = pathOf(input);
    const handled = ["/recent-charts", "/search-charts", "/save-chart", "/delete-chart", "/update-chart-timestamp", "/export-charts", "/import-charts", "/api/default-location", "/save-default-location", "/recent-settings", "/save-settings", "/delete-settings", "/update-settings-timestamp", "/recent-profiles", "/save-profile", "/delete-profile", "/update-profile-timestamp"].includes(path);
    if (!handled || !nativeFetch) return nativeFetch(input, init);

    const backendBase = getLocalBackendBaseUrl();
    if (backendBase) {
      try {
        input = new URL(path, backendBase).toString();
      } catch (_) {}
    }

    if (location.protocol === "file:") return jsonResponse(await localEndpoint(path, init, input));
    try {
      const response = await nativeFetch(input, init);
      if (response.ok) return mirror(path, response);
      const fallback = await localEndpoint(path, init, input);
      return fallback ? jsonResponse(fallback) : response;
    } catch (_) {
      return jsonResponse(await localEndpoint(path, init, input));
    }
  };

  window.AstroLocalProfiles = {
    getCharts: () => recent(read(CHARTS_KEY)),
    getSettings: () => recent(read(SETTINGS_KEY)),
    mergeCharts,
    mergeSettings,
    mergeMainProfiles,
  };
})();
