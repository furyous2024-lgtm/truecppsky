// js/firebase-auth.js
// Módulo de autenticação Firebase para Google/Gmail, email/senha, criação de conta,
// bloqueio de email já existente, recuperação de senha e perfil básico no Firestore.

import { auth, db, googleProvider, isFirebaseConfigured } from "./firebase-config-module.js";
import {
  createUserWithEmailAndPassword,
  fetchSignInMethodsForEmail,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  doc,
  serverTimestamp,
  setDoc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const ID = (id) => document.getElementById(id);
const SELECT = (selectors) => selectors.map((s) => document.querySelector(s)).find(Boolean) || null;

const EMAIL_IDS = [
  "createEmail", "signupEmail", "registerEmail", "accountEmail", "authEmail", "email", "loginEmail"
];
const PASSWORD_IDS = [
  "createPassword", "signupPassword", "registerPassword", "accountPassword", "authPassword", "password", "loginPassword"
];
const NAME_IDS = [
  "displayName", "signupName", "registerName", "accountName", "name", "userName"
];
const MESSAGE_IDS = [
  "authMessage", "loginMessage", "signupMessage", "accountMessage", "firebaseMessage", "errorMessage"
];

function byIds(ids) {
  return ids.map(ID).find(Boolean) || null;
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function getEmail() {
  const el = byIds(EMAIL_IDS) || SELECT(["input[type='email']", "input[name='email']"]);
  return normalizeEmail(el?.value);
}

function getPassword() {
  const el = byIds(PASSWORD_IDS) || SELECT(["input[type='password']", "input[name='password']"]);
  return String(el?.value || "");
}

function getDisplayName() {
  const el = byIds(NAME_IDS) || SELECT(["input[name='displayName']", "input[name='name']"]);
  return String(el?.value || "").trim();
}

function getMessageBox() {
  return byIds(MESSAGE_IDS) || SELECT([".auth-message", ".login-message", ".signup-message", ".errorMessage", ".error-message"]);
}

function showMessage(message, type = "info") {
  const box = getMessageBox();
  if (box) {
    box.textContent = message;
    box.dataset.type = type;
    box.classList.remove("success", "error", "info");
    box.classList.add(type);
    box.style.display = message ? "block" : "none";
  }

  if (type === "error") console.error(message);
  else console.log(message);
}

function requireFirebase() {
  if (!isFirebaseConfigured || !auth || !db) {
    showMessage(
      "Firebase não está configurado. Cole sua configuração real em js/firebase-config.js e ative Authentication/Firestore no Firebase Console.",
      "error"
    );
    return false;
  }
  return true;
}

function friendlyAuthError(error) {
  const code = error?.code || "";

  switch (code) {
    case "auth/email-already-in-use":
      return "Este email já tem conta. Use Entrar ou Recuperar senha.";
    case "auth/invalid-email":
      return "Email inválido. Verifique e tente novamente.";
    case "auth/missing-email":
      return "Digite seu email.";
    case "auth/weak-password":
      return "Senha fraca. Use pelo menos 6 caracteres.";
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "Email ou senha incorretos.";
    case "auth/user-not-found":
      return "Nenhuma conta encontrada com este email.";
    case "auth/popup-closed-by-user":
      return "Login com Google cancelado antes de concluir.";
    case "auth/operation-not-allowed":
      return "Método de login não ativado no Firebase Console.";
    case "auth/network-request-failed":
      return "Falha de rede. Verifique sua conexão e tente de novo.";
    case "permission-denied":
      return "Firestore bloqueou a gravação. Ajuste as regras de segurança para usuários logados.";
    default:
      return error?.message || "Erro inesperado no Firebase.";
  }
}

async function upsertUserProfile(user, extra = {}) {
  if (!user || !db) return;

  const ref = doc(db, "users", user.uid);
  await setDoc(
    ref,
    {
      uid: user.uid,
      email: user.email || null,
      displayName: user.displayName || extra.displayName || null,
      photoURL: user.photoURL || null,
      providerIds: user.providerData?.map((p) => p.providerId) || [],
      updatedAt: serverTimestamp(),
      ...extra
    },
    { merge: true }
  );
}

export async function createAccount(email = getEmail(), password = getPassword(), displayName = getDisplayName()) {
  if (!requireFirebase()) return null;

  email = normalizeEmail(email);
  password = String(password || "");
  displayName = String(displayName || "").trim();

  if (!email) {
    showMessage("Digite um email para criar a conta.", "error");
    return null;
  }

  if (password.length < 6) {
    showMessage("A senha precisa ter pelo menos 6 caracteres.", "error");
    return null;
  }

  try {
    // Pré-checagem amigável. Mesmo com ela, o catch abaixo continua obrigatório,
    // porque o Firebase pode bloquear enumeração de email ou outro cadastro pode ocorrer ao mesmo tempo.
    try {
      const methods = await fetchSignInMethodsForEmail(auth, email);
      if (methods.length > 0) {
        showMessage("Este email já tem conta. Use Entrar ou Recuperar senha.", "error");
        return null;
      }
    } catch (_) {
      // Não interrompe o cadastro: createUserWithEmailAndPassword ainda é a confirmação real.
    }

    const credential = await createUserWithEmailAndPassword(auth, email, password);

    if (displayName) {
      await updateProfile(credential.user, { displayName });
    }

    await upsertUserProfile(credential.user, {
      displayName: displayName || credential.user.displayName || null,
      createdAt: serverTimestamp(),
      authMethod: "password"
    });

    showMessage("Conta criada com sucesso.", "success");
    return credential.user;
  } catch (error) {
    showMessage(friendlyAuthError(error), "error");
    return null;
  }
}

export async function loginEmailPassword(email = getEmail(), password = getPassword()) {
  if (!requireFirebase()) return null;

  email = normalizeEmail(email);
  password = String(password || "");

  if (!email || !password) {
    showMessage("Digite email e senha para entrar.", "error");
    return null;
  }

  try {
    const credential = await signInWithEmailAndPassword(auth, email, password);
    await upsertUserProfile(credential.user, { lastLoginAt: serverTimestamp() });
    showMessage("Login feito com sucesso.", "success");
    return credential.user;
  } catch (error) {
    showMessage(friendlyAuthError(error), "error");
    return null;
  }
}

export async function loginGoogle() {
  if (!requireFirebase()) return null;

  try {
    const credential = await signInWithPopup(auth, googleProvider);
    await upsertUserProfile(credential.user, {
      createdAt: serverTimestamp(),
      lastLoginAt: serverTimestamp(),
      authMethod: "google"
    });
    showMessage("Login com Google concluído.", "success");
    return credential.user;
  } catch (error) {
    showMessage(friendlyAuthError(error), "error");
    return null;
  }
}

export async function recoverPassword(email = getEmail()) {
  if (!requireFirebase()) return false;

  email = normalizeEmail(email);
  if (!email) {
    showMessage("Digite seu email para recuperar a senha.", "error");
    return false;
  }

  try {
    await sendPasswordResetEmail(auth, email, {
      url: window.location.origin + window.location.pathname,
      handleCodeInApp: false
    });
    showMessage("Email de recuperação enviado. Verifique sua caixa de entrada e spam.", "success");
    return true;
  } catch (error) {
    showMessage(friendlyAuthError(error), "error");
    return false;
  }
}

export async function logoutFirebase() {
  if (!requireFirebase()) return false;

  try {
    await signOut(auth);
    showMessage("Você saiu da conta.", "success");
    return true;
  } catch (error) {
    showMessage(friendlyAuthError(error), "error");
    return false;
  }
}

function buttonTextMatches(button, words) {
  const text = String(button.textContent || button.value || "").trim().toLowerCase();
  return words.some((word) => text.includes(word));
}

function bindButton(ids, textWords, handler) {
  const byId = ids.map(ID).filter(Boolean);
  const byText = Array.from(document.querySelectorAll("button, a, input[type='button'], input[type='submit']"))
    .filter((el) => buttonTextMatches(el, textWords));

  [...new Set([...byId, ...byText])].forEach((el) => {
    if (el.dataset.firebaseBound === "true") return;
    el.dataset.firebaseBound = "true";
    el.addEventListener("click", (event) => {
      event.preventDefault();
      handler();
    });
  });
}

function ensureRecoveryButton() {
  const existing = byIds(["recoverPasswordBtn", "forgotPasswordBtn", "resetPasswordBtn"])
    || Array.from(document.querySelectorAll("button, a")).find((el) => buttonTextMatches(el, ["forgot", "recover", "reset", "recuperar", "esqueci"]));
  if (existing) return;

  const password = byIds(PASSWORD_IDS) || SELECT(["input[type='password']"]);
  if (!password || !password.parentElement) return;

  const btn = document.createElement("button");
  btn.type = "button";
  btn.id = "recoverPasswordBtn";
  btn.className = "firebase-recover-password";
  btn.textContent = "Esqueci minha senha";
  btn.style.marginTop = "8px";
  btn.addEventListener("click", () => recoverPassword());

  password.parentElement.appendChild(btn);
}

function updateAuthUI(user) {
  document.documentElement.classList.toggle("firebase-logged-in", Boolean(user));
  document.documentElement.classList.toggle("firebase-logged-out", !user);

  document.querySelectorAll("[data-auth-email]").forEach((el) => {
    el.textContent = user?.email || "";
  });

  document.querySelectorAll("[data-auth-name]").forEach((el) => {
    el.textContent = user?.displayName || user?.email || "";
  });
}

function initFirebaseAuthUI() {
  if (!isFirebaseConfigured) {
    showMessage(
      "Firebase não está configurado em js/firebase-config.js. Cole sua configuração real para ativar Google/Gmail, email/senha e Firestore.",
      "error"
    );
    return;
  }

  bindButton(
    ["createAccountBtn", "signupBtn", "registerBtn", "btnCreateAccount", "accountCreateBtn"],
    ["create account", "sign up", "signup", "register", "criar conta", "cadastrar"],
    () => createAccount()
  );

  bindButton(
    ["loginBtn", "signinBtn", "signInBtn", "btnLogin"],
    ["log in", "login", "sign in", "entrar"],
    () => loginEmailPassword()
  );

  bindButton(
    ["googleLoginBtn", "loginGoogleBtn", "signInGoogleBtn", "gmailLoginBtn"],
    ["google", "gmail"],
    () => loginGoogle()
  );

  bindButton(
    ["recoverPasswordBtn", "forgotPasswordBtn", "resetPasswordBtn"],
    ["forgot", "recover", "reset password", "recuperar", "esqueci", "redefinir senha"],
    () => recoverPassword()
  );

  bindButton(
    ["logoutBtn", "signoutBtn", "signOutBtn"],
    ["log out", "logout", "sair"],
    () => logoutFirebase()
  );

  ensureRecoveryButton();

  onAuthStateChanged(auth, async (user) => {
    updateAuthUI(user);
    if (user) {
      try {
        await upsertUserProfile(user, { lastSeenAt: serverTimestamp() });
      } catch (error) {
        console.warn("Não foi possível atualizar perfil no Firestore:", error);
      }
    }
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initFirebaseAuthUI);
} else {
  initFirebaseAuthUI();
}

window.trueSkyAuth = {
  createAccount,
  loginEmailPassword,
  loginGoogle,
  recoverPassword,
  logoutFirebase,
  auth,
  db,
  isFirebaseConfigured
};
