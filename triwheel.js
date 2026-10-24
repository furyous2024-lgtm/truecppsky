"use strict";

import { sharedNatal } from "./sharedNatal.js";
import { openSafariPrintView, isSafariMode } from "./js/safariPrintView.js";

document.addEventListener("DOMContentLoaded", function () {
  const svgContainer = d3.select("#triwheel-chart");

  // Move house circles closer to center
  const signInner = 2.27;
  const houseOuter = 7.5;
  const houseInner = 9;
  const houseNumber = `16px`;
  const planetCircle = 5;
  const innerWheel = 0.55;
  const middleWheel = 0.765;
  const innerPlanet = 0.8;
  const centerPlanet = 3.25;
  const outerPlanet = 2.44;
  const removeHouseTicks = true;

  // Call sharedNatal with the custom parameters for triwheel chart
  sharedNatal(
    svgContainer,
    signInner,
    houseOuter,
    houseInner,
    houseNumber,
    planetCircle,
    innerWheel,
    middleWheel,
    innerPlanet,
    centerPlanet,
    outerPlanet,
    removeHouseTicks,
    "triwheel"
  );
});

// Print triwheel chart
document.getElementById("triwheelPrint").addEventListener("click", function () {
  const chart = document.getElementById("triwheel-chart");
  if (!chart) return;

  // Determine label based on selected wheel mode
  const getWheelModeLabel = () => {
    if (chart.classList.contains("biwheel-progressions")) return "Progressions";
    if (chart.classList.contains("biwheel-transits")) return "Transits";
    return "Multiwheel";
  };
  const wheelModeLabel = getWheelModeLabel();

  if (isSafariMode()) {
    // Safari mode - open in new window with title modifier
    openSafariPrintView("triwheel-chart", "Triwheel Chart", (titleText) => {
      if (!titleText.dataset.originalText) {
        titleText.dataset.originalText = titleText.textContent;
      }
      titleText.textContent = `${titleText.dataset.originalText} - ${wheelModeLabel}`;
    });
  } else {
    // Standard mode - use browser print
    const titleText = chart.querySelector("svg .birth-details text");

    if (titleText && !titleText.dataset.originalText) {
      // Save the original name
      titleText.dataset.originalText = titleText.textContent;
    }

    if (titleText) {
      // Append label based on wheel mode
      titleText.textContent = `${titleText.dataset.originalText} - ${wheelModeLabel}`;
    }

    // Ensure chart is in view for printing
    const y = chart.getBoundingClientRect().top + window.pageYOffset;
    window.scrollTo(0, y);

    // Trigger print
    window.print();

    // Restore original text
    if (titleText) {
      setTimeout(() => {
        titleText.textContent = titleText.dataset.originalText;
      }, 1000);
    }
  }
});

// Triwheel report
document.getElementById("triwheelReport")?.addEventListener("click", function () {
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

  window.generateTriwheelReport(printWindow);
});
