"use strict";

// Decorative subscription lock icons are disabled. Subscription validation and
// access control remain enforced by the existing server-side endpoints.
// This cleanup also restores original button graphics for clients that still
// have an old page version loaded from cache.
document.addEventListener("DOMContentLoaded", function () {
  document.querySelectorAll('img[src*="/lock.svg"], img[alt="Subscription required"]').forEach((icon) => {
    const button = icon.closest("button");
    if (button?.id === "sendMessage") {
      // This image replaced the original send arrow in older cached clients.
      icon.src = "/images/misc/arrow-right.svg";
      icon.alt = "Send";
      icon.style.width = "24px";
      icon.style.height = "24px";
      return;
    }
    icon.remove();
  });

  const saveLocationButton = document.getElementById("saveDefaultLocationBtn");
  if (saveLocationButton && !saveLocationButton.textContent.trim() && !saveLocationButton.querySelector("img")) {
    saveLocationButton.textContent = "✔";
  }
});
