(function () {
  "use strict";

  const MANUAL_KEY = "TRUESKY_MANUAL_LOGIN_OK";
  const MANUAL_UNTIL_KEY = "TRUESKY_MANUAL_LOGIN_UNTIL";
  const EMAIL_KEY = "TRUESKY_EMAIL_FOR_SIGNIN";
  const PENDING_KEY = "TRUESKY_AUTH_REDIRECT_PENDING";
  const PENDING_TIME_KEY = "TRUESKY_AUTH_PENDING_TIME";
  const LOGIN_EMAIL_KEY = "TRUESKY_LOGIN_EMAIL";
  const MANUAL_MAX_MS = 30 * 24 * 60 * 60 * 1000;
  let auth = null;
  let db = null;
  let ready = false;
  let redirecting = false;

  function $(id) { return document.getElementById(id); }
  function show(el, active) { if (el) el.classList.toggle("active", !!active); }
  function normalizeEmail(email) { return String(email || "").trim().toLowerCase(); }

  function setMessage(message, type) {
    const error = $("login-error");
    const success = $("login-success");
    if (error) { error.textContent = ""; show(error, false); }
    if (success) { success.textContent = ""; show(success, false); }
    const box = type === "success" ? success : error;
    if (box && message) { box.textContent = message; show(box, true); }
  }

  function firebaseIsConfigured() {
    const c = window.TrueSkyFirebaseConfig || {};
    return !!c.isConfigured;
  }

  async function initFirebase() {
    if (ready) return true;
    if (!window.firebase || !firebaseIsConfigured()) {
      setMessage("Firebase não está configurado corretamente em js/firebase-config.js.");
      return false;
    }
    try {
      if (!window.firebase.apps.length) window.firebase.initializeApp(window.TRUESKY_FIREBASE_CONFIG);
      auth = window.firebase.auth();
      db = window.firebase.firestore ? window.firebase.firestore() : null;
      await auth.setPersistence(window.firebase.auth.Auth.Persistence.LOCAL);
      ready = true;
      return true;
    } catch (err) {
      setMessage(firebaseError(err));
      return false;
    }
  }

  function firebaseError(err) {
    const code = err && err.code;
    const map = {
      "auth/popup-closed-by-user": "Login com Google cancelado antes de concluir.",
      "auth/popup-blocked": "O navegador bloqueou o popup. Vou tentar por redirecionamento.",
      "auth/cancelled-popup-request": "Aguarde o login anterior terminar e tente novamente.",
      "auth/unauthorized-domain": "Este domínio não está autorizado no Firebase Authentication.",
      "auth/operation-not-allowed": "Ative Google e Email link/passwordless no Firebase Authentication.",
      "auth/invalid-email": "Email inválido.",
      "auth/missing-email": "Digite seu email.",
      "auth/invalid-action-code": "Link inválido ou expirado. Peça uma nova verificação.",
      "auth/network-request-failed": "Falha de rede. Tente novamente.",
      "auth/invalid-api-key": "A chave do Firebase está incorreta.",
      "auth/app-not-authorized": "Este domínio/app não está autorizado no Firebase."
    };
    return map[code] || (err && err.message) || "Erro inesperado no Firebase.";
  }

  function setPending() {
    const stamp = String(Date.now());
    try {
      sessionStorage.setItem(PENDING_KEY, "1");
      sessionStorage.setItem(PENDING_TIME_KEY, stamp);
      localStorage.setItem(PENDING_KEY, "1");
      localStorage.setItem(PENDING_TIME_KEY, stamp);
    } catch (_) {}
  }

  function clearPending() {
    try {
      sessionStorage.removeItem(PENDING_KEY);
      sessionStorage.removeItem(PENDING_TIME_KEY);
      localStorage.removeItem(PENDING_KEY);
      localStorage.removeItem(PENDING_TIME_KEY);
      sessionStorage.removeItem("TRUESKY_GOOGLE_REDIRECT_PENDING");
      localStorage.removeItem("TRUESKY_GOOGLE_REDIRECT_PENDING");
    } catch (_) {}
  }

  function markManual(user) {
    try {
      sessionStorage.setItem(MANUAL_KEY, "1");
      localStorage.setItem(MANUAL_UNTIL_KEY, String(Date.now() + MANUAL_MAX_MS));
      sessionStorage.setItem(LOGIN_EMAIL_KEY, (user && (user.email || user.displayName)) || "");
    } catch (_) {}
  }

  function clearManual() {
    try {
      sessionStorage.removeItem(MANUAL_KEY);
      sessionStorage.removeItem(LOGIN_EMAIL_KEY);
      localStorage.removeItem(MANUAL_UNTIL_KEY);
    } catch (_) {}
    clearPending();
  }

  function getTarget() {
    const next = new URLSearchParams(window.location.search).get("next");
    if (next && next.startsWith("/") && !next.startsWith("//")) return next;
    return "/";
  }

  function enterSite() {
    if (redirecting) return;
    redirecting = true;
    window.location.replace(getTarget());
  }

  function waitForSignedUser(timeoutMs) {
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
        resolve(user || (auth && auth.currentUser) || null);
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

  async function saveProfile(user, method) {
    if (!db || !user) return;
    try {
      await db.collection("users").doc(user.uid).set({
        uid: user.uid,
        email: user.email || null,
        displayName: user.displayName || null,
        photoURL: user.photoURL || null,
        providerIds: (user.providerData || []).map((p) => p.providerId),
        authMethod: method,
        updatedAt: window.firebase.firestore.FieldValue.serverTimestamp(),
        lastLoginAt: window.firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    } catch (err) {
      console.warn("Could not save user profile:", err);
    }
  }

  async function finishLogin(user, method) {
    if (!user) {
      setMessage("O Firebase não retornou usuário. Tente novamente.");
      return;
    }
    markManual(user);
    setPending();
    setMessage("Login concluído. Entrando...", "success");
    saveProfile(user, method);
    try { await user.getIdToken(true); } catch (_) {}
    setTimeout(enterSite, 50);
  }

  function updateSignedBox(user) {
    const box = $("signed-in-box");
    const email = $("signed-in-email");
    const options = $("login-options");
    const emailSection = $("email-section");
    const manual = sessionStorage.getItem(MANUAL_KEY) === "1" || Number(localStorage.getItem(MANUAL_UNTIL_KEY) || "0") > Date.now();
    if (user && manual) {
      if (email) email.textContent = user.email || user.displayName || "Conta conectada";
      if (box) box.style.display = "block";
      if (options) options.style.display = "none";
      if (emailSection) emailSection.classList.remove("active");
    } else {
      if (box) box.style.display = "none";
      if (options) options.style.display = "block";
    }
  }

  window.showLoginOptions = function () {
    setMessage("");
    const options = $("login-options");
    const emailSection = $("email-section");
    if (options) options.style.display = "block";
    if (emailSection) emailSection.classList.remove("active");
  };

  window.showEmailInput = function () {
    setMessage("");
    const options = $("login-options");
    const emailSection = $("email-section");
    if (options) options.style.display = "none";
    if (emailSection) emailSection.classList.add("active");
    const input = $("email-input");
    if (input) input.focus();
  };

  window.trueskyGoogleLogin = async function () {
    if (!(await initFirebase())) return;
    const btn = $("google-login-btn");
    if (btn) { btn.disabled = true; btn.textContent = "Abrindo Google..."; }
    setMessage("");
    setPending();

    const provider = new window.firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });

    try {
      const result = await auth.signInWithPopup(provider);
      await finishLogin(result.user, "google_popup");
    } catch (err) {
      if (err && (err.code === "auth/popup-blocked" || err.code === "auth/cancelled-popup-request")) {
        try {
          setPending();
          sessionStorage.setItem("TRUESKY_GOOGLE_REDIRECT_PENDING", "1");
          localStorage.setItem("TRUESKY_GOOGLE_REDIRECT_PENDING", "1");
          await auth.signInWithRedirect(provider);
          return;
        } catch (redirectErr) {
          clearPending();
          setMessage(firebaseError(redirectErr));
        }
      } else {
        clearPending();
        setMessage(firebaseError(err));
      }
    } finally {
      if (!redirecting && btn) { btn.disabled = false; btn.textContent = "Entrar com Google"; }
    }
  };

  window.trueskySendEmailLink = async function (event) {
    if (event) event.preventDefault();
    if (!(await initFirebase())) return;
    const input = $("email-input");
    const btn = $("send-code-btn");
    const email = normalizeEmail(input && input.value);
    if (!email || !email.includes("@")) {
      setMessage("Digite um email válido.");
      return;
    }
    if (btn) { btn.disabled = true; btn.textContent = "Enviando..."; }
    try {
      const loginUrl = new URL("login", window.location.origin + "/");
      const next = new URLSearchParams(window.location.search).get("next");
      if (next) loginUrl.searchParams.set("next", next);
      await auth.sendSignInLinkToEmail(email, {
        url: loginUrl.toString(),
        handleCodeInApp: true
      });
      localStorage.setItem(EMAIL_KEY, email);
      setMessage("Link de verificação enviado. Abra seu email e clique no link para entrar.", "success");
    } catch (err) {
      setMessage(firebaseError(err));
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = "Enviar link de verificação"; }
    }
  };

  window.trueskyContinueToSite = function () {
    markManual(auth && auth.currentUser);
    enterSite();
  };

  window.trueskyLogout = async function () {
    if (!(await initFirebase())) return;
    clearManual();
    try { await auth.signOut(); } catch (_) {}
    updateSignedBox(null);
    setMessage("Você saiu da conta.", "success");
  };

  document.addEventListener("DOMContentLoaded", async () => {
    if (!(await initFirebase())) return;

    try {
      const googleRedirect = sessionStorage.getItem("TRUESKY_GOOGLE_REDIRECT_PENDING") === "1" || localStorage.getItem("TRUESKY_GOOGLE_REDIRECT_PENDING") === "1";
      if (googleRedirect) {
        const result = await auth.getRedirectResult();
        const redirectedUser = (result && result.user) || auth.currentUser || await waitForSignedUser(6000);
        if (redirectedUser) {
          clearPending();
          await finishLogin(redirectedUser, result && result.user ? "google_redirect" : "google_redirect_session");
          return;
        }
      }

      if (auth.isSignInWithEmailLink(window.location.href)) {
        let email = localStorage.getItem(EMAIL_KEY) || "";
        if (!email) email = normalizeEmail(window.prompt("Confirme seu email para concluir o login:"));
        if (email) {
          const result = await auth.signInWithEmailLink(email, window.location.href);
          localStorage.removeItem(EMAIL_KEY);
          window.history.replaceState({}, document.title, "/login");
          await finishLogin(result.user, "email_link");
          return;
        }
      }
    } catch (err) {
      clearPending();
      setMessage(firebaseError(err));
    }

    auth.onAuthStateChanged(async (user) => {
      if (redirecting) return;
      if (user) {
        await finishLogin(user, "firebase_session");
        return;
      }
      updateSignedBox(null);
    });
  });
})();