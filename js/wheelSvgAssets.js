"use strict";

// 8 rodas zodiacais extraídas do diretório "svgs extraidos".
// Usamos os arquivos existentes para cada tipo de gráfico e cada sistema zodiacal.
window.TrueSkyWheelSvgs = {
  natal: { midpoint: "svgs%20extraidos/roda%20serpent%C3%A1rio.svg", tropical: "svgs%20extraidos/roda%20tropical.svg" },
  main: { midpoint: "svgs%20extraidos/roda%20serpent%C3%A1rio.svg", tropical: "svgs%20extraidos/roda%20tropical.svg" },
  composite: { midpoint: "svgs%20extraidos/composite%20serpent%C3%A1rio.svg", tropical: "svgs%20extraidos/composite%20tropical.svg" },
  synastry: { midpoint: "svgs%20extraidos/sinastria%20serpent%C3%A1rio.svg", tropical: "svgs%20extraidos/sinastria%20tropical.svg" },
  transits: { midpoint: "svgs%20extraidos/transitos%20serpent%C3%A1rio.svg", tropical: "svgs%20extraidos/transitos%20tropical.svg" },
  triwheel: { midpoint: "svgs%20extraidos/roda%20serpent%C3%A1rio.svg", tropical: "svgs%20extraidos/roda%20tropical.svg" },
};

window.getTrueSkyWheelSvg = function getTrueSkyWheelSvg(form, zodiacSystem) {
  const normalizedForm = String(form || "natal").toLowerCase();
  const normalizedZodiac = String(zodiacSystem || "").toLowerCase();
  const key = normalizedZodiac.includes("midpoint") || normalizedZodiac.includes("13") || normalizedZodiac.includes("iau")
    ? "midpoint"
    : "tropical";
  return window.TrueSkyWheelSvgs?.[normalizedForm]?.[key] || window.TrueSkyWheelSvgs?.natal?.[key];
};
