"use strict";

// Helper to clear a message after a delay using the importResults element
let clearImportMessageTimeoutId;

const clearImportMessage = (elementId, delay = 5000) => {
  // Clear any existing timeout before setting a new one
  if (clearImportMessageTimeoutId) {
    clearTimeout(clearImportMessageTimeoutId);
  }
  clearImportMessageTimeoutId = setTimeout(() => {
    document.getElementById(elementId).innerText = "";
  }, delay);
};

// Helper to show the loading overlay
const showLoading = () => {
  const overlay = document.getElementById("loading-overlay");
  if (overlay) {
    overlay.style.display = "block";
  }
};

// Helper to hide the loading overlay
const hideLoading = () => {
  const overlay = document.getElementById("loading-overlay");
  if (overlay) {
    overlay.style.display = "none";
  }
};

// Import Charts Handler
const fileInput = document.getElementById("chartFileInput");
const importBtn = document.getElementById("importChartsBtn");

// When the import button is clicked, trigger a click on the hidden file input
importBtn.addEventListener("click", () => {
  fileInput.click();
});

// When a file is selected, process the import automatically
fileInput.addEventListener("change", () => {
  if (fileInput.files.length === 0) {
    document.getElementById("importResults").innerText = "No file selected.";
    clearImportMessage("importResults");
    return;
  }
  const file = fileInput.files[0];
  const MAX_FILE_SIZE_BYTES = 204800; // 200KB

  // Validate file extension
  if (!file.name.toLowerCase().endsWith(".txt")) {
    document.getElementById("importResults").innerText =
      "Please select a .txt file.";
    clearImportMessage("importResults");
    return;
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    document.getElementById("importResults").innerText =
      "File size exceeds maximum allowed (200KB).";
    clearImportMessage("importResults");
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    const fileContent = e.target.result;
    showLoading();
    fetch("/import-charts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // Send both fileContent and fileName to the server
      body: JSON.stringify({ fileContent, fileName: file.name }),
      credentials: 'same-origin'
    })
      .then((response) => response.json())
      .then((data) => {
        // If the server returns a redirectUrl, redirect the browser to Stripe Checkout
        if (data.redirectUrl) {
          hideLoading();
          window.location.href = data.redirectUrl;
          return;
        }

        if (!data.success) {
          hideLoading();
          document.getElementById("importResults").innerText = data.error;
          clearImportMessage("importResults");
          return;
        }

        // Hide the spinner but keep the overlay to prevent clicks
        const spinner = document.querySelector("#loading-overlay .spinner");
        if (spinner) {
          spinner.style.display = "none";
        }

        let errorsMsg = "";
        if (data.errors && data.errors.length) {
          errorsMsg = data.errors.join(". ") + ".";
        }
        const resultMsg =
          "Imported " +
          data.imported +
          "/" +
          data.total +
          " charts. " +
          errorsMsg +
          " Updating...";
        document.getElementById("importResults").innerText = resultMsg;

        // Keep overlay active and refresh after notification disappears (5 seconds)
        setTimeout(() => {
          window.location.reload();
        }, 6000);
      })
      .catch((err) => {
        hideLoading();
        document.getElementById("importResults").innerText =
          "Fetch error: " + err;
        clearImportMessage("importResults");
      });
  };
  reader.readAsText(file);
});

// Export Charts Handler
document.getElementById("exportChartsBtn").addEventListener("click", () => {
  showLoading();
  fetch("/export-charts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
    credentials: 'same-origin'
  })
    .then((response) => response.json())
    .then((data) => {
      hideLoading();

      // If the server returns a redirectUrl, redirect the browser to Stripe Checkout
      if (data.redirectUrl) {
        window.location.href = data.redirectUrl;
        return;
      }

      if (!data.success) {
        document.getElementById("importResults").innerText = data.error;
        clearImportMessage("importResults");
        return;
      }
      const blob = new Blob([data.fileContent], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "charts_export.txt";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      // No message after export
    })
    .catch((err) => {
      hideLoading();
      document.getElementById("importResults").innerText =
        "Fetch error: " + err;
      clearImportMessage("importResults");
    });
});

// Delete Charts Handler
document.getElementById("deleteChartsBtn").addEventListener("click", () => {
  const confirmCheckbox = document.getElementById("confirmExportCheckbox");
  if (!confirmCheckbox.checked) {
    document.getElementById("importResults").innerText =
      "Please check the box to confirm deletion.";
    clearImportMessage("importResults");
    return;
  }
  showLoading();
  fetch("/delete-exported-charts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: 'same-origin'
  })
    .then((response) => response.json())
    .then((data) => {
      hideLoading();
      if (data.success) {
        document.getElementById("importResults").innerText = data.message;
        // Reset the confirmation checkbox
        document.getElementById("confirmExportCheckbox").checked = false;
        // Refresh the recent charts list on the natal page
        fetchRecentCharts && fetchRecentCharts();
      } else {
        document.getElementById("importResults").innerText = data.error;
      }
      clearImportMessage("importResults");
    })
    .catch((err) => {
      hideLoading();
      document.getElementById("importResults").innerText =
        "Fetch error: " + err;
      clearImportMessage("importResults");
    });
});
