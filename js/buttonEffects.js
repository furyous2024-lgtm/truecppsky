// Button click effects for all main buttons in the astrology app

document.addEventListener('DOMContentLoaded', function() {
    // Select all buttons that should have click effects
    const buttons = document.querySelectorAll(`
        .menu button,
        .calculate,
        .import-export-container button,
        .delete-charts button,
        .logout button,
        .subscribe button,
        .delete-account button,
        .lat-long-button,
        #saveDefaultLocationBtn
    `);

    buttons.forEach(button => {
        // Add mousedown event for click-down effect
        button.addEventListener('mousedown', function() {
            this.classList.add('button-clicked');
        });

        // Add mouseup event for click-up effect
        button.addEventListener('mouseup', function() {
            this.classList.remove('button-clicked');
        });

        // Add mouseleave event to handle case where user drags off button
        button.addEventListener('mouseleave', function() {
            this.classList.remove('button-clicked');
        });

        // Add touchstart for mobile devices
        button.addEventListener('touchstart', function() {
            this.classList.add('button-clicked');
        });

        // Add touchend for mobile devices
        button.addEventListener('touchend', function() {
            this.classList.remove('button-clicked');
        });
    });
});