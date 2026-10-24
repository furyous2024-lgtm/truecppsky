/**
 * AI Memory Settings - ACCOUNT section handlers
 * Allows users to enable/disable AI memory and clear stored memory
 */

// Helper to clear message after delay (matches importCharts.js pattern)
let clearAiMemoryMessageTimeoutId;

const clearAiMemoryMessage = (delay = 5000) => {
  if (clearAiMemoryMessageTimeoutId) {
    clearTimeout(clearAiMemoryMessageTimeoutId);
  }
  clearAiMemoryMessageTimeoutId = setTimeout(() => {
    document.getElementById("aiMemoryMessage").innerText = "";
  }, delay);
};

// Load initial state when page loads
document.addEventListener("DOMContentLoaded", async () => {
  const toggle = document.getElementById("aiMemoryToggle");
  if (!toggle) return;

  try {
    const response = await fetch("/api/ai-chat/memory-settings", {
      credentials: "same-origin",
    });
    if (response.ok) {
      const data = await response.json();
      toggle.checked = data.memoryEnabled;
    }
    // Non-subscribers get 403 - checkbox stays at default (checked)
  } catch {
    // Network error - checkbox stays at default (checked)
  }
});

// Handle toggle change
document.getElementById("aiMemoryToggle")?.addEventListener("change", async (e) => {
  try {
    const response = await fetch("/api/ai-chat/memory-settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ memoryEnabled: e.target.checked }),
    });
    if (response.ok) {
      document.getElementById("aiMemoryMessage").innerText = e.target.checked
        ? "Memory enabled."
        : "Memory disabled.";
    } else if (response.status === 403) {
      document.getElementById("aiMemoryMessage").innerText = "Subscription required.";
      e.target.checked = !e.target.checked; // Revert
    } else {
      document.getElementById("aiMemoryMessage").innerText = "Failed to update setting.";
      e.target.checked = !e.target.checked; // Revert
    }
  } catch {
    document.getElementById("aiMemoryMessage").innerText = "Failed to update setting.";
    e.target.checked = !e.target.checked; // Revert
  }
  clearAiMemoryMessage();
});

// Handle clear memory button
document.getElementById("clearAiMemoryBtn")?.addEventListener("click", async () => {
  try {
    const response = await fetch("/api/ai-chat/delete-memory", {
      method: "POST",
      credentials: "same-origin",
    });
    if (response.ok) {
      document.getElementById("aiMemoryMessage").innerText = "Memory cleared.";
    } else if (response.status === 403) {
      document.getElementById("aiMemoryMessage").innerText = "Subscription required.";
    } else {
      document.getElementById("aiMemoryMessage").innerText = "Failed to clear memory.";
    }
  } catch {
    document.getElementById("aiMemoryMessage").innerText = "Failed to clear memory.";
  }
  clearAiMemoryMessage();
});
