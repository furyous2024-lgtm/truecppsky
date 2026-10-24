// Shared helpers for chart/report print windows and image export.
// Keep this file dependency-free so it works in mobile Safari, Android Chrome, and desktop browsers.

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function displayZodiacSystemLabel(value) {
  const raw = String(value || "").trim();
  const lower = raw.toLowerCase();
  if (!raw || lower === "tropical") return "Tropical/Sideral";
  if (lower === "midpoint" || lower.includes("midpoint") || lower.includes("true sidereal")) {
    return "Midpoint (True Sidereal)";
  }
  if (lower === "sidereal13" || lower === "sidereal 13" || lower.includes("iau 13")) {
    return "Sidereal 13";
  }
  return raw;
}

export function getStoredNatalData() {
  try {
    return JSON.parse(localStorage.getItem("natalData") || "null") || null;
  } catch (error) {
    return null;
  }
}

export function safeFilePart(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function buildSafeExportFileName(title, options = {}) {
  const storedNatalData = getStoredNatalData() || {};
  const zodiac = displayZodiacSystemLabel(options.zodiacSystem || storedNatalData.zodiacSystem || "Tropical");
  const name = options.name || storedNatalData.name || "";
  const parts = [title || "Delta Astrology", zodiac, name]
    .map(safeFilePart)
    .filter(Boolean);
  return (parts.join("_") || "Delta-Astrology").slice(0, 180);
}

export function normalizeZodiacTextLabels(root) {
  if (!root) return;
  const normalize = (text) => String(text || "")
    .replace(/Zodiac:\s*Tropical(?!\/Sideral)\b/g, "Zodiac: Tropical/Sideral")
    .replace(/Zodiac:\s*Midpoint(?! \(True Sidereal\))\b/g, "Zodiac: Midpoint (True Sidereal)");

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode);
  textNodes.forEach((node) => {
    const nextValue = normalize(node.nodeValue);
    if (nextValue !== node.nodeValue) node.nodeValue = nextValue;
  });

  root.querySelectorAll?.("text").forEach((el) => {
    const nextValue = normalize(el.textContent);
    if (nextValue !== el.textContent) el.textContent = nextValue;
  });
}

export function buttonCss(isMobile = false, includeImageButton = true) {
  return `
    .close-window-button,
    .print-trigger-button,
    .image-save-button {
      position: fixed;
      right: 10px;
      padding: 12px 24px;
      color: #fff;
      border: 0;
      border-radius: 6px;
      font-size: 16px;
      font-weight: 700;
      cursor: pointer;
      z-index: 10000;
      box-shadow: 0 2px 8px rgba(0,0,0,.2);
      -webkit-tap-highlight-color: transparent;
      touch-action: manipulation;
    }
    .close-window-button { top: 10px; background: #666; }
    .print-trigger-button { top: 66px; background: #4A90E2; }
    .image-save-button { top: 122px; background: #2f855a; ${includeImageButton ? "" : "display:none!important;"} }
    .close-window-button:hover { background: #555; }
    .print-trigger-button:hover { background: #357ABD; }
    .image-save-button:hover { background: #276749; }
    .export-status {
      position: fixed;
      right: 10px;
      top: ${includeImageButton ? "178px" : "122px"};
      max-width: min(360px, calc(100vw - 20px));
      padding: 8px 10px;
      border-radius: 6px;
      background: rgba(255,255,255,.94);
      color: #222;
      font: 13px/1.35 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;
      z-index: 10000;
      box-shadow: 0 2px 8px rgba(0,0,0,.16);
      display: none;
    }
    ${isMobile ? `
    .close-window-button,
    .print-trigger-button,
    .image-save-button {
      left: 10px;
      right: 10px;
      width: auto;
      padding: 14px 18px !important;
      font-size: 18px !important;
    }
    .print-trigger-button { top: 72px !important; }
    .image-save-button { top: 134px !important; }
    .export-status { left: 10px; right: 10px; top: ${includeImageButton ? "196px" : "134px"}; max-width: none; }
    body { padding-top: ${includeImageButton ? "248px" : "184px"} !important; }
    ` : ""}
    @media print {
      .close-window-button,
      .print-trigger-button,
      .image-save-button,
      .export-status { display: none !important; }
    }
  `;
}

export function buildPrintWindowBridgeScript(chartId, exportFileName) {
  const safeChartId = JSON.stringify(chartId || "");
  const safeFileName = JSON.stringify(exportFileName || "Delta-Astrology");
  return `
    <script>
      (function() {
        var chartId = ${safeChartId};
        var exportFileName = ${safeFileName};
        var statusNode = document.querySelector('[data-export-status]');
        function setStatus(message) {
          if (!statusNode) return;
          statusNode.textContent = message || '';
          statusNode.style.display = message ? 'block' : 'none';
        }
        function blobToDataURL(blob) {
          return new Promise(function(resolve, reject) {
            var reader = new FileReader();
            reader.onload = function() { resolve(reader.result); };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
        }
        function getSvgSize(svg) {
          var viewBox = (svg.getAttribute('viewBox') || '').trim().split(/[ ,]+/).map(Number);
          var width = parseFloat(svg.getAttribute('width'));
          var height = parseFloat(svg.getAttribute('height'));
          if ((!width || !height) && viewBox.length === 4 && viewBox.every(Number.isFinite)) {
            width = viewBox[2];
            height = viewBox[3];
          }
          if (!width || !height) {
            var rect = svg.getBoundingClientRect();
            width = width || rect.width || 1000;
            height = height || rect.height || 1000;
          }
          return { width: Math.max(1, width), height: Math.max(1, height) };
        }
        async function inlineExternalImages(svgClone) {
          var nodes = Array.prototype.slice.call(svgClone.querySelectorAll('image'));
          await Promise.all(nodes.map(async function(node) {
            var href = node.getAttribute('href') || node.getAttributeNS('http://www.w3.org/1999/xlink', 'href') || node.getAttribute('xlink:href');
            if (!href || href.indexOf('data:') === 0 || href.indexOf('blob:') === 0) return;
            try {
              var absoluteUrl = new URL(href, window.location.href).href;
              var response = await fetch(absoluteUrl, { credentials: 'same-origin', cache: 'force-cache' });
              if (!response.ok) throw new Error('Image fetch failed: ' + response.status);
              var dataUrl = await blobToDataURL(await response.blob());
              node.setAttribute('href', dataUrl);
              node.setAttributeNS('http://www.w3.org/1999/xlink', 'href', dataUrl);
            } catch (error) {
              console.warn('Could not inline SVG image for export:', error);
            }
          }));
        }
        function downloadBlob(blob, fileName) {
          var url = URL.createObjectURL(blob);
          var link = document.createElement('a');
          link.href = url;
          link.download = fileName;
          link.rel = 'noopener';
          document.body.appendChild(link);
          link.click();
          setTimeout(function() {
            URL.revokeObjectURL(url);
            link.remove();
          }, 1200);
        }
        async function saveSvgAsPng() {
          try {
            setStatus('Preparing image...');
            if (document.fonts && document.fonts.ready) {
              try { await document.fonts.ready; } catch (error) {}
            }
            var chart = document.getElementById(chartId);
            var svg = chart ? chart.querySelector('svg') : document.querySelector('svg');
            if (!svg) {
              setStatus('No SVG chart found to save.');
              return;
            }
            var clone = svg.cloneNode(true);
            clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
            clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
            await inlineExternalImages(clone);
            var size = getSvgSize(svg);
            clone.setAttribute('width', String(size.width));
            clone.setAttribute('height', String(size.height));
            if (!clone.getAttribute('viewBox')) clone.setAttribute('viewBox', '0 0 ' + size.width + ' ' + size.height);
            var svgText = new XMLSerializer().serializeToString(clone);
            var svgBlob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
            var svgUrl = URL.createObjectURL(svgBlob);
            var img = new Image();
            img.decoding = 'async';
            var loaded = new Promise(function(resolve, reject) {
              img.onload = resolve;
              img.onerror = reject;
            });
            img.src = svgUrl;
            await loaded;
            var ratio = Math.min(3, Math.max(2, window.devicePixelRatio || 2));
            var canvas = document.createElement('canvas');
            canvas.width = Math.ceil(size.width * ratio);
            canvas.height = Math.ceil(size.height * ratio);
            var ctx = canvas.getContext('2d');
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            URL.revokeObjectURL(svgUrl);
            canvas.toBlob(function(blob) {
              if (!blob) {
                downloadBlob(svgBlob, exportFileName + '.svg');
                setStatus('PNG was blocked by this browser. SVG image saved instead.');
                return;
              }
              downloadBlob(blob, exportFileName + '.png');
              setStatus('Image saved. On iPhone/iPad, check Downloads or Files.');
              setTimeout(function() { setStatus(''); }, 4000);
            }, 'image/png', 0.98);
          } catch (error) {
            console.error('Image export failed:', error);
            setStatus('Could not save PNG in this browser. Try Print / Save PDF.');
          }
        }
        function printNow() {
          setStatus('Opening print dialog. Choose Save as PDF or Print.');
          try { window.focus(); } catch (error) {}
          window.print();
        }
        document.querySelectorAll('[data-action="print"]').forEach(function(button) {
          button.addEventListener('click', printNow);
        });
        document.querySelectorAll('[data-action="save-image"]').forEach(function(button) {
          button.addEventListener('click', saveSvgAsPng);
        });
        document.querySelectorAll('[data-action="close"]').forEach(function(button) {
          button.addEventListener('click', function() {
            try { if (window.opener) window.opener.focus(); } catch (error) {}
            window.close();
          });
        });
        document.addEventListener('keydown', function(e) {
          if (e.key === 'Escape') window.close();
        });
      })();
    <\/script>
  `;
}

export function openInlinePrintFallback({ title, contentHtml, chartId, fileName, isReport = false, includeImageButton = true }) {
  document.getElementById('deltaInlinePrintView')?.remove();
  document.getElementById('deltaInlinePrintStyles')?.remove();

  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  const wrapper = document.createElement('div');
  wrapper.id = 'deltaInlinePrintView';
  wrapper.innerHTML = `
    <button class="close-window-button" type="button" data-inline-action="close">Close View</button>
    <button class="print-trigger-button" type="button" data-inline-action="print">Save PDF / Print</button>
    ${includeImageButton ? '<button class="image-save-button" type="button" data-inline-action="save-image">Save Image</button>' : ''}
    <div class="export-status" data-inline-export-status></div>
    <main class="${isReport ? 'report-print-page' : 'chart-print-page'}">${contentHtml}</main>
  `;

  const style = document.createElement('style');
  style.id = 'deltaInlinePrintStyles';
  style.textContent = `
    ${buttonCss(isMobile, includeImageButton)}
    #deltaInlinePrintView {
      position: fixed;
      inset: 0;
      z-index: 2147483000;
      overflow: auto;
      background: #fff;
      color: #222;
      padding: ${isMobile ? '24px 10px 60px' : '24px 20px 60px'};
      box-sizing: border-box;
      font-family: -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;
    }
    #deltaInlinePrintView .chart-print-page,
    #deltaInlinePrintView .report-print-page {
      max-width: ${isReport ? '980px' : '940px'};
      margin: 0 auto;
      background: #fff;
    }
    #deltaInlinePrintView svg {
      max-width: 100% !important;
      height: auto !important;
      overflow: visible !important;
    }
    @media print {
      body > *:not(#deltaInlinePrintView) { display: none !important; }
      #deltaInlinePrintView {
        position: static !important;
        inset: auto !important;
        overflow: visible !important;
        padding: 0 !important;
        z-index: auto !important;
      }
      #deltaInlinePrintView .chart-print-page,
      #deltaInlinePrintView .report-print-page {
        max-width: none !important;
        margin: 0 !important;
      }
      @page { margin: 12mm; }
    }
  `;

  document.head.appendChild(style);
  document.body.appendChild(wrapper);
  normalizeZodiacTextLabels(wrapper);

  const statusNode = wrapper.querySelector('[data-inline-export-status]');
  const setStatus = (message) => {
    if (!statusNode) return;
    statusNode.textContent = message || '';
    statusNode.style.display = message ? 'block' : 'none';
  };

  wrapper.querySelector('[data-inline-action="close"]')?.addEventListener('click', () => {
    wrapper.remove();
    style.remove();
  });
  wrapper.querySelector('[data-inline-action="print"]')?.addEventListener('click', () => {
    setStatus('Opening print dialog. Choose Save as PDF or Print.');
    window.print();
  });
  wrapper.querySelector('[data-inline-action="save-image"]')?.addEventListener('click', async () => {
    const virtualWindow = window.open('', '_blank', 'width=1000,height=1000');
    if (virtualWindow) {
      virtualWindow.document.write(`<!doctype html><html><head><title>${escapeHtml(title || 'Delta Astrology')}</title></head><body><button type="button" data-action="save-image" style="display:none">Save Image</button>${wrapper.querySelector('main')?.innerHTML || ''}<div data-export-status style="display:none"></div>${buildPrintWindowBridgeScript(chartId, fileName)}</body></html>`);
      virtualWindow.document.close();
      setTimeout(() => {
        virtualWindow.document.querySelector('[data-action="save-image"]')?.click();
      }, 100);
    } else {
      setStatus('Could not open image exporter. Use Print / Save PDF.');
    }
  });
}
