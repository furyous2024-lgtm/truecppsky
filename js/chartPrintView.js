"use strict";

/*
 * Clean, single-chart print view.
 * The legacy handlers called window.print() on the entire app page, which
 * allowed forms, animation controls and other sections to create extra pages.
 * Intercept only the chart "View" buttons and print one isolated SVG instead.
 */
(function () {
  const chartIds = {
    natalPrint: "natal-chart",
    triwheelPrint: "triwheel-chart",
    graphPrint: "graph",
    returnPrint: "return-chart",
    synastryPrint: "synastry-chart",
  };

  const isVisible = (element) => {
    if (!element) return false;
    const style = window.getComputedStyle(element);
    return (
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      element.getClientRects().length > 0
    );
  };

  function getTargetId(buttonId) {
    if (buttonId === "mapPrint") {
      const skyMap = document.getElementById("sky-map");
      return isVisible(skyMap) ? "sky-map" : "astro-map";
    }

    if (buttonId === "compositePrint") {
      const primary = document.getElementById("composite-chart");
      const blank = document.getElementById("composite-chart-blank");
      const primaryHasChart =
        isVisible(primary) && Boolean(primary.querySelector("svg circle"));
      const blankIsSelected = isVisible(blank) && !primaryHasChart;
      return blankIsSelected ? "composite-chart-blank" : "composite-chart";
    }

    return chartIds[buttonId] || null;
  }

  function getWindowTitle(buttonId) {
    const titles = {
      natalPrint: "Main Chart",
      triwheelPrint: "Transit Chart",
      graphPrint: "Graph",
      returnPrint: "Return Chart",
      mapPrint: "Astrocartography Map",
      synastryPrint: "Synastry Chart",
      compositePrint: "Composite Chart",
    };
    if (buttonId === "returnPrint") {
      const type = document.getElementById("adjustType")?.value || "Solar";
      return `${type} Return Chart`;
    }
    if (buttonId === "triwheelPrint") {
      const chart = document.getElementById("triwheel-chart");
      const mode = chart?.classList.contains("biwheel-progressions")
        ? "Progressions"
        : chart?.classList.contains("biwheel-transits")
          ? "Transits"
          : "Multiwheel";
      return `Transit Chart - ${mode}`;
    }
    return titles[buttonId] || "True Sky Astrology Chart";
  }

  function applyChartSpecificTitle(svg, buttonId) {
    const titleText = svg.querySelector(".birth-details text");
    if (!titleText) return;

    if (buttonId === "triwheelPrint") {
      const chart = document.getElementById("triwheel-chart");
      const mode = chart?.classList.contains("biwheel-progressions")
        ? "Progressions"
        : chart?.classList.contains("biwheel-transits")
          ? "Transits"
          : "Multiwheel";
      const base = titleText.textContent.replace(/\s+-\s+(Multiwheel|Transits|Progressions)$/, "");
      titleText.textContent = `${base} - ${mode}`;
    } else if (buttonId === "returnPrint") {
      const type = document.getElementById("adjustType")?.value || "Solar";
      const base = titleText.textContent.replace(/\s+-\s+.+ Return$/, "");
      titleText.textContent = `${base} - ${type} Return`;
    }
  }

  function getSvgDimensions(svg) {
    const values = (svg.getAttribute("viewBox") || "0 0 1000 1000")
      .trim()
      .split(/[ ,]+/)
      .map(Number);
    if (values.length === 4 && values.every(Number.isFinite) && values[2] > 0 && values[3] > 0) {
      return { width: values[2], height: values[3] };
    }
    const rect = svg.getBoundingClientRect();
    return {
      width: Math.max(1, rect.width || 1000),
      height: Math.max(1, rect.height || 1000),
    };
  }

  function openChartPrintView(buttonId) {
    const chartId = getTargetId(buttonId);
    const chartContainer = chartId ? document.getElementById(chartId) : null;
    const sourceSvg = chartContainer?.querySelector("svg");

    if (!sourceSvg) {
      window.alert("Calcule ou carregue o gráfico antes de clicar em View.");
      return;
    }

    const printWindow = window.open("", "_blank", "width=1100,height=1000,resizable=yes,scrollbars=yes");
    if (!printWindow) {
      window.alert("O navegador bloqueou a janela de prévia. Permita pop-ups para este site e tente novamente.");
      return;
    }

    const chartClone = chartContainer.cloneNode(true);
    chartClone
      .querySelectorAll("#reportDescriptions")
      .forEach((previousReport) => previousReport.remove());
    chartClone.classList.add("chart-print-root");
    const svgClone = chartClone.querySelector("svg");

    // Details are intentionally hidden in the live chart but belong on a printout.
    svgClone.querySelectorAll(
      ".birth-details, .birth-details-left, .birth-details-right, .birth-details-center, .system-details"
    ).forEach((element) => {
      element.style.setProperty("display", "initial", "important");
      element.style.setProperty("visibility", "visible", "important");
      element.style.setProperty("opacity", "1", "important");
      element.removeAttribute("display");
    });
    svgClone.querySelectorAll(
      ".birth-details text, .birth-details-left text, .birth-details-right text, .birth-details-center text, .system-details text"
    ).forEach((element) => {
      element.style.setProperty("display", "initial", "important");
      element.style.setProperty("visibility", "visible", "important");
      element.style.setProperty("opacity", "1", "important");
    });

    applyChartSpecificTitle(svgClone, buttonId);

    const dimensions = getSvgDimensions(svgClone);
    const title = getWindowTitle(buttonId).replace(/[<>]/g, "");
    const landscape = dimensions.width / dimensions.height > 1.18;
    const pageOrientation = landscape ? "landscape" : "portrait";

    printWindow.document.open();
    printWindow.document.write(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <base href="${window.location.origin}/">
  <title>${title}</title>
  <link rel="stylesheet" href="/css/styles.css">
  <style>
    @page { size: A4 ${pageOrientation}; margin: 8mm; }
    html, body { margin:0; padding:0; width:100%; min-height:100%; background:#e9ecef; }
    body { font-family:Arial,sans-serif; color:#222; }
    .chart-print-toolbar { position:fixed; z-index:1000; top:12px; right:12px; display:flex; gap:8px; }
    .chart-print-toolbar button { border:0; border-radius:6px; padding:10px 16px; color:#fff; font-size:14px; font-weight:600; cursor:pointer; box-shadow:0 2px 7px #0002; }
    .chart-print-toolbar .print-button { background:#2463eb; }
    .chart-print-toolbar .close-button { background:#555; }
    .chart-print-sheet { width:min(${landscape ? "297mm" : "210mm"},96vw); height:min(${landscape ? "210mm" : "297mm"},calc(100vh - 76px)); box-sizing:border-box; margin:62px auto 24px; padding:8mm; display:flex; align-items:center; justify-content:center; background:#fff; box-shadow:0 2px 12px #0002; overflow:hidden; }
    .chart-print-root { box-sizing:border-box; display:block !important; width:100% !important; max-width:100% !important; margin:-10% auto 50px !important; padding:0 !important; position:static !important; overflow:visible !important; transform:scale(.8); transform-origin:center; }
    #${chartId}.chart-print-root { width:100% !important; max-width:100% !important; display:block !important; position:static !important; }
    .chart-print-root > svg { display:block !important; width:100% !important; height:100% !important; max-width:100% !important; margin:0 auto !important; overflow:visible; }
    .birth-details, .birth-details-left, .birth-details-right, .birth-details-center, .system-details { display:initial !important; visibility:visible !important; opacity:1 !important; }
    .birth-details text, .birth-details-left text, .birth-details-right text, .birth-details-center text, .system-details text { display:initial !important; visibility:visible !important; opacity:1 !important; }
    @media print {
      html, body { width:100% !important; height:100% !important; min-height:0 !important; margin:0 !important; padding:0 !important; background:#fff !important; overflow:hidden !important; }
      .chart-print-toolbar { display:none !important; }
      .chart-print-sheet { width:100% !important; height:${landscape ? "194mm" : "281mm"} !important; min-height:0 !important; margin:0 !important; padding:0 !important; box-shadow:none !important; overflow:hidden !important; page-break-after:avoid !important; break-after:avoid-page !important; break-inside:avoid !important; }
      .chart-print-sheet, .chart-print-sheet * { visibility:visible !important; }
      .chart-print-root { transform:scale(.9) !important; margin:-5% auto 50px !important; }
      #${chartId}.chart-print-root { position:static !important; width:100% !important; max-width:100% !important; margin:-5% auto 50px !important; overflow:visible !important; }
      #${chartId}.chart-print-root > svg { width:100% !important; height:100% !important; max-width:100% !important; margin:0 auto !important; visibility:visible !important; page-break-inside:avoid !important; break-inside:avoid !important; }
    }
  </style>
</head>
<body>
  <div class="chart-print-toolbar">
    <button class="print-button" type="button" onclick="window.print()">Print / Save PDF</button>
    <button class="close-button" type="button" onclick="window.close()">Close</button>
  </div>
  <main class="chart-print-sheet">${chartClone.outerHTML}</main>
  <script>
    window.addEventListener('load', function () {
      var isSafari = /^((?!chrome|android|crios|fxios).)*safari/i.test(navigator.userAgent);
      if (!isSafari) setTimeout(function () { window.print(); }, 350);
    });
  </script>
</body>
</html>`);
    printWindow.document.close();
  }

  // Capture phase runs before legacy handlers so we can prevent printing the entire page.
  document.addEventListener("click", function (event) {
    const button = event.target?.closest?.('button[name="print"]');
    if (!button) return;
    if (!getTargetId(button.id)) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    openChartPrintView(button.id);
  }, true);
})();
