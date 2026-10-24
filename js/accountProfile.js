(function () {
  "use strict";

  const FALLBACK_AVATAR = "/images/misc/anonymouse.png";

  function safeText(value, fallback = "User") {
    const text = String(value || "").trim();
    return text || fallback;
  }

  function normalizePhotoUrl(url) {
    const raw = String(url || "").trim();
    if (!raw) return FALLBACK_AVATAR;
    if (/^https?:\/\//i.test(raw) || raw.startsWith("data:") || raw.startsWith("/")) return raw;
    return `/${raw.replace(/^\.\//, "")}`;
  }

  function getFirebaseUser() {
    try {
      return window.TrueSkyAuth?.currentUser || window.TrueSkyAuth?.auth?.currentUser || window.firebase?.auth?.().currentUser || null;
    } catch (_) {
      return window.TrueSkyAuth?.currentUser || null;
    }
  }

  function readProfile() {
    const firebaseUser = getFirebaseUser();
    const fallbackUser = window.user || {};
    const email = firebaseUser?.email || fallbackUser.email || sessionStorage.getItem("TRUESKY_LOGIN_EMAIL") || "";
    const displayName = safeText(firebaseUser?.displayName || fallbackUser.display_name || fallbackUser.displayName || email, "User");
    const photoURL = normalizePhotoUrl(firebaseUser?.photoURL || fallbackUser.profile_image || fallbackUser.photoURL || FALLBACK_AVATAR);
    return { displayName, email, photoURL, uid: firebaseUser?.uid || fallbackUser.id || fallbackUser.uid || "" };
  }

  function applyProfile(profile = readProfile()) {
    const { displayName, email, photoURL, uid } = profile;
    document.querySelectorAll(".account-avatar, #user-info img").forEach((img) => {
      img.src = photoURL;
      img.alt = `${displayName} avatar`;
      img.referrerPolicy = "no-referrer";
      img.onerror = function () {
        if (this.src !== new URL(FALLBACK_AVATAR, window.location.href).href) this.src = FALLBACK_AVATAR;
      };
    });
    document.querySelectorAll(".account-display-name, #user-info span").forEach((el) => {
      el.textContent = displayName;
    });
    document.body.dataset.currentUser = displayName;
    if (uid) document.body.dataset.userId = String(uid);
    window.currentUser = displayName;
    window.user = {
      ...(window.user || {}),
      display_name: displayName,
      displayName,
      email,
      profile_image: photoURL,
      photoURL,
      id: uid || window.user?.id || "local",
    };
  }

  window.TrueSkyAccountProfile = { apply: applyProfile, read: readProfile };

  document.addEventListener("DOMContentLoaded", () => applyProfile());
  window.addEventListener("truesky-auth-changed", (event) => {
    const user = event.detail?.user || getFirebaseUser();
    applyProfile({
      displayName: safeText(user?.displayName || user?.email, "User"),
      email: user?.email || "",
      photoURL: normalizePhotoUrl(user?.photoURL || FALLBACK_AVATAR),
      uid: user?.uid || "",
    });
  });

  try {
    const auth = window.TrueSkyAuth?.auth || window.firebase?.auth?.();
    if (auth?.onAuthStateChanged) {
      auth.onAuthStateChanged((user) => {
        if (user) {
          applyProfile({
            displayName: safeText(user.displayName || user.email, "User"),
            email: user.email || "",
            photoURL: normalizePhotoUrl(user.photoURL || FALLBACK_AVATAR),
            uid: user.uid || "",
          });
        } else {
          applyProfile();
        }
      });
    }
  } catch (_) {}
})();
