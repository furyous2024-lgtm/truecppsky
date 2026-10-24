"use strict";

// True Sky install prompt
// - Listens for Chromium's beforeinstallprompt and surfaces a friendly button
// - Detects iOS Safari and shows Add-to-Home-Screen instructions on tap
// - Hides itself when already running as an installed PWA
// - Persists "maybe later" dismissals in localStorage

(function () {
  const DISMISS_KEY = "tsInstallDismissedUntil";
  const DISMISS_COUNT_KEY = "tsInstallDismissCount";
  // Count-based dismiss escalation:
  //   1st dismiss → 7 days
  //   2nd dismiss → 30 days
  //   3rd dismiss → 90 days
  //   4th+ dismiss → effectively never (100 years)
  // Installed users get the long timer immediately (independent of count).
  const DISMISS_DAYS_INSTALLED = 36500;
  const SHOW_DELAY_MS = 2000;

  const isStandalone =
    (window.matchMedia &&
      window.matchMedia("(display-mode: standalone)").matches) ||
    window.navigator.standalone === true;

  if (isStandalone) return;

  function isIOS() {
    return (
      /iP(ad|hone|od)/.test(navigator.userAgent) && !window.MSStream
    );
  }

  function isIOSSafari() {
    if (!isIOS()) return false;
    const ua = navigator.userAgent;
    // Exclude Chrome/Firefox/Edge on iOS — they cannot install PWAs
    return !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
  }

  // Mac Safari supports PWA install via File → Add to Dock as of
  // macOS Sonoma (Safari 17). Does not fire beforeinstallprompt, so we
  // detect it via UA and show platform-specific instructions.
  function isMacSafari() {
    const ua = navigator.userAgent;
    if (!/Macintosh/.test(ua)) return false;
    if (!/Safari\//.test(ua)) return false;
    // Exclude all Chromium-based browsers on Mac (they include "Safari/" too)
    if (/Chrom(e|ium)/.test(ua)) return false;
    if (/Edg\//.test(ua)) return false;
    if (/OPR\//.test(ua)) return false;
    if (/Firefox/.test(ua)) return false;
    return true;
  }

  function isDismissed() {
    try {
      const until = parseInt(
        localStorage.getItem(DISMISS_KEY) || "0",
        10
      );
      return until > Date.now();
    } catch (e) {
      return false;
    }
  }

  function setDismissed(days) {
    try {
      const until = Date.now() + days * 24 * 60 * 60 * 1000;
      localStorage.setItem(DISMISS_KEY, String(until));
    } catch (e) {
      // localStorage unavailable (private mode) — ignore
    }
  }

  // Increment the user-dismissal counter and set the next re-show timer
  // using the escalation schedule. All "user said no" paths funnel through
  // this — x on pill, native install Cancel, iOS Maybe later, iOS Got it.
  // After 4 dismissals, pill is suppressed for ~100 years.
  function recordAndDismiss() {
    let count = 0;
    try {
      count = parseInt(localStorage.getItem(DISMISS_COUNT_KEY) || "0", 10) + 1;
      localStorage.setItem(DISMISS_COUNT_KEY, String(count));
    } catch (e) {
      // localStorage unavailable — fall through with count=0 → defaults to 7 days
    }
    let days;
    if (count <= 1) days = 7;
    else if (count === 2) days = 30;
    else if (count === 3) days = 90;
    else days = 36500;
    setDismissed(days);
  }

  let deferredPrompt = null;
  let installBtn = null;
  let stylesInjected = false;

  // Cross-profile / cross-browser install detection (Chromium only).
  // If the PWA is already installed anywhere on this device — even in a
  // different profile or browser — suppress the pill so we don't nag users
  // who've already converted. Falls back gracefully on browsers without
  // the API (Safari, Firefox) and on any API error.
  const installedElsewherePromise = (async function () {
    if (!("getInstalledRelatedApps" in navigator)) return false;
    try {
      const apps = await navigator.getInstalledRelatedApps();
      return Array.isArray(apps) && apps.length > 0;
    } catch (e) {
      return false;
    }
  })();

  function injectStyles() {
    if (stylesInjected) return;
    stylesInjected = true;
    const css = `
      #ts-install-btn {
        position: fixed;
        bottom: 20px;
        right: 20px;
        z-index: 9000;
        display: none;
        align-items: center;
        gap: 8px;
        padding: 10px 16px;
        background: #2c3d4f;
        color: #fff;
        border: none;
        border-radius: 24px;
        font-family: inherit;
        font-size: 14px;
        font-weight: 500;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
        cursor: pointer;
        opacity: 0;
        transform: translateY(8px);
        transition: opacity 0.25s ease, transform 0.25s ease, background 0.15s ease;
      }
      #ts-install-btn.ts-install-visible {
        display: inline-flex;
        opacity: 1;
        transform: translateY(0);
      }
      #ts-install-btn:hover {
        background: #1d2a39;
      }
      #ts-install-btn .ts-install-icon {
        font-size: 18px;
        line-height: 1;
      }
      #ts-install-btn .ts-install-close {
        margin-left: 4px;
        width: 18px;
        height: 18px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: rgba(255, 255, 255, 0.15);
        border-radius: 50%;
        color: #fff;
        opacity: 0.8;
      }
      #ts-install-btn .ts-install-close:hover {
        opacity: 1;
      }
      #ts-install-btn .ts-install-close svg {
        display: block;
        pointer-events: none;
      }

      #ts-install-ios-modal {
        position: fixed;
        inset: 0;
        z-index: 9500;
        background: rgba(0, 0, 0, 0.45);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
      }
      #ts-install-ios-modal .ts-install-modal {
        background: #fff;
        border-radius: 12px;
        max-width: 360px;
        width: 100%;
        padding: 24px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
        color: #2c3d4f;
        font-family: inherit;
      }
      #ts-install-ios-modal h3 {
        margin: 0 0 12px 0;
        font-size: 20px;
      }
      #ts-install-ios-modal p {
        margin: 0 0 12px 0;
        font-size: 14px;
        color: #6c757d;
      }
      #ts-install-ios-modal ol {
        margin: 0 0 20px 0;
        padding-left: 20px;
        font-size: 14px;
        line-height: 1.6;
      }
      #ts-install-ios-modal .ts-install-modal-buttons {
        display: flex;
        gap: 8px;
        justify-content: flex-end;
      }
      #ts-install-ios-modal button {
        padding: 10px 16px;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        border: 1px solid #dee2e6;
        background: #f8f9fa;
        color: #2c3d4f;
        font-family: inherit;
      }
      #ts-install-ios-modal button.ts-install-primary {
        background: #2c3d4f;
        color: #fff;
        border-color: #2c3d4f;
      }
      #ts-install-ios-modal button:hover {
        opacity: 0.9;
      }
    `;
    const style = document.createElement("style");
    style.id = "ts-install-styles";
    style.textContent = css;
    document.head.appendChild(style);
  }

  function createButton() {
    if (installBtn) return installBtn;
    injectStyles();
    const btn = document.createElement("button");
    btn.id = "ts-install-btn";
    btn.type = "button";
    btn.setAttribute("aria-label", "Install True Sky app");

    const icon = document.createElement("span");
    icon.className = "ts-install-icon";
    icon.textContent = "↓";

    const label = document.createElement("span");
    label.textContent = "Install True Sky";

    const close = document.createElement("span");
    close.className = "ts-install-close";
    close.setAttribute("role", "button");
    close.setAttribute("aria-label", "Dismiss install prompt");
    close.innerHTML =
      '<svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true" focusable="false">' +
      '<path d="M1 1 L9 9 M9 1 L1 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" fill="none"/>' +
      "</svg>";

    btn.appendChild(icon);
    btn.appendChild(label);
    btn.appendChild(close);

    btn.addEventListener("click", function (e) {
      if (e.target === close) {
        e.stopPropagation();
        recordAndDismiss();
        hideButton();
        return;
      }
      handleInstallClick();
    });

    document.body.appendChild(btn);
    installBtn = btn;
    return btn;
  }

  async function showButton() {
    if (isDismissed()) return;
    // Suppress if the PWA is already installed elsewhere on this device
    if (await installedElsewherePromise) {
      setDismissed(DISMISS_DAYS_INSTALLED);
      return;
    }
    // Defer if a blocking modal is showing — let the user finish that first
    if (document.getElementById("tos-modal")) {
      setTimeout(showButton, 1500);
      return;
    }
    const btn = createButton();
    // Force a layout flush before adding the visible class for the transition
    btn.offsetHeight; // eslint-disable-line no-unused-expressions
    btn.classList.add("ts-install-visible");
  }

  function hideButton() {
    if (installBtn) installBtn.classList.remove("ts-install-visible");
  }

  function showSafariInstructions() {
    if (document.getElementById("ts-install-ios-modal")) return;
    injectStyles();

    const isMac = isMacSafari();

    const overlay = document.createElement("div");
    overlay.id = "ts-install-ios-modal";

    const modal = document.createElement("div");
    modal.className = "ts-install-modal";

    const h3 = document.createElement("h3");
    h3.textContent = "Install True Sky";

    const p = document.createElement("p");
    p.textContent = isMac
      ? "Add True Sky to your Dock for quick access:"
      : "Add True Sky to your home screen for quick access:";

    const ol = document.createElement("ol");
    const steps = isMac
      ? [
          "Open the File menu in Safari",
          "Select Add to Dock",
          "Click Add to confirm (requires macOS Sonoma or later)",
        ]
      : [
          "Tap the Share button at the bottom of Safari",
          "Scroll and tap Add to Home Screen",
          "Tap Add in the top-right corner",
        ];
    steps.forEach(function (text) {
      const li = document.createElement("li");
      li.textContent = text;
      ol.appendChild(li);
    });

    const buttons = document.createElement("div");
    buttons.className = "ts-install-modal-buttons";

    const laterBtn = document.createElement("button");
    laterBtn.type = "button";
    laterBtn.textContent = "Maybe later";
    laterBtn.addEventListener("click", function () {
      overlay.remove();
      recordAndDismiss();
      hideButton();
    });

    const gotItBtn = document.createElement("button");
    gotItBtn.type = "button";
    gotItBtn.className = "ts-install-primary";
    gotItBtn.textContent = "Got it";
    gotItBtn.addEventListener("click", function () {
      overlay.remove();
      recordAndDismiss();
      hideButton();
    });

    buttons.appendChild(laterBtn);
    buttons.appendChild(gotItBtn);

    modal.appendChild(h3);
    modal.appendChild(p);
    modal.appendChild(ol);
    modal.appendChild(buttons);
    overlay.appendChild(modal);

    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) {
        overlay.remove();
      }
    });

    document.body.appendChild(overlay);
  }

  function handleInstallClick() {
    if (deferredPrompt && typeof deferredPrompt.prompt === "function") {
      try {
        deferredPrompt.prompt();
        const userChoice = deferredPrompt.userChoice;
        deferredPrompt = null;
        hideButton();
        if (userChoice && typeof userChoice.then === "function") {
          userChoice.then(function (choice) {
            if (!choice || choice.outcome !== "accepted") {
              recordAndDismiss();
            }
          });
        }
      } catch (err) {
        deferredPrompt = null;
        hideButton();
        recordAndDismiss();
      }
      return;
    }

    if (isIOSSafari() || isMacSafari()) {
      showSafariInstructions();
      return;
    }

    // Fallback: no install pathway available — dismiss quietly
    recordAndDismiss();
    hideButton();
  }

  // Chromium: capture the install prompt and reveal our button
  window.addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault();
    deferredPrompt = e;
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", showButton, { once: true });
    } else {
      showButton();
    }
  });

  // Hide the button once installation completes
  window.addEventListener("appinstalled", function () {
    deferredPrompt = null;
    hideButton();
    setDismissed(DISMISS_DAYS_INSTALLED);
  });

  // Safari (iOS and Mac) never fires beforeinstallprompt — show the button on a
  // delay so we don't compete with the welcome/release modals on first paint.
  function maybeShowSafari() {
    if (!isIOSSafari() && !isMacSafari()) return;
    if (isDismissed()) return;
    setTimeout(showButton, SHOW_DELAY_MS);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", maybeShowSafari, { once: true });
  } else {
    maybeShowSafari();
  }

  // Public API for other UI surfaces (e.g. the welcome modal's install button).
  // Returns "prompted" if the native install dialog was triggered,
  //         "instructions" if the Safari (iOS or Mac) overlay was shown,
  //         "unavailable" if no install path was available right now.
  // Deliberately does NOT dismiss or hide the floating pill on "unavailable",
  // so the user can still install later via the pill or browser address bar.
  function trigger() {
    if (deferredPrompt && typeof deferredPrompt.prompt === "function") {
      handleInstallClick();
      return "prompted";
    }
    if (isIOSSafari() || isMacSafari()) {
      showSafariInstructions();
      return "instructions";
    }
    return "unavailable";
  }

  window.tsInstallPrompt = { trigger: trigger };
})();
