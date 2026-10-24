document.addEventListener("DOMContentLoaded", () => {
  const synastryForm = document.getElementById("synastryForm");
  if (!synastryForm) return;

  // Create swap button
  const swapButton = document.createElement("button");
  swapButton.type = "button";
  swapButton.textContent = "Swap";
  swapButton.className = "synastry-swap-btn";
  swapButton.style.fontSize = "18px";
  swapButton.style.cursor = "pointer";
  swapButton.style.padding = "5px 15px";
  swapButton.style.border = "none";
  swapButton.style.borderRadius = "5px";

  // Insert button above the synastry form
  const controlsContainer = document.createElement("div");
  controlsContainer.style.display = "flex";
  controlsContainer.style.justifyContent = "center";
  controlsContainer.style.gap = "10px";
  controlsContainer.style.marginBottom = "12px";

  controlsContainer.appendChild(swapButton);
  synastryForm.parentNode.insertBefore(controlsContainer, synastryForm);

  // Sync button state with synastryDay value
  const synastryDayInput = document.getElementById("synastryDay");

  function updateSwapButtonState() {
    const isDayFilled = synastryDayInput.value.trim() !== "";
    swapButton.disabled = !isDayFilled;
    if (isDayFilled) {
      swapButton.classList.remove("disabled");
    } else {
      swapButton.classList.add("disabled");
    }
  }

  // Add listeners for manual input
  synastryDayInput.addEventListener("input", updateSwapButtonState);
  synastryDayInput.addEventListener("change", updateSwapButtonState);

  // Observe programmatic changes using MutationObserver
  const observer = new MutationObserver(updateSwapButtonState);
  observer.observe(synastryDayInput, {
    attributes: true,
    childList: true,
    characterData: true,
    subtree: true,
  });

  // Fallback polling in case observer misses a value update
  setTimeout(() => {
    updateSwapButtonState();

    const interval = setInterval(() => {
      updateSwapButtonState();
      if (synastryDayInput.value.trim() !== "") {
        clearInterval(interval);
      }
    }, 250);
  }, 0);

  // Swap button behavior
  swapButton.addEventListener("click", () => {
    const fields = [
      "Name",
      "Day",
      "Month",
      "Year",
      "Hour",
      "Minute",
      "Location",
    ];

    const getValue = (prefix, field) =>
      document.getElementById(prefix + field)?.value || "";

    const setValue = (prefix, field, value) => {
      const el = document.getElementById(prefix + field);
      if (el) el.value = value;
    };

    const natalPrefix = "natal";
    const synastryPrefix = "synastry";

    const temp = {};

    fields.forEach((field) => {
      temp[field] = getValue(natalPrefix, field);
    });

    fields.forEach((field) => {
      const natalVal = temp[field];
      const synastryVal = getValue(synastryPrefix, field);
      setValue(natalPrefix, field, synastryVal);
      setValue(synastryPrefix, field, natalVal);
    });

    // Set swap flag before submitting forms
    window.isSynastrySwap = true;

    // Submit natal form first (Person 1)
    document.getElementById("natalForm").requestSubmit();

    // Wait a bit then submit synastry form (Person 2)
    setTimeout(() => {
      document.getElementById("synastryForm").requestSubmit();

      // Clear swap flag after both submissions
      setTimeout(() => {
        window.isSynastrySwap = false;
      }, 500);
    }, 200);
  });
});
