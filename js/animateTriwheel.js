"use strict";

document.addEventListener("DOMContentLoaded", () => {
  const calculateButton = document.getElementById("triwheelCalculate");
  const triwheelChart = document.getElementById("triwheel-chart");

  // Create container for the controls
  const controlsContainer = document.createElement("div");

  // Apply styles to center the controls
  controlsContainer.style.display = "flex";
  controlsContainer.style.alignItems = "center";
  controlsContainer.style.justifyContent = "center";
  controlsContainer.style.gap = "10px";
  controlsContainer.style.marginBottom = "12px";

  // Create left arrow button
  const leftArrow = document.createElement("button");
  leftArrow.type = "button";
  leftArrow.innerHTML = "&#8592;"; // Left arrow Unicode
  leftArrow.title = "Decrement";
  leftArrow.className = "animation-control-btn";
  leftArrow.style.fontSize = "24px";
  leftArrow.style.cursor = "pointer";
  leftArrow.style.padding = "5px 15px";
  leftArrow.style.border = "none";
  leftArrow.style.borderRadius = "5px";

  // Create right arrow button
  const rightArrow = document.createElement("button");
  rightArrow.type = "button";
  rightArrow.innerHTML = "&#8594;"; // Right arrow Unicode
  rightArrow.title = "Increment";
  rightArrow.className = "animation-control-btn";
  rightArrow.style.fontSize = "24px";
  rightArrow.style.cursor = "pointer";
  rightArrow.style.padding = "5px 15px";
  rightArrow.style.border = "none";
  rightArrow.style.borderRadius = "5px";

  // Create dropdown menu
  const dropdown = document.createElement("select");
  dropdown.id = "adjustUnit";
  dropdown.style.padding = "5px 10px";
  dropdown.style.fontSize = "18px";
  dropdown.style.fontFamily = '"Segoe UI", sans-serif';
  dropdown.style.borderRadius = "5px";
  dropdown.style.border = "1px solid #ccc";

  // Add default "Animate" option that does nothing
  const animateOption = document.createElement("option");
  animateOption.value = "animate";
  animateOption.text = "Animate";
  dropdown.appendChild(animateOption);

  // Define the units without "second"
  const units = ["year", "month", "day", "hour", "minute"];
  units.forEach((unit) => {
    const option = document.createElement("option");
    option.value = unit;
    option.text = unit.charAt(0).toUpperCase() + unit.slice(1);
    dropdown.appendChild(option);
  });

  // Set default to "animate" (no action)
  dropdown.value = "animate";

  // Create now button
  const nowButton = document.createElement("button");
  nowButton.type = "button";
  nowButton.textContent = "Now";
  nowButton.className = "animation-control-btn";
  nowButton.style.fontSize = "18px";
  nowButton.style.cursor = "pointer";
  nowButton.style.padding = "5px 15px";
  nowButton.style.border = "none";
  nowButton.style.borderRadius = "5px";

  // Append controls to the container
  controlsContainer.appendChild(leftArrow);
  controlsContainer.appendChild(dropdown);
  controlsContainer.appendChild(nowButton);
  controlsContainer.appendChild(rightArrow);

  // Inject CSS styles for biwheel modes (prevents flashing during animation)
  const styleId = "triwheel-biwheel-styles";
  if (!document.getElementById(styleId)) {
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
      /* Default: transits-middle, short house lines, and biwheel aspect lines hidden */
      #triwheel-chart .transits-middle {
        display: none !important;
      }
      #triwheel-chart .house-line-short {
        display: none !important;
      }
      #triwheel-chart .triwheel-progressions {
        display: none !important;
      }
      #triwheel-chart .triwheel-transits {
        display: none !important;
      }
      /* Hide natal-natal aspect lines/symbols only when triwheel aspects exist (using :has) */
      #triwheel-chart:has(.triwheel-default) .aspect-line:not(.triwheel-default):not(.triwheel-progressions):not(.triwheel-transits),
      #triwheel-chart:has(.triwheel-default) .aspect-symbol:not(.triwheel-default):not(.triwheel-progressions):not(.triwheel-transits) {
        display: none;
      }

      /* Progressions biwheel mode */
      #triwheel-chart.biwheel-progressions {
        overflow: hidden;
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
      #triwheel-chart.biwheel-progressions svg {
        transform: scale(1.31);
        transform-origin: center center;
      }

      /* Transits biwheel mode */
      #triwheel-chart.biwheel-transits {
        overflow: hidden;
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
      #triwheel-chart.biwheel-transits svg {
        transform: scale(1.31);
        transform-origin: center center;
      }

      /* Mobile responsive styles for radio buttons */
      @media (max-width: 600px) {
        .triwheel-radio-container {
          gap: 12px !important;
        }
        .triwheel-radio-label {
          font-size: 14px !important;
          gap: 4px !important;
        }
        .triwheel-radio-input {
          width: 14px !important;
          height: 14px !important;
        }
      }
      @media (max-width: 420px) {
        .triwheel-radio-container {
          gap: 8px !important;
        }
        .triwheel-radio-label {
          font-size: 12px !important;
          gap: 2px !important;
        }
        /* Shorten "Progressions & Transits" to "Prog & Tran" */
        .triwheel-radio-label-triwheel {
          font-size: 0 !important;
        }
        .triwheel-radio-label-triwheel::after {
          content: "Prog & Tran";
          font-size: 12px;
        }
      }
      @media (max-width: 310px) {
        /* Shorten all labels for very small screens */
        .triwheel-radio-label-progressions {
          font-size: 0 !important;
        }
        .triwheel-radio-label-progressions::after {
          content: "Prog";
          font-size: 12px;
        }
        .triwheel-radio-label-transits {
          font-size: 0 !important;
        }
        .triwheel-radio-label-transits::after {
          content: "Tran";
          font-size: 12px;
        }
      }

      /* Print overrides for biwheel modes - ensure birth-details are visible */
      @media print {
        /* Remove overflow clipping so birth-details and system-details are visible */
        #triwheel-chart.biwheel-progressions,
        #triwheel-chart.biwheel-transits {
          overflow: visible !important;
        }

        /* Remove SVG scaling so birth-details aren't pushed out of view */
        #triwheel-chart.biwheel-progressions svg,
        #triwheel-chart.biwheel-transits svg {
          transform: none !important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  // Create radio button container for wheel mode selection
  const radioContainer = document.createElement("div");
  radioContainer.className = "triwheel-radio-container";
  radioContainer.style.display = "flex";
  radioContainer.style.alignItems = "center";
  radioContainer.style.justifyContent = "center";
  radioContainer.style.gap = "24px";
  radioContainer.style.marginTop = "12px";
  radioContainer.style.marginBottom = "8px";

  // Radio button options
  const radioOptions = [
    { value: "triwheel", label: "Progressions & Transits" },
    { value: "progressions", label: "Progressions" },
    { value: "transits", label: "Transits" },
  ];

  radioOptions.forEach((option, index) => {
    const label = document.createElement("label");
    label.className = `triwheel-radio-label triwheel-radio-label-${option.value}`;
    label.style.display = "flex";
    label.style.alignItems = "center";
    label.style.gap = "6px";
    label.style.cursor = "pointer";
    label.style.fontSize = "18px";
    label.style.fontFamily = '"Segoe UI", sans-serif';

    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = "wheelMode";
    radio.value = option.value;
    radio.checked = index === 0; // First option (triwheel) is default
    radio.className = "triwheel-radio-input";
    radio.style.cursor = "pointer";
    radio.style.width = "18px";
    radio.style.height = "18px";

    label.appendChild(radio);
    label.appendChild(document.createTextNode(option.label));
    radioContainer.appendChild(label);
  });

  // Function to apply wheel mode by toggling CSS classes on the chart container
  function applyWheelMode(mode) {
    const chart = document.getElementById("triwheel-chart");
    if (!chart) return;

    // Remove all biwheel mode classes
    chart.classList.remove("biwheel-progressions", "biwheel-transits");

    // Add the appropriate class based on mode
    if (mode === "progressions") {
      chart.classList.add("biwheel-progressions");
    } else if (mode === "transits") {
      chart.classList.add("biwheel-transits");
    }
    // For "triwheel" mode, no class is added (default state)
  }

  // Add change event listeners to radio buttons
  radioContainer
    .querySelectorAll('input[name="wheelMode"]')
    .forEach((radio) => {
      radio.addEventListener("change", (e) => {
        applyWheelMode(e.target.value);
      });
    });

  // Store applyWheelMode globally so it can be called after chart recalculation
  window.applyTriwheelMode = function () {
    const selectedRadio = document.querySelector(
      'input[name="wheelMode"]:checked'
    );
    if (selectedRadio) {
      applyWheelMode(selectedRadio.value);
    }
  };

  // Insert the controlsContainer below the Triwheel
  triwheelChart.parentNode.insertBefore(
    controlsContainer,
    triwheelChart.nextSibling
  );

  // Insert the radioContainer below the controlsContainer
  controlsContainer.parentNode.insertBefore(
    radioContainer,
    controlsContainer.nextSibling
  );

  // Function to adjust the date/time
  function adjustDate(unit, direction) {
    // Get current form values
    let day = parseInt(document.getElementById("triwheelDay").value);
    let monthStr = document.getElementById("triwheelMonth").value;
    let year = parseInt(document.getElementById("triwheelYear").value);
    let hour = parseInt(document.getElementById("triwheelHour").value);
    let minute = parseInt(document.getElementById("triwheelMinute").value);

    // Convert month string to month number
    const monthNames = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ];
    let month = monthNames.indexOf(monthStr) + 1;

    // Create a Date object
    let date = new Date(year, month - 1, day, hour, minute);
    // Fix for years 1-99: JavaScript interprets these as 1900-1999 by default
    if (year >= 1 && year <= 99) {
      date.setFullYear(year);
    }

    // Determine the adjustment value
    const adjustValue = direction === "increment" ? 1 : -1;

    // Adjust the date based on the selected unit
    switch (unit) {
      case "year":
        date.setFullYear(date.getFullYear() + adjustValue);
        break;
      case "month":
        date.setMonth(date.getMonth() + adjustValue);
        break;
      case "day":
        date.setDate(date.getDate() + adjustValue);
        break;
      case "hour":
        date.setHours(date.getHours() + adjustValue);
        break;
      case "minute":
        date.setMinutes(date.getMinutes() + adjustValue);
        break;
      default:
        console.error("Unknown unit:", unit);
        return;
    }

    // Validate date range (10,000 BCE to 10,000 CE) and skip year 0
    const resultYear = date.getFullYear();
    if (resultYear < -9999 || resultYear > 9999 || resultYear === 0) {
      // Skip year 0 (doesn't exist in Gregorian calendar)
      if (resultYear === 0) {
        date.setFullYear(direction === "increment" ? 1 : -1);
      } else {
        return;
      }
    }

    // Update the form fields with the new date values
    document.getElementById("triwheelDay").value = date.getDate();
    document.getElementById("triwheelMonth").value =
      monthNames[date.getMonth()];
    document.getElementById("triwheelYear").value = date.getFullYear();
    document.getElementById("triwheelHour").value = String(
      date.getHours()
    ).padStart(2, "0");
    document.getElementById("triwheelMinute").value = String(
      date.getMinutes()
    ).padStart(2, "0");

    // Submit the form
    calculateButton.click();
  }

  // Event listener for left arrow (decrement)
  leftArrow.addEventListener("click", () => {
    const selectedUnit = dropdown.value;
    // Don't do anything if "Animate" is selected
    if (selectedUnit === "animate") {
      return;
    }
    adjustDate(selectedUnit, "decrement");
  });

  // Event listener for right arrow (increment)
  rightArrow.addEventListener("click", () => {
    const selectedUnit = dropdown.value;
    // Don't do anything if "Animate" is selected
    if (selectedUnit === "animate") {
      return;
    }
    adjustDate(selectedUnit, "increment");
  });

  // Event listener for now button
  nowButton.addEventListener("click", () => {
    const today = new Date();

    document.getElementById("triwheelDay").value = today.getDate();
    document.getElementById("triwheelMonth").value = today.toLocaleString(
      "en-US",
      { month: "long" }
    );
    document.getElementById("triwheelYear").value = today.getFullYear();
    document.getElementById("triwheelHour").value = String(
      today.getHours()
    ).padStart(2, "0");
    document.getElementById("triwheelMinute").value = String(
      today.getMinutes()
    ).padStart(2, "0");

    calculateButton.click(); // Recalculate chart
  });

  // Observe changes to the SVG to re-apply wheel mode after recalculation
  const observer = new MutationObserver((mutations) => {
    // Check if new transits or progressions elements were added
    const hasNewElements = mutations.some((mutation) => {
      return Array.from(mutation.addedNodes).some((node) => {
        if (node.classList) {
          return (
            node.classList.contains("transits") ||
            node.classList.contains("transits-middle") ||
            node.classList.contains("progressions")
          );
        }
        return false;
      });
    });

    if (hasNewElements && window.applyTriwheelMode) {
      // Small delay to ensure all elements are rendered
      setTimeout(() => {
        window.applyTriwheelMode();
      }, 50);
    }
  });

  // Start observing the SVG for changes
  const startObserving = () => {
    const svg = triwheelChart.querySelector("svg");
    if (svg) {
      observer.observe(svg, { childList: true, subtree: true });
    }
  };

  // Initial observation setup (may need to wait for SVG to exist)
  if (triwheelChart.querySelector("svg")) {
    startObserving();
  } else {
    const initObserver = new MutationObserver(() => {
      if (triwheelChart.querySelector("svg")) {
        startObserving();
        initObserver.disconnect();
      }
    });
    initObserver.observe(triwheelChart, { childList: true });
  }
});
