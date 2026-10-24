"use strict";

(function () {
  function zodiacKey(value) {
    return String(value || "").trim().toLowerCase().replace(/[\s_()\-.°]/g, "");
  }

  function isEqual13(value) {
    const key = zodiacKey(value);
    return (
      key === "tropical13" ||
      key === "tropical13equal" ||
      key === "sidereal13" ||
      key === "sidereal13equal" ||
      key === "equal13" ||
      key === "13signequal" ||
      key === "13signsequal" ||
      key === "equal13tropical" ||
      key === "equal13sidereal" ||
      key === "13signtropical" ||
      key === "13signsidereal" ||
      key === "13signsequaltropical" ||
      key === "13signsequalsidereal" ||
      key === "tropical13signs" ||
      key === "tropical13signsequal" ||
      key === "sidereal13signs" ||
      key === "sidereal13signsequal" ||
      key.includes("13signsequal") ||
      key.includes("equal13")
    );
  }

  function isIauReal13(value) {
    const key = zodiacKey(value);
    return (
      key === "iau13" ||
      key === "iaureal13" ||
      key === "iau13real" ||
      key === "iaureal13signs" ||
      key === "iau13signsreal" ||
      key.includes("iaureal") ||
      (key.includes("iau") && key.includes("13"))
    );
  }

  function syncIau13Ayanamsa() {
    const zodiacSelect = document.querySelector('#system-settings select[name="zodiacSystem"]');
    const ayanamsaSelect = document.querySelector('#system-settings select[name="ayanamsaSystem"]');
    if (!zodiacSelect || !ayanamsaSelect) return;

    if (isIauReal13(zodiacSelect.value)) {
      ayanamsaSelect.disabled = false;
      ayanamsaSelect.title = "IAU Real 13: usa os limites reais das constelações. A ayanamsa escolhida controla as longitudes; os graus são medidos a partir dos limites reais.";
    } else {
      ayanamsaSelect.disabled = false;
      if (isEqual13(zodiacSelect.value)) {
        ayanamsaSelect.title = "13 signos iguais: usa Galact. Center = 0 Sag como referência; o Centro Galáctico fica em 0° de Sagitário. Cada signo tem 27,69230769230769°.";
      } else {
        ayanamsaSelect.title = "";
      }
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    const zodiacSelect = document.querySelector('#system-settings select[name="zodiacSystem"]');
    if (!zodiacSelect) return;
    zodiacSelect.addEventListener("change", syncIau13Ayanamsa);
    syncIau13Ayanamsa();
  });

  window.syncIau13Ayanamsa = syncIau13Ayanamsa;
})();
