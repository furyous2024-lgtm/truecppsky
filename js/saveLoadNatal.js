"use strict";

(function () {
  function attachNatalChartUI() {
    if (!window.TrueSkyFirebaseCharts) {
      console.error("Firebase Birth Charts não foi carregado. Verifique js/firebase-birth-charts.js.");
      const error = document.querySelector(".errorMessage");
      if (error) error.textContent = "Firebase não foi inicializado para os mapas natais.";
      return;
    }
    window.TrueSkyFirebaseCharts.attachUI({
      saveButtonId: "natalSave",
      listId: "recentChartsList",
      searchInputId: "searchChartsInput",
      dataStorageKey: "natalData",
      formPrefix: "natal",
      calculateButtonId: "natalCalculate",
      messageSelector: ".errorMessage"
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", attachNatalChartUI, { once: true });
  else attachNatalChartUI();
})();
