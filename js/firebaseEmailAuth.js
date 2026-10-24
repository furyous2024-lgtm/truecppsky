(function () {
  "use strict";

  const cfg = window.TRUESKY_FIREBASE_CONFIG || (window.TrueSkyFirebaseConfig && window.TrueSkyFirebaseConfig.config) || {};
  const required = ["apiKey", "authDomain", "projectId", "appId"];
  const placeholderParts = ["COLE_", "SEU_PROJETO", "SEU_PROJECT_ID", "YOUR_", "AQUI"];
  const configured = required.every((key) => {
    const value = String(cfg[key] || "").trim();
    return value && !placeholderParts.some((part) => value.includes(part));
  });
  const firebaseAvailable = typeof window.firebase !== "undefined";

  const state = {
    ready: false,
    configured,
    user: null,
    auth: null,
    db: null,
  };

  // Session caches keep the UI responsive after a cloud write/delete. The old
  // code saved to Firestore and then immediately performed another Firestore
  // query; when that second request was slow, the buttons looked broken even
  // though the write could have succeeded. These caches let us update the UI
  // instantly and sync from Firestore in the background/next refresh.
  let cloudSettingsCache = [];
  let cloudChartsCache = [];
  let cloudDefaultLocationCache = "";

  function safeJson(value, fallback) {
    try { return JSON.parse(value); } catch { return fallback; }
  }

  function now() { return new Date().toISOString(); }
  function makeId() { return `cloud_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`; }
  function stableId(prefix, value) {
    const text = String(value || "");
    let hash = 2166136261;
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return `${prefix}_${(hash >>> 0).toString(36)}`;
  }



  function encodeFirestorePath(path) {
    return String(path || "")
      .split("/")
      .filter(Boolean)
      .map((part) => encodeURIComponent(part))
      .join("/");
  }

  function toFirestoreValue(value) {
    if (value === undefined) return { nullValue: null };
    if (value === null) return { nullValue: null };
    if (typeof value === "boolean") return { booleanValue: value };
    if (typeof value === "number") {
      if (Number.isInteger(value)) return { integerValue: String(value) };
      return { doubleValue: value };
    }
    if (typeof value === "string") return { stringValue: value };
    if (Array.isArray(value)) return { arrayValue: { values: value.map(toFirestoreValue) } };
    if (typeof value === "object") {
      const fields = {};
      Object.entries(value).forEach(([key, childValue]) => {
        if (childValue !== undefined) fields[key] = toFirestoreValue(childValue);
      });
      return { mapValue: { fields } };
    }
    return { stringValue: String(value) };
  }

  function fromFirestoreValue(value) {
    if (!value || typeof value !== "object") return null;
    if ("stringValue" in value) return value.stringValue;
    if ("integerValue" in value) return Number(value.integerValue);
    if ("doubleValue" in value) return Number(value.doubleValue);
    if ("booleanValue" in value) return Boolean(value.booleanValue);
    if ("nullValue" in value) return null;
    if ("timestampValue" in value) return value.timestampValue;
    if ("arrayValue" in value) return (value.arrayValue.values || []).map(fromFirestoreValue);
    if ("mapValue" in value) return fromFirestoreFields(value.mapValue.fields || {});
    return null;
  }

  function fromFirestoreFields(fields) {
    const out = {};
    Object.entries(fields || {}).forEach(([key, value]) => {
      out[key] = fromFirestoreValue(value);
    });
    return out;
  }

  function toFirestoreDocument(data) {
    const fields = {};
    Object.entries(data || {}).forEach(([key, value]) => {
      if (value !== undefined) fields[key] = toFirestoreValue(value);
    });
    return { fields };
  }

  function firestoreDocId(docName) {
    return String(docName || "").split("/").pop() || "";
  }

  async function getFirebaseIdToken() {
    if (!state.user || typeof state.user.getIdToken !== "function") {
      throw new Error("Login Firebase não está pronto. Entre novamente na página /login.");
    }
    return withCloudTimeout(state.user.getIdToken(false), 5000, "Obter token Firebase");
  }

  async function firestoreRestRequest(method, docPath, body, timeoutMs = 7000) {
    if (!state.configured || !cfg.projectId) throw new Error("Firebase não está configurado em js/firebase-config.js.");
    const token = await getFirebaseIdToken();
    const encodedPath = encodeFirestorePath(docPath);
    const params = new URLSearchParams();
    if (cfg.apiKey) params.set("key", cfg.apiKey);
    if (method === "PATCH" && body && typeof body === "object") {
      Object.keys(body).forEach((key) => params.append("updateMask.fieldPaths", key));
    }
    const query = params.toString() ? `?${params.toString()}` : "";
    const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(cfg.projectId)}/databases/(default)/documents/${encodedPath}${query}`;
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
      const response = await withCloudTimeout(fetch(url, {
        method,
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(toFirestoreDocument(body)) : undefined,
        signal: controller ? controller.signal : undefined,
      }), timeoutMs + 500, `Firestore REST ${method}`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        let message = data?.error?.message || `Firestore REST HTTP ${response.status}`;
        if (response.status === 403 || /permission/i.test(message)) {
          message = `${message} Confira se as regras do Firestore foram publicadas no projeto true-sky-astrology. Rode: firebase deploy --only firestore:rules --project true-sky-astrology`;
        }
        throw new Error(message);
      }
      return data;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async function firestoreRestList(collectionPath, timeoutMs = 7000) {
    if (!state.configured || !cfg.projectId) throw new Error("Firebase não está configurado em js/firebase-config.js.");
    const token = await getFirebaseIdToken();
    const encodedPath = encodeFirestorePath(collectionPath);
    const sep = cfg.apiKey ? `?key=${encodeURIComponent(cfg.apiKey)}` : "";
    const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(cfg.projectId)}/databases/(default)/documents/${encodedPath}${sep}`;
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
      const response = await withCloudTimeout(fetch(url, {
        headers: { "Authorization": `Bearer ${token}` },
        signal: controller ? controller.signal : undefined,
      }), timeoutMs + 500, "Listar Firestore REST");
      const data = await response.json().catch(() => ({}));
      if (response.status === 404) return [];
      if (!response.ok) {
        let message = data?.error?.message || `Firestore REST HTTP ${response.status}`;
        if (response.status === 403 || /permission/i.test(message)) {
          message = `${message} Confira se as regras do Firestore foram publicadas no projeto true-sky-astrology. Rode: firebase deploy --only firestore:rules --project true-sky-astrology`;
        }
        throw new Error(message);
      }
      return (data.documents || []).map((doc) => ({ id: firestoreDocId(doc.name), ...fromFirestoreFields(doc.fields || {}) }));
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async function firestoreRestGet(docPath, timeoutMs = 7000) {
    const token = await getFirebaseIdToken();
    const encodedPath = encodeFirestorePath(docPath);
    const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(cfg.projectId)}/databases/(default)/documents/${encodedPath}${cfg.apiKey ? `?key=${encodeURIComponent(cfg.apiKey)}` : ""}`;
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
      const response = await withCloudTimeout(fetch(url, {
        headers: { "Authorization": `Bearer ${token}` },
        signal: controller ? controller.signal : undefined,
      }), timeoutMs + 500, "Ler Firestore REST");
      const data = await response.json().catch(() => ({}));
      if (response.status === 404) return null;
      if (!response.ok) {
        let message = data?.error?.message || `Firestore REST HTTP ${response.status}`;
        if (response.status === 403 || /permission/i.test(message)) {
          message = `${message} Confira se as regras do Firestore foram publicadas no projeto true-sky-astrology. Rode: firebase deploy --only firestore:rules --project true-sky-astrology`;
        }
        throw new Error(message);
      }
      return { id: firestoreDocId(data.name), ...fromFirestoreFields(data.fields || {}) };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  function userPath() {
    if (!state.user) return "";
    return `users/${state.user.uid}`;
  }

  function settingsPath(id) {
    return `${userPath()}/settings/${id}`;
  }

  function chartsPath(id) {
    return `${userPath()}/charts/${id}`;
  }

  function getLocalSettings() {
    const primary = safeJson(localStorage.getItem("astroSavedSettings.v1") || "[]", []);
    if (Array.isArray(primary) && primary.length) return primary;
    return safeJson(localStorage.getItem("truesky_recent_settings_v1") || "[]", []);
  }

  function setSettingsMessage(text, isError) {
    const targets = [
      document.querySelector(".firebase-auth-message"),
      document.querySelector(".errorMessageSettings"),
    ].filter(Boolean);
    targets.forEach((el) => {
      el.textContent = text || "";
      el.style.color = isError ? "#b00020" : "#285b2a";
    });
  }

  function userDoc() {
    if (!state.user || !state.db) return null;
    return state.db.collection("users").doc(state.user.uid);
  }

  function settingsCollection() {
    const doc = userDoc();
    return doc ? doc.collection("settings") : null;
  }

  function chartsCollection() {
    const doc = userDoc();
    return doc ? doc.collection("charts") : null;
  }

  function normalizeText(value) {
    return String(value ?? "").trim();
  }

  function normalizeChart(body) {
    const raw = body || {};
    const lat = raw.lat ?? raw.latitude ?? "";
    const lon = raw.long ?? raw.lon ?? raw.lng ?? raw.longitude ?? "";
    const utc = raw.utcOffset ?? raw.utc ?? raw.timezoneOffset ?? raw.utc_offset ?? "";
    const timezone = raw.timezone ?? raw.timezoneName ?? "";
    const utcMode = raw.utcMode ?? raw.timezoneMode ?? "auto";
    const nowIso = now();

    return {
      id: raw.id || makeId(),
      name: normalizeText(raw.name) || "Untitled",
      year: normalizeText(raw.year),
      month: normalizeText(raw.month),
      day: normalizeText(raw.day),
      hour: normalizeText(raw.hour || "0"),
      minute: normalizeText(raw.minute || "0").padStart(2, "0"),
      location: normalizeText(raw.location),
      lat,
      latitude: lat,
      long: lon,
      lon,
      longitude: lon,
      utc,
      utcOffset: utc,
      timezone,
      timezoneName: timezone,
      utcMode,
      profile_type: raw.profile_type || raw.chart_type || "natal",
      natalData: raw.natalData || null,
      created_at: raw.created_at || nowIso,
      updated_at: nowIso,
      owner_uid: state.user ? state.user.uid : "",
      owner_email: state.user ? (state.user.email || "") : "",
    };
  }

  function chartKey(chart) {
    const c = normalizeChart(chart || {});
    return [c.name, c.year, c.month, c.day, c.hour, String(c.minute).padStart(2, "0"), c.location]
      .map((value) => normalizeText(value).toLowerCase())
      .join("|");
  }


  function withCloudTimeout(promise, timeoutMs = 12000, label = "Firebase") {
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} demorou demais para responder.`)), timeoutMs);
    });
    return Promise.race([Promise.resolve(promise), timeout]).finally(() => clearTimeout(timer));
  }

  function recent(items, max = 100) {
    return [...(items || [])]
      .sort((a, b) => String(b.updated_at || b.created_at || "").localeCompare(String(a.updated_at || a.created_at || "")))
      .slice(0, max);
  }

  function upsertCached(list, item) {
    if (!item || !item.id) return recent(list || []);
    return recent([item, ...(list || []).filter((old) => String(old.id) !== String(item.id))]);
  }

  function removeCached(list, id) {
    return recent((list || []).filter((item) => String(item.id) !== String(id)));
  }

  async function getCloudSettings() {
    if (!state.user) return cloudSettingsCache;
    try {
      cloudSettingsCache = await firestoreRestList(`${userPath()}/settings`, 6500);
    } catch (err) {
      console.warn("Could not refresh settings from Firestore REST; trying SDK/cache:", err);
      const col = settingsCollection();
      if (col) {
        try {
          const snap = await withCloudTimeout(col.orderBy("updated_at", "desc").limit(100).get(), 5000, "Carregar settings do Firebase");
          cloudSettingsCache = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        } catch (sdkErr) {
          console.warn("Could not refresh settings from Firebase SDK; using session cache:", sdkErr);
        }
      }
    }
    return recent(cloudSettingsCache);
  }

  async function getCloudCharts() {
    if (!state.user) return cloudChartsCache;
    try {
      cloudChartsCache = await firestoreRestList(`${userPath()}/charts`, 6500);
    } catch (err) {
      console.warn("Could not refresh Birth Charts from Firestore REST; trying SDK/cache:", err);
      const col = chartsCollection();
      if (col) {
        try {
          const snap = await withCloudTimeout(col.orderBy("updated_at", "desc").limit(100).get(), 5000, "Carregar Birth Charts do Firebase");
          cloudChartsCache = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        } catch (sdkErr) {
          console.warn("Could not refresh Birth Charts from Firebase SDK; using session cache:", sdkErr);
        }
      }
    }
    return recent(cloudChartsCache);
  }

  async function searchCloudCharts(query) {
    const q = normalizeText(query).toLowerCase();
    const charts = await getCloudCharts();
    if (!q) return charts;
    return charts.filter((chart) => JSON.stringify(chart).toLowerCase().includes(q));
  }

  async function saveCloudChart(body) {
    if (!configured) throw new Error("Firebase não está configurado em js/firebase-config.js.");
    if (!state.user) throw new Error("Faça login com Google/Gmail ou email na página /login antes de salvar o Birth Chart no Firebase.");

    const item = normalizeChart(body || {});
    const identity = chartKey(item);
    const existing = cloudChartsCache.find((chart) => chartKey(chart) === identity);
    if (existing) {
      item.id = existing.id;
      item.created_at = existing.created_at || item.created_at;
    } else if (!String(item.id || "").startsWith("cloud_") && !String(item.id || "").startsWith("chart_")) {
      item.id = stableId("chart", identity);
    }

    await firestoreRestRequest("PATCH", chartsPath(item.id), item, 6500);
    cloudChartsCache = upsertCached(cloudChartsCache, item);
    return item;
  }

  async function deleteCloudChart(body) {
    if (!state.user || !body.id) return;
    await firestoreRestRequest("DELETE", chartsPath(String(body.id)), null, 6500);
    cloudChartsCache = removeCached(cloudChartsCache, body.id);
  }

  async function touchCloudChart(body) {
    if (!state.user || !body.id) return;
    const updated_at = now();
    await firestoreRestRequest("PATCH", chartsPath(String(body.id)), { updated_at }, 5000);
    cloudChartsCache = upsertCached(cloudChartsCache, { ...(cloudChartsCache.find((c) => String(c.id) === String(body.id)) || { id: String(body.id) }), updated_at });
  }

  async function importCloudCharts(charts) {
    for (const chart of charts || []) {
      await saveCloudChart(chart);
    }
    return recent(cloudChartsCache);
  }

  async function getCloudDefaultLocation() {
    if (!state.user) return cloudDefaultLocationCache;
    try {
      const data = await firestoreRestGet(userPath(), 6500) || {};
      cloudDefaultLocationCache = normalizeText(data.defaultLocation || data.default_location || cloudDefaultLocationCache || "");
    } catch (err) {
      console.warn("Could not refresh Default Location from Firestore REST; trying SDK/cache:", err);
      const doc = userDoc();
      if (doc) {
        try {
          const snap = await withCloudTimeout(doc.get(), 5000, "Carregar Default Location do Firebase");
          const data = snap.exists ? (snap.data() || {}) : {};
          cloudDefaultLocationCache = normalizeText(data.defaultLocation || data.default_location || cloudDefaultLocationCache || "");
        } catch (sdkErr) {
          console.warn("Could not refresh Default Location from Firebase SDK; using session cache:", sdkErr);
        }
      }
    }
    return cloudDefaultLocationCache;
  }

  async function saveCloudDefaultLocation(defaultLocation) {
    if (!configured) throw new Error("Firebase não está configurado em js/firebase-config.js.");
    if (!state.user) throw new Error("Faça login com Google/Gmail ou email na página /login antes de salvar a Default Location no Firebase.");
    const clean = normalizeText(defaultLocation);
    if (!clean) throw new Error("Default location is required.");
    await firestoreRestRequest("PATCH", userPath(), {
      defaultLocation: clean,
      default_location: clean,
      updated_at: now(),
      owner_uid: state.user.uid,
      owner_email: state.user.email || "",
    }, 6500);
    cloudDefaultLocationCache = clean;
    return clean;
  }

  async function saveCloudSettings(body) {
    if (!configured) throw new Error("Firebase não está configurado em js/firebase-config.js.");
    if (!state.user) throw new Error("Faça login com Google/Gmail ou email na página /login antes de salvar no Firebase.");
    const id = body.id || makeId();
    const parsedSettings = safeJson(body.settings_json || "{}", {});
    const item = {
      id,
      settings_name: body.settingsName || body.settings_name || "Settings",
      settings_json: body.settings_json || "{}",
      birthChart: body.birthChart || parsedSettings.birthChart || parsedSettings.accountState?.birthChart || null,
      defaultLocation: body.defaultLocation || parsedSettings.defaultLocation || parsedSettings.accountState?.defaultLocation || "",
      created_at: body.created_at || now(),
      updated_at: now(),
      owner_uid: state.user.uid,
      owner_email: state.user.email || "",
    };
    await firestoreRestRequest("PATCH", settingsPath(id), item, 6500);
    cloudSettingsCache = upsertCached(cloudSettingsCache, item);
    return item;
  }

  async function deleteCloudSettings(body) {
    if (!state.user || !body.id) return;
    await firestoreRestRequest("DELETE", settingsPath(String(body.id)), null, 6500);
    cloudSettingsCache = removeCached(cloudSettingsCache, body.id);
  }

  async function touchCloudSettings(body) {
    if (!state.user || !body.id) return;
    const updated_at = now();
    await firestoreRestRequest("PATCH", settingsPath(String(body.id)), { updated_at }, 5000);
    cloudSettingsCache = upsertCached(cloudSettingsCache, { ...(cloudSettingsCache.find((s) => String(s.id) === String(body.id)) || { id: String(body.id) }), updated_at });
  }

  async function syncLocalSettingsToCloud() {
    if (!state.user) throw new Error("Faça login com Google/Gmail ou email na página /login antes de sincronizar.");
    const localItems = getLocalSettings();
    for (const item of localItems) {
      await saveCloudSettings({
        id: item.id,
        settingsName: item.settings_name || item.settingsName || "Settings",
        settings_json: item.settings_json || "{}",
        birthChart: item.birthChart || null,
        defaultLocation: item.defaultLocation || "",
        created_at: item.created_at || now(),
      });
    }
    return getCloudSettings();
  }

  const originalFetch = window.fetch.bind(window);
  window.fetch = async function patchedFetch(input, init) {
    const url = typeof input === "string" ? input : input && input.url;
    const path = url ? new URL(url, window.location.href).pathname : "";
    const method = String((init && init.method) || "GET").toUpperCase();

    const headers = new Headers((init && init.headers) || {});
    const bypassCloud = headers.get("X-TrueSky-Settings-Target") === "local";
    const cloudEndpoints = [
      "/recent-settings", "/save-settings", "/delete-settings", "/update-settings-timestamp",
      "/recent-charts", "/search-charts", "/save-chart", "/delete-chart", "/update-chart-timestamp",
      "/export-charts", "/import-charts", "/api/default-location", "/save-default-location",
    ];
    const isCloudEndpoint = cloudEndpoints.includes(path);
    if (bypassCloud || !isCloudEndpoint) {
      return originalFetch(input, init);
    }

    await waitForAuthReady(2500);
    if (state.auth?.currentUser && !state.user) state.user = state.auth.currentUser;
    if (!state.configured || !state.user) {
      // On Firebase Hosting there is no Express backend for these routes. Return
      // a fast JSON error instead of letting the request hang or become an HTML 404.
      return new Response(JSON.stringify({
        success: false,
        error: !state.configured
          ? "Firebase não está configurado em js/firebase-config.js."
          : "Faça login com Google/Gmail ou email na página /login antes de usar o Firebase.",
      }), { headers: { "Content-Type": "application/json" } });
    }

    try {
      const body = init && init.body ? safeJson(init.body, {}) : {};
      if (path === "/recent-settings" && method === "GET") {
        const recentSettings = await withCloudTimeout(getCloudSettings(), 12000, "Carregar settings do Firebase");
        return new Response(JSON.stringify({ success: true, recentSettings }), { headers: { "Content-Type": "application/json" } });
      }
      if (path === "/save-settings" && method === "POST") {
        const item = await saveCloudSettings(body);
        return new Response(JSON.stringify({ success: true, item, recentSettings: recent(cloudSettingsCache) }), { headers: { "Content-Type": "application/json" } });
      }
      if (path === "/delete-settings" && method === "POST") {
        await deleteCloudSettings(body);
        return new Response(JSON.stringify({ success: true, recentSettings: recent(cloudSettingsCache) }), { headers: { "Content-Type": "application/json" } });
      }
      if (path === "/update-settings-timestamp" && method === "POST") {
        await touchCloudSettings(body);
        return new Response(JSON.stringify({ success: true, recentSettings: recent(cloudSettingsCache) }), { headers: { "Content-Type": "application/json" } });
      }
      if (path === "/recent-charts" && method === "GET") {
        const recentCharts = await withCloudTimeout(getCloudCharts(), 12000, "Carregar Birth Charts do Firebase");
        return new Response(JSON.stringify({ success: true, recentCharts }), { headers: { "Content-Type": "application/json" } });
      }
      if (path === "/search-charts" && method === "GET") {
        const urlObj = new URL(url, window.location.href);
        const recentCharts = await withCloudTimeout(searchCloudCharts(urlObj.searchParams.get("query") || ""), 12000, "Buscar Birth Charts no Firebase");
        return new Response(JSON.stringify({ success: true, recentCharts }), { headers: { "Content-Type": "application/json" } });
      }
      if (path === "/save-chart" && method === "POST") {
        const item = await saveCloudChart(body);
        return new Response(JSON.stringify({ success: true, item, recentCharts: recent(cloudChartsCache) }), { headers: { "Content-Type": "application/json" } });
      }
      if (path === "/delete-chart" && method === "POST") {
        await deleteCloudChart(body);
        return new Response(JSON.stringify({ success: true, recentCharts: recent(cloudChartsCache) }), { headers: { "Content-Type": "application/json" } });
      }
      if (path === "/update-chart-timestamp" && method === "POST") {
        await touchCloudChart(body);
        return new Response(JSON.stringify({ success: true, recentCharts: recent(cloudChartsCache) }), { headers: { "Content-Type": "application/json" } });
      }
      if (path === "/export-charts" && method === "GET") {
        const recentCharts = await withCloudTimeout(getCloudCharts(), 12000, "Carregar Birth Charts do Firebase");
        return new Response(JSON.stringify(recentCharts), { headers: { "Content-Type": "application/json" } });
      }
      if (path === "/import-charts" && method === "POST") {
        const incoming = Array.isArray(body) ? body : (body.charts || body.recentCharts || []);
        const recentCharts = await withCloudTimeout(importCloudCharts(incoming), 12000, "Importar Birth Charts no Firebase");
        return new Response(JSON.stringify({ success: true, recentCharts }), { headers: { "Content-Type": "application/json" } });
      }
      if (path === "/api/default-location" && method === "GET") {
        const defaultLocation = await withCloudTimeout(getCloudDefaultLocation(), 12000, "Carregar Default Location do Firebase");
        return new Response(JSON.stringify({ success: true, defaultLocation }), { headers: { "Content-Type": "application/json" } });
      }
      if (path === "/save-default-location" && method === "POST") {
        const defaultLocation = await withCloudTimeout(saveCloudDefaultLocation(body.defaultLocation || body.default_location || ""), 12000, "Salvar Default Location no Firebase");
        return new Response(JSON.stringify({ success: true, defaultLocation }), { headers: { "Content-Type": "application/json" } });
      }
    } catch (err) {
      return new Response(JSON.stringify({ success: false, error: err.message || "Erro no Firebase." }), { headers: { "Content-Type": "application/json" } });
    }

    return originalFetch(input, init);
  };

  function ensureCloudStatusBox() {
    let box = document.getElementById("firebaseCloudStatusBox");
    if (box) return box;

    const settingsForm = document.querySelector(".settings-form");
    if (!settingsForm) return null;

    box = document.createElement("section");
    box.id = "firebaseCloudStatusBox";
    box.className = "firebase-auth-box";
    box.innerHTML = `
      <p class="firebase-auth-title">Firebase Settings</p>
      <p class="firebase-auth-status">Verificando login Firebase...</p>
      <p class="firebase-auth-message" aria-live="polite"></p>
      <button type="button" id="firebaseGoLoginBtn" class="calculate">Login Firebase</button>
    `;
    settingsForm.parentNode.insertBefore(box, settingsForm);

    const loginBtn = box.querySelector("#firebaseGoLoginBtn");
    if (loginBtn) {
      loginBtn.addEventListener("click", () => {
        const next = encodeURIComponent(location.pathname + location.search + location.hash);
        location.href = `/login?next=${next}`;
      });
    }
    return box;
  }

  function renderAuthState() {
    const box = ensureCloudStatusBox();
    if (!box) return;
    const status = box.querySelector(".firebase-auth-status");
    const loginBtn = box.querySelector("#firebaseGoLoginBtn");

    if (!firebaseAvailable) {
      status.textContent = "Firebase não carregou. Confira os scripts do Firebase.";
      if (loginBtn) loginBtn.style.display = "none";
      return;
    }
    if (!configured) {
      status.textContent = "Cole sua configuração real em js/firebase-config.js para ativar Google/Gmail, email/senha e Firestore.";
      if (loginBtn) loginBtn.style.display = "none";
      return;
    }
    if (state.user) {
      status.textContent = `Conectado no Firebase: ${state.user.email || state.user.displayName || state.user.uid}`;
      if (loginBtn) loginBtn.style.display = "none";
    } else {
      status.textContent = "Não conectado. Para salvar Settings no Firebase, entre com Google/Gmail ou email na página de login.";
      if (loginBtn) loginBtn.style.display = "inline-block";
    }
  }

  function init() {
    ensureCloudStatusBox();
    if (!firebaseAvailable || !configured) {
      state.ready = true;
      renderAuthState();
      return;
    }

    try {
      if (!window.firebase.apps.length) window.firebase.initializeApp(cfg);
      state.auth = window.firebase.auth();
      try {
        state.db = window.firebase.firestore();
        try {
          // Safer in browsers/networks where Firestore WebChannel hangs, and it
          // prevents writes from failing because an optional field is undefined.
          state.db.settings({ experimentalForceLongPolling: true, ignoreUndefinedProperties: true });
        } catch (_) {}
      } catch (firestoreErr) {
        // Auth is enough for the REST Firestore path below. Do not disable cloud
        // saves just because the compat Firestore SDK failed to initialize.
        state.db = null;
        console.warn("Firestore SDK unavailable; using REST Firestore fallback:", firestoreErr);
      }
      state.auth.onAuthStateChanged(async (user) => {
        state.user = user || null;
        state.ready = true;
        renderAuthState();
        if (user && typeof window.fetchRecentSettings === "function") {
          try { window.fetchRecentSettings(); } catch {}
        }
        if (user && typeof window.fetchRecentCharts === "function") {
          try { window.fetchRecentCharts(); } catch {}
        }
        if (user) {
          try {
            window.dispatchEvent(new CustomEvent("truesky-firebase-ready", { detail: { user } }));
          } catch (_) {}
        }
      });
    } catch (err) {
      state.ready = true;
      setSettingsMessage(err.message || "Erro ao iniciar Firebase.", true);
      renderAuthState();
    }
  }

  function waitForAuthReady(timeoutMs = 8000) {
    if (state.ready) return Promise.resolve(state.user);
    return new Promise((resolve) => {
      const started = Date.now();
      const timer = setInterval(() => {
        if (state.ready || Date.now() - started >= timeoutMs) {
          clearInterval(timer);
          resolve(state.user);
        }
      }, 50);
    });
  }

  async function saveCurrentSettingsToCloud(settingsName, settingsData) {
    if (!state.configured) throw new Error("Firebase não está configurado em js/firebase-config.js.");
    await waitForAuthReady();
    if (!state.user) {
      const authUser = state.auth && state.auth.currentUser;
      if (authUser) {
        state.user = authUser;
        renderAuthState();
      }
    }
    if (!state.user) throw new Error("Faça login com Google/Gmail ou email na página /login antes de salvar no Firebase.");
    const data = settingsData || {};
    const accountState = data.accountState || {};
    const birthChart = data.birthChart || accountState.birthChart || null;
    const defaultLocation = data.defaultLocation || accountState.defaultLocation || "";

    const item = await saveCloudSettings({
      settingsName: settingsName || "Settings",
      settings_json: JSON.stringify(data),
      birthChart,
      defaultLocation,
    });

    // Save the account-level data separately too, so Save Settings to Firebase
    // restores the actual Birth Chart list and Default Location, not only a JSON blob.
    const extraWrites = [];
    if (birthChart) extraWrites.push(saveCloudChart({ ...birthChart, natalData: birthChart }));
    if (defaultLocation) extraWrites.push(saveCloudDefaultLocation(defaultLocation));
    if (extraWrites.length) await Promise.all(extraWrites);

    return {
      item,
      recentSettings: recent(cloudSettingsCache),
      recentCharts: recent(cloudChartsCache),
      defaultLocation: cloudDefaultLocationCache || defaultLocation,
    };
  }

  window.TrueSkyCloud = {
    state,
    getCloudSettings,
    saveCloudSettings,
    getCloudCharts,
    saveCloudChart,
    searchCloudCharts,
    getCloudDefaultLocation,
    saveCloudDefaultLocation,
    syncLocalSettingsToCloud,
    saveCurrentSettingsToCloud,
    waitForAuthReady,
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
