"use strict";

import { sharedNatal } from "./sharedNatal.js";
import { openSafariPrintView, isSafariMode } from "./js/safariPrintView.js";

document.addEventListener("DOMContentLoaded", function () {
  const svgContainer = d3.select("#synastry-chart");

  // Move house circles closer to center
  const signInner = 2.27;
  const houseOuter = 7.5;
  const houseInner = 9;
  const houseNumber = `16px`;
  const planetCircle = 4.2;
  const innerWheel = 0.64;
  const middleWheel = false;
  const innerPlanet = 1;
  const centerPlanet = 3.25;
  const outerPlanet = 2.5;
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
    "synastry"
  );
});

// Print synastry chart
document.getElementById("synastryPrint").addEventListener("click", function () {
  const chart = document.getElementById("synastry-chart");
  if (!chart) return;

  if (isSafariMode()) {
    // Safari mode - open in new window
    openSafariPrintView("synastry-chart", "Synastry Chart");
  } else {
    // Standard mode - use browser print
    const y = chart.getBoundingClientRect().top + window.pageYOffset;
    window.scrollTo(0, y);
    window.print();
  }
});

// Synastry report
document.getElementById("synastryReport")?.addEventListener("click", function () {
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

  window.generateSynastryReport(printWindow);
});
