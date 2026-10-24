"use strict";

function bindLabelsToInput(containerSelector) {
  document.querySelectorAll(`${containerSelector} label`).forEach((label, index) => {
    if (label.htmlFor) return;

    let input = label.querySelector("input, select, textarea");
    if (!input) {
      const previous = label.previousElementSibling;
      const next = label.nextElementSibling;
      if (previous && /^(INPUT|SELECT|TEXTAREA)$/.test(previous.tagName)) {
        input = previous;
      } else if (next && /^(INPUT|SELECT|TEXTAREA)$/.test(next.tagName)) {
        input = next;
      }
    }

    if (!input) return;

    if (!input.id) {
      const safeValue = (input.value || input.name || "input")
        .toString()
        .trim()
        .replace(/[^a-zA-Z0-9_-]/g, "-");
      input.id = `${containerSelector.replace(/[^a-zA-Z0-9]/g, "")}-${index}-${safeValue}`;
    }

    label.htmlFor = input.id;
    label.style.cursor = "pointer";
  });
}

window.bindLabelsToInput = bindLabelsToInput;

document.addEventListener("DOMContentLoaded", function () {
  [
    "#planet-settings",
    "#graph-planet-settings",
    "#graph-aspect-settings",
    "#graph-type-settings",
    "#system-settings",
    "#customPointsList",
    ".degree-settings",
    ".ascendant-override",
  ].forEach(bindLabelsToInput);
});
