function runNativeContextMenuSoftReload(featureResult) {
  if (!isAgileBoardPage()) return;

  const csrfToken = () =>
    document.querySelector('meta[name="csrf-token"]')?.getAttribute("content") || "";

  function hookLinks(menu) {
    // data-method="patch" identifies the inline action links (status, assignee,
    // priority, etc.). Plain navigation links (Edit, Copy, Add subtask) don't
    // have this attribute and are left untouched.
    menu
      .querySelectorAll('a[data-method="patch"]:not([data-bluemine])')
      .forEach((link) => {
        link.setAttribute("data-bluemine", "1");
        link.addEventListener("click", async (e) => {
          e.preventDefault();
          e.stopPropagation();
          menu.style.display = "none";
          const body = new URLSearchParams();
          body.append("_method", "patch");
          body.append("authenticity_token", csrfToken());
          try {
            await fetch(link.getAttribute("href"), {
              method: "POST",
              credentials: "same-origin",
              headers: { "Content-Type": "application/x-www-form-urlencoded" },
              body: body.toString(),
            });
          } catch (_e) {}
          await softReloadBoard(featureResult);
        });
      });
  }

  // #context-menu is created by Redmine's contextMenuCreate() on first
  // right-click. Watch for it to appear, then watch its content for updates.
  function observeMenu(menu) {
    new MutationObserver(() => hookLinks(menu)).observe(menu, {
      childList: true,
    });
  }

  const existing = document.getElementById("context-menu");
  if (existing) {
    observeMenu(existing);
  } else {
    const bodyObserver = new MutationObserver((_, obs) => {
      const menu = document.getElementById("context-menu");
      if (menu) {
        observeMenu(menu);
        obs.disconnect();
      }
    });
    bodyObserver.observe(document.body, { childList: true });
  }
}
