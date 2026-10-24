"use strict";

// Master color synchronization system
class ColorSynchronizer {
  constructor() {
    this.masterElement = null;
    this.houseColors = [
      "#e15947",
      "#d58f3b",
      "#c9dd47",
      "#a5c16f",
      "#33b278",
      "#44c1a8",
      "#33b7bb",
      "#3388c7",
      "#7a33d0",
      "#a14cd3",
      "#cf49cc",
      "#c16195",
    ];
    this.currentHueRotation = 0;
    this.animationId = null;
    this.cachedElements = new Map();
  }

  init() {
    // Wait for DOM to be ready
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => this.start());
    } else {
      this.start();
    }
  }

  start() {
    this.masterElement = document.getElementById("masterColorReference");
    if (!this.masterElement) {
      console.error("ColorSync: Master color reference element not found");
      return;
    }

    // Start the synchronization loop
    this.updateColors();
  }

  updateColors() {
    if (!this.masterElement) return;

    // Get current hue rotation from master element
    const computedStyle = getComputedStyle(this.masterElement);
    const filterValue = computedStyle.filter;

    // Extract hue-rotate value from filter string
    const hueMatch = filterValue.match(/hue-rotate\(([^)]+)\)/);
    const newHueRotation = hueMatch ? parseFloat(hueMatch[1]) : 0;

    // Only update if rotation changed significantly (performance optimization)
    if (Math.abs(newHueRotation - this.currentHueRotation) > 0.5) {
      this.currentHueRotation = newHueRotation;
      this.applyColorsToElements();
    }

    // Continue the loop
    this.animationId = requestAnimationFrame(() => this.updateColors());
  }

  applyColorsToElements() {
    // Expose current hue rotation for elements that use filter directly (e.g., AI avatar)
    document.documentElement.style.setProperty(
      "--current-hue-rotation",
      `${this.currentHueRotation}deg`,
    );

    // Calculate rotated colors - using opposite colors for maximum contrast
    const leftColor = this.rotateHue(
      this.houseColors[0],
      this.currentHueRotation,
    );
    const rightColor = this.rotateHue(
      this.houseColors[2],
      this.currentHueRotation,
    );

    // Update body::before background
    this.updateBodyBackground(leftColor, rightColor);

    // Update calculate buttons
    this.updateCalculateButtons();

    // Update saved charts hover states
    this.updateSavedChartsHover();

    // Update delete button colors
    this.updateDeleteButtons();

    // Update account button colors
    this.updateAccountButtons();

    // Debug log (remove after testing)
    if (window.colorSyncDebug) {
      console.log("Color sync updated:", {
        hue: this.currentHueRotation.toFixed(1),
        leftColor,
        rightColor,
      });
    }
  }

  updateBodyBackground(leftColor, rightColor) {
    const leftRgba = this.hexToRgba(leftColor);
    const rightRgba = this.hexToRgba(rightColor);

    // Apply to CSS custom properties
    document.documentElement.style.setProperty(
      "--corner-color-left-015",
      `rgba(${leftRgba.r}, ${leftRgba.g}, ${leftRgba.b}, 0.15)`,
    );
    document.documentElement.style.setProperty(
      "--corner-color-left-010",
      `rgba(${leftRgba.r}, ${leftRgba.g}, ${leftRgba.b}, 0.10)`,
    );
    document.documentElement.style.setProperty(
      "--corner-color-left-005",
      `rgba(${leftRgba.r}, ${leftRgba.g}, ${leftRgba.b}, 0.05)`,
    );

    document.documentElement.style.setProperty(
      "--corner-color-right-015",
      `rgba(${rightRgba.r}, ${rightRgba.g}, ${rightRgba.b}, 0.15)`,
    );
    document.documentElement.style.setProperty(
      "--corner-color-right-010",
      `rgba(${rightRgba.r}, ${rightRgba.g}, ${rightRgba.b}, 0.10)`,
    );
    document.documentElement.style.setProperty(
      "--corner-color-right-005",
      `rgba(${rightRgba.r}, ${rightRgba.g}, ${rightRgba.b}, 0.05)`,
    );
  }

  updateCalculateButtons() {
    // For calculate buttons, we'll update their background using CSS custom properties
    const leftColor = this.rotateHue(
      this.houseColors[0],
      this.currentHueRotation,
    );
    const rightColor = this.rotateHue(
      this.houseColors[2],
      this.currentHueRotation,
    );

    const leftRgba = this.hexToRgba(leftColor);
    const rightRgba = this.hexToRgba(rightColor);

    document.documentElement.style.setProperty(
      "--calc-color-left-008",
      `rgba(${leftRgba.r}, ${leftRgba.g}, ${leftRgba.b}, 0.065)`,
    );
    document.documentElement.style.setProperty(
      "--calc-color-left-005",
      `rgba(${leftRgba.r}, ${leftRgba.g}, ${leftRgba.b}, 0.045)`,
    );
    document.documentElement.style.setProperty(
      "--calc-color-left-002",
      `rgba(${leftRgba.r}, ${leftRgba.g}, ${leftRgba.b}, 0.025)`,
    );

    document.documentElement.style.setProperty(
      "--calc-color-right-008",
      `rgba(${rightRgba.r}, ${rightRgba.g}, ${rightRgba.b}, 0.065)`,
    );
    document.documentElement.style.setProperty(
      "--calc-color-right-005",
      `rgba(${rightRgba.r}, ${rightRgba.g}, ${rightRgba.b}, 0.045)`,
    );
    document.documentElement.style.setProperty(
      "--calc-color-right-002",
      `rgba(${rightRgba.r}, ${rightRgba.g}, ${rightRgba.b}, 0.025)`,
    );

    // AI avatar colors - pastel versions (blend 40% toward color from white)
    // This gives the same "tinted white" look as buttons, not "transparent color"
    const blend = 0.4;
    const leftPastel = {
      r: Math.round(255 - blend * (255 - leftRgba.r)),
      g: Math.round(255 - blend * (255 - leftRgba.g)),
      b: Math.round(255 - blend * (255 - leftRgba.b)),
    };
    const rightPastel = {
      r: Math.round(255 - blend * (255 - rightRgba.r)),
      g: Math.round(255 - blend * (255 - rightRgba.g)),
      b: Math.round(255 - blend * (255 - rightRgba.b)),
    };
    document.documentElement.style.setProperty(
      "--calc-color-left-avatar",
      `rgb(${leftPastel.r}, ${leftPastel.g}, ${leftPastel.b})`,
    );
    document.documentElement.style.setProperty(
      "--calc-color-right-avatar",
      `rgb(${rightPastel.r}, ${rightPastel.g}, ${rightPastel.b})`,
    );

    // Set calculate button hover colors (slightly brighter than normal)
    document.documentElement.style.setProperty(
      "--calc-hover-left-008",
      `rgba(${leftRgba.r}, ${leftRgba.g}, ${leftRgba.b}, 0.12)`,
    );
    document.documentElement.style.setProperty(
      "--calc-hover-left-005",
      `rgba(${leftRgba.r}, ${leftRgba.g}, ${leftRgba.b}, 0.08)`,
    );
    document.documentElement.style.setProperty(
      "--calc-hover-left-003",
      `rgba(${leftRgba.r}, ${leftRgba.g}, ${leftRgba.b}, 0.06)`,
    );

    document.documentElement.style.setProperty(
      "--calc-hover-right-008",
      `rgba(${rightRgba.r}, ${rightRgba.g}, ${rightRgba.b}, 0.12)`,
    );
    document.documentElement.style.setProperty(
      "--calc-hover-right-005",
      `rgba(${rightRgba.r}, ${rightRgba.g}, ${rightRgba.b}, 0.08)`,
    );
    document.documentElement.style.setProperty(
      "--calc-hover-right-003",
      `rgba(${rightRgba.r}, ${rightRgba.g}, ${rightRgba.b}, 0.06)`,
    );
  }

  updateSavedChartsHover() {
    // For hover states, we'll use CSS custom properties that get updated
    const leftColor = this.rotateHue(
      this.houseColors[0],
      this.currentHueRotation,
    );
    const rightColor = this.rotateHue(
      this.houseColors[2],
      this.currentHueRotation,
    );

    const leftRgba = this.hexToRgba(leftColor);
    const rightRgba = this.hexToRgba(rightColor);

    document.documentElement.style.setProperty(
      "--hover-color-left-008",
      `rgba(${leftRgba.r}, ${leftRgba.g}, ${leftRgba.b}, 0.07)`,
    );
    document.documentElement.style.setProperty(
      "--hover-color-left-005",
      `rgba(${leftRgba.r}, ${leftRgba.g}, ${leftRgba.b}, 0.05)`,
    );
    document.documentElement.style.setProperty(
      "--hover-color-left-002",
      `rgba(${leftRgba.r}, ${leftRgba.g}, ${leftRgba.b}, 0.025)`,
    );

    document.documentElement.style.setProperty(
      "--hover-color-right-008",
      `rgba(${rightRgba.r}, ${rightRgba.g}, ${rightRgba.b}, 0.07)`,
    );
    document.documentElement.style.setProperty(
      "--hover-color-right-005",
      `rgba(${rightRgba.r}, ${rightRgba.g}, ${rightRgba.b}, 0.05)`,
    );
    document.documentElement.style.setProperty(
      "--hover-color-right-002",
      `rgba(${rightRgba.r}, ${rightRgba.g}, ${rightRgba.b}, 0.025)`,
    );

    // Set delete button hover colors (slightly brighter than chart hovers)
    document.documentElement.style.setProperty(
      "--delete-hover-left-012",
      `rgba(${leftRgba.r}, ${leftRgba.g}, ${leftRgba.b}, 0.12)`,
    );
    document.documentElement.style.setProperty(
      "--delete-hover-left-008",
      `rgba(${leftRgba.r}, ${leftRgba.g}, ${leftRgba.b}, 0.08)`,
    );
    document.documentElement.style.setProperty(
      "--delete-hover-left-004",
      `rgba(${leftRgba.r}, ${leftRgba.g}, ${leftRgba.b}, 0.04)`,
    );

    document.documentElement.style.setProperty(
      "--delete-hover-right-012",
      `rgba(${rightRgba.r}, ${rightRgba.g}, ${rightRgba.b}, 0.12)`,
    );
    document.documentElement.style.setProperty(
      "--delete-hover-right-008",
      `rgba(${rightRgba.r}, ${rightRgba.g}, ${rightRgba.b}, 0.08)`,
    );
    document.documentElement.style.setProperty(
      "--delete-hover-right-004",
      `rgba(${rightRgba.r}, ${rightRgba.g}, ${rightRgba.b}, 0.04)`,
    );
  }

  updateDeleteButtons() {
    // Delete buttons now get their colors from CSS custom properties (set in updateSavedChartsHover)
    // No direct filter application needed - they use the same synchronized colors
  }

  updateAccountButtons() {
    // For account buttons, we only need hover colors (no normal state colors)
    const leftColor = this.rotateHue(
      this.houseColors[0],
      this.currentHueRotation,
    );
    const rightColor = this.rotateHue(
      this.houseColors[2], // Use same color pairing as other elements
      this.currentHueRotation,
    );

    const leftRgba = this.hexToRgba(leftColor);
    const rightRgba = this.hexToRgba(rightColor);

    // Set account button hover colors only (reduced brightness)
    document.documentElement.style.setProperty(
      "--account-hover-left-008",
      `rgba(${leftRgba.r}, ${leftRgba.g}, ${leftRgba.b}, 0.08)`,
    );
    document.documentElement.style.setProperty(
      "--account-hover-left-005",
      `rgba(${leftRgba.r}, ${leftRgba.g}, ${leftRgba.b}, 0.05)`,
    );
    document.documentElement.style.setProperty(
      "--account-hover-left-003",
      `rgba(${leftRgba.r}, ${leftRgba.g}, ${leftRgba.b}, 0.03)`,
    );

    document.documentElement.style.setProperty(
      "--account-hover-right-008",
      `rgba(${rightRgba.r}, ${rightRgba.g}, ${rightRgba.b}, 0.08)`,
    );
    document.documentElement.style.setProperty(
      "--account-hover-right-005",
      `rgba(${rightRgba.r}, ${rightRgba.g}, ${rightRgba.b}, 0.05)`,
    );
    document.documentElement.style.setProperty(
      "--account-hover-right-003",
      `rgba(${rightRgba.r}, ${rightRgba.g}, ${rightRgba.b}, 0.03)`,
    );
  }

  rotateHue(hexColor, degrees) {
    const hsl = this.hexToHsl(hexColor);
    hsl.h = (hsl.h + degrees) % 360;
    if (hsl.h < 0) hsl.h += 360;
    return this.hslToHex(hsl);
  }

  hexToRgba(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
      ? {
          r: parseInt(result[1], 16),
          g: parseInt(result[2], 16),
          b: parseInt(result[3], 16),
        }
      : null;
  }

  hexToHsl(hex) {
    const rgb = this.hexToRgba(hex);
    const r = rgb.r / 255;
    const g = rgb.g / 255;
    const b = rgb.b / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h,
      s,
      l = (max + min) / 2;

    if (max === min) {
      h = s = 0;
    } else {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r:
          h = (g - b) / d + (g < b ? 6 : 0);
          break;
        case g:
          h = (b - r) / d + 2;
          break;
        case b:
          h = (r - g) / d + 4;
          break;
      }
      h /= 6;
    }

    return { h: h * 360, s: s * 100, l: l * 100 };
  }

  hslToHex({ h, s, l }) {
    l /= 100;
    const a = (s * Math.min(l, 1 - l)) / 100;
    const f = (n) => {
      const k = (n + h / 30) % 12;
      const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
      return Math.round(255 * color)
        .toString(16)
        .padStart(2, "0");
    };
    return `#${f(0)}${f(8)}${f(4)}`;
  }

  destroy() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }
}

// Initialize color synchronizer
const colorSync = new ColorSynchronizer();
colorSync.init();

// Make it available globally for debugging
window.colorSync = colorSync;

// Test function to verify synchronization
window.testColorSync = function () {
  console.log("Testing color synchronization...");

  // Enable debug mode
  window.colorSyncDebug = true;

  // Log current state
  console.log("Current hue rotation:", colorSync.currentHueRotation);

  // Test: Create a new list item (simulating saved chart)
  const testItem = document.createElement("li");
  testItem.textContent = "Test Chart - Colors should be synchronized";
  testItem.style.padding = "8px";
  testItem.style.margin = "2px 0";
  testItem.style.cursor = "pointer";

  const recentChartsList = document.getElementById("recentChartsList");
  if (recentChartsList) {
    recentChartsList.appendChild(testItem);
    console.log("✓ Test item added - hover over it to see synchronized colors");
  } else {
    console.log(
      "✗ recentChartsList not found - make sure you are on the main page",
    );
  }

  // Disable debug after 10 seconds
  setTimeout(() => {
    window.colorSyncDebug = false;
    console.log("Debug mode disabled");
  }, 10000);
};
