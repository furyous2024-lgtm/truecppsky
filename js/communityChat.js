document.addEventListener("DOMContentLoaded", () => {
  // Listen for clicks anywhere within the document body.
  document.body.addEventListener("click", function (event) {
    if (event.target.classList.contains("username-mention")) {
      const clickedUser = event.target.getAttribute("data-username");
      if (!clickedUser) return;

      // Prevent adding a mention for the current user.
      if (
        window.currentUser &&
        window.currentUser.trim().toLowerCase() ===
          clickedUser.trim().toLowerCase()
      ) {
        return;
      }

      const chatInput = document.getElementById("chatInput");
      if (chatInput) {
        // Use a colon delimiter to support multi-word names.
        const newMention = `@${clickedUser}: `;
        const currentValue = chatInput.value;

        if (currentValue.startsWith("@")) {
          // Match a mention that starts with '@' and goes until the first colon and space.
          const mentionRegex = /^@[^:]+:\s/;
          if (mentionRegex.test(currentValue)) {
            chatInput.value = currentValue.replace(mentionRegex, newMention);
          } else {
            // In case no colon delimiter is found, split the text on the first space.
            const firstSpace = currentValue.indexOf(" ");
            if (firstSpace !== -1) {
              chatInput.value = newMention + currentValue.slice(firstSpace + 1);
            } else {
              chatInput.value = newMention;
            }
          }
        } else {
          // Prepend the new mention to the existing text.
          chatInput.value = newMention + currentValue;
        }
        // Focus and set cursor to end of text (not select all)
        chatInput.focus();
        const textLength = chatInput.value.length;
        chatInput.setSelectionRange(textLength, textLength);
      }
    }
  });
});
