function initTagFilter() {
  const items = document.querySelectorAll<HTMLElement>(".work-item");
  const tagLinks = document.querySelectorAll<HTMLElement>(".tag-filter-link");

  const containers = document.querySelectorAll<HTMLElement>(
    ".active-tags-desktop, .active-tags-mobile, .active-tags-area"
  );

  if (tagLinks.length === 0) return;

  let activeTags = new Set<string>();

  function applyFilters() {
    const typeLinks = document.querySelectorAll<HTMLElement>(".filter-link");
    let currentType = "all";
    typeLinks.forEach(l => {
      if (l.classList.contains("active") && l.dataset.filter) {
        currentType = l.dataset.filter;
      }
    });

    items.forEach(item => {
      const typeMatch = currentType === "all" || item.dataset.type === currentType;
      const itemTags = (item.dataset.tags || "").split(",").filter(Boolean);
      const tagMatch = activeTags.size === 0 || [...activeTags].every(t => itemTags.includes(t));
      item.style.display = typeMatch && tagMatch ? "" : "none";
    });
  }

  function renderPills() {
    const html = [...activeTags].map(tag =>
      `<span class="tag-pill" data-remove-tag="${tag}" role="button" tabindex="0">#${tag} ×</span>`
    ).join("");

    containers.forEach(c => { c.innerHTML = html; });

    document.querySelectorAll<HTMLElement>(".tag-pill").forEach(pill => {
      pill.addEventListener("click", e => {
        e.stopPropagation();
        const tag = pill.dataset.removeTag;
        if (tag) activeTags.delete(tag);
        renderPills();
        syncHighlights();
        applyFilters();
      });
    });
  }

  function syncHighlights() {
    tagLinks.forEach(link => {
      link.classList.toggle("active", activeTags.has(link.dataset.tag || ""));
    });
  }

  tagLinks.forEach(link => {
    link.addEventListener("click", e => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      const tag = link.dataset.tag;
      if (!tag) return;
      if (activeTags.has(tag)) {
        activeTags.delete(tag);
      } else {
        activeTags.add(tag);
      }
      renderPills();
      syncHighlights();
      applyFilters();
      return false;
    }, true);
  });
}

initTagFilter();
document.addEventListener("astro:page-load", initTagFilter);
