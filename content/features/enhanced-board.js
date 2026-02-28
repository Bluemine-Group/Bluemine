function readCollapsedGroupIds(storageKey) {
  try {
    const raw = window.sessionStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (id) =>
        typeof id === "string" &&
        (id === COLLAPSED_GROUP_NONE_ID || /^\d+$/.test(id)),
    );
  } catch (_error) {
    return [];
  }
}

function writeCollapsedGroupIds(storageKey, ids) {
  try {
    if (!Array.isArray(ids) || ids.length === 0) {
      window.sessionStorage.removeItem(storageKey);
    } else {
      window.sessionStorage.setItem(storageKey, JSON.stringify(ids));
    }
  } catch (_error) {
    // Ignore quota or access errors.
  }
}

function collectCurrentCollapsedGroupIds() {
  const collapsedIds = [];
  document.querySelectorAll("tr.group.swimlane[data-id]").forEach((row) => {
    if (!row.classList.contains("open")) {
      const rawId = String(row.getAttribute("data-id") || "").trim();
      collapsedIds.push(rawId === "" ? COLLAPSED_GROUP_NONE_ID : rawId);
    }
  });
  return collapsedIds;
}

function ensureSwimlaneToolbarStyles() {
  if (document.getElementById(SWIMLANE_TOOLBAR_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = SWIMLANE_TOOLBAR_STYLE_ID;
  style.textContent = `
    .toggle-all {
      display: none !important;
    }

    #${SWIMLANE_TOOLBAR_ID} {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      margin-left: auto;
    }

    #${SWIMLANE_TOOLBAR_ID} .bluemine-swimlane-btn {
      display: inline-flex;
      align-items: center;
      gap: 0px;
      padding: 0;
      border: none;
      background: none;
      color: #269;
      font: inherit;
      font-size: 11px;
      cursor: pointer;
      line-height: 1;
      white-space: nowrap;
    }

    #${SWIMLANE_TOOLBAR_ID} .bluemine-swimlane-btn:hover {
      text-decoration: underline;
    }

    #${SWIMLANE_TOOLBAR_ID} .bluemine-swimlane-btn:hover svg {
      color: #c61a1a;
    }

    #${SWIMLANE_TOOLBAR_ID} .bluemine-swimlane-btn svg {
      width: 18px;
      height: 18px;
      flex: 0 0 auto;
      color: #888;
      position: relative;
      top: 1px;
    }

  `;
  (document.head || document.documentElement).appendChild(style);
}

function injectSwimlaneToolbar(
  onCollapseAll,
  onExpandAll,
  onCollapseConfirmedUnassigned,
) {
  if (document.getElementById(SWIMLANE_TOOLBAR_ID)) return;

  const toolbar = document.createElement("span");
  toolbar.id = SWIMLANE_TOOLBAR_ID;

  const collapseSvg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m7 20 5-5 5 5"/><path d="m7 4 5 5 5-5"/></svg>';
  const expandSvg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m7 15 5 5 5-5"/><path d="m7 9 5-5 5 5"/></svg>';
  const collapseConfirmedUnassignedSvg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="17" x2="22" y1="8" y2="13"/><line x1="22" x2="17" y1="8" y2="13"/></svg>';

  const collapseBtn = document.createElement("button");
  collapseBtn.type = "button";
  collapseBtn.className = "bluemine-swimlane-btn";
  collapseBtn.innerHTML =
    collapseSvg + '<span class="icon-label">Collapse all</span>';
  collapseBtn.addEventListener("click", onCollapseAll);

  const expandBtn = document.createElement("button");
  expandBtn.type = "button";
  expandBtn.className = "bluemine-swimlane-btn";
  expandBtn.innerHTML =
    expandSvg + '<span class="icon-label">Expand all</span>';
  expandBtn.addEventListener("click", onExpandAll);

  const collapseConfirmedUnassignedBtn = document.createElement("button");
  collapseConfirmedUnassignedBtn.type = "button";
  collapseConfirmedUnassignedBtn.className = "bluemine-swimlane-btn";
  collapseConfirmedUnassignedBtn.innerHTML =
    collapseConfirmedUnassignedSvg +
    '<span class="icon-label">Smart collapse</span>';
  collapseConfirmedUnassignedBtn.addEventListener(
    "click",
    onCollapseConfirmedUnassigned,
  );

  toolbar.appendChild(collapseConfirmedUnassignedBtn);
  toolbar.appendChild(collapseBtn);
  toolbar.appendChild(expandBtn);

  const redmineToolbar = findRedmineToolbar();
  if (redmineToolbar) {
    redmineToolbar.style.display = "flex";
    redmineToolbar.style.alignItems = "center";
    redmineToolbar.style.flexWrap = "wrap";
    redmineToolbar.appendChild(toolbar);
    return;
  }

  const boardTable = findBoardTable();
  if (boardTable && boardTable.parentNode) {
    toolbar.style.display = "flex";
    toolbar.style.justifyContent = "flex-end";
    toolbar.style.marginBottom = "6px";
    boardTable.parentNode.insertBefore(toolbar, boardTable);
  }
}

function getSiblingIssueRow(groupRow) {
  const id = groupRow.getAttribute("data-id");
  if (id === null) return null;
  let next = groupRow.nextElementSibling;
  while (next) {
    if (
      next.tagName === "TR" &&
      next.classList.contains("swimlane") &&
      next.classList.contains("issue") &&
      next.getAttribute("data-id") === id
    ) {
      return next;
    }
    next = next.nextElementSibling;
  }
  return null;
}

function swapExpanderIcon(expander, href) {
  const use = expander.querySelector("use");
  if (!use) return;
  if (use.hasAttribute("href")) {
    const current = use.getAttribute("href");
    const base = current.split("#")[0];
    use.setAttribute("href", `${base}#${href}`);
  } else if (use.hasAttribute("xlink:href")) {
    const current = use.getAttributeNS("http://www.w3.org/1999/xlink", "href");
    const base = current.split("#")[0];
    use.setAttributeNS(
      "http://www.w3.org/1999/xlink",
      "xlink:href",
      `${base}#${href}`,
    );
  }
}

function collapseGroupRow(row) {
  if (!row.classList.contains("open")) return;
  row.classList.remove("open");
  const expander = row.querySelector("span.expander");
  if (expander) {
    expander.classList.remove("icon-expanded");
    expander.classList.add("icon-collapsed");
    swapExpanderIcon(expander, "icon--angle-right");
  }
  const issueRow = getSiblingIssueRow(row);
  if (issueRow) issueRow.style.display = "none";
}

function expandGroupRow(row) {
  if (row.classList.contains("open")) return;
  row.classList.add("open");
  const expander = row.querySelector("span.expander");
  if (expander) {
    expander.classList.remove("icon-collapsed");
    expander.classList.add("icon-expanded");
    swapExpanderIcon(expander, "icon--angle-down");
  }
  const issueRow = getSiblingIssueRow(row);
  if (issueRow) issueRow.style.display = "";
}

function runCollapsedGroupsFeature() {
  if (!isAgileBoardPage()) return;

  const boardUrl = normalizePageUrl(window.location.href);
  if (!boardUrl) return;

  // The agile plugin focuses #agile_live_search during its own init.
  // Defer one tick so we run after it, then blur if it's still focused.
  window.setTimeout(() => {
    const liveSearch = document.getElementById("agile_live_search");
    if (liveSearch && document.activeElement === liveSearch) liveSearch.blur();
  }, 0);

  const storageKey = COLLAPSED_GROUPS_SESSION_KEY_PREFIX + boardUrl;
  let isApplyingRestoredState = false;

  function persistCollapsedGroups() {
    if (isApplyingRestoredState) return;
    writeCollapsedGroupIds(storageKey, collectCurrentCollapsedGroupIds());
  }

  const observer = new MutationObserver((mutations) => {
    if (isApplyingRestoredState) return;
    let relevant = false;
    for (const mutation of mutations) {
      if (mutation.type !== "attributes") continue;
      const t = mutation.target;
      if (
        t.tagName === "TR" &&
        t.classList.contains("group") &&
        t.classList.contains("swimlane") &&
        t.hasAttribute("data-id")
      ) {
        relevant = true;
        break;
      }
    }
    if (relevant) persistCollapsedGroups();
  });
  observer.observe(document.body, {
    subtree: true,
    attributes: true,
    attributeFilter: ["class"],
  });

  const storedIds = readCollapsedGroupIds(storageKey);
  if (storedIds.length > 0) {
    const storedIdSet = new Set(storedIds);
    isApplyingRestoredState = true;
    document.querySelectorAll("tr.group.swimlane[data-id]").forEach((row) => {
      const rawId = String(row.getAttribute("data-id") || "").trim();
      const storageId = rawId === "" ? COLLAPSED_GROUP_NONE_ID : rawId;
      if (storedIdSet.has(storageId)) {
        collapseGroupRow(row);
      }
    });
    window.setTimeout(() => {
      isApplyingRestoredState = false;
    }, 0);
  }

  ensureSwimlaneToolbarStyles();

  function findConfirmedColumnInfo() {
    const table = findBoardTable();
    if (!table) return null;
    for (const th of table.querySelectorAll("th[data-column-id]")) {
      if (th.textContent.trim().toLowerCase().startsWith("confirmed")) {
        const siblings = Array.from(th.parentElement.children);
        return {
          columnId: th.getAttribute("data-column-id"),
          columnIndex: siblings.indexOf(th),
        };
      }
    }
    return null;
  }

  function isRowAllConfirmedAndUnassigned(groupRow, confirmedColumnInfo) {
    const issueRow = getSiblingIssueRow(groupRow);
    if (!issueRow) return false;
    const allCells = Array.from(issueRow.querySelectorAll("td"));
    if (allCells.length === 0) return false;
    let confirmedCell = issueRow.querySelector(
      `td[data-column-id="${confirmedColumnInfo.columnId}"]`,
    );
    if (!confirmedCell) {
      confirmedCell = allCells[confirmedColumnInfo.columnIndex] ?? null;
    }
    if (!confirmedCell) return false;
    const confirmedCards = confirmedCell.querySelectorAll(
      ".issue-card[data-id]",
    );
    if (confirmedCards.length === 0) return false;
    for (const cell of allCells) {
      if (cell === confirmedCell) continue;
      if (cell.querySelector(".issue-card[data-id]")) return false;
    }
    for (const card of confirmedCards) {
      const assignee = card.querySelector("p.info.assigned-user a.user");
      if (assignee && assignee.textContent.trim()) return false;
    }
    return true;
  }

  function handleCollapseAll() {
    isApplyingRestoredState = true;
    document.querySelectorAll("tr.group.swimlane[data-id]").forEach((row) => {
      collapseGroupRow(row);
    });
    writeCollapsedGroupIds(storageKey, collectCurrentCollapsedGroupIds());
    window.setTimeout(() => {
      isApplyingRestoredState = false;
    }, 0);
  }

  function handleExpandAll() {
    isApplyingRestoredState = true;
    document.querySelectorAll("tr.group.swimlane[data-id]").forEach((row) => {
      expandGroupRow(row);
    });
    writeCollapsedGroupIds(storageKey, []);
    window.setTimeout(() => {
      isApplyingRestoredState = false;
    }, 0);
  }

  function handleCollapseConfirmedUnassigned() {
    const confirmedColumnInfo = findConfirmedColumnInfo();
    if (!confirmedColumnInfo) return;
    isApplyingRestoredState = true;
    document.querySelectorAll("tr.group.swimlane[data-id]").forEach((row) => {
      if (isRowAllConfirmedAndUnassigned(row, confirmedColumnInfo)) {
        collapseGroupRow(row);
      }
    });
    writeCollapsedGroupIds(storageKey, collectCurrentCollapsedGroupIds());
    window.setTimeout(() => {
      isApplyingRestoredState = false;
    }, 0);
  }

  injectSwimlaneToolbar(
    handleCollapseAll,
    handleExpandAll,
    handleCollapseConfirmedUnassigned,
  );
}
