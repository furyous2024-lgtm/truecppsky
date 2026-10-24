(function () {
  "use strict";

  const COLLECTION_NAME = "birthCharts";
  const MAX_CHARTS = 5000;
  const controllers = new Map();

  function services() {
    const firebase = window.firebase;
    const config = window.TRUESKY_FIREBASE_CONFIG || {};
    if (!firebase || typeof firebase.auth !== "function" || typeof firebase.firestore !== "function") {
      throw new Error("Firebase Authentication/Firestore não foi carregado nesta página.");
    }
    if (!firebase.apps || !firebase.apps.length) {
      if (!config.apiKey || !config.projectId || !config.appId) {
        throw new Error("A configuração do Firebase está incompleta em js/firebase-config.js.");
      }
      firebase.initializeApp(config);
    }
    return { firebase, auth: firebase.auth(), db: firebase.firestore() };
  }

  function requireUser(timeoutMs = 12000) {
    const { auth } = services();
    if (auth.currentUser) return Promise.resolve(auth.currentUser);

    return new Promise((resolve, reject) => {
      let done = false;
      let unsubscribe = null;
      const timeout = setTimeout(() => finish(null, new Error("Sua sessão Firebase não foi encontrada. Entre novamente na sua conta.")), timeoutMs);

      function finish(user, error) {
        if (done) return;
        done = true;
        clearTimeout(timeout);
        try { if (unsubscribe) unsubscribe(); } catch (_) {}
        if (error) reject(error);
        else if (user) resolve(user);
        else reject(new Error("Entre na sua conta para salvar e consultar seus mapas natais no Firebase."));
      }

      try {
        unsubscribe = auth.onAuthStateChanged((user) => {
          if (user) finish(user);
          else finish(null, new Error("Você saiu da conta. Entre novamente para acessar seus mapas natais."));
        }, (error) => finish(null, error));
      } catch (error) {
        finish(null, error);
      }
    });
  }

  async function collectionForUser() {
    const { db } = services();
    const user = await requireUser();
    return { user, collection: db.collection("users").doc(user.uid).collection(COLLECTION_NAME) };
  }

  function cleanText(value) {
    return String(value == null ? "" : value).trim();
  }

  function normalizeText(value) {
    return cleanText(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ");
  }

  function normalizeMonth(value) {
    const month = normalizeText(value);
    const aliases = {
      january: "1", jan: "1", february: "2", feb: "2", march: "3", mar: "3",
      april: "4", apr: "4", may: "5", june: "6", jun: "6", july: "7", jul: "7",
      august: "8", aug: "8", september: "9", sep: "9", sept: "9", october: "10", oct: "10",
      november: "11", nov: "11", december: "12", dec: "12"
    };
    if (aliases[month]) return aliases[month];
    const n = Number(month);
    return Number.isFinite(n) && n >= 1 && n <= 12 ? String(Math.trunc(n)) : month;
  }

  function chartKey(chart) {
    return [
      normalizeText(chart.name),
      cleanText(chart.year),
      normalizeMonth(chart.month),
      cleanText(chart.day),
      cleanText(chart.hour),
      cleanText(chart.minute).padStart(2, "0"),
      normalizeText(chart.location)
    ].join("|");
  }

  function timestampMillis(value) {
    if (value && typeof value.toMillis === "function") return value.toMillis();
    if (value && typeof value.toDate === "function") return value.toDate().getTime();
    if (typeof value === "number") return value;
    const parsed = Date.parse(value || "");
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function timestampIso(value) {
    if (value && typeof value.toDate === "function") return value.toDate().toISOString();
    if (typeof value === "string") return value;
    if (typeof value === "number" && Number.isFinite(value)) return new Date(value).toISOString();
    return "";
  }

  function toChart(doc) {
    const data = doc.data() || {};
    return {
      id: doc.id,
      uid: data.uid || "",
      name: cleanText(data.name),
      year: data.year == null ? "" : data.year,
      month: data.month == null ? "" : data.month,
      day: data.day == null ? "" : data.day,
      hour: data.hour == null ? "" : data.hour,
      minute: data.minute == null ? "0" : data.minute,
      lat: data.lat == null ? null : data.lat,
      long: data.long == null ? null : data.long,
      utc: data.utc == null ? (data.utcOffset == null ? null : data.utcOffset) : data.utc,
      location: cleanText(data.location),
      created_at: timestampIso(data.createdAt || data.created_at),
      updated_at: timestampIso(data.updatedAt || data.updated_at),
      createdAt: timestampIso(data.createdAt || data.created_at),
      updatedAt: timestampIso(data.updatedAt || data.updated_at)
    };
  }

  async function readAll() {
    const { collection } = await collectionForUser();
    const snapshot = await collection.get();
    const charts = snapshot.docs.map(toChart);
    charts.sort((a, b) => timestampMillis(b.updatedAt || b.updated_at) - timestampMillis(a.updatedAt || a.updated_at));
    return charts.slice(0, MAX_CHARTS);
  }

  function filterCharts(charts, query) {
    const q = normalizeText(query);
    if (!q) return charts.slice();
    return charts.filter((chart) => normalizeText([
      chart.name, chart.year, chart.month, chart.day, chart.hour, chart.minute,
      chart.location, chart.lat, chart.long, chart.utc
    ].join(" ")).includes(q));
  }

  async function list(query = "") {
    return filterCharts(await readAll(), query);
  }

  async function save(chartInput) {
    if (!chartInput || typeof chartInput !== "object") {
      throw new Error("Calcule o mapa natal antes de salvar.");
    }
    const chart = {
      name: cleanText(chartInput.name),
      year: chartInput.year == null ? "" : chartInput.year,
      month: chartInput.month == null ? "" : chartInput.month,
      day: chartInput.day == null ? "" : chartInput.day,
      hour: chartInput.hour == null ? "" : chartInput.hour,
      minute: chartInput.minute == null ? "0" : chartInput.minute,
      lat: chartInput.lat == null ? null : chartInput.lat,
      long: chartInput.long == null ? null : chartInput.long,
      utc: chartInput.utc == null ? (chartInput.utcOffset == null ? null : chartInput.utcOffset) : chartInput.utc,
      location: cleanText(chartInput.location)
    };
    if (!chart.year || !chart.month || !chart.day || chart.hour === "" || chart.minute === "") {
      throw new Error("Os dados de nascimento estão incompletos. Calcule o mapa e tente salvar novamente.");
    }

    const { firebase, user, collection } = await (async () => {
      const result = await collectionForUser();
      return { firebase: services().firebase, user: result.user, collection: result.collection };
    })();

    const currentCharts = await readAll();
    const key = chartKey(chart);
    if (currentCharts.some((existing) => chartKey(existing) === key)) {
      const error = new Error("Chart already exists in database.");
      error.code = "chart/already-exists";
      throw error;
    }
    if (currentCharts.length >= MAX_CHARTS) {
      const error = new Error("Chart limit reached. Maximum allowed charts is 5000.");
      error.code = "chart/limit-reached";
      throw error;
    }

    const ref = collection.doc();
    const timestamp = firebase.firestore.FieldValue.serverTimestamp();
    await ref.set({
      ...chart,
      uid: user.uid,
      chartKey: key,
      schemaVersion: 1,
      createdAt: timestamp,
      updatedAt: timestamp
    });
    return { success: true, recentCharts: await list() };
  }

  async function touch(id) {
    const { collection } = await collectionForUser();
    const { firebase } = services();
    const ref = collection.doc(String(id));
    const snapshot = await ref.get();
    if (!snapshot.exists) throw new Error("Este mapa natal não foi encontrado na sua conta Firebase.");
    await ref.set({ updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
    return { success: true, recentCharts: await list() };
  }

  async function remove(id) {
    const { collection } = await collectionForUser();
    await collection.doc(String(id)).delete();
    return { success: true, recentCharts: await list() };
  }

  function errorMessage(error) {
    if (!error) return "Não foi possível concluir a operação no Firebase.";
    if (error.code === "permission-denied" || error.code === "firestore/permission-denied") {
      return "O Firestore recusou o acesso. Verifique se as regras permitem que cada usuário acesse users/{uid}/birthCharts.";
    }
    if (error.code === "unavailable" || error.code === "firestore/unavailable" || error.code === "auth/network-request-failed") {
      return "Firebase indisponível. Verifique sua conexão e tente novamente.";
    }
    return error.message || "Não foi possível concluir a operação no Firebase.";
  }

  function showMessage(selector, message, delay = 6000) {
    const element = document.querySelector(selector);
    if (!element) return;
    element.textContent = message || "";
    if (element._trueSkyClearTimer) clearTimeout(element._trueSkyClearTimer);
    if (message) {
      element._trueSkyClearTimer = setTimeout(() => {
        if (element.textContent === message) element.textContent = "";
      }, delay);
    }
  }

  function setOverlay(visible) {
    const overlay = document.getElementById("loading-overlay");
    if (overlay) overlay.style.display = visible ? "block" : "none";
  }

  function broadcast(charts) {
    document.dispatchEvent(new CustomEvent("chartsUpdated", { detail: { charts } }));
  }

  function renderList(options, charts) {
    const listElement = document.getElementById(options.listId);
    if (!listElement) return;
    listElement.innerHTML = "";
    const state = controllers.get(options.listId);
    if (state) state.deleteConfirmation.clear();

    charts.forEach((chart) => {
      const item = document.createElement("li");
      const chartText = document.createElement("span");
      const paddedMinute = String(chart.minute == null ? 0 : chart.minute).padStart(2, "0");
      chartText.textContent = `${chart.name} ${chart.day} ${chart.month} ${chart.year} ${chart.hour}:${paddedMinute} ${chart.location}`;
      chartText.style.cursor = "pointer";
      chartText.addEventListener("click", async () => {
        setOverlay(true);
        try {
          const result = await touch(chart.id);
          const currentCharts = result.recentCharts || [];
          const fieldValues = {
            Name: chart.name,
            Day: chart.day,
            Month: chart.month,
            Year: chart.year,
            Hour: chart.hour,
            Minute: String(chart.minute == null ? 0 : chart.minute).padStart(2, "0"),
            Location: chart.location
          };
          Object.entries(fieldValues).forEach(([suffix, value]) => {
            const field = document.getElementById(options.formPrefix + suffix);
            if (field) field.value = value == null ? "" : value;
          });
          const search = document.getElementById(options.searchInputId);
          if (search) search.value = "";
          renderList(options, currentCharts);
          broadcast(currentCharts);
          const calculateButton = document.getElementById(options.calculateButtonId);
          if (calculateButton) calculateButton.click();
        } catch (error) {
          showMessage(options.messageSelector, errorMessage(error));
          console.error("Erro ao carregar mapa natal salvo no Firebase:", error);
        } finally {
          setOverlay(false);
        }
      });

      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.textContent = "X";
      deleteButton.className = "deleteChartButton";
      deleteButton.setAttribute("aria-label", "Excluir mapa natal salvo");
      deleteButton.addEventListener("mousedown", (event) => event.preventDefault());
      deleteButton.addEventListener("click", async (event) => {
        event.stopPropagation();
        const currentState = controllers.get(options.listId);
        if (currentState.deleteConfirmation.get(chart.id)) {
          currentState.deleteConfirmation.delete(chart.id);
          setOverlay(true);
          try {
            const result = await remove(chart.id);
            const allCharts = result.recentCharts || [];
            const search = document.getElementById(options.searchInputId);
            const visibleCharts = filterCharts(allCharts, search ? search.value : "");
            renderList(options, visibleCharts);
            broadcast(allCharts);
            showMessage(options.messageSelector, "");
          } catch (error) {
            showMessage(options.messageSelector, errorMessage(error));
            console.error("Erro ao excluir mapa natal do Firebase:", error);
          } finally {
            setOverlay(false);
          }
        } else {
          deleteButton.textContent = "✓";
          deleteButton.style.height = "29px";
          deleteButton.style.width = "30px";
          currentState.deleteConfirmation.set(chart.id, true);
          setTimeout(() => {
            if (currentState.deleteConfirmation.get(chart.id)) {
              deleteButton.textContent = "X";
              deleteButton.style.height = "";
              deleteButton.style.width = "";
              currentState.deleteConfirmation.delete(chart.id);
            }
          }, 5000);
        }
      });
      item.appendChild(chartText);
      item.appendChild(deleteButton);
      listElement.appendChild(item);
    });
  }

  async function refresh(options, query = "", broadcastAll = false) {
    try {
      const charts = await list(query);
      renderList(options, charts);
      if (broadcastAll) broadcast(await list());
      return charts;
    } catch (error) {
      showMessage(options.messageSelector, errorMessage(error));
      console.error("Erro ao consultar mapas natais no Firebase:", error);
      return [];
    }
  }

  function attachUI(options) {
    if (!options || !options.listId || controllers.has(options.listId)) return;
    controllers.set(options.listId, { deleteConfirmation: new Map() });

    const saveButton = document.getElementById(options.saveButtonId);
    if (saveButton) {
      saveButton.addEventListener("click", async () => {
        setOverlay(true);
        try {
          let data;
          try { data = JSON.parse(localStorage.getItem(options.dataStorageKey) || "null"); }
          catch (_) { data = null; }
          if (!data) throw new Error("Calcule o mapa antes de salvar.");
          const chart = {
            name: data.name,
            year: data.year,
            month: data.month,
            day: data.day,
            hour: data.hour,
            minute: data.minute,
            lat: data.lat,
            long: data.long,
            utc: data.utcOffset,
            location: data.location
          };
          const result = await save(chart);
          renderList(options, result.recentCharts || []);
          broadcast(result.recentCharts || []);
          showMessage(options.messageSelector, options.saveButtonId === "synastrySave" ? "Mapa salvo no Firebase com sucesso." : "Mapa natal salvo no Firebase com sucesso.");
        } catch (error) {
          showMessage(options.messageSelector, errorMessage(error));
          console.error("Erro ao salvar mapa natal no Firebase:", error);
        } finally {
          setOverlay(false);
        }
      });
    }

    const searchInput = document.getElementById(options.searchInputId);
    if (searchInput) {
      searchInput.addEventListener("input", () => refresh(options, searchInput.value.trim()));
      searchInput.addEventListener("focus", () => refresh(options, searchInput.value.trim()));
      searchInput.addEventListener("blur", () => {
        setTimeout(() => {
          if (!searchInput.value.trim()) refresh(options, "");
        }, 100);
      });
    }

    document.addEventListener("chartsUpdated", (event) => {
      const charts = event.detail && Array.isArray(event.detail.charts) ? event.detail.charts : null;
      if (!charts) return;
      const input = document.getElementById(options.searchInputId);
      renderList(options, filterCharts(charts, input ? input.value : ""));
    });

    refresh(options);
  }

  window.TrueSkyFirebaseCharts = Object.freeze({
    list,
    save,
    touch,
    remove,
    attachUI,
    errorMessage
  });
})();
