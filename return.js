"use strict";

import { sharedNatal } from "./sharedNatal.js?v=IAU_REAL13_ANY_AYANAMSA_20261015";
import { openSafariPrintView, isSafariMode } from "./js/safariPrintView.js?v=DELTA_SYNASTRY_FIX_20260617";

document.addEventListener("DOMContentLoaded", function () {
  const svgContainer = d3.select("#return-chart");
  sharedNatal(
    svgContainer,
    false,
    false,
    false,
    false,
    false,
    false,
    false,
    false,
    false,
    false,
    false,
    "return"
  );
});

// Print return chart
document.getElementById("returnPrint").addEventListener("click", function () {
  const chart = document.getElementById("return-chart");
  if (!chart) return;
  const returnType = document.getElementById("adjustType")?.value || "";

  const label = `${returnType || "Solar"} Return`;
  openSafariPrintView("return-chart", label, (titleText) => {
    if (!titleText.dataset.originalText) {
      titleText.dataset.originalText = titleText.textContent;
    }
    titleText.textContent = `${titleText.dataset.originalText} - ${label}`;
  });
});

// Return report
document.getElementById("returnReport")?.addEventListener("click", function () {
  // Open immediately on the click so View Report is not blocked by async fetch
  const printWindow = window.open(
    "about:blank",
    "_blank",
    "width=1000,height=1200,scrollbars=yes,resizable=yes",
  );
  if (printWindow) {
    printWindow.document.write(
      `<html><body style="font-family:Segoe UI,Arial,sans-serif;padding:24px"><p>Loading report...</p></body></html>`,
    );
  }

  window.generateReturnReport(printWindow);
});
