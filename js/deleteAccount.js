"use strict";

// Show temporary error messages (matches pattern from sharedNatal.js)
function showTemporaryError(container, message, duration = 5000) {
  if (!container) return;
  container.textContent = message;
  setTimeout(() => {
    container.textContent = "";
  }, duration);
}

document.getElementById("deleteAccountBtn").addEventListener("click", () => {
  const confirmCheckbox = document.getElementById(
    "confirmDeleteAccountCheckbox"
  );
  if (!confirmCheckbox.checked) {
    // Do nothing if the checkbox isn't checked
    return;
  }
  showLoading();
  fetch("/deleteAccount", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: 'same-origin'
  })
    .then((response) => response.json())
    .then((data) => {
      hideLoading();
      if (data.success) {
        // Redirect on successful deletion
        window.location.href = "/login";
      } else if (data.error) {
        // Display error using the same pattern as other forms
        const errorContainer = document.getElementById("deleteAccountMessage");
        showTemporaryError(errorContainer, data.error);
      }
    })
    .catch((err) => {
      hideLoading();
      const errorContainer = document.getElementById("deleteAccountMessage");
      showTemporaryError(errorContainer, 
        "Unable to delete account. Please email truesky@masteringthezodiac.com for assistance.");
    });
});
