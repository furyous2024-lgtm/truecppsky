function showStep(stepId, event) {
  // Prevent default anchor behavior to avoid hash in URL
  if (event) {
    event.preventDefault();
  }
  
  // Close all steps
  closeAllSteps();
  
  // Open the target step
  const step = document.getElementById(stepId);
  if (step) {
    const header = step.querySelector('.step-header');
    const content = step.querySelector('.step-content');
    if (header && content) {
      header.classList.add('active');
      content.classList.add('active');
    }
    
    // Scroll to step with longer delay to account for content expansion
    setTimeout(() => {
      step.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 300);
  }
}

function toggleStep(stepId) {
  const step = document.getElementById(stepId);
  if (step) {
    const header = step.querySelector('.step-header');
    const content = step.querySelector('.step-content');
    if (header && content) {
      const isActive = header.classList.contains('active');
      if (isActive) {
        header.classList.remove('active');
        content.classList.remove('active');
      } else {
        closeAllSteps();
        header.classList.add('active');
        content.classList.add('active');
        
        // Scroll to step with longer delay to account for content expansion
        setTimeout(() => {
          step.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 300);
      }
    }
  }
}

function closeAllSteps() {
  const allSteps = document.querySelectorAll('.tutorial-step');
  allSteps.forEach(step => {
    const header = step.querySelector('.step-header');
    const content = step.querySelector('.step-content');
    if (header && content) {
      header.classList.remove('active');
      content.classList.remove('active');
    }
  });
}

// Initialize all steps closed
document.addEventListener('DOMContentLoaded', function() {
  closeAllSteps();
  
  // Add ESC key support
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      closeAllSteps();
    }
  });
});