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
const exportBtn = document.getElementById("exportChartsBtn");
const importResults = document.getElementById("importResults");

function showImportResult(message) {
  importResults.innerText = message;
  clearImportMessage("importResults");
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 60000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error(`Request timed out after ${Math.ceil(timeoutMs / 1000)} seconds.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function parseCsvLine(line) {
  const fields = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      fields.push(field.trim());
      field = "";
    } else {
      field += character;
    }
  }
  fields.push(field.trim());
  return fields;
}

function parseChartsFile(fileContent) {
  let parsed;
  try {
    parsed = JSON.parse(fileContent);
  } catch {
    parsed = null;
  }

  const charts = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.charts)
      ? parsed.charts
      : Array.isArray(parsed?.recentCharts)
        ? parsed.recentCharts
        : null;

  if (charts) return charts;

  return String(fileContent)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const fields = parseCsvLine(line);
      const [name, year, month, day, time, utc, location, longitude, latitude] =
        fields;
      const timeParts = String(time || "").split(":");
      if (
        fields.length < 9 ||
        !name ||
        !year ||
        !month ||
        !day ||
        !timeParts[0] ||
        !timeParts[1] ||
        !location ||
        !Number.isFinite(Number(longitude)) ||
        !Number.isFinite(Number(latitude))
      ) {
        throw new Error(`Invalid chart data on line ${index + 1}.`);
      }

      return {
        name,
        year,
        month,
        day,
        hour: timeParts[0],
        minute: timeParts[1],
        utcOffset: utc,
        location,
        long: Number(longitude),
        lat: Number(latitude),
        profile_type: "natal",
      };
    });
}

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
  const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

  // Validate file extension
  if (!file.name.toLowerCase().endsWith(".txt")) {
    document.getElementById("importResults").innerText =
      "Please select a .txt file.";
    clearImportMessage("importResults");
    return;
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    document.getElementById("importResults").innerText =
      "File size exceeds maximum allowed (10MB).";
    clearImportMessage("importResults");
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    let charts;
    try {
      charts = parseChartsFile(e.target.result);
      if (!charts.length || charts.length > 5000) {
        throw new Error("Import must contain between 1 and 5000 charts.");
      }
      if (charts.some((chart) => !chart || typeof chart !== "object" || Array.isArray(chart))) {
        throw new Error("The selected file contains invalid chart data.");
      }
    } catch (error) {
      showImportResult(error.message);
      fileInput.value = "";
      return;
    }

    showLoading();
    (async () => {
      let imported = 0;
      try {
        for (let offset = 0; offset < charts.length; offset += 1000) {
          const batch = charts.slice(offset, offset + 1000);
          const response = await fetchWithTimeout("/import-charts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ charts: batch }),
            credentials: "same-origin",
          }, 120000);
          const data = await response.json();
          if (data.redirectUrl) {
            window.location.href = data.redirectUrl;
            return;
          }
          if (!response.ok || !data.success) {
            throw new Error(data.error || `Import failed (${response.status}).`);
          }
          imported += data.imported ?? batch.length;
        }
        showImportResult(`Imported ${imported}/${charts.length} charts.`);
        if (typeof window.fetchRecentCharts === "function") {
          window.fetchRecentCharts();
        }
      } catch (error) {
        showImportResult(
          imported
            ? `Import partially completed (${imported}/${charts.length}): ${error.message}`
            : `Import error: ${error.message}`,
        );
      } finally {
        hideLoading();
        fileInput.value = "";
      }
    })();
  };
  reader.onerror = () => {
    showImportResult("Unable to read the selected file.");
    fileInput.value = "";
  };
  reader.readAsText(file);
});

// Export Charts Handler
exportBtn.addEventListener("click", () => {
  showLoading();
  fetchWithTimeout("/export-charts", {
    method: "GET",
    credentials: "same-origin",
  })
    .then(async (response) => {
      const data = await response.json();
      if (!response.ok || data?.success === false) {
        throw new Error(data?.error || `Export failed (${response.status}).`);
      }
      const charts = Array.isArray(data)
        ? data
        : Array.isArray(data?.charts)
          ? data.charts
          : Array.isArray(data?.recentCharts)
            ? data.recentCharts
            : null;
      if (!charts) throw new Error("The charts service returned an invalid response.");
      return charts;
    })
    .then((data) => {
      hideLoading();
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "text/plain;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "charts_export.txt";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      showImportResult(`Exported ${data.length} charts.`);
    })
    .catch((error) => {
      hideLoading();
      showImportResult(`Export error: ${error.message}`);
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
  fetchWithTimeout("/delete-exported-charts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: 'same-origin'
  })
    .then((response) => response.json())
    .then((data) => {
      hideLoading();
      if (data.success) {
        importResults.innerText = data.message;
        // Reset the confirmation checkbox
        document.getElementById("confirmExportCheckbox").checked = false;
        // Refresh the recent charts list on the natal page
        fetchRecentCharts && fetchRecentCharts();
      } else {
        importResults.innerText = data.error;
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
