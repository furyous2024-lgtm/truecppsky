document.addEventListener("DOMContentLoaded", () => {
  // Prevent drag and drop on all form inputs and selects
  const formElements = document.querySelectorAll('.form input, .form select');
  formElements.forEach(element => {
    element.addEventListener('dragstart', (e) => {
      e.preventDefault();
      return false;
    });
    element.addEventListener('drop', (e) => {
      e.preventDefault();
      return false;
    });
    element.addEventListener('dragover', (e) => {
      e.preventDefault();
      return false;
    });
  });

  // Year fields with BCE negative symbol
  const yearInputs = [
    "natalYear",
    "triwheelYear",
    "graphStartYear",
    "graphEndYear",
    "synastryYear",
  ]
    .map((id) => document.getElementById(id))
    .filter((el) => el !== null);

  yearInputs.forEach((input) => {
    input.addEventListener("input", function () {
      let value = this.value;

      // Allow only digits and a single leading minus
      value = value.replace(/[^\d-]/g, ""); // remove non-digit/non-minus

      if (value.includes("-")) {
        value = "-" + value.replace(/-/g, ""); // only keep minus at start
      }

      // Enforce length: 5 max with minus, 4 otherwise
      if (value.startsWith("-") && value.length > 5) {
        value = value.slice(0, 5);
      } else if (!value.startsWith("-") && value.length > 4) {
        value = value.slice(0, 4);
      }

      this.value = value;
    });
  });

  // Number only fields
  const numericInputIDs = [
    "natalDay",
    "natalHour",
    "natalMinute",
    "triwheelDay",
    "triwheelHour",
    "triwheelMinute",
    "graphStartDay",
    "graphStartHour",
    "graphStartMinute",
    "graphEndDay",
    "graphEndHour",
    "graphEndMinute",
    "synastryDay",
    "synastryHour",
    "synastryMinute",
  ];

  numericInputIDs.forEach((id) => {
    const input = document.getElementById(id);
    if (!input) return;

    input.addEventListener("input", function () {
      this.value = this.value.replace(/\D/g, ""); // remove non-digit characters

      if (this.value.length > 2) {
        this.value = this.value.slice(0, 2);
      }
    });
  });
});
