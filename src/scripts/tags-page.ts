function initTagsPage() {
  const toggles = document.querySelectorAll<HTMLElement>("[data-tag-toggle]");
  const items = document.querySelectorAll<HTMLElement>(".work-item");
  if (toggles.length === 0 || items.length === 0) return;

  let activeTags = new Set<string>();

  const params = new URLSearchParams(window.location.search);
  const preselected = params.get("t");
  if (preselected) activeTags.add(preselected);

  function applyFilters() {
    items.forEach(item => {
      const itemTags = (item.dataset.tags || "").split(",").filter(Boolean);
      const match = activeTags.size === 0 || [...activeTags].every(t => itemTags.includes(t));
      item.style.display = match ? "" : "none";
    });
  }

  function syncToggles() {
    toggles.forEach(t => {
      const tag = t.dataset.tagToggle;
      if (tag === "all") {
        t.classList.toggle("active", activeTags.size === 0);
      } else {
        t.classList.toggle("active", activeTags.has(tag || ""));
      }
    });
  }

  toggles.forEach(el => {
    el.addEventListener("click", () => {
      const tag = el.dataset.tagToggle;
      if (!tag) return;

      if (tag === "all") {
        activeTags.clear();
      } else if (activeTags.has(tag)) {
        activeTags.delete(tag);
      } else {
        activeTags.add(tag);
      }

      syncToggles();
      applyFilters();
    });
  });

  syncToggles();
  applyFilters();
}

initTagsPage();
document.addEventListener("astro:page-load", initTagsPage);
