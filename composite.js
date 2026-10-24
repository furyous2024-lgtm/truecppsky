import { sharedNatal } from "./sharedNatal.js";
import { openSafariPrintView, isSafariMode } from "./js/safariPrintView.js";

document.addEventListener("DOMContentLoaded", function () {
  const compositeContainerBlank = d3.select("#composite-chart-blank");
  sharedNatal(
    compositeContainerBlank,
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
    "compositeBlank"
  );

  const compositeContainer = d3.select("#composite-chart");
  sharedNatal(
    compositeContainer,
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
    "composite"
  );
});

document
  .getElementById("compositePrint")
  ?.addEventListener("click", function () {
    const chart = document.getElementById("composite-chart");
    const blankChart = document.getElementById("composite-chart-blank");

    // Determine which chart to use based on visibility
    let chartToUse = "composite-chart";
    if (
      blankChart &&
      blankChart.style.display !== "none" &&
      (!chart ||
        chart.style.display === "none" ||
        !chart.querySelector("svg circle"))
    ) {
      chartToUse = "composite-chart-blank";
    }

    if (!document.getElementById(chartToUse)) return;

    if (isSafariMode()) {
      // Safari mode - open in new window
      openSafariPrintView(chartToUse, "Composite Chart");
    } else {
      // Standard mode - use browser print
      const y = chart.getBoundingClientRect().top + window.pageYOffset;
      window.scrollTo(0, y);
      window.print();
    }
  });

// Composite report
document.getElementById("compositeReport")?.addEventListener("click", function () {
  // For Safari, open window immediately to avoid popup blocking
  const isSafari =
    /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

  let printWindow = null;
  if (isSafari) {
    printWindow = window.open("", "PrintChart", "width=1000,height=1200");
    if (printWindow) {
      printWindow.document.write(
        "<html><body><p>Loading report...</p></body></html>"
      );
    }
  }

  window.generateCompositeReport(printWindow);
});
