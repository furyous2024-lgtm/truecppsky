// ============================================
// Safari Print View Handler
// Created: 2025-01-09
// Purpose: Handle print views for Safari which blocks window.print() in PWAs
// ============================================

/**
 * Check if browser is Safari
 * For testing in Chrome: Comment/uncomment the appropriate line below
 */
export function isSafariMode() {
  // PRODUCTION: Use this line for real Safari detection
  return /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

  // TESTING: Use this line to test Safari mode in Chrome
  // return /chrome/i.test(navigator.userAgent);
}

/**
 * Open chart in new window for Safari printing
 * @param {string} chartId - ID of chart container (e.g., 'synastry-chart')
 * @param {string} chartTitle - Title for window (e.g., 'Synastry Chart')
 * @param {function} [modifyTitle] - Optional function to modify title text before printing
 */
export function openSafariPrintView(chartId, chartTitle, modifyTitle) {
  const chart = document.getElementById(chartId);
  if (!chart) return;

  // Detect mobile for specific adjustments
  const isMobile = /iPhone|iPad|iPod/i.test(navigator.userAgent);

  // Open window immediately to avoid popup blockers
  const printWindow = window.open("", "PrintChart", "width=1000,height=1000");
  if (!printWindow) {
    console.error("Failed to open print window - may be blocked");
    return;
  }

  // Clone the entire chart container (preserves SVG structure exactly)
  const chartClone = chart.cloneNode(true);

  // Apply title modification if provided (for triwheel/return)
  if (modifyTitle) {
    const titleText = chartClone.querySelector("svg .birth-details text");
    if (titleText) {
      modifyTitle(titleText);
    }
  }

  // CRITICAL: Make hidden elements visible
  // These are hidden by CSS default and only shown with @media print
  const hiddenElements = chartClone.querySelectorAll(
    ".birth-details, .birth-details-left, .birth-details-right, " +
      ".birth-details-center, .system-details"
  );

  hiddenElements.forEach((el) => {
    // For SVG g elements, we need to handle visibility differently
    el.style.display = "block";
    el.style.visibility = "visible";
    el.style.opacity = "1";
    // Remove any display attribute that might be set
    el.removeAttribute("display");

    // Also make all child text elements visible
    const textElements = el.querySelectorAll("text");
    textElements.forEach((text) => {
      text.style.display = "block";
      text.style.visibility = "visible";
      text.style.opacity = "1";
    });
  });

  // Get SVG element and adjust viewBox to include text above and below
  const svgElement = chartClone.querySelector("svg");
  if (svgElement) {
    // Get current viewBox or set default
    const currentViewBox = svgElement.getAttribute("viewBox");
    if (currentViewBox) {
      // Expand viewBox to show text above and below chart
      const parts = currentViewBox.split(" ");
      const x = parseFloat(parts[0]);
      const y = parseFloat(parts[1]) - 180; // Extend top to show title but with less space
      const width = parseFloat(parts[2]);
      const height = parseFloat(parts[3]) + 400; // Extend bottom for system details and balance
      svgElement.setAttribute("viewBox", `${x} ${y} ${width} ${height}`);
    } else {
      // Set a default viewBox that includes space for text and title
      svgElement.setAttribute("viewBox", "0 -250 1000 1400");
    }

    // Set explicit dimensions - adjust height for the expanded viewBox
    svgElement.setAttribute("width", "1000");
    svgElement.setAttribute("height", "1330"); // Make everything fit on first page - a little smaller for mobile
  }

  // Build the print window HTML
  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>${chartTitle}</title>
      <link rel="stylesheet" href="/css/styles.css">
      <style>
        /* Critical: Override the default hiding of birth/system details */
        .birth-details,
        .birth-details-left,
        .birth-details-right,
        .birth-details-center,
        .system-details {
          display: block !important;
          visibility: visible !important;
          opacity: 1 !important;
        }
        
        /* Ensure SVG text elements are visible */
        .birth-details text,
        .birth-details-left text,
        .birth-details-right text,
        .birth-details-center text,
        .system-details text {
          display: block !important;
          visibility: visible !important;
          opacity: 1 !important;
        }
        
        /* Body layout */
        body {
          margin: 0;
          padding: 20px;
          background: white;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
        }
        
        /* Chart container - match Natal implementation */
        #${chartId} {
          position: static !important;
          width: 100%;
          max-width: 900px;
          display: flex;
          justify-content: center;
          align-items: center;
          padding: 20px;
          /* No scaling - keep at normal size */
        }
        
        /* SVG sizing */
        #${chartId} svg {
          width: 100%;
          height: auto;
          max-width: 900px;
          /* Remove max-height to show full content */
        }

        /* Biwheel modes for triwheel chart - Progressions only (2 wheels) */
        #triwheel-chart.biwheel-progressions {
          overflow: visible !important;
        }
        #triwheel-chart.biwheel-progressions .outer-wheel,
        #triwheel-chart.biwheel-progressions .transits,
        #triwheel-chart.biwheel-progressions .transits-middle {
          display: none !important;
        }
        #triwheel-chart.biwheel-progressions .house-line-full {
          display: none !important;
        }
        #triwheel-chart.biwheel-progressions .house-line-short {
          display: initial !important;
        }
        #triwheel-chart.biwheel-progressions .triwheel-default {
          display: none !important;
        }
        #triwheel-chart.biwheel-progressions .triwheel-progressions {
          display: initial !important;
        }
        #triwheel-chart.biwheel-progressions .triwheel-transits {
          display: none !important;
        }

        /* Biwheel modes for triwheel chart - Transits only (2 wheels) */
        #triwheel-chart.biwheel-transits {
          overflow: visible !important;
        }
        #triwheel-chart.biwheel-transits .outer-wheel,
        #triwheel-chart.biwheel-transits .transits,
        #triwheel-chart.biwheel-transits .progressions {
          display: none !important;
        }
        #triwheel-chart.biwheel-transits .transits-middle {
          display: initial !important;
        }
        #triwheel-chart.biwheel-transits .house-line-full {
          display: none !important;
        }
        #triwheel-chart.biwheel-transits .house-line-short {
          display: initial !important;
        }
        #triwheel-chart.biwheel-transits .triwheel-default {
          display: none !important;
        }
        #triwheel-chart.biwheel-transits .triwheel-progressions {
          display: none !important;
        }
        #triwheel-chart.biwheel-transits .triwheel-transits {
          display: initial !important;
        }

        /* Smaller title text for synastry and composite charts */
        ${
          chartId === "synastry-chart" ||
          chartId === "composite-chart" ||
          chartId === "composite-chart-blank"
            ? `
        #${chartId} .birth-details text,
        #${chartId} .birth-details-left text,
        #${chartId} .birth-details-right text,
        #${chartId} .birth-details-center text {
          font-size: 24px !important;
        }
        `
            : ""
        }
        
        
        /* Control buttons - match Natal Safari implementation exactly */
        .close-window-button {
          position: fixed;
          top: 10px;
          right: 10px;
          padding: 12px 24px;
          background-color: #666;
          color: white;
          border: none;
          border-radius: 6px;
          font-size: 16px;
          font-weight: bold;
          cursor: pointer;
          z-index: 10000;
          box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        }
        
        .close-window-button:hover {
          background-color: #555;
        }
        
        .print-trigger-button {
          position: fixed;
          top: 66px;
          right: 10px;
          padding: 12px 24px;
          background-color: #4A90E2;
          color: white;
          border: none;
          border-radius: 6px;
          font-size: 16px;
          font-weight: bold;
          cursor: pointer;
          z-index: 10000;
          box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        }
        
        .print-trigger-button:hover {
          background-color: #357ABD;
        }
        
        ${
          isMobile
            ? `
        /* Larger buttons for Safari mobile */
        .close-window-button,
        .print-trigger-button {
          padding: 16px 32px !important;
          font-size: 20px !important;
        }
        
        .print-trigger-button {
          top: 80px !important;
        }
        `
            : ""
        }
        
        /* Hide buttons when actually printing */
        @media print {
          .close-window-button,
          .print-trigger-button {
            display: none !important;
          }

          body {
            padding: 0;
            margin: 0;
          }

          #${chartId} {
            transform: scale(${isMobile ? "1" : "0.95"});
            transform-origin: top center;
            padding: 0;
            page-break-inside: avoid;
          }

          #${chartId} svg {
            width: 100%;
            height: auto;
            max-width: 100%;
          }

          /* Smaller title text for synastry and composite charts in print */
          ${
            chartId === "synastry-chart" ||
            chartId === "composite-chart" ||
            chartId === "composite-chart-blank"
              ? `
          #${chartId} .birth-details text,
          #${chartId} .birth-details-left text,
          #${chartId} .birth-details-right text,
          #${chartId} .birth-details-center text {
            font-size: 24px !important;
          }
          `
              : ""
          }

          /* Ensure all content is visible */
          body * {
            visibility: visible !important;
          }

          ${
            isMobile
              ? `
          /* Fix blank page after chart on mobile Safari */
          .system-details {
            margin-bottom: -200px !important;
          }
          `
              : ""
          }
        }
      </style>
    </head>
    <body>
      <button class="close-window-button" onclick="if(window.opener){window.opener.focus();}window.close()">Close View</button>
      <button class="print-trigger-button" onclick="window.print()">Print View</button>
      ${chartClone.outerHTML}
      <script>
        // Auto-close after print
        window.onafterprint = function() {
          window.close();
        };
        // Also close on Escape key
        document.addEventListener('keydown', function(e) {
          if (e.key === 'Escape') {
            window.close();
          }
        });
      </script>
    </body>
    </html>
  `);

  printWindow.document.close();

  // Note: We don't call window.print() automatically in Safari
  // User must click "Tap to Print" button (PWA compatibility)
}
