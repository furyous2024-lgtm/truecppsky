(function () {
  "use strict";

  const SETTINGS_COLLECTION = "settings";
  const MAX_SETTINGS = 100;

  function getFirebase() {
    if (!window.firebase || !window.firebase.firestore || !window.firebase.auth) {
      throw new Error("Firebase Authentication/Firestore não foi inicializado.");
    }
    return window.firebase;
  }

  function requireSignedInUser(firebase) {
    const auth = firebase.auth();
    if (auth.currentUser) return Promise.resolve(auth.currentUser);

    return new Promise((resolve, reject) => {
      let unsubscribe = null;
      const timeout = setTimeout(() => finish(null), 10000);

      function finish(user, error) {
        clearTimeout(timeout);
        if (unsubscribe) unsubscribe();
        if (error) {
          reject(error);
        } else if (user) {
          resolve(user);
        } else {
          reject(new Error("Entre com sua conta Firebase para acessar as configurações."));
        }
      }

      unsubscribe = auth.onAuthStateChanged(
        (user) => finish(user),
        (error) => finish(null, error),
      );
    });
  }

  async function settingsCollection() {
    const firebase = getFirebase();
    const user = await requireSignedInUser(firebase);
    return firebase.firestore().collection("users").doc(user.uid).collection(SETTINGS_COLLECTION);
  }

  function toSetting(doc) {
    const data = doc.data();
    if (
      !data ||
      typeof data.settings_name !== "string" ||
      !data.settings_name.trim() ||
      typeof data.settings_json !== "string"
    ) {
      throw new Error(`A configuração salva (${doc.id}) está incompleta no Firestore.`);
    }
    const toIsoString = (value) =>
      value && typeof value.toDate === "function"
        ? value.toDate().toISOString()
        : typeof value === "string" ? value : "";
    return {
      id: doc.id,
      settings_name: data.settings_name,
      settings_json: data.settings_json,
      created_at: toIsoString(data.created_at),
      updated_at: toIsoString(data.updated_at),
    };
  }

  async function list() {
    const collection = await settingsCollection();
    const snapshot = await collection.orderBy("updated_at", "desc").limit(MAX_SETTINGS + 1).get();
    // The stable current-preferences document lives in this collection for compatibility
    // with deployments whose Firestore rules already permit named settings documents.
    return snapshot.docs
      .filter((doc) => doc.id !== "_default_preferences" && doc.data()?.is_default_preferences !== true)
      .slice(0, MAX_SETTINGS)
      .map(toSetting);
  }

  async function save(settingsName, settingsJson) {
    const collection = await settingsCollection();
    const ref = collection.doc();
    const timestamp = getFirebase().firestore.FieldValue.serverTimestamp();
    await ref.set({
      settings_name: settingsName,
      settings_json: settingsJson,
      created_at: timestamp,
      updated_at: timestamp,
    });
    return list();
  }

  async function touch(id) {
    const collection = await settingsCollection();
    await collection.doc(String(id)).update({
      updated_at: getFirebase().firestore.FieldValue.serverTimestamp(),
    });
    return list();
  }

  async function remove(id) {
    const collection = await settingsCollection();
    await collection.doc(String(id)).delete();
    return list();
  }

  // One current-preferences document per signed-in user. Named presets above remain unchanged.
  async function preferencesDocument() {
    const firebase = getFirebase();
    const user = await requireSignedInUser(firebase);
    const userDocument = firebase.firestore().collection("users").doc(user.uid);
    return {
      user,
      // Keep the current preference under the same collection used by named presets.
      // This avoids failures on Firebase deployments that only allow the existing settings path.
      ref: userDocument.collection(SETTINGS_COLLECTION).doc("_default_preferences"),
      // Read the earlier location too so existing users do not lose already-saved data.
      legacyRef: userDocument.collection("preferences").doc("main-settings"),
    };
  }

  async function loadPreferences() {
    const { user, ref, legacyRef } = await preferencesDocument();
    let snapshot = await ref.get();
    if (!snapshot.exists) {
      // Older deployments may not yet grant read access to the legacy collection.
      // Ignore that legacy lookup failure instead of blocking the supported settings path.
      try { snapshot = await legacyRef.get(); } catch (_) { return null; }
    }
    if (!snapshot.exists) return null;
    const data = snapshot.data() || {};
    if (typeof data.settings_json !== "string" || !data.settings_json.trim()) {
      return null;
    }
    return {
      uid: user.uid,
      settings_name: typeof data.settings_name === "string" ? data.settings_name : "My Preferences",
      settings_json: data.settings_json,
      updated_at: data.updated_at && typeof data.updated_at.toDate === "function"
        ? data.updated_at.toDate().toISOString()
        : (typeof data.updated_at === "string" ? data.updated_at : ""),
    };
  }

  async function savePreferences(settingsName, settingsJson) {
    const { user, ref } = await preferencesDocument();
    const timestamp = getFirebase().firestore.FieldValue.serverTimestamp();
    const normalizedName = String(settingsName || "My Preferences").trim() || "My Preferences";
    const normalizedJson = String(settingsJson || "");
    if (!normalizedJson.trim()) throw new Error("As preferências estão vazias e não foram salvas.");
    // Validate JSON before sending it to Firestore, so an invalid record cannot be restored later.
    try { JSON.parse(normalizedJson); } catch (_) { throw new Error("As preferências estão em um formato inválido; nada foi salvo."); }
    await ref.set({
      uid: user.uid,
      settings_name: normalizedName,
      settings_json: normalizedJson,
      is_default_preferences: true,
      schema_version: 2,
      updated_at: timestamp,
    }, { merge: true });
    return { uid: user.uid, settings_name: normalizedName };
  }

  // Explicit save action used by both Save buttons. Named presets and the stable
  // account-preferences document are separate records, so write both and report
  // partial failures instead of silently leaving the popup list stale.
  async function savePresetAndPreferences(settingsName, settingsJson) {
    const normalizedName = String(settingsName || "My Preferences").trim() || "My Preferences";
    const normalizedJson = String(settingsJson || "");
    let presets = null;
    let presetError = null;
    let preferencesError = null;

    try {
      presets = await save(normalizedName, normalizedJson);
    } catch (error) {
      presetError = error;
    }

    try {
      await savePreferences(normalizedName, normalizedJson);
    } catch (error) {
      preferencesError = error;
    }

    return {
      presets,
      presetSaved: !presetError,
      presetError,
      preferencesSaved: !preferencesError,
      preferencesError,
    };
  }

  window.TrueSkyFirebaseSettings = Object.freeze({
    list, save, touch, remove, loadPreferences, savePreferences, savePresetAndPreferences
  });
})();
