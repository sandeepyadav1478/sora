function initModal() {
  const dialog = document.getElementById("work-modal") as HTMLDialogElement;
  const modalContent = document.getElementById("modal-content");
  const closeBtn = document.getElementById("modal-close");
  const lightbox = document.getElementById("media-lightbox") as HTMLDialogElement;

  if (!dialog || !modalContent || !closeBtn) return;

  let savedScrollY = 0;
  const originalUrl = location.href;

  function lockBody() {
    savedScrollY = window.scrollY;
    document.body.style.position = "fixed";
    document.body.style.top = `-${savedScrollY}px`;
    document.body.style.width = "100%";
  }

  function unlockBody() {
    document.body.style.position = "";
    document.body.style.top = "";
    document.body.style.width = "";
    document.documentElement.style.scrollBehavior = "auto";
    window.scrollTo(0, savedScrollY);
    document.documentElement.style.scrollBehavior = "";
  }

  function openLightbox(html: string) {
    if (!lightbox) return;
    const lbContent = lightbox.querySelector(".lightbox-content");
    if (!lbContent) return;
    lbContent.innerHTML = html;
    lightbox.showModal();
  }

  function closeLightbox() {
    if (!lightbox?.open) return;
    const lbContent = lightbox.querySelector(".lightbox-content");
    if (lbContent) {
      lbContent.querySelectorAll("iframe, video").forEach(el => el.remove());
      lbContent.innerHTML = "";
    }
    lightbox.close();
  }

  function openModal(workId: string) {
    const source = document.querySelector(
      `div[data-work-template="${workId}"]`
    ) as HTMLDivElement;

    if (!source || !modalContent) return;

    modalContent.innerHTML = source.innerHTML;
    history.replaceState({ modal: true }, "", `/works/${workId}`);

    lockBody();
    const inner = dialog.querySelector(".modal-inner") as HTMLElement;
    if (inner) inner.scrollTop = 0;
    dialog.showModal();

    initLightboxTriggers();
  }

  function initLightboxTriggers() {
    if (!lightbox) return;

    const lbClose = lightbox.querySelector(".lightbox-close");
    if (!lbClose) return;

    modalContent?.querySelectorAll<HTMLImageElement>(".app-prose img").forEach(img => {
      img.addEventListener("click", () => {
        openLightbox(`<img src="${img.src}" alt="${img.alt || ""}" />`);
      });
    });

    modalContent?.querySelectorAll<HTMLIFrameElement>(".app-prose iframe").forEach(iframe => {
      iframe.removeAttribute("allowfullscreen");
      const wrapper = document.createElement("div");
      wrapper.className = "video-theater-wrap";

      const overlay = document.createElement("div");
      overlay.className = "video-theater-overlay";
      overlay.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="2" y="7" width="20" height="15" rx="2" ry="2"></rect>
          <polyline points="17 2 12 7 7 2"></polyline>
        </svg>
        <span>Theater mode</span>
      `;

      overlay.addEventListener("click", e => {
        e.stopPropagation();
        const src = iframe.src.includes("?")
          ? iframe.src + "&autoplay=1"
          : iframe.src + "?autoplay=1";
        openLightbox(`<iframe src="${src}"></iframe>`);
      });

      iframe.parentNode?.insertBefore(wrapper, iframe);
      wrapper.appendChild(iframe);
      wrapper.appendChild(overlay);
    });

    modalContent?.querySelectorAll<HTMLVideoElement>(".app-prose video").forEach(video => {
      const wrapper = document.createElement("div");
      wrapper.className = "video-theater-wrap";

      const overlay = document.createElement("div");
      overlay.className = "video-theater-overlay";
      overlay.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="2" y="7" width="20" height="15" rx="2" ry="2"></rect>
          <polyline points="17 2 12 7 7 2"></polyline>
        </svg>
        <span>Theater mode</span>
      `;

      overlay.addEventListener("click", e => {
        e.stopPropagation();
        openLightbox(`<video src="${video.src}" controls autoplay></video>`);
      });

      video.parentNode?.insertBefore(wrapper, video);
      wrapper.appendChild(video);
      wrapper.appendChild(overlay);
    });

    modalContent?.querySelectorAll<HTMLElement>(".modal-gallery-item").forEach(item => {
      const img = item.querySelector("img");
      if (img) {
        img.addEventListener("click", () => {
          openLightbox(`<img src="${img.src}" alt="${img.alt || ""}" />`);
        });
      }
      const videoOverlay = item.querySelector(".video-theater-overlay");
      const iframe = item.querySelector("iframe");
      if (videoOverlay && iframe) {
        iframe.removeAttribute("allowfullscreen");
        videoOverlay.addEventListener("click", e => {
          e.stopPropagation();
          const src = iframe.src.includes("?")
            ? iframe.src + "&autoplay=1"
            : iframe.src + "?autoplay=1";
          openLightbox(`<iframe src="${src}"></iframe>`);
        });
      }
    });

    lbClose.addEventListener("click", closeLightbox);
    lightbox.addEventListener("click", e => {
      if (e.target === lightbox) closeLightbox();
    });
    lightbox.addEventListener("cancel", e => {
      e.preventDefault();
      closeLightbox();
    });
  }

  document.querySelectorAll<HTMLElement>(".work-card-trigger").forEach(trigger => {
    trigger.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).closest(".tag-link")) return;
      const workId = trigger.dataset.workId;
      if (workId) openModal(workId);
    });

    trigger.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        if ((e.target as HTMLElement).closest(".tag-link")) return;
        e.preventDefault();
        const workId = trigger.dataset.workId;
        if (workId) openModal(workId);
      }
    });
  });

  closeBtn.addEventListener("click", closeModal);

  dialog.addEventListener("click", e => {
    if (e.target === dialog) closeModal();
  });

  dialog.addEventListener("cancel", e => {
    e.preventDefault();
    closeModal();
  });

  function closeModal() {
    if (!dialog.open) return;
    closeLightbox();
    dialog.close();
    unlockBody();
    history.replaceState(null, "", originalUrl);
  }
}

initModal();
document.addEventListener("astro:page-load", initModal);
