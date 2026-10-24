// js/firebase-config-module.js
// Versão ES module da configuração Firebase, para arquivos que usam import/export.
// O valor principal fica em js/firebase-config.js como window.TRUESKY_FIREBASE_CONFIG.

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const fallbackConfig = {
  apiKey: "COLE_SUA_API_KEY_AQUI",
  authDomain: "SEU_PROJECT_ID.firebaseapp.com",
  projectId: "SEU_PROJECT_ID",
  storageBucket: "SEU_PROJECT_ID.firebasestorage.app",
  messagingSenderId: "COLE_SEU_MESSAGING_SENDER_ID",
  appId: "COLE_SEU_APP_ID"
};

export const firebaseConfig = window.TRUESKY_FIREBASE_CONFIG || fallbackConfig;

const PLACEHOLDER_PARTS = ["COLE_", "SEU_PROJECT_ID", "SEU_PROJETO", "YOUR_", "AQUI"];

function hasRealFirebaseConfig(config) {
  const required = ["apiKey", "authDomain", "projectId", "appId"];
  return required.every((key) => {
    const value = String(config && config[key] ? config[key] : "").trim();
    return value && !PLACEHOLDER_PARTS.some((part) => value.includes(part));
  });
}

export const isFirebaseConfigured = hasRealFirebaseConfig(firebaseConfig);

let app = null;
let auth = null;
let db = null;
let googleProvider = null;

if (isFirebaseConfigured) {
  app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  googleProvider = new GoogleAuthProvider();
  googleProvider.setCustomParameters({ prompt: "select_account" });
} else {
  console.warn("Firebase não está configurado. Preencha js/firebase-config.js com a configuração real do app Web.");
}

export { app, auth, db, googleProvider };
