"use strict";

// Ensure the DOM is fully loaded before attaching event listeners
document.addEventListener("DOMContentLoaded", function () {
  // Hide all sections. This ensures that only the selected section is visible
  function hideAllSections() {
    document.getElementById("showNatal").style.display = "none";
    document.getElementById("showTriwheel").style.display = "none";
    document.getElementById("showGraph").style.display = "none";
    document.getElementById("showReturn").style.display = "none";
    const showCommunity = document.getElementById("showCommunity");
    if (showCommunity) showCommunity.style.display = "none";
    // SYNC section only exists in the desktop app (index.hbs isDesktop)
    const showSync = document.getElementById("showSync");
    if (showSync) showSync.style.display = "none";
    document.getElementById("showSettings").style.display = "none";
    document.getElementById("showSynastry").style.display = "none";
    document.getElementById("showComposite").style.display = "none";
    document.getElementById("showHelp").style.display = "none";
    document.getElementById("showAccount").style.display = "none";
    document.getElementById("showMap").style.display = "none";
    // Remove chat-active class when leaving CHAT section
    document.body.classList.remove("chat-active");
  }

  // Clean up the UI by removing the Graph tooltip and red date box if they exist
  function cleanupUI() {
    // Remove the Tooltip
    const tooltip = document.querySelector(".tooltip");
    if (tooltip) {
      tooltip.style.opacity = "0"; // Hide the tooltip
      tooltip.innerHTML = ""; // Clear any existing content
    }

    // Remove the Red Date Box
    const fixedDateText = document.getElementById("fixedDateText");
    if (fixedDateText) {
      fixedDateText.remove(); // Remove the red date box from the DOM
    }

    // Remove the Red Line
    const redLines = document.querySelectorAll("#graph svg .red-line");
    redLines.forEach((line) => line.remove());
  }

  // Change nav button on selection
  // Store all nav buttons and their corresponding sections
  const navButtons = [
    { id: "natal-button", section: "showNatal", icon: "main" },
    { id: "triwheel-button", section: "showTriwheel", icon: "triwheel" },
    { id: "graph-button", section: "showGraph", icon: "graph" },
    { id: "return-button", section: "showReturn", icon: "return" },
    { id: "community-button", section: "showCommunity", icon: "community" },
    { id: "settings-button", section: "showSettings", icon: "settings" },
    { id: "synastry-button", section: "showSynastry", icon: "synastry" },
    { id: "composite-button", section: "showComposite", icon: "composite" },
    { id: "help-button", section: "showHelp", icon: "help" },
    { id: "account-button", section: "showAccount", icon: "account" },
    { id: "map-button", section: "showMap", icon: "map" },
    // Desktop app only (top.hbs isDesktop); skipped on the website
    { id: "sync-button", section: "showSync", icon: "sync" },
  ];

  // Keep the MAIN and SETTINGS icons paired with their dedicated selected assets.
  // Other navigation icons use the existing drop-shadow active treatment.
  function setNavigationIcon(button, icon, active) {
    const img = button?.querySelector("img");
    if (!img) return;
    const hasSelectedAsset = icon === "main" || icon === "settings";
    const file = hasSelectedAsset && active ? `${icon}-select.svg` : `${icon}.svg`;
    img.setAttribute("src", `images/menu/${file}`);
  }

  // Reset all icons to their default (non-colored) version
  function resetAllIcons() {
    navButtons.forEach(({ id, icon }) => {
      const btn = document.getElementById(id);
      if (!btn) return; // SYNC button only exists in the desktop app
      const img = btn.querySelector("img");
      const label = btn.querySelector("span");
      setNavigationIcon(btn, icon, false);
      img.classList.remove("is-active");

      // Remove all known active classes from the label
      label.classList.remove(
        "active-main",
        "active-natal",
        "active-triwheel",
        "active-graph",
        "active-return",
        "active-community",
        "active-settings",
        "active-synastry",
        "active-composite",
        "active-help",
        "active-account",
        "active-map",
        "active-sync"
      );
    });
  }

  // Show selected section and update the nav icon
  function showSection(buttonId, sectionId, iconName) {
    hideAllSections();
    document.getElementById(sectionId).style.display = "block";
    cleanupUI();
    resetAllIcons();

    // Change current button icon and text to the colored version
    const btn = document.getElementById(buttonId);
    const img = btn.querySelector("img");
    const label = btn.querySelector("span");
    setNavigationIcon(btn, iconName, true);
    img.classList.add("is-active");
    label.classList.add(`active-${iconName}`);
  }

  // Attach event listeners dynamically
  navButtons.forEach(({ id, section, icon }) => {
    const btn = document.getElementById(id);
    if (!btn) return; // SYNC button only exists in the desktop app
    btn.addEventListener("click", () => {
      showSection(id, section, icon);
    });
  });

  // Shows the Community section and hides others
  const communityButton = document.getElementById("community-button");
  if (communityButton) communityButton.addEventListener("click", function () {
    hideAllSections(); // Hide all sections first
    const communitySection = document.getElementById("showCommunity");
    communitySection.style.display = "block";
    document.body.classList.add("chat-active"); // Prevent page scroll
    cleanupUI(); // Clean up tooltip and red date box

    // Restore the previously selected channel (defaults to "ai" if not set)
    const channelToSelect = window.currentChannel || "ai";
    const channelBtn = communitySection.querySelector(
      `.channel-btn[data-channel="${channelToSelect}"]`
    );
    if (channelBtn) {
      // Create and dispatch a MouseEvent to simulate the click.
      const clickEvent = new MouseEvent("click", {
        view: window,
        bubbles: true,
        cancelable: true,
      });
      channelBtn.dispatchEvent(clickEvent);
    } else {
      // No channel buttons (non-admin) - scroll chat to bottom
      const chatBox = document.getElementById("chatBox");
      if (chatBox) {
        setTimeout(() => {
          chatBox.scrollTo({
            top: chatBox.scrollHeight,
            behavior: "smooth",
          });
        }, 100);
      }
    }
  });
  // Ensure natal page is selected on page load
  setTimeout(() => {
    if (new URLSearchParams(window.location.search).get("section") === "map") {
      document.getElementById("map-button")?.click();
      return;
    }
    const natalBtn = document.getElementById("natal-button");
    const natalImg = natalBtn.querySelector("img");
    const natalLabel = natalBtn.querySelector("span");
    setNavigationIcon(natalBtn, "main", true);
    natalImg.classList.add("is-active");
    natalLabel.classList.add("active-main");
  }, 0);
});
