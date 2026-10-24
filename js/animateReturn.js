"use strict";

import { requestSwissReturnDate } from "./localSwiss.js";

document.addEventListener("DOMContentLoaded", () => {
  // load the original birth data
  let natalData = null;
  try {
    natalData = JSON.parse(localStorage.getItem("natalData"));
  } catch (_) {}

  const returnChart = document.getElementById("return-chart");

  // Create and style controls container
  const controlsContainer = document.createElement("div");
  controlsContainer.style.display = "flex";
  controlsContainer.style.alignItems = "center";
  controlsContainer.style.justifyContent = "center";
  controlsContainer.style.gap = "10px";
  controlsContainer.style.marginBottom = "12px";

  // Arrow buttons
  const leftArrow = document.createElement("button");
  leftArrow.type = "button";
  leftArrow.innerHTML = "&#8592;";
  leftArrow.title = "Previous";
  leftArrow.className = "animation-control-btn";
  leftArrow.style.fontSize = "24px";
  leftArrow.style.cursor = "pointer";
  leftArrow.style.padding = "5px 15px";
  leftArrow.style.border = "none";
  leftArrow.style.borderRadius = "5px";

  const rightArrow = document.createElement("button");
  rightArrow.type = "button";
  rightArrow.innerHTML = "&#8594;";
  rightArrow.title = "Next";
  rightArrow.className = "animation-control-btn";
  rightArrow.style.fontSize = "24px";
  rightArrow.style.cursor = "pointer";
  rightArrow.style.padding = "5px 15px";
  rightArrow.style.border = "none";
  rightArrow.style.borderRadius = "5px";

  // Dropdown
  const dropdown = document.createElement("select");
  dropdown.id = "adjustType";
  dropdown.style.padding = "5px 10px";
  dropdown.style.fontSize = "18px";
  dropdown.style.fontFamily = '"Segoe UI", sans-serif';
  dropdown.style.borderRadius = "5px";
  dropdown.style.border = "1px solid #ccc";
  ["Solar", "Lunar", "Mercury", "Venus", "Mars", "Jupiter", "Saturn"].forEach((type) => {
    const option = document.createElement("option");
    option.value = type;
    option.text = type;
    dropdown.appendChild(option);
  });

  const currentButton = document.createElement("button");
  currentButton.type = "button";
  currentButton.textContent = "Current";
  currentButton.title = "Set to current return";
  currentButton.className = "animation-control-btn";
  currentButton.style.fontSize = "18px";
  currentButton.style.cursor = "pointer";
  currentButton.style.padding = "5px 15px";
  currentButton.style.border = "none";
  currentButton.style.borderRadius = "5px";

  controlsContainer.appendChild(leftArrow);
  controlsContainer.appendChild(dropdown);
  controlsContainer.appendChild(currentButton);
  controlsContainer.appendChild(rightArrow);
  returnChart.parentNode.insertBefore(
    controlsContainer,
    returnChart.nextSibling
  );

  // Form elements
  const offsetInput = document.getElementById("returnOffset");
  const calculateButton = document.getElementById("returnCalculate");
  const nameField = document.getElementById("returnName");
  const dayField = document.getElementById("returnDay");
  const monthField = document.getElementById("returnMonth");
  const yearField = document.getElementById("returnYear");
  const hourField = document.getElementById("returnHour");
  const minuteField = document.getElementById("returnMinute");
  const locationField = document.getElementById("returnLocation");

  if (natalData) {
    nameField.value = natalData.name || "";
    locationField.value = natalData.location || "";
    dayField.value = natalData.day || "";
    monthField.value = natalData.month || "";
    yearField.value = natalData.year || "";
    hourField.value = String(natalData.hour ?? "").padStart(2, "0");
    minuteField.value = String(natalData.minute ?? "").padStart(2, "0");
    const hiddenMonth = document.querySelector("input[name='month']");
    if (hiddenMonth) hiddenMonth.value = natalData.month || "";
  }

  async function updateReturn(offsetChange) {
    // re-read natalData fresh each time
    let natalData;
    try {
      natalData = JSON.parse(localStorage.getItem("natalData") || "null");
    } catch (error) {
      const errorContainer = document.querySelector("#returnForm .errorMessage");
      if (errorContainer) {
        errorContainer.textContent = "Saved birth chart data is invalid.";
      }
      console.error("Could not read saved birth chart data:", error);
      return;
    }
    if (!natalData) {
      const errorContainer = document.querySelector("#returnForm .errorMessage");
      if (errorContainer) {
        errorContainer.textContent =
          "Calculate a Main Wheel before opening a Return Wheel.";
      }
      return;
    }
    nameField.value = natalData.name || nameField.value;
    if (!locationField.value) {
      locationField.value = natalData.location || "";
    }

    const currentOffset = parseInt(offsetInput.value, 10);
    const newOffset = currentOffset + offsetChange;

    const returnType = dropdown.value;

    // grab the user’s zodiac system choice
    const zodiacSystemEl = document.querySelector(
      "#system-settings select[name='zodiacSystem']"
    );
    const selectedZodiacSystem = zodiacSystemEl
      ? zodiacSystemEl.value
      : "Tropical";

    // grab the user’s coordinate system choice (Geocentric vs Topocentric)
    const coordinateSystemEl = document.querySelector(
      "#system-settings select[name='coordinateSystem']"
    );
    const selectedCoordinateSystem = coordinateSystemEl
      ? coordinateSystemEl.value
      : "Geocentric";

    const payload = {
      formType: "chart",
      name: natalData.name || nameField.value,
      day: natalData.day,
      month: natalData.month,
      year: natalData.year,
      hour: natalData.hour,
      minute: natalData.minute,
      location: locationField.value || natalData.location,
      returnOffset: newOffset,
      form: "return",
      natalData,
      preservedNatalLocation: natalData.location,
      returnLocation: locationField.value || natalData.location,
      returnType,
      selectedZodiacSystem,
      selectedCoordinateSystem,
    };

    try {
      const errorContainer = document.querySelector("#returnForm .errorMessage");
      if (errorContainer) errorContainer.textContent = "Finding return date...";
      const result = await requestSwissReturnDate(
        payload,
        document.getElementById("returnForm"),
      );
      const date = result.localDateTime;
      if (!date || !Number.isInteger(date.year) || !Number.isInteger(date.month)) {
        throw new Error("Swiss Ephemeris returned an invalid local return date.");
      }

      const monthNames = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December",
      ];
      offsetInput.value = String(newOffset);
      dayField.value = String(date.day).padStart(2, "0");
      monthField.value = monthNames[date.month - 1];
      const hiddenMonth = document.querySelector("input[name='month']");
      if (hiddenMonth) hiddenMonth.value = monthField.value;
      yearField.value = String(date.year);
      hourField.value = String(date.hour).padStart(2, "0");
      minuteField.value = String(date.minute).padStart(2, "0");
      if (errorContainer) errorContainer.textContent = "";

      requestAnimationFrame(() => calculateButton.click());
    } catch (err) {
      const errorContainer = document.querySelector("#returnForm .errorMessage");
      if (errorContainer) {
        errorContainer.textContent =
          err.message || "Could not calculate this return.";
      }
      console.error("Error fetching return:", err);
    }
  }

  // Bind arrow buttons
  leftArrow.addEventListener("click", () => {
    updateReturn(-1);
  });
  rightArrow.addEventListener("click", () => {
    updateReturn(1);
  });
  currentButton.addEventListener("click", () => {
    offsetInput.value = "0";
    updateReturn(0);
  });

  // When user changes the return‐location update return chart
  let locationChangeTimeout;
  locationField.addEventListener("change", () => {
    // Clear any pending timeout
    if (locationChangeTimeout) clearTimeout(locationChangeTimeout);
    // Wait a bit to ensure the value is fully settled
    locationChangeTimeout = setTimeout(() => {
      currentButton.click();
    }, 100);
  });

  // When user selects return type reset to “current”
  dropdown.addEventListener("change", () => {
    currentButton.click();
  });

  document.getElementById("return-button")?.addEventListener("click", () => {
    if (localStorage.getItem("natalData")) currentButton.click();
  });
});
