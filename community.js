// Helper for formating time stamps
function formatTimestamp(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();

  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");

  const isToday = date.toDateString() === now.toDateString();

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();

  if (isToday) {
    return `today ${hours}:${minutes}`;
  } else if (isYesterday) {
    return `yesterday ${hours}:${minutes}`;
  } else {
    // Check if message is older than 7 days
    const msPerDay = 24 * 60 * 60 * 1000;
    const daysDiff = Math.floor((now - date) / msPerDay);

    if (daysDiff > 7) {
      // Show month and day for messages older than a week
      const month = date.toLocaleString("en-US", { month: "short" }).toLowerCase();
      const day = date.getDate();
      return `${month} ${day} ${hours}:${minutes}`;
    } else {
      // Show weekday for messages within the past week
      const weekday = date
        .toLocaleString("en-US", { weekday: "long" })
        .toLowerCase();
      return `${weekday} ${hours}:${minutes}`;
    }
  }
}

document.addEventListener("DOMContentLoaded", () => {
  // Center the chatBox, remove its border, and ensure its text is left-aligned.
  const chatBox = document.getElementById("chatBox");
  if (chatBox) {
    chatBox.style.border = "none";
    chatBox.style.maxWidth = "625px";
    chatBox.style.margin = "0 auto"; // Center the chat box horizontally.
    chatBox.style.textAlign = "left"; // Ensure the text inside remains left-aligned
  }

  // Dynamic chatBox height calculation
  function updateChatBoxHeight() {
    if (!chatBox) return;
    const channelSelection = document.getElementById("channel-selection");
    const chatInputRow = document.getElementById("chatInputRow");
    const header = document.querySelector("header");

    // Calculate available height
    const viewportHeight = window.innerHeight;
    const headerHeight = header ? header.offsetHeight : 0;
    const channelHeight = channelSelection ? channelSelection.offsetHeight : 0;
    const inputRowHeight = chatInputRow ? chatInputRow.offsetHeight : 0;
    const bodyPaddingTop = 20; // From body CSS
    const bottomPadding = 110; // Space for status row + error message + bottom padding

    const availableHeight =
      viewportHeight -
      headerHeight -
      channelHeight -
      inputRowHeight -
      bodyPaddingTop -
      bottomPadding;

    // Set height with minimum of 200px
    chatBox.style.height = Math.max(200, availableHeight) + "px";
  }

  // Update height when CHAT section becomes visible
  // Using MutationObserver to detect when showCommunity is displayed
  const showCommunity = document.getElementById("showCommunity");
  if (showCommunity) {
    const observer = new MutationObserver(() => {
      if (showCommunity.style.display !== "none") {
        updateChatBoxHeight();
      }
    });
    observer.observe(showCommunity, { attributes: true, attributeFilter: ["style"] });
  }

  // Also update on window resize
  window.addEventListener("resize", () => {
    if (showCommunity && showCommunity.style.display !== "none") {
      updateChatBoxHeight();
    }
  });

  // Read user attributes from the <body> tag.
  const currentUser =
    document.body.getAttribute("data-current-user") || "Anonymous";
  const currentUserId = document.body.getAttribute("data-user-id");
  const currentUserRole =
    document.body.getAttribute("data-user-role") || "user";

  window.currentUser = currentUser;

  // Determine admin status (case-insensitive)
  const isAdmin = currentUserRole.toLowerCase() === "admin";
  window.currentUserIsAdmin = isAdmin;

  // Configure Socket.io to avoid WebSocket errors in production
  const socket = io({
    transports: ["polling"], // Only use HTTP long-polling, not WebSocket
  });

  // Set default channel (TO GO LIVE: change back to just "ai")
  // Exposed to window so navigation.js can restore selection when returning to CHAT
  let currentChannel = window.defaultToWelcome ? "welcome" : "ai";
  window.currentChannel = currentChannel;
  // Don't emit joinChannel for AI - it uses HTTP, not WebSocket

  const sendMessageButton = document.getElementById("sendMessage");
  const messageInput = document.getElementById("chatInput");
  const anonymousCheckbox = document.getElementById("anonymousCheckbox");

  // Auto-resize textarea
  if (messageInput) {
    messageInput.addEventListener("input", function () {
      // Limit to 5 newlines (6 lines total)
      const lines = this.value.split("\n");
      if (lines.length > 6) {
        // Restore to first 6 lines only
        this.value = lines.slice(0, 6).join("\n");
      }

      this.style.height = "auto";
      this.style.height = this.scrollHeight + "px";
      updateChatBoxHeight();
    });
  }

  // Track last sent message to prevent duplicates
  let lastSentMessage = "";
  let lastSentTime = 0;

  // Function to load chat history for a given channel
  function loadChatHistory(channel) {
    fetch(`/chat-history/${channel}`, {
      credentials: "same-origin",
    })
      .then((response) => response.json())
      .then((messages) => {
        chatBox.innerHTML = "";
        // Check if we got an error instead of messages array
        if (messages.error) {
          const errorDiv = document.createElement("div");
          errorDiv.style.textAlign = "center";
          errorDiv.style.padding = "20px";
          errorDiv.style.color = "#777";
          errorDiv.textContent = messages.error;
          chatBox.appendChild(errorDiv);

          // Disable chat input when rate limited (can't see messages = shouldn't send)
          if (messageInput) {
            messageInput.disabled = true;
            messageInput.placeholder = "";
          }
          if (sendMessageButton) {
            sendMessageButton.disabled = true;
          }
          return;
        }

        // Re-enable chat input when messages load successfully
        if (messageInput) {
          messageInput.disabled = false;
          messageInput.placeholder =
            messageInput.getAttribute("data-original-placeholder") ||
            "Type a message...";
        }
        if (
          sendMessageButton &&
          window.user &&
          window.user.subscription_status
        ) {
          sendMessageButton.disabled = false;
        }
        messages.forEach((msg) => {
          const msgDiv = document.createElement("div");
          msgDiv.id = `message-${msg.id}`;
          msgDiv.style.display = "flex";
          msgDiv.style.alignItems = "flex-start";
          msgDiv.style.marginBottom = "5px";

          // Admin highlighted
          // if (
          //   msg.community_role &&
          //   msg.community_role.toLowerCase() === "admin"
          // ) {
          //   msgDiv.classList.add("admin-message");
          // }

          const img = document.createElement("img");
          img.src = msg.profile_image || "/images/default-avatar.png";
          img.alt = msg.username;
          img.style.width = "26px";
          img.style.height = "26px";
          img.style.borderRadius = "50%";
          img.style.marginRight = "10px";
          img.style.marginTop = "0px";
          img.style.objectFit = "cover";

          // Create a container for text content.
          const messageContainer = document.createElement("div");
          messageContainer.style.wordWrap = "break-word";
          messageContainer.style.whiteSpace = "pre-wrap";
          messageContainer.style.maxWidth = "90%";

          // Message font size
          messageContainer.style.fontSize = "18px";

          msgDiv.appendChild(img);

          // Create a clickable username span.
          const usernameSpan = document.createElement("span");
          usernameSpan.classList.add("username-mention");
          usernameSpan.textContent = msg.username;
          usernameSpan.setAttribute("data-username", msg.username);
          usernameSpan.style.cursor = "pointer";
          usernameSpan.style.fontWeight = "bold";
          messageContainer.appendChild(usernameSpan);

          // Color admin usernames
          if (
            msg.community_role &&
            msg.community_role.toLowerCase() === "admin"
          ) {
            usernameSpan.style.color = "#2c3d4f";
          }

          // Add badge for admins
          if (
            msg.community_role &&
            msg.community_role.toLowerCase() === "admin"
          ) {
            const badgeImg = document.createElement("img");
            badgeImg.src = "/images/misc/badge.svg";
            badgeImg.alt = "Admin Badge";
            badgeImg.style.width = "18px";
            badgeImg.style.height = "18px";
            badgeImg.style.verticalAlign = "middle";
            badgeImg.style.marginBottom = "6px";
            badgeImg.style.marginRight = "-2px";
            messageContainer.appendChild(badgeImg);
          }

          // Append time text.
          const timeSpan = document.createElement("span");
          timeSpan.textContent = "  " + formatTimestamp(msg.timestamp);
          timeSpan.style.fontSize = "12px";
          timeSpan.style.color = "#777";
          timeSpan.style.fontFamily = "Geneva, sans-serif";
          timeSpan.style.position = "relative";
          timeSpan.style.top = "-1px";
          messageContainer.appendChild(timeSpan);

          // Show delete link for admins OR message owner
          const isMessageOwner =
            msg.user_id && msg.user_id.toString() === currentUserId;
          if (window.currentUserIsAdmin || isMessageOwner) {
            const deleteLink = document.createElement("span");
            deleteLink.textContent = "  remove";
            deleteLink.style.fontSize = "12px";
            deleteLink.style.color = "#777";
            deleteLink.style.fontFamily = "Geneva, sans-serif";
            deleteLink.style.position = "relative";
            deleteLink.style.top = "-1px";
            deleteLink.style.cursor = "pointer";

            deleteLink.addEventListener("click", () => {
              deleteMessage(msg.id);
            });
            messageContainer.appendChild(deleteLink);
          }

          // Append the rest of the message text.
          const messageText = document.createElement("div");
          messageText.textContent = msg.message;
          messageText.style.marginTop = "2px";
          messageContainer.appendChild(messageText);

          // Bold @ user:
          if (
            currentUser.toLowerCase() !== "anonymous" &&
            msg.message.toLowerCase().includes("@" + currentUser.toLowerCase())
          ) {
            messageText.style.fontWeight = "bold";
          }

          msgDiv.appendChild(messageContainer);
          chatBox.appendChild(msgDiv);
        });
        // Smoothly scroll to the bottom after a short delay.
        setTimeout(() => {
          chatBox.scrollTo({
            top: chatBox.scrollHeight,
            behavior: "smooth",
          });
        }, 100);
      })
      .catch((err) =>
        console.error("Error fetching chat history for channel:", err)
      );
  }

  // Initially load the chat history for the default channel.
  // AI channel is default - activate it instead of loading WebSocket chat
  if (currentChannel === "ai" && window.aiChat) {
    window.aiChat.activate();
  } else {
    socket.emit("joinChannel", currentChannel);
    loadChatHistory(currentChannel);
  }

  // Listen to channel button clicks to switch channels.
  const channelButtons = document.querySelectorAll(".channel-btn");
  channelButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      // Update active state
      channelButtons.forEach((b) => b.classList.remove("active-channel"));
      btn.classList.add("active-channel");

      // Update currentChannel
      currentChannel = btn.getAttribute("data-channel");
      window.currentChannel = currentChannel;

      if (currentChannel === "ai") {
        // AI channel uses HTTP, not WebSocket
        if (window.aiChat) {
          window.aiChat.activate();
        }
      } else {
        // Regular channels use WebSocket
        if (window.aiChat) {
          window.aiChat.deactivate();
        }
        socket.emit("joinChannel", currentChannel);
        loadChatHistory(currentChannel);
      }
    });
  });

  // Function to send a delete request.
  const deleteMessage = (messageId) => {
    fetch("/delete-chat-message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: messageId }),
      credentials: "same-origin",
    })
      .then((res) => res.json())
      .then((result) => {
        if (result.success) {
          const elem = document.getElementById(`message-${messageId}`);
          if (elem) elem.remove();
        } else {
          console.error("Deletion error:", result.error);
        }
      })
      .catch((err) => console.error("Deletion error", err));
  };

  // When sending a message, include the currentChannel.
  sendMessageButton.addEventListener("click", () => {
    // Check if AI channel - handle separately
    if (currentChannel === "ai") {
      if (window.aiChat) {
        const message = messageInput.value.trim();
        if (message) {
          window.aiChat.sendMessage(message);
        }
      }
      return; // Don't continue to WebSocket logic
    }

    // Check subscription status first
    const userSubscriptionStatus = window.user?.subscription_status;

    // Check if limited status is still valid
    let hasValidLimited = false;
    if (userSubscriptionStatus?.startsWith("limited_")) {
      const dateMatch = userSubscriptionStatus.match(
        /^limited_(\d{4}-\d{2}-\d{2})$/
      );
      if (dateMatch) {
        const expiryDate = new Date(dateMatch[1] + "T00:00:00Z"); // Parse as UTC midnight
        const today = new Date();
        const todayUTC = new Date(
          Date.UTC(
            today.getUTCFullYear(),
            today.getUTCMonth(),
            today.getUTCDate()
          )
        );
        if (expiryDate >= todayUTC) {
          // Valid through the entire expiry date in UTC
          hasValidLimited = true;
        }
      }
    }

    const hasValidSubscription =
      userSubscriptionStatus === "active" ||
      userSubscriptionStatus === "trialing" ||
      userSubscriptionStatus === "past_due" ||
      userSubscriptionStatus === "free" ||
      hasValidLimited;

    // If no subscription, send empty message to trigger server redirect
    if (!hasValidSubscription) {
      socket.emit("chatMessage", {
        channel: currentChannel,
        userId: currentUserId,
        username: currentUser,
        message: "", // Empty message will trigger subscription check on server
        anonymous: false,
      });
      return;
    }

    // Original logic for subscribed users - only send if there's a message
    const message = messageInput.value.trim();
    if (message) {
      // Prevent sending duplicate message within 10 seconds
      const now = Date.now();
      if (message === lastSentMessage && now - lastSentTime < 10000) {
        messageInput.value = ""; // Clear input
        messageInput.style.height = "auto"; // Reset height
        updateChatBoxHeight();
        // Show error message
        const errorElem = document.getElementById("chatErrorMessage");
        if (errorElem) {
          errorElem.textContent = "Duplicate message. Message already sent.";
          setTimeout(() => {
            errorElem.textContent = "";
          }, 3000);
        }
        return; // Block duplicate
      }

      // Update tracking
      lastSentMessage = message;
      lastSentTime = now;

      // Clear input immediately to prevent spam during network issues
      messageInput.value = "";
      messageInput.style.height = "auto"; // Reset height
      updateChatBoxHeight();

      const isAnonymous = anonymousCheckbox ? anonymousCheckbox.checked : false;
      socket.emit("chatMessage", {
        channel: currentChannel,
        userId: currentUserId,
        username: isAnonymous ? "Anonymous" : window.currentUser,
        message: message,
        anonymous: isAnonymous,
      });
    }
  });

  // Allow enter key for messages
  messageInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();

      // Check if AI channel
      if (currentChannel === "ai") {
        if (window.aiChat) {
          const message = messageInput.value.trim();
          if (message) {
            window.aiChat.sendMessage(message);
          }
        }
        return;
      }

      // Regular channel - trigger send button click
      sendMessageButton.click();
    }
  });

  // When a new chat message is received.
  socket.on("chatMessage", (data) => {
    // Only handle messages for the currently selected channel.
    if (data.channel !== currentChannel) return;
    // Skip if already rendered (can happen after loadChatHistory re-fetch
    // on tab-visibility-change — the polling may also deliver the same msg).
    if (document.getElementById(`message-${data.id}`)) return;

    const timeString = formatTimestamp(data.timestamp);

    const msgContainer = document.createElement("div");
    msgContainer.id = `message-${data.id}`;
    msgContainer.style.display = "flex";
    msgContainer.style.alignItems = "flex-start";
    msgContainer.style.marginBottom = "5px";

    // Highlight admin messages
    // if (data.role && data.role.toLowerCase() === "admin") {
    //   msgContainer.classList.add("admin-message");
    // }

    const img = new Image();
    img.alt = data.username;
    img.style.width = "26px";
    img.style.height = "26px";
    img.style.borderRadius = "50%";
    img.style.marginRight = "10px";
    img.style.objectFit = "cover";

    // Create a container for text content.
    const messageContainer = document.createElement("div");
    messageContainer.style.wordWrap = "break-word";
    messageContainer.style.whiteSpace = "pre-wrap";
    messageContainer.style.maxWidth = "90%";
    messageContainer.style.fontSize = "18px";

    // Create and append the username span.
    const usernameSpan = document.createElement("span");
    usernameSpan.textContent = data.username;
    usernameSpan.style.fontWeight = "bold";
    usernameSpan.classList.add("username-mention");
    usernameSpan.setAttribute("data-username", data.username);
    messageContainer.appendChild(usernameSpan);

    // Color admin usernames
    if (data.role && data.role.toLowerCase() === "admin") {
      usernameSpan.style.color = "#2c3d4f";
    }

    // Add badge for admins
    if (data.role && data.role.toLowerCase() === "admin") {
      const badgeImg = document.createElement("img");
      badgeImg.src = "/images/misc/badge.svg";
      badgeImg.alt = "Admin Badge";
      badgeImg.style.width = "18px";
      badgeImg.style.height = "18px";
      badgeImg.style.verticalAlign = "middle";
      badgeImg.style.marginBottom = "6px";
      badgeImg.style.marginRight = "-2px";
      messageContainer.appendChild(badgeImg);
    }

    // Append the timestamp using a span.
    const timeSpan = document.createElement("span");
    timeSpan.textContent = `  ${timeString}`;
    timeSpan.style.fontSize = "12px";
    timeSpan.style.color = "#777";
    timeSpan.style.fontFamily = "Geneva, sans-serif";
    timeSpan.style.position = "relative";
    timeSpan.style.top = "-1px";
    messageContainer.appendChild(timeSpan);

    // Show delete link for admins OR message owner
    const isMessageOwner =
      data.userId && data.userId.toString() === currentUserId;
    if (window.currentUserIsAdmin || isMessageOwner) {
      const deleteLink = document.createElement("span");
      deleteLink.textContent = "  remove";
      deleteLink.style.fontSize = "12px";
      deleteLink.style.color = "#777";
      deleteLink.style.fontFamily = "Geneva, sans-serif";
      deleteLink.style.position = "relative";
      deleteLink.style.top = "-1px";
      deleteLink.style.cursor = "pointer";

      deleteLink.addEventListener("click", () => {
        deleteMessage(data.id);
      });
      messageContainer.appendChild(deleteLink);
    }

    // Append the rest of the message text.
    const messageText = document.createElement("div");
    messageText.textContent = data.message;
    messageText.style.marginTop = "2px";
    messageContainer.appendChild(messageText);

    // If the message is sent by the current user, bold only the timestamp.
    if (
      window.currentUser.toLowerCase() !== "anonymous" &&
      data.username.toLowerCase() === window.currentUser.toLowerCase()
    ) {
      // timeSpan.style.fontWeight = "bold";
      usernameSpan.style.fontWeight = "bold";

      // Otherwise, if it contains an @mention for the user, bold the entire text.
    } else if (
      window.currentUser.toLowerCase() !== "anonymous" &&
      data.message
        .toLowerCase()
        .includes("@" + window.currentUser.toLowerCase())
    ) {
      messageText.style.fontWeight = "bold";
    }

    img.onload = () => {
      msgContainer.appendChild(img);
      msgContainer.appendChild(messageContainer);
      chatBox.appendChild(msgContainer);
      chatBox.scrollTop = chatBox.scrollHeight;
    };

    img.onerror = () => {
      msgContainer.appendChild(img);
      msgContainer.appendChild(messageContainer);
      chatBox.appendChild(msgContainer);
      chatBox.scrollTop = chatBox.scrollHeight;
    };

    img.src = data.profileImage || "/images/default-avatar.png";

    // Only clear if it's the current user (for multi-tab scenarios)
    if (data.userId === currentUserId) {
      // Already cleared on send, but this handles edge cases
      messageInput.value = "";
    }
  });

  socket.on("messageDeleted", (data) => {
    const elem = document.getElementById(`message-${data.id}`);
    if (elem) elem.remove();
  });

  socket.on("errorMessage", (data) => {
    const errorElem = document.getElementById("chatErrorMessage");
    if (errorElem) {
      errorElem.textContent = data.text;
      setTimeout(() => {
        errorElem.textContent = "";
      }, 5000);
    }
  });

  // Handle subscription required - redirect to Stripe checkout
  socket.on("subscriptionRequired", (data) => {
    if (data.redirectUrl) {
      window.location.href = data.redirectUrl;
    }
  });

  // Re-fetch chat history when the tab becomes visible again. Mobile browsers
  // (iOS Safari especially) pause/throttle long-polling connections when the
  // app is backgrounded, so messages sent during that window can be missed.
  // Only runs for community channels — AI uses HTTP, not sockets, so it is
  // not affected by the polling pause issue.
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) return;
    const showCommunity = document.getElementById("showCommunity");
    if (!showCommunity || showCommunity.style.display === "none") return;
    if (currentChannel === "ai") return;
    loadChatHistory(currentChannel);
  });
});
