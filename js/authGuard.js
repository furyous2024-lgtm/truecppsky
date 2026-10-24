(function () {
  "use strict";

  const MANUAL_KEY = "TRUESKY_MANUAL_LOGIN_OK";
  const MANUAL_UNTIL_KEY = "TRUESKY_MANUAL_LOGIN_UNTIL";
  const PENDING_KEY = "TRUESKY_AUTH_REDIRECT_PENDING";
  const PENDING_TIME_KEY = "TRUESKY_AUTH_PENDING_TIME";
  const EMAIL_KEY = "TRUESKY_LOGIN_EMAIL";
  const LOGIN_PATH = "/login";
  const PENDING_MAX_MS = 10 * 60 * 1000;
  const MANUAL_MAX_MS = 30 * 24 * 60 * 60 * 1000;
  const pathname = window.location.pathname || "/";
  const isLoginPage = /(^|\/)login(?:\.html)?$/i.test(pathname) || pathname.endsWith("/login");
  let resolved = false;

  function get(store, key) {
    try { return store.getItem(key); } catch (_) { return null; }
  }

  function set(store, key, value) {
    try { store.setItem(key, value); } catch (_) {}
  }

  function remove(store, key) {
    try { store.removeItem(key); } catch (_) {}
  }

  function revealPage() {
    resolved = true;
    document.documentElement.classList.remove("truesky-auth-loading");
  }

  function goLogin() {
    resolved = true;
    if (isLoginPage) {
      revealPage();
      return;
    }
    const next = pathname + window.location.search + window.location.hash;
    window.location.replace(LOGIN_PATH + (next && next !== "/" ? "?next=" + encodeURIComponent(next) : ""));
  }

  function clearPending() {
    remove(sessionStorage, PENDING_KEY);
    remove(sessionStorage, PENDING_TIME_KEY);
    remove(localStorage, PENDING_KEY);
    remove(localStorage, PENDING_TIME_KEY);
    remove(sessionStorage, "TRUESKY_GOOGLE_REDIRECT_PENDING");
    remove(localStorage, "TRUESKY_GOOGLE_REDIRECT_PENDING");
  }

  function pendingIsRecent() {
    const raw = get(sessionStorage, PENDING_TIME_KEY) || get(localStorage, PENDING_TIME_KEY) || "0";
    const flag = get(sessionStorage, PENDING_KEY) === "1" || get(localStorage, PENDING_KEY) === "1";
    return flag && (Date.now() - Number(raw) < PENDING_MAX_MS);
  }

  function manualIsRecent() {
    if (get(sessionStorage, MANUAL_KEY) === "1") return true;
    const until = Number(get(localStorage, MANUAL_UNTIL_KEY) || "0");
    return until > Date.now();
  }

  function setManualLogin(user) {
    set(sessionStorage, MANUAL_KEY, "1");
    set(localStorage, MANUAL_UNTIL_KEY, String(Date.now() + MANUAL_MAX_MS));
    if (user && (user.email || user.displayName)) set(sessionStorage, EMAIL_KEY, user.email || user.displayName);
  }

  function clearManualLogin() {
    remove(sessionStorage, MANUAL_KEY);
    remove(sessionStorage, EMAIL_KEY);
    remove(localStorage, MANUAL_UNTIL_KEY);
    clearPending();
  }


  function applyUserToPage(user) {
    if (!user || !document.body) return;
    const displayName = user.displayName || (user.email ? user.email.split("@")[0] : "User");
    const photoURL = user.photoURL || "/images/misc/anonymouse.png";
    window.user = Object.assign({}, window.user || {}, {
      id: user.uid,
      uid: user.uid,
      email: user.email || null,
      display_name: displayName,
      profile_image: photoURL,
      photoURL: photoURL,
      community_role: (window.user && window.user.community_role) || "user",
      subscription_status: (window.user && window.user.subscription_status) || "free"
    });
    window.currentUser = displayName;
    document.body.setAttribute("data-user-id", user.uid);
    document.body.setAttribute("data-current-user", displayName);
    document.body.setAttribute("data-user-role", window.user.community_role || "user");
    const info = document.getElementById("user-info");
    if (info) {
      const img = info.querySelector("img");
      const span = info.querySelector("span");
      if (img) img.src = photoURL;
      if (span) span.textContent = displayName;
    }
  }

  function waitForUser(auth, timeoutMs) {
    return new Promise((resolve) => {
      if (auth.currentUser) return resolve(auth.currentUser);
      let done = false;
      let unsubscribe = null;
      const timeout = setTimeout(() => finish(null), timeoutMs || 5000);
      function finish(user) {
        if (done) return;
        done = true;
        clearTimeout(timeout);
        try { unsubscribe && unsubscribe(); } catch (_) {}
        resolve(user || auth.currentUser || null);
      }
      try {
        unsubscribe = auth.onAuthStateChanged((user) => {
          if (user) finish(user);
        });
      } catch (_) {
        finish(null);
      }
    });
  }

  window.TrueSkyAuth = window.TrueSkyAuth || {};
  window.TrueSkyAuth.hasManualLogin = manualIsRecent;
  window.TrueSkyAuth.goToLogin = goLogin;
  window.TrueSkyAuth.setManualLogin = setManualLogin;
  window.TrueSkyAuth.clearManualLogin = clearManualLogin;

  // Nunca deixa a página ficar branca para sempre.
  // Se o Firebase já tiver uma sessão real, libera; caso contrário volta ao login.
  setTimeout(() => {
    if (resolved) return;
    if (isLoginPage) {
      revealPage();
      return;
    }
    try {
      const current = window.firebase && window.firebase.auth && window.firebase.auth().currentUser;
      if (current) {
        setManualLogin(current);
        clearPending();
        revealPage();
        return;
      }
    } catch (_) {}
    goLogin();
  }, 9000);

  const cfg = window.TRUESKY_FIREBASE_CONFIG || {};
  const required = ["apiKey", "authDomain", "projectId", "appId"];
  const configured = required.every((key) => {
    const value = String(cfg[key] || "");
    return value && !value.includes("COLE_") && !value.includes("SEU_PROJECT_ID") && !value.includes("SEU_PROJETO") && !value.includes("AQUI");
  });

  if (!configured || typeof window.firebase === "undefined") {
    if (!isLoginPage) goLogin();
    else revealPage();
    return;
  }

  try {
    if (!window.firebase.apps.length) window.firebase.initializeApp(cfg);
    const auth = window.firebase.auth();
    auth.setPersistence(window.firebase.auth.Auth.Persistence.LOCAL).catch(() => {});

    window.TrueSkyAuth.auth = auth;
    window.TrueSkyAuth.currentUser = null;
    window.TrueSkyAuth.signOut = async function () {
      clearManualLogin();
      try { await auth.signOut(); } catch (_) {}
      window.TrueSkyAuth.currentUser = null;
      window.location.replace(LOGIN_PATH);
    };

    function allow(user) {
      setManualLogin(user);
      clearPending();
      window.TrueSkyAuth.currentUser = user || auth.currentUser || null;
      applyUserToPage(window.TrueSkyAuth.currentUser);
      revealPage();
      window.dispatchEvent(new CustomEvent("truesky-auth-changed", { detail: { user: window.TrueSkyAuth.currentUser } }));
    }

    let firstAuthEvent = true;
    auth.onAuthStateChanged(async (user) => {
      if (resolved && !isLoginPage) return;

      const manual = manualIsRecent();
      const pending = pendingIsRecent();

      if (user) {
        // Firebase confirmou uma sessão real: entra direto na página inicial.
        allow(user);
        return;
      }

      if (!user && (manual || pending)) {
        const recovered = await waitForUser(auth, firstAuthEvent ? 7000 : 3000);
        if (recovered) {
          allow(recovered);
          return;
        }
      }

      window.TrueSkyAuth.currentUser = null;
      if (isLoginPage) revealPage();
      else {
        clearManualLogin();
        goLogin();
      }
      firstAuthEvent = false;
    });
  } catch (err) {
    console.warn("Firebase auth guard error:", err);
    if (!isLoginPage) goLogin();
    else revealPage();
  }
})();
