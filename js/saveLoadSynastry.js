"use strict";

(function () {
  function attachSynastryChartUI() {
    if (!window.TrueSkyFirebaseCharts) {
      console.error("Firebase Birth Charts não foi carregado. Verifique js/firebase-birth-charts.js.");
      const error = document.querySelector(".errorMessageSynastry");
      if (error) error.textContent = "Firebase não foi inicializado para os mapas salvos.";
      return;
    }
    window.TrueSkyFirebaseCharts.attachUI({
      saveButtonId: "synastrySave",
      listId: "synastryRecentChartsList",
      searchInputId: "synastrySearchChartsInput",
      dataStorageKey: "synastryData",
      formPrefix: "synastry",
      calculateButtonId: "synastryCalculate",
      messageSelector: ".errorMessageSynastry"
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", attachSynastryChartUI, { once: true });
  else attachSynastryChartUI();
})();
