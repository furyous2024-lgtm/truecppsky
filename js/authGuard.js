(function () {
  "use strict";

  const MANUAL_KEY = "TRUESKY_MANUAL_LOGIN_OK";
  const MANUAL_UNTIL_KEY = "TRUESKY_MANUAL_LOGIN_UNTIL";
  const PENDING_KEY = "TRUESKY_AUTH_REDIRECT_PENDING";
  const PENDING_TIME_KEY = "TRUESKY_AUTH_PENDING_TIME";
  const EMAIL_KEY = "TRUESKY_LOGIN_EMAIL";
  const BOUNCE_KEY = "TRUESKY_AUTH_GUARD_BOUNCE_AT";
  const LOGIN_PATH = "/login";
  const PENDING_MAX_MS = 10 * 60 * 1000;
  const MANUAL_MAX_MS = 30 * 24 * 60 * 60 * 1000;
  const BOUNCE_MAX_MS = 60 * 1000;
  const STARTUP_WATCHDOG_MS = 25000;
  const pathname = window.location.pathname || "/";
  const isLoginPage = /(^|\/)login(?:\.html)?$/i.test(pathname) || pathname.endsWith("/login");
  let resolved = false;
  let redirecting = false;
  let watchdogTimer = null;

  function get(store, key) {
    try { return store.getItem(key); } catch (_) { return null; }
  }
  function set(store, key, value) {
    try { store.setItem(key, value); } catch (_) {}
  }
  function remove(store, key) {
    try { store.removeItem(key); } catch (_) {}
  }
  function clearWatchdog() {
    if (watchdogTimer !== null) clearTimeout(watchdogTimer);
    watchdogTimer = null;
  }
  function clearBounceMarker() {
    remove(sessionStorage, BOUNCE_KEY);
    remove(localStorage, BOUNCE_KEY);
  }
  function markBounceMarker() {
    const stamp = String(Date.now());
    set(sessionStorage, BOUNCE_KEY, stamp);
    set(localStorage, BOUNCE_KEY, stamp);
  }
  function isRecentBounce() {
    const raw = get(sessionStorage, BOUNCE_KEY) || get(localStorage, BOUNCE_KEY) || "0";
    const stamp = Number(raw);
    return Number.isFinite(stamp) && stamp > 0 && Date.now() - stamp >= 0 && Date.now() - stamp < BOUNCE_MAX_MS;
  }

  function revealPage() {
    if (resolved) return;
    resolved = true;
    clearWatchdog();
    document.documentElement.classList.remove("truesky-auth-loading");
  }

  function goLogin() {
    if (resolved || redirecting) return;
    if (isLoginPage) {
      revealPage();
      return;
    }
    redirecting = true;
    resolved = true;
    clearWatchdog();
    // This marker stops the login page from automatically bouncing back if
    // the main page cannot validate this same Firebase session.
    markBounceMarker();
    const next = pathname + window.location.search + window.location.hash;
    const target = LOGIN_PATH + (next && next !== "/" ? "?next=" + encodeURIComponent(next) : "");
    if (target !== window.location.pathname + window.location.search) {
      window.location.replace(target);
    }
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
    const age = Date.now() - Number(raw);
    return flag && Number.isFinite(age) && age >= 0 && age < PENDING_MAX_MS;
  }
  function manualIsRecent() {
    if (get(sessionStorage, MANUAL_KEY) === "1") return true;
    const until = Number(get(localStorage, MANUAL_UNTIL_KEY) || "0");
    return Number.isFinite(until) && until > Date.now();
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
    if (!user) return;
    const apply = function () {
      if (!document.body) return;
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
      document.body.setAttribute("data-user-id", user.uid || "");
      document.body.setAttribute("data-current-user", displayName);
      document.body.setAttribute("data-user-role", window.user.community_role || "user");
      const info = document.getElementById("user-info");
      if (info) {
        const img = info.querySelector("img");
        const span = info.querySelector("span");
        if (img) img.src = photoURL;
        if (span) span.textContent = displayName;
      }
    };
    if (document.body) apply();
    else document.addEventListener("DOMContentLoaded", apply, { once: true });
  }

  function waitForUser(auth, timeoutMs) {
    return new Promise((resolve) => {
      if (!auth) return resolve(null);
      if (auth.currentUser) return resolve(auth.currentUser);
      let done = false;
      let unsubscribe = null;
      const timeout = setTimeout(() => finish(null), timeoutMs || 5000);
      function finish(user) {
        if (done) return;
        done = true;
        clearTimeout(timeout);
        try { if (unsubscribe) unsubscribe(); } catch (_) {}
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
  window.TrueSkyAuth.hasRecentAuthBounce = isRecentBounce;

  watchdogTimer = setTimeout(() => {
    if (resolved) return;
    if (isLoginPage) revealPage();
    else goLogin();
  }, STARTUP_WATCHDOG_MS);

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
    window.TrueSkyAuth.auth = auth;
    window.TrueSkyAuth.currentUser = null;

    window.TrueSkyAuth.signOut = async function () {
      clearManualLogin();
      clearBounceMarker();
      try { await auth.signOut(); } catch (_) {}
      window.TrueSkyAuth.currentUser = null;
      if (!redirecting) {
        redirecting = true;
        window.location.replace(LOGIN_PATH);
      }
    };

    function allow(user) {
      if (resolved || !user) return;
      setManualLogin(user);
      clearPending();
      clearBounceMarker();
      window.TrueSkyAuth.currentUser = user;
      applyUserToPage(user);
      revealPage();
      window.dispatchEvent(new CustomEvent("truesky-auth-changed", { detail: { user } }));
    }

    // IMPORTANT: wait until Firebase has restored its persisted session before
    // observing auth state. Attaching the guard before this resolves can send a
    // valid user to /login and then the login page sends them back to / forever.
    (async function initializeAuthGuard() {
      try {
        await auth.setPersistence(window.firebase.auth.Auth.Persistence.LOCAL);
      } catch (err) {
        console.warn("Firebase persistence setup warning:", err);
      }
      if (resolved) return;

      auth.onAuthStateChanged(async (user) => {
        if (resolved) return;
        if (user) {
          allow(user);
          return;
        }
        if (isLoginPage) {
          revealPage();
          return;
        }

        // A short grace period allows storage restoration / redirect sign-in to
        // finish, but a stale manual flag is never accepted as authentication.
        const hasPendingLogin = manualIsRecent() || pendingIsRecent();
        const recovered = await waitForUser(auth, hasPendingLogin ? 15000 : 3500);
        if (resolved) return;
        if (recovered) {
          allow(recovered);
          return;
        }

        window.TrueSkyAuth.currentUser = null;
        clearManualLogin();
        goLogin();
      });
    })();
  } catch (err) {
    console.warn("Firebase auth guard error:", err);
    if (!isLoginPage) goLogin();
    else revealPage();
  }
})();
