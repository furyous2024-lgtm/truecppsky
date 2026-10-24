document.addEventListener("DOMContentLoaded", function () {
  // Fill the form fields with today's date and default location for formNatal
  const today = new Date();
  document.getElementById("natalName").value = "Today";
  document.getElementById("natalDay").value = today.getDate();
  document.getElementById("natalMonth").value = today.toLocaleString(
    "en-US",
    {
      month: "long",
    }
  );
  document.getElementById("natalYear").value = today.getFullYear();
  document.getElementById("natalHour").value = today.getHours().toString().padStart(2, "0");
  document.getElementById("natalMinute").value = today.getMinutes().toString().padStart(2, "0");
  document.getElementById("natalLocation").value =
    document.getElementById("defaultLocation")?.value.trim() ||
    "New York City, New York, United States";

  // Fill the form fields with today's date and default location for formTriwheel
  document.getElementById("triwheelDay").value = today.getDate();
  document.getElementById("triwheelMonth").value = today.toLocaleString(
    "en-US",
    {
      month: "long",
    }
  );
  document.getElementById("triwheelYear").value = today.getFullYear();
  document.getElementById("triwheelHour").value = today.getHours().toString().padStart(2, "0");
  document.getElementById("triwheelMinute").value = today.getMinutes().toString().padStart(2, "0");
  document.getElementById("triwheelLocation").value =
    document.getElementById("defaultLocation")?.value.trim() ||
    "New York City, New York, United States";

  // Fill the form fields with one year before/after and default location for formGraph
  // Start date
  document.getElementById("graphStartDay").value = today.getDate();
  document.getElementById("graphStartMonth").value = today.toLocaleString(
    "en-US",
    {
      month: "long",
    }
  );
  document.getElementById("graphStartYear").value = today.getFullYear() - 1;
  document.getElementById("graphStartHour").value = today.getHours().toString().padStart(2, "0");
  document.getElementById("graphStartMinute").value = today.getMinutes().toString().padStart(2, "0");

  // End date
  document.getElementById("graphEndDay").value = today.getDate();
  document.getElementById("graphEndMonth").value = today.toLocaleString(
    "en-US",
    {
      month: "long",
    }
  );
  document.getElementById("graphEndYear").value = today.getFullYear() + 1;
  document.getElementById("graphEndHour").value = today.getHours().toString().padStart(2, "0");
  document.getElementById("graphEndMinute").value = today.getMinutes().toString().padStart(2, "0");

  // Default location
  document.getElementById("graphLocation").value =
    document.getElementById("defaultLocation")?.value.trim() ||
    "New York City, New York, United States";

  // Submit the chart and graph forms
  // document.getElementById("natalForm").dispatchEvent(new Event("submit"));
  // document.getElementById("graphForm").dispatchEvent(new Event("submit"));
});
