function initModal() {
  const dialog = document.getElementById("work-modal") as HTMLDialogElement;
  const modalContent = document.getElementById("modal-content");
  const closeBtn = document.getElementById("modal-close");

  if (!dialog || !modalContent || !closeBtn) return;

  // Open modal when a work card is clicked
  document.querySelectorAll<HTMLElement>(".work-card-trigger").forEach(trigger => {
    trigger.addEventListener("click", () => {
      const workId = trigger.dataset.workId;
      const source = document.querySelector(
        `div[data-work-template="${workId}"]`
      ) as HTMLDivElement;

      if (!source) return;

      modalContent.innerHTML = source.innerHTML;

      // Update URL without navigation
      history.pushState({ modal: true, slug: workId }, "", `/works/${workId}`);

      // Open the dialog
      dialog.showModal();
      document.body.style.overflow = "hidden";
    });
  });

  // Close handlers
  closeBtn.addEventListener("click", closeModal);

  dialog.addEventListener("click", e => {
    // Close on backdrop click (click on dialog element itself, not children)
    if (e.target === dialog) closeModal();
  });

  // Handle browser back button
  window.addEventListener("popstate", () => {
    if (dialog.open) {
      dialog.close();
      document.body.style.overflow = "";
    }
  });

  // Clean up body overflow when dialog closes (covers ESC key too)
  dialog.addEventListener("close", () => {
    document.body.style.overflow = "";
  });

  function closeModal() {
    dialog.close();
    document.body.style.overflow = "";
    if (history.state?.modal) {
      history.back();
    }
  }
}

initModal();
document.addEventListener("astro:page-load", initModal);
