"use strict";

document.querySelectorAll("input").forEach((input) => {
  input.addEventListener("focus", function () {
    this.select();
  });
});

// Ensure 0 before single digit hours and minutes
document.querySelectorAll("input.hour, input.minute").forEach((input) => {
  input.addEventListener("blur", function () {
    if (this.value && this.value.length === 1) {
      this.value = this.value.padStart(2, "0");
    }
  });
});
