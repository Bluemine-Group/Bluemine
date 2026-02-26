const FEATURE_KEY = "feature.helloWorld.enabled";
const GITLAB_MR_FEATURE_KEY = "feature.gitlabMrStatus.enabled";
const ENHANCED_AGILE_BOARD_FEATURE_KEY = "feature.restoreScrollOnReload.enabled";
const BOARD_PATH_REGEX = /\/projects\/([^/]+)\/agile\/board\/?$/;
const SCROLL_RESTORE_STATE_KEY = "bluemine.scrollRestoreState.v1";
const SCROLL_RESTORE_WAIT_TIMEOUT_MS = 20000;
const SCROLL_RESTORE_RETRY_INTERVAL_MS = 120;
const SCROLL_RESTORE_TOLERANCE_PX = 2;
const SCROLL_RESTORE_MAX_AGE_MS = 30 * 60 * 1000;
const SCROLL_RESTORE_OVERLAY_ID = "bluemine-scroll-restore-overlay";
const SCROLL_RESTORE_OVERLAY_STYLE_ID = "bluemine-scroll-restore-overlay-style";
const MR_TITLE_PREFIX_REGEX = /^(\d{5}(?:\s*[^\d\s]\s*\d{5})*) - /;
const MR_CONTAINER_CLASS = "bluemine-mr-status";
const MR_STYLE_ID = "bluemine-mr-status-style";
const MR_ATTRIBUTE_LINE_CLASS = "bluemine-gitlab-attribute-line";
const GITLAB_ASSIGNEE_AVATAR_CLASS = "bluemine-gitlab-assignee-avatar";
const GITLAB_FADE_IN_CLASS = "bluemine-gitlab-fade-in";
const MR_CARD_STATUS_SIGNATURE_ATTRIBUTE =
  "data-bluemine-mr-card-status-signature";
const MR_STORY_STATUS_SIGNATURE_ATTRIBUTE =
  "data-bluemine-mr-story-status-signature";
const MR_DETAIL_SIGNATURE_ATTRIBUTE = "data-bluemine-mr-detail-signature";
const REDMINE_REVIEWER_NAME_ATTRIBUTE = "data-bluemine-redmine-reviewer-name";
const GITLAB_ICON_PATH =
  "M22.547 13.374l-2.266-6.977a.783.783 0 0 0-.744-.53h-3.03L12 19.78 7.494 5.867H4.463a.783.783 0 0 0-.744.53l-2.266 6.977a1.523 1.523 0 0 0 .553 1.704L12 22.422l9.994-7.344a1.523 1.523 0 0 0 .553-1.704Z";
const COLLAPSED_GROUPS_SESSION_KEY_PREFIX = "bluemine.collapsedGroups.v1.";
const COLLAPSED_GROUP_NONE_ID = "__none__";
const SWIMLANE_TOOLBAR_ID = "bluemine-swimlane-toolbar";
const SWIMLANE_TOOLBAR_STYLE_ID = "bluemine-swimlane-toolbar-style";
let hasRegisteredScrollTracker = false;
let lastKnownWindowScrollY = 0;
let shouldHoldScrollRestoreOverlayForScroll = false;
let shouldHoldScrollRestoreOverlayForGitlab = false;

function isDetectedRedmineTab() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      {
        type: "BLUEMINE_IS_REDMINE_TAB",
      },
      (response) => {
        if (chrome.runtime.lastError) {
          resolve(false);
          return;
        }

        resolve(Boolean(response?.ok && response?.isRedmine));
      },
    );
  });
}

function runHelloWorldFeature() {
  console.info("[Bluemine] Hello World!");
}

function getCurrentBoardProjectName() {
  try {
    const current = new URL(window.location.href);
    const match = current.pathname.match(BOARD_PATH_REGEX);
    if (!match) {
      return "";
    }

    return decodeURIComponent(match[1]);
  } catch (_error) {
    return "";
  }
}

function isAgileBoardPage() {
  return Boolean(getCurrentBoardProjectName());
}

function getNavigationType() {
  const navigationEntries =
    typeof performance.getEntriesByType === "function"
      ? performance.getEntriesByType("navigation")
      : [];
  const navigationEntry = navigationEntries?.[0];
  if (navigationEntry && typeof navigationEntry.type === "string") {
    return navigationEntry.type;
  }

  if (performance.navigation) {
    if (performance.navigation.type === 1) {
      return "reload";
    }

    if (performance.navigation.type === 2) {
      return "back_forward";
    }

    if (performance.navigation.type === 0) {
      return "navigate";
    }
  }

  return "unknown";
}

function normalizePageUrl(rawUrl, baseUrl = window.location.href) {
  try {
    const parsed = new URL(String(rawUrl || "").trim(), baseUrl);
    const normalizedPath =
      parsed.pathname === "/" ? "/" : parsed.pathname.replace(/\/+$/, "");
    return `${parsed.origin}${normalizedPath}${parsed.search}`;
  } catch (_error) {
    return "";
  }
}

function isBackUrlRedirectToCurrentBoard(currentPageUrl) {
  const referrer = String(document.referrer || "").trim();
  if (!referrer) {
    return false;
  }

  try {
    const referrerUrl = new URL(referrer);
    const backUrl = String(
      referrerUrl.searchParams.get("back_url") || "",
    ).trim();
    if (!backUrl) {
      return false;
    }

    const normalizedBackUrl = normalizePageUrl(backUrl, referrerUrl.origin);
    if (!normalizedBackUrl) {
      return false;
    }

    return normalizedBackUrl === currentPageUrl;
  } catch (_error) {
    return false;
  }
}

function isSamePageReferrerNavigation(currentPageUrl) {
  const normalizedReferrer = normalizePageUrl(document.referrer);
  if (!normalizedReferrer) {
    return false;
  }

  return normalizedReferrer === currentPageUrl;
}

function clearStoredScrollRestoreState() {
  try {
    window.sessionStorage.removeItem(SCROLL_RESTORE_STATE_KEY);
  } catch (_error) {
    // Ignore sessionStorage access errors.
  }
}

function removeScrollRestoreOverlay() {
  document.getElementById(SCROLL_RESTORE_OVERLAY_ID)?.remove();
  document.getElementById(SCROLL_RESTORE_OVERLAY_STYLE_ID)?.remove();
}

function ensureScrollRestoreOverlay() {
  if (!document.getElementById(SCROLL_RESTORE_OVERLAY_STYLE_ID)) {
    const style = document.createElement("style");
    style.id = SCROLL_RESTORE_OVERLAY_STYLE_ID;
    style.textContent = `
      #${SCROLL_RESTORE_OVERLAY_ID} {
        position: fixed;
        inset: 0;
        background: #fff;
        z-index: 2147483647;
        pointer-events: none;
        opacity: 1;
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  if (document.getElementById(SCROLL_RESTORE_OVERLAY_ID)) {
    return;
  }

  const overlay = document.createElement("div");
  overlay.id = SCROLL_RESTORE_OVERLAY_ID;
  (document.body || document.documentElement).appendChild(overlay);
}

function removeScrollRestoreOverlayIfReady() {
  if (
    shouldHoldScrollRestoreOverlayForScroll ||
    shouldHoldScrollRestoreOverlayForGitlab
  ) {
    return;
  }

  removeScrollRestoreOverlay();
}

function setScrollRestoreOverlayHoldForScroll(shouldHold) {
  shouldHoldScrollRestoreOverlayForScroll = Boolean(shouldHold);
  if (!shouldHoldScrollRestoreOverlayForScroll) {
    removeScrollRestoreOverlayIfReady();
  }
}

function setScrollRestoreOverlayHoldForGitlab(shouldHold) {
  shouldHoldScrollRestoreOverlayForGitlab = Boolean(shouldHold);
  if (!shouldHoldScrollRestoreOverlayForGitlab) {
    removeScrollRestoreOverlayIfReady();
  }
}

function waitForNextPaint() {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
}

function readStoredScrollRestoreState() {
  try {
    const rawState = window.sessionStorage.getItem(SCROLL_RESTORE_STATE_KEY);
    if (!rawState) {
      return null;
    }

    const parsedState = JSON.parse(rawState);
    const pageUrl = normalizePageUrl(parsedState?.pageUrl || parsedState?.url);
    const scrollY = Number(parsedState?.scrollY);
    const savedAtMs = Number(parsedState?.savedAtMs || 0);
    const isTooOld =
      !Number.isFinite(savedAtMs) ||
      savedAtMs <= 0 ||
      Date.now() - savedAtMs > SCROLL_RESTORE_MAX_AGE_MS;
    if (!pageUrl || !Number.isFinite(scrollY) || scrollY <= 0 || isTooOld) {
      return null;
    }

    return {
      pageUrl,
      scrollY: Math.round(scrollY),
      savedAtMs,
    };
  } catch (_error) {
    return null;
  }
}

function getCurrentWindowScrollY() {
  return Math.round(
    Math.max(
      0,
      Number(window.scrollY || 0),
      Number(document.documentElement?.scrollTop || 0),
      Number(document.body?.scrollTop || 0),
    ),
  );
}

function getMaxScrollableY() {
  const documentElementHeight = Number(
    document.documentElement?.scrollHeight || 0,
  );
  const bodyHeight = Number(document.body?.scrollHeight || 0);
  return Math.max(
    0,
    Math.max(documentElementHeight, bodyHeight) - window.innerHeight,
  );
}

function persistScrollPositionForReload() {
  if (!isAgileBoardPage()) {
    return;
  }

  try {
    const pageUrl = normalizePageUrl(window.location.href);
    if (!pageUrl) {
      return;
    }

    const liveWindowScrollY = getCurrentWindowScrollY();
    const scrollY = Math.max(lastKnownWindowScrollY, liveWindowScrollY);
    if (scrollY <= 0) {
      clearStoredScrollRestoreState();
      return;
    }

    const state = {
      pageUrl,
      scrollY,
      savedAtMs: Date.now(),
    };
    window.sessionStorage.setItem(
      SCROLL_RESTORE_STATE_KEY,
      JSON.stringify(state),
    );
  } catch (_error) {
    // Ignore sessionStorage access errors.
  }
}

function restoreScrollPositionWhenReady(targetScrollY) {
  const normalizedTargetScrollY = Math.round(
    Math.max(0, Number(targetScrollY)),
  );
  if (normalizedTargetScrollY <= 0) {
    clearStoredScrollRestoreState();
    setScrollRestoreOverlayHoldForScroll(false);
    return;
  }

  const startedAtMs = Date.now();
  const attemptRestore = () => {
    const maxScrollableY = getMaxScrollableY();
    const canReachTarget =
      maxScrollableY >= normalizedTargetScrollY - SCROLL_RESTORE_TOLERANCE_PX;
    const timedOut = Date.now() - startedAtMs >= SCROLL_RESTORE_WAIT_TIMEOUT_MS;

    if (!canReachTarget && !timedOut) {
      window.setTimeout(attemptRestore, SCROLL_RESTORE_RETRY_INTERVAL_MS);
      return;
    }

    const finalScrollY = Math.min(normalizedTargetScrollY, maxScrollableY);
    window.scrollTo(0, finalScrollY);
    clearStoredScrollRestoreState();
    setScrollRestoreOverlayHoldForScroll(false);
  };

  attemptRestore();
}

function ensureWindowScrollTracking() {
  if (hasRegisteredScrollTracker) {
    return;
  }

  lastKnownWindowScrollY = getCurrentWindowScrollY();
  const updateLastKnownScrollY = () => {
    lastKnownWindowScrollY = getCurrentWindowScrollY();
  };
  window.addEventListener("scroll", updateLastKnownScrollY, {
    passive: true,
    capture: true,
  });
  hasRegisteredScrollTracker = true;
}

function runRestoreScrollOnReloadFeature() {
  if (!isAgileBoardPage()) {
    setScrollRestoreOverlayHoldForScroll(false);
    removeScrollRestoreOverlayIfReady();
    return;
  }

  ensureWindowScrollTracking();

  const saveScrollPosition = () => {
    persistScrollPositionForReload();
  };
  window.addEventListener("pagehide", saveScrollPosition, { capture: true });
  window.addEventListener("beforeunload", saveScrollPosition, {
    capture: true,
  });

  const storedState = readStoredScrollRestoreState();
  if (!storedState) {
    setScrollRestoreOverlayHoldForScroll(false);
    removeScrollRestoreOverlayIfReady();
    return;
  }

  const currentPageUrl = normalizePageUrl(window.location.href);
  if (!currentPageUrl || storedState.pageUrl !== currentPageUrl) {
    clearStoredScrollRestoreState();
    setScrollRestoreOverlayHoldForScroll(false);
    removeScrollRestoreOverlayIfReady();
    return;
  }

  const navigationType = getNavigationType();
  const isReload = navigationType === "reload";
  const isBackUrlRedirect = isBackUrlRedirectToCurrentBoard(currentPageUrl);
  const isSameReferrer = isSamePageReferrerNavigation(currentPageUrl);
  const shouldRestore = isReload || isBackUrlRedirect || isSameReferrer;
  if (!shouldRestore) {
    clearStoredScrollRestoreState();
    setScrollRestoreOverlayHoldForScroll(false);
    removeScrollRestoreOverlayIfReady();
    return;
  }

  setScrollRestoreOverlayHoldForScroll(true);
  restoreScrollPositionWhenReady(storedState.scrollY);
}

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
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 6px;
    }

    #${SWIMLANE_TOOLBAR_ID} .bluemine-swimlane-btn {
      height: 26px;
      padding: 0 12px;
      border: 1px solid #c7d2de;
      border-radius: 3px;
      background: #f4f7fa;
      color: #3a3a3c;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      line-height: 1;
    }

    #${SWIMLANE_TOOLBAR_ID} .bluemine-swimlane-btn:hover {
      background: #e8eef5;
      border-color: #a8b9cc;
    }

    #${SWIMLANE_TOOLBAR_ID} .bluemine-swimlane-btn:active {
      background: #dce6f0;
    }
  `;
  (document.head || document.documentElement).appendChild(style);
}

function findBoardTable() {
  const agileTable = document.querySelector("table.agile-board");
  if (agileTable) return agileTable;
  const groupRow = document.querySelector("tr.group.swimlane[data-id]");
  return groupRow ? groupRow.closest("table") : null;
}

function injectSwimlaneToolbar(onCollapseAll, onExpandAll) {
  if (document.getElementById(SWIMLANE_TOOLBAR_ID)) return;
  const boardTable = findBoardTable();
  if (!boardTable || !boardTable.parentNode) return;

  const toolbar = document.createElement("div");
  toolbar.id = SWIMLANE_TOOLBAR_ID;

  const collapseBtn = document.createElement("button");
  collapseBtn.type = "button";
  collapseBtn.className = "bluemine-swimlane-btn";
  collapseBtn.textContent = "Collapse all";
  collapseBtn.addEventListener("click", onCollapseAll);

  const expandBtn = document.createElement("button");
  expandBtn.type = "button";
  expandBtn.className = "bluemine-swimlane-btn";
  expandBtn.textContent = "Expand all";
  expandBtn.addEventListener("click", onExpandAll);

  toolbar.appendChild(collapseBtn);
  toolbar.appendChild(expandBtn);
  boardTable.parentNode.insertBefore(toolbar, boardTable);
}

function getSiblingIssueRow(groupRow) {
  // The sibling <tr class="swimlane issue"> shares the same data-id
  // and immediately follows the group row in the DOM.
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
  // The href attribute may be in either the default namespace or the
  // xlink namespace depending on the Redmine version.
  if (use.hasAttribute("href")) {
    const current = use.getAttribute("href");
    const base = current.split("#")[0];
    use.setAttribute("href", `${base}#${href}`);
  } else if (use.hasAttribute("xlink:href")) {
    const current = use.getAttributeNS(
      "http://www.w3.org/1999/xlink",
      "href",
    );
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

  injectSwimlaneToolbar(handleCollapseAll, handleExpandAll);
}

function mapMrState(state) {
  if (state === "opened") {
    return { label: "Open", className: "is-open" };
  }

  if (state === "merged") {
    return { label: "Merged", className: "is-merged" };
  }

  if (state === "closed") {
    return { label: "Closed", className: "is-closed" };
  }

  return { label: String(state || "Unknown"), className: "is-unknown" };
}

function extractIssueIdsFromMrTitle(title) {
  if (typeof title !== "string") {
    return [];
  }

  const titleMatch = title.match(MR_TITLE_PREFIX_REGEX);
  if (!titleMatch) {
    return [];
  }

  return [...new Set(titleMatch[1].match(/\d{5}/g) || [])];
}

function normalizeIssueIdList(issueIds) {
  if (!Array.isArray(issueIds)) {
    return [];
  }

  return [
    ...new Set(
      issueIds
        .map((issueId) => String(issueId || "").trim())
        .filter((issueId) => /^\d+$/.test(issueId)),
    ),
  ];
}

function extractIssueIdsFromMergeRequest(mergeRequest) {
  const explicitIssueIds = normalizeIssueIdList(mergeRequest?.issueIds);
  if (explicitIssueIds.length > 0) {
    return explicitIssueIds;
  }

  return extractIssueIdsFromMrTitle(mergeRequest?.title);
}

function ensureMrStylesInjected() {
  if (document.getElementById(MR_STYLE_ID)) {
    return;
  }

  const style = document.createElement("style");
  style.id = MR_STYLE_ID;
  style.textContent = `
    @keyframes bluemine-gitlab-fade-in {
      from {
        opacity: 0;
        transform: translateY(2px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .${GITLAB_FADE_IN_CLASS} {
      animation: bluemine-gitlab-fade-in 500ms ease-out both;
      will-change: opacity, transform;
    }

    .${MR_CONTAINER_CLASS} {
      display: inline-flex;
      flex-wrap: wrap;
      gap: 6px;
      vertical-align: middle;
    }

    .${MR_CONTAINER_CLASS} .bluemine-mr-link {
      display: inline-flex;
      align-items: center;
      padding: 1px 7px;
      border-radius: 999px;
      border: 1px solid rgba(25, 35, 52, 0.16);
      color: #1f2e44;
      font-size: 10px;
      font-weight: 600;
      line-height: 1.2;
      text-decoration: none;
      letter-spacing: 0.01em;
      transition: filter 120ms ease, border-color 120ms ease;
      transform: translateY(-1px);
    }

    .${MR_CONTAINER_CLASS} .bluemine-mr-link:hover,
    .${MR_CONTAINER_CLASS} .bluemine-mr-link:focus-visible {
      text-decoration: underline;
      border-color: rgba(25, 35, 52, 0.38);
      filter: brightness(0.98);
      outline: none;
    }

    .${MR_CONTAINER_CLASS} .bluemine-mr-link.is-open {
      background: #edf4ff;
      color: #184f95;
    }

    .${MR_CONTAINER_CLASS} .bluemine-mr-link.is-merged {
      background: #eaf9f1;
      color: #16613d;
    }

    .${MR_CONTAINER_CLASS} .bluemine-mr-link.is-closed {
      background: #f6ecec;
      color: #8a3232;
    }

    .${MR_CONTAINER_CLASS} .bluemine-mr-link.is-unknown {
      background: #f1f2f6;
      color: #3d4350;
    }

    .${MR_CONTAINER_CLASS} .bluemine-mr-meta {
      display: inline-flex;
      align-items: center;
      padding: 1px 7px;
      border-radius: 999px;
      border: 1px solid rgba(25, 35, 52, 0.16);
      font-size: 10px;
      font-weight: 600;
      line-height: 1.2;
      letter-spacing: 0.01em;
      transform: translateY(-1px);
      color: #1f2e44;
      background: #f1f2f6;
    }

    .${MR_CONTAINER_CLASS} .bluemine-mr-meta.is-reviewer {
      background: #f1f2f4;
      color: #4f5562;
    }

    .${MR_CONTAINER_CLASS} .bluemine-mr-meta.is-approved {
      background: #eaf9f1;
      color: #16613d;
    }

    .${MR_CONTAINER_CLASS} .bluemine-mr-meta.is-not-approved {
      background: #fff4db;
      color: #8d5a06;
    }

    .${MR_CONTAINER_CLASS} .bluemine-mr-reviewer-text {
      display: inline-flex;
      align-items: center;
      color: #4f5562;
      font-size: 11px;
      font-weight: 500;
      line-height: 1.2;
    }

    .${MR_CONTAINER_CLASS} .bluemine-gitlab-icon-link {
      display: inline-flex;
      align-items: center;
      margin-left: 4px;
      color: inherit;
      text-decoration: none;
      opacity: 0.9;
    }

    .${MR_CONTAINER_CLASS} .bluemine-gitlab-icon-link:hover,
    .${MR_CONTAINER_CLASS} .bluemine-gitlab-icon-link:focus-visible {
      opacity: 1;
      text-decoration: none;
      outline: none;
    }

    .${MR_CONTAINER_CLASS} .bluemine-gitlab-icon,
    .${MR_ATTRIBUTE_LINE_CLASS} .bluemine-gitlab-icon {
      width: 11px;
      height: 11px;
      fill: currentColor;
      flex: 0 0 auto;
    }

    .${MR_ATTRIBUTE_LINE_CLASS} .bluemine-gitlab-icon-link {
      display: inline-flex;
      align-items: center;
      color: #1f2e44;
      text-decoration: none;
      opacity: 0.9;
    }

    .${MR_ATTRIBUTE_LINE_CLASS} .bluemine-gitlab-icon-link:hover,
    .${MR_ATTRIBUTE_LINE_CLASS} .bluemine-gitlab-icon-link:focus-visible {
      opacity: 1;
      text-decoration: none;
      outline: none;
    }

    .issue-card .info.assigned-user img.${GITLAB_ASSIGNEE_AVATAR_CLASS} {
      width: 14px;
      height: 14px;
      border-radius: 50%;
      object-fit: cover;
      display: inline-block;
      vertical-align: middle;
      margin-right: 4px;
    }
  `;
  document.head.appendChild(style);
}

function normalizeReviewerList(reviewers) {
  if (!Array.isArray(reviewers)) {
    return [];
  }

  return reviewers
    .map((reviewer) => {
      const name = String(reviewer?.name || "").trim();
      if (!name) {
        return null;
      }

      return {
        name,
        url: String(reviewer?.web_url || "").trim(),
      };
    })
    .filter(Boolean);
}

function toNonNegativeNumber(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }

  return parsed;
}

function createGitlabIconNode() {
  const svgNamespace = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNamespace, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.classList.add("bluemine-gitlab-icon");

  const path = document.createElementNS(svgNamespace, "path");
  path.setAttribute("d", GITLAB_ICON_PATH);
  svg.appendChild(path);

  return svg;
}

function createGitlabIconLink(url, titleText) {
  if (!url) {
    return null;
  }

  const link = document.createElement("a");
  link.className = "bluemine-gitlab-icon-link";
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.setAttribute("aria-label", titleText);
  link.title = titleText;
  link.appendChild(createGitlabIconNode());
  return link;
}

function isMergedMergeRequest(mergeRequest) {
  return mergeRequest?.stateClassName === "is-merged";
}

function getResolvedCounts(mergeRequest) {
  const total = toNonNegativeNumber(mergeRequest?.totalComments);
  const unresolved = Math.min(
    toNonNegativeNumber(mergeRequest?.unresolvedComments),
    total,
  );
  const resolved = Math.max(0, total - unresolved);
  return { resolved, total };
}

function getMergeRequestStatusLabel(mergeRequest) {
  const stateLabel = String(mergeRequest?.stateLabel || "").trim() || "Unknown";
  if (mergeRequest?.stateClassName !== "is-open") {
    return stateLabel;
  }

  const { resolved, total } = getResolvedCounts(mergeRequest);
  if (total === 0) {
    return stateLabel;
  }

  return `${stateLabel} ${resolved}/${total}`;
}

function normalizePersonName(name) {
  return String(name || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function getNormalizedReviewerNames(reviewers) {
  if (!Array.isArray(reviewers)) {
    return [];
  }

  const normalizedNames = [];
  const seenNames = new Set();
  reviewers.forEach((reviewer) => {
    const normalizedName = normalizePersonName(reviewer?.name);
    if (!normalizedName || seenNames.has(normalizedName)) {
      return;
    }

    seenNames.add(normalizedName);
    normalizedNames.push(normalizedName);
  });

  return normalizedNames;
}

function buildIssueMrMap(mergeRequests) {
  const issueMrMap = new Map();

  for (const mergeRequest of mergeRequests) {
    if (!mergeRequest) {
      continue;
    }

    const issueIds = extractIssueIdsFromMergeRequest(mergeRequest);
    if (issueIds.length === 0) {
      continue;
    }

    const state = mapMrState(mergeRequest.state);
    const reviewers = normalizeReviewerList(mergeRequest.reviewers);
    const mergeRequestEntry = {
      stateLabel: state.label,
      stateClassName: state.className,
      url: String(mergeRequest.web_url || "").trim(),
      reviewers,
      hasReviewer: reviewers.length > 0,
      isApproved: Boolean(mergeRequest.approved),
      unresolvedComments: toNonNegativeNumber(mergeRequest.unresolvedComments),
      totalComments: toNonNegativeNumber(mergeRequest.totalComments),
    };

    issueIds.forEach((issueId) => {
      const existing = issueMrMap.get(issueId) || [];
      existing.push(mergeRequestEntry);
      issueMrMap.set(issueId, existing);
    });
  }

  return issueMrMap;
}

function createMrMetaBadge(text, className, options = {}) {
  const { iconUrl = "", iconLabel = "" } = options;
  const badge = document.createElement("span");
  badge.className = `bluemine-mr-meta ${className || ""}`.trim();
  badge.textContent = text;

  const iconLink = createGitlabIconLink(
    iconUrl,
    iconLabel || "Open GitLab merge request",
  );
  if (iconLink) {
    badge.appendChild(iconLink);
  }

  return badge;
}

function createMrReviewerText(text, options = {}) {
  const { iconUrl = "", iconLabel = "" } = options;
  const reviewerText = document.createElement("span");
  reviewerText.className = "bluemine-mr-reviewer-text";
  reviewerText.textContent = text;

  const iconLink = createGitlabIconLink(
    iconUrl,
    iconLabel || "Open GitLab merge request",
  );
  if (iconLink) {
    reviewerText.appendChild(iconLink);
  }

  return reviewerText;
}

function formatReviewerNames(reviewers) {
  return reviewers.map((reviewer) => reviewer.name).join(", ");
}

function createMrStatusNode(relatedMergeRequests, options = {}) {
  const includeReviewerBadge = Boolean(options.includeReviewerBadge);
  const includeApprovedBadge = Boolean(options.includeApprovedBadge);
  const animate = options.animate !== false;
  const wrapper = document.createElement("span");
  wrapper.className = animate
    ? `${MR_CONTAINER_CLASS} ${GITLAB_FADE_IN_CLASS}`
    : MR_CONTAINER_CLASS;

  for (const mergeRequest of relatedMergeRequests) {
    if (!mergeRequest.url) {
      continue;
    }

    const link = document.createElement("a");
    link.className = `bluemine-mr-link ${mergeRequest.stateClassName || "is-unknown"}`;
    link.href = mergeRequest.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = getMergeRequestStatusLabel(mergeRequest);
    wrapper.appendChild(link);
  }

  if (includeReviewerBadge || includeApprovedBadge) {
    const primaryMergeRequest = relatedMergeRequests[0];
    if (includeReviewerBadge && primaryMergeRequest?.hasReviewer) {
      wrapper.appendChild(
        createMrReviewerText(
          `Reviewer: ${formatReviewerNames(primaryMergeRequest.reviewers)}`,
          {
            iconUrl: primaryMergeRequest.url,
            iconLabel: "Open GitLab merge request",
          },
        ),
      );
    }

    if (
      includeApprovedBadge &&
      primaryMergeRequest?.hasReviewer &&
      primaryMergeRequest?.isApproved &&
      !isMergedMergeRequest(primaryMergeRequest)
    ) {
      wrapper.appendChild(createMrMetaBadge("Approved \u2713", "is-approved"));
    }
  }

  if (wrapper.childElementCount === 0) {
    return null;
  }

  return wrapper;
}

function buildMergeRequestRenderSignaturePayload(relatedMergeRequests) {
  return relatedMergeRequests.map((mergeRequest) => ({
    stateLabel: String(mergeRequest?.stateLabel || ""),
    stateClassName: String(mergeRequest?.stateClassName || ""),
    url: String(mergeRequest?.url || ""),
    hasReviewer: Boolean(mergeRequest?.hasReviewer),
    isApproved: Boolean(mergeRequest?.isApproved),
    unresolvedComments: toNonNegativeNumber(mergeRequest?.unresolvedComments),
    totalComments: toNonNegativeNumber(mergeRequest?.totalComments),
    reviewers: Array.isArray(mergeRequest?.reviewers)
      ? mergeRequest.reviewers.map((reviewer) => ({
          name: String(reviewer?.name || ""),
          url: String(reviewer?.url || ""),
        }))
      : [],
  }));
}

function buildMrStatusSignature(relatedMergeRequests, options = {}) {
  if (
    !Array.isArray(relatedMergeRequests) ||
    relatedMergeRequests.length === 0
  ) {
    return "";
  }

  return JSON.stringify({
    includeReviewerBadge: Boolean(options.includeReviewerBadge),
    includeApprovedBadge: Boolean(options.includeApprovedBadge),
    mergeRequests:
      buildMergeRequestRenderSignaturePayload(relatedMergeRequests),
  });
}

function buildMrDetailSignature(primaryMergeRequest, options = {}) {
  const normalizedRedmineReviewerName = normalizePersonName(
    options.redmineReviewerName,
  );
  if (!primaryMergeRequest) {
    return "";
  }

  const hasReviewer = Boolean(primaryMergeRequest.hasReviewer);
  if (!hasReviewer) {
    return "";
  }

  return JSON.stringify({
    redmineReviewerName: hasReviewer ? normalizedRedmineReviewerName : "",
    reviewers: hasReviewer
      ? {
          url: String(primaryMergeRequest.url || ""),
          reviewers: Array.isArray(primaryMergeRequest.reviewers)
            ? primaryMergeRequest.reviewers.map((reviewer) => ({
                name: String(reviewer?.name || ""),
                url: String(reviewer?.url || ""),
              }))
            : [],
        }
      : null,
  });
}

function removeMrStatusNodes(containerNode) {
  containerNode
    .querySelectorAll(`.${MR_CONTAINER_CLASS}`)
    .forEach((existingNode) => {
      existingNode.remove();
    });
}

function removeMrDetailNodes(attributesNode) {
  attributesNode
    .querySelectorAll(`.${MR_ATTRIBUTE_LINE_CLASS}`)
    .forEach((lineNode) => {
      lineNode.remove();
    });
}

function applyStatusesToCardIssues(issueMrMap, options = {}) {
  const animate = options.animate !== false;
  const issueIdContainers = document.querySelectorAll("p.issue-id");
  issueIdContainers.forEach((container) => {
    const issueInput = container.querySelector('input[name="ids[]"]');
    const issueId = issueInput?.value ? String(issueInput.value).trim() : "";
    const relatedMergeRequests = issueId ? issueMrMap.get(issueId) : null;
    const nextSignature = buildMrStatusSignature(relatedMergeRequests, {
      includeApprovedBadge: true,
    });
    const previousSignature = String(
      container.getAttribute(MR_CARD_STATUS_SIGNATURE_ATTRIBUTE) || "",
    );
    const hasExistingStatusNode = Boolean(
      container.querySelector(`.${MR_CONTAINER_CLASS}`),
    );

    if (!nextSignature) {
      if (hasExistingStatusNode) {
        removeMrStatusNodes(container);
      }
      container.removeAttribute(MR_CARD_STATUS_SIGNATURE_ATTRIBUTE);
      return;
    }

    if (previousSignature === nextSignature && hasExistingStatusNode) {
      return;
    }

    removeMrStatusNodes(container);
    container.setAttribute(MR_CARD_STATUS_SIGNATURE_ATTRIBUTE, nextSignature);
    if (!issueId) {
      return;
    }

    if (!relatedMergeRequests || relatedMergeRequests.length === 0) {
      return;
    }

    const statusNode = createMrStatusNode(relatedMergeRequests, {
      includeApprovedBadge: true,
      animate,
    });
    if (!statusNode) {
      container.removeAttribute(MR_CARD_STATUS_SIGNATURE_ATTRIBUTE);
      return;
    }

    container.appendChild(statusNode);
  });
}

function applyStatusesToStoryRows(issueMrMap, options = {}) {
  const animate = options.animate !== false;
  const storyRows = document.querySelectorAll("tr.group.swimlane[data-id]");
  storyRows.forEach((storyRow) => {
    const storyCell = storyRow.querySelector("td");
    if (!storyCell) {
      return;
    }

    const issueId = String(storyRow.getAttribute("data-id") || "").trim();
    const relatedMergeRequests = issueId ? issueMrMap.get(issueId) : null;
    const nextSignature = buildMrStatusSignature(relatedMergeRequests, {
      includeReviewerBadge: true,
      includeApprovedBadge: true,
    });
    const previousSignature = String(
      storyCell.getAttribute(MR_STORY_STATUS_SIGNATURE_ATTRIBUTE) || "",
    );
    const hasExistingStatusNode = Boolean(
      storyCell.querySelector(`.${MR_CONTAINER_CLASS}`),
    );

    if (!nextSignature) {
      if (hasExistingStatusNode) {
        removeMrStatusNodes(storyCell);
      }
      storyCell.removeAttribute(MR_STORY_STATUS_SIGNATURE_ATTRIBUTE);
      return;
    }

    if (previousSignature === nextSignature && hasExistingStatusNode) {
      return;
    }

    removeMrStatusNodes(storyCell);
    storyCell.setAttribute(MR_STORY_STATUS_SIGNATURE_ATTRIBUTE, nextSignature);
    if (!issueId) {
      return;
    }

    if (!relatedMergeRequests || relatedMergeRequests.length === 0) {
      return;
    }

    const statusNode = createMrStatusNode(relatedMergeRequests, {
      includeReviewerBadge: true,
      includeApprovedBadge: true,
      animate,
    });
    if (!statusNode) {
      storyCell.removeAttribute(MR_STORY_STATUS_SIGNATURE_ATTRIBUTE);
      return;
    }

    storyCell.appendChild(statusNode);
  });
}

function findNativeReviewerLabel(attributesNode) {
  return Array.from(attributesNode.querySelectorAll("b")).find((labelNode) => {
    const isReviewerLabel =
      String(labelNode.textContent || "")
        .trim()
        .toLowerCase() === "reviewer";
    if (!isReviewerLabel) {
      return false;
    }

    return !labelNode.closest(`.${MR_ATTRIBUTE_LINE_CLASS}`);
  });
}

function findReviewerLineInsertionReference(attributesNode) {
  const reviewerLabel = findNativeReviewerLabel(attributesNode);
  if (!reviewerLabel) {
    return null;
  }

  let current = reviewerLabel.nextSibling;
  while (current) {
    if (current.nodeName === "BR") {
      return current.nextSibling;
    }

    current = current.nextSibling;
  }

  return null;
}

function getRedmineReviewerName(attributesNode) {
  const reviewerLabel = findNativeReviewerLabel(attributesNode);
  if (!reviewerLabel) {
    return "";
  }

  let reviewerName = "";
  let current = reviewerLabel.nextSibling;
  while (current) {
    if (current.nodeName === "BR") {
      break;
    }

    if (current.nodeType === Node.ELEMENT_NODE) {
      reviewerName += String(current.textContent || "");
    } else if (current.nodeType === Node.TEXT_NODE) {
      reviewerName += String(current.textContent || "");
    }

    current = current.nextSibling;
  }

  return reviewerName.replace(/^:\s*/, "").trim();
}

function rememberRedmineReviewerName(attributesNode) {
  const redmineReviewerName = getRedmineReviewerName(attributesNode);
  if (redmineReviewerName) {
    attributesNode.setAttribute(
      REDMINE_REVIEWER_NAME_ATTRIBUTE,
      redmineReviewerName,
    );
    return redmineReviewerName;
  }

  return String(
    attributesNode.getAttribute(REDMINE_REVIEWER_NAME_ATTRIBUTE) || "",
  ).trim();
}

function ensureRedmineReviewerLine(attributesNode, reviewerName) {
  const trimmedReviewerName = String(reviewerName || "").trim();
  if (!trimmedReviewerName) {
    return;
  }

  if (findNativeReviewerLabel(attributesNode)) {
    return;
  }

  const lineNode = document.createDocumentFragment();
  const labelNode = document.createElement("b");
  labelNode.textContent = "Reviewer";
  lineNode.appendChild(labelNode);
  lineNode.appendChild(document.createTextNode(": "));
  lineNode.appendChild(document.createTextNode(trimmedReviewerName));
  lineNode.appendChild(document.createElement("br"));

  const firstGitlabLine = attributesNode.querySelector(
    `.${MR_ATTRIBUTE_LINE_CLASS}`,
  );
  if (firstGitlabLine && firstGitlabLine.parentNode === attributesNode) {
    attributesNode.insertBefore(lineNode, firstGitlabLine);
  } else {
    attributesNode.appendChild(lineNode);
  }
}

function removeRedmineReviewerLine(attributesNode) {
  const reviewerLabel = findNativeReviewerLabel(attributesNode);
  if (!reviewerLabel) {
    return;
  }

  let current = reviewerLabel;
  while (current) {
    const next = current.nextSibling;
    const shouldStop = current.nodeName === "BR";
    current.remove();
    if (shouldStop) {
      break;
    }
    current = next;
  }
}

function appendReviewerNames(targetNode, reviewers) {
  reviewers.forEach((reviewer, index) => {
    if (index > 0) {
      targetNode.appendChild(document.createTextNode(", "));
    }

    if (reviewer.url) {
      const reviewerLink = document.createElement("a");
      reviewerLink.className = "user active";
      reviewerLink.href = reviewer.url;
      reviewerLink.target = "_blank";
      reviewerLink.rel = "noopener noreferrer";
      reviewerLink.textContent = reviewer.name;
      targetNode.appendChild(reviewerLink);
      return;
    }

    targetNode.appendChild(document.createTextNode(reviewer.name));
  });
}

function createReviewerValueNode(reviewers, options = {}) {
  const { iconUrl = "", redmineReviewerName = "" } = options;
  const redmineName = String(redmineReviewerName || "").trim();
  const normalizedRedmineName = normalizePersonName(redmineName);
  const normalizedGitlabNames = getNormalizedReviewerNames(reviewers);
  const hasSameSingleReviewerName =
    Boolean(normalizedRedmineName) &&
    normalizedGitlabNames.length === 1 &&
    normalizedGitlabNames[0] === normalizedRedmineName;

  const valueNode = document.createElement("span");
  valueNode.appendChild(document.createTextNode(redmineName || "none"));

  const detailsNode = document.createElement("span");
  if (!hasSameSingleReviewerName) {
    appendReviewerNames(detailsNode, reviewers);
  }

  const iconLink = createGitlabIconLink(iconUrl, "Open GitLab merge request");
  if (iconLink) {
    if (detailsNode.childNodes.length > 0) {
      detailsNode.appendChild(document.createTextNode(" "));
    }
    detailsNode.appendChild(iconLink);
  }

  if (detailsNode.childNodes.length > 0) {
    valueNode.appendChild(document.createTextNode(" ("));
    valueNode.appendChild(detailsNode);
    valueNode.appendChild(document.createTextNode(")"));
  }

  return valueNode;
}

function createGitlabAttributeLine(labelText, valueNode, options = {}) {
  const animate = options.animate !== false;
  const lineNode = document.createElement("span");
  lineNode.className = animate
    ? `${MR_ATTRIBUTE_LINE_CLASS} ${GITLAB_FADE_IN_CLASS}`
    : MR_ATTRIBUTE_LINE_CLASS;

  if (labelText) {
    const label = document.createElement("b");
    label.textContent = labelText;
    lineNode.appendChild(label);
    lineNode.appendChild(document.createTextNode(": "));
  }

  if (typeof valueNode === "string") {
    lineNode.appendChild(document.createTextNode(valueNode));
  } else {
    lineNode.appendChild(valueNode);
  }

  lineNode.appendChild(document.createElement("br"));
  return lineNode;
}

function createGitlabRequestMetricsSummary() {
  return {
    requestCount: 0,
    apiRequestCount: 0,
    avatarRequestCount: 0,
    requestUrls: [],
  };
}

function mergeGitlabRequestMetrics(summary, metrics) {
  if (!summary || !metrics) {
    return summary;
  }

  summary.requestCount += Number(metrics.requestCount || 0);
  summary.apiRequestCount += Number(metrics.apiRequestCount || 0);
  summary.avatarRequestCount += Number(metrics.avatarRequestCount || 0);
  if (!Array.isArray(summary.requestUrls)) {
    summary.requestUrls = [];
  }

  if (Array.isArray(metrics.requestUrls)) {
    metrics.requestUrls.forEach((url) => {
      const normalizedUrl = String(url || "").trim();
      if (!normalizedUrl) {
        return;
      }

      summary.requestUrls.push(normalizedUrl);
    });
  }

  return summary;
}

function applyDetailsToCardIssues(issueMrMap, options = {}) {
  const animate = options.animate !== false;
  const issueCards = document.querySelectorAll(".issue-card[data-id]");
  issueCards.forEach((issueCard) => {
    const attributesNode = issueCard.querySelector("p.attributes");
    if (!attributesNode) {
      return;
    }

    const issueId = String(issueCard.getAttribute("data-id") || "").trim();
    const relatedMergeRequests = issueId ? issueMrMap.get(issueId) : null;
    const primaryMergeRequest = relatedMergeRequests?.[0];
    const redmineReviewerName = rememberRedmineReviewerName(attributesNode);
    const nextSignature = buildMrDetailSignature(primaryMergeRequest, {
      redmineReviewerName,
    });
    const previousSignature = String(
      attributesNode.getAttribute(MR_DETAIL_SIGNATURE_ATTRIBUTE) || "",
    );
    const hasExistingDetailLines = Boolean(
      attributesNode.querySelector(`.${MR_ATTRIBUTE_LINE_CLASS}`),
    );
    if (!primaryMergeRequest?.hasReviewer) {
      ensureRedmineReviewerLine(attributesNode, redmineReviewerName);
    }

    if (!nextSignature) {
      if (hasExistingDetailLines) {
        removeMrDetailNodes(attributesNode);
      }
      attributesNode.removeAttribute(MR_DETAIL_SIGNATURE_ATTRIBUTE);
      return;
    }

    if (previousSignature === nextSignature && hasExistingDetailLines) {
      return;
    }

    removeMrDetailNodes(attributesNode);
    attributesNode.setAttribute(MR_DETAIL_SIGNATURE_ATTRIBUTE, nextSignature);
    if (!issueId) {
      return;
    }

    if (!relatedMergeRequests || relatedMergeRequests.length === 0) {
      return;
    }

    if (!primaryMergeRequest) {
      return;
    }

    const insertBeforeNode = findReviewerLineInsertionReference(attributesNode);
    if (primaryMergeRequest.hasReviewer) {
      removeRedmineReviewerLine(attributesNode);
    }

    const linesToInsert = [];
    if (primaryMergeRequest.hasReviewer) {
      linesToInsert.push(
        createGitlabAttributeLine(
          "Reviewer",
          createReviewerValueNode(primaryMergeRequest.reviewers, {
            iconUrl: primaryMergeRequest.url,
            redmineReviewerName,
          }),
          { animate },
        ),
      );
    }

    if (linesToInsert.length === 0) {
      attributesNode.removeAttribute(MR_DETAIL_SIGNATURE_ATTRIBUTE);
      return;
    }

    linesToInsert.forEach((lineNode) => {
      if (insertBeforeNode && insertBeforeNode.parentNode === attributesNode) {
        attributesNode.insertBefore(lineNode, insertBeforeNode);
      } else {
        attributesNode.appendChild(lineNode);
      }
    });
  });
}

function applyGitlabMergeRequestsToBoard(mergeRequests, options = {}) {
  const issueMrMap = buildIssueMrMap(
    Array.isArray(mergeRequests) ? mergeRequests : [],
  );
  applyStatusesToCardIssues(issueMrMap, options);
  applyDetailsToCardIssues(issueMrMap, options);
  applyStatusesToStoryRows(issueMrMap, options);
}

function fetchGitlabMergeRequests(
  redmineProjectName,
  issueIds = [],
  options = {},
) {
  const cacheOnly = Boolean(options.cacheOnly);
  const boardCacheKey = String(options.boardCacheKey || "").trim();
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      {
        type: "BLUEMINE_FETCH_GITLAB_MRS",
        redmineProjectName,
        issueIds,
        cacheOnly,
        boardCacheKey,
      },
      (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }

        if (!response?.ok) {
          reject(
            new Error(
              response?.error ||
                `GitLab request failed${response?.status ? ` (${response.status})` : ""}`,
            ),
          );
          return;
        }

        resolve({
          mergeRequests: Array.isArray(response.mergeRequests)
            ? response.mergeRequests
            : [],
          requestMetrics: response?.requestMetrics || null,
        });
      },
    );
  });
}

function isGitlabProjectReady(redmineProjectName) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      {
        type: "BLUEMINE_IS_GITLAB_PROJECT_READY",
        redmineProjectName,
      },
      (response) => {
        if (chrome.runtime.lastError) {
          resolve(false);
          return;
        }

        resolve(Boolean(response?.ok && response?.isReady));
      },
    );
  });
}

function collectBoardIssueIds() {
  const issueIds = new Set();

  document
    .querySelectorAll('.issue-card input[name="ids[]"]')
    .forEach((inputNode) => {
      const issueId = String(inputNode?.value || "").trim();
      if (/^\d+$/.test(issueId)) {
        issueIds.add(issueId);
      }
    });

  document
    .querySelectorAll("tr.group.swimlane[data-id]")
    .forEach((storyRow) => {
      const issueId = String(storyRow.getAttribute("data-id") || "").trim();
      if (/^\d+$/.test(issueId)) {
        issueIds.add(issueId);
      }
    });

  return [...issueIds];
}

function fetchGitlabAssigneeAvatars(
  redmineProjectName,
  assigneeNames,
  options = {},
) {
  const cacheOnly = Boolean(options.cacheOnly);
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      {
        type: "BLUEMINE_FETCH_GITLAB_ASSIGNEE_AVATARS",
        redmineProjectName,
        assigneeNames,
        cacheOnly,
      },
      (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }

        if (!response?.ok) {
          reject(
            new Error(
              response?.error ||
                `GitLab avatar request failed${response?.status ? ` (${response.status})` : ""}`,
            ),
          );
          return;
        }

        resolve({
          avatarsByName:
            response?.avatarsByName &&
            typeof response.avatarsByName === "object"
              ? response.avatarsByName
              : {},
          requestMetrics: response?.requestMetrics || null,
        });
      },
    );
  });
}

function applyTaskCardAssigneeAvatarsFromMap(assigneeEntries, avatarsByName) {
  assigneeEntries.forEach(({ assigneeInfoNode, assigneeName }) => {
    const avatarDataUrl = String(avatarsByName?.[assigneeName] || "").trim();
    if (!avatarDataUrl) {
      return;
    }

    applyTaskCardAssigneeAvatar(assigneeInfoNode, assigneeName, avatarDataUrl);
  });
}

function collectTaskCardAssigneeEntries() {
  const entries = [];
  document
    .querySelectorAll(".issue-card[data-id] p.info.assigned-user")
    .forEach((assigneeInfoNode) => {
      const assigneeNameNode = assigneeInfoNode.querySelector("a.user");
      const assigneeName = String(assigneeNameNode?.textContent || "").trim();
      if (!assigneeName) {
        return;
      }

      entries.push({
        assigneeInfoNode,
        assigneeName,
      });
    });

  return entries;
}

function applyTaskCardAssigneeAvatar(
  assigneeInfoNode,
  assigneeName,
  avatarDataUrl,
) {
  const existingAvatarNode = assigneeInfoNode.querySelector(".avatar");
  if (!existingAvatarNode) {
    return;
  }

  const avatarImage = document.createElement("img");
  avatarImage.className =
    `${existingAvatarNode.className || "avatar"} ${GITLAB_ASSIGNEE_AVATAR_CLASS}`.trim();
  avatarImage.src = avatarDataUrl;
  avatarImage.alt = assigneeName;
  avatarImage.title = assigneeName;
  avatarImage.setAttribute("aria-label", assigneeName);

  if (existingAvatarNode.tagName.toLowerCase() === "img") {
    existingAvatarNode.className = avatarImage.className;
    existingAvatarNode.src = avatarDataUrl;
    existingAvatarNode.alt = assigneeName;
    existingAvatarNode.title = assigneeName;
    existingAvatarNode.setAttribute("aria-label", assigneeName);
    return;
  }

  existingAvatarNode.replaceWith(avatarImage);
}

async function applyGitlabAssigneeAvatarsToTaskCards(
  redmineProjectName,
  options = {},
) {
  const onCachedApplied =
    typeof options.onCachedApplied === "function"
      ? options.onCachedApplied
      : null;
  let hasSignaledCachedApplied = false;
  const signalCachedApplied = () => {
    if (hasSignaledCachedApplied) {
      return;
    }

    hasSignaledCachedApplied = true;
    if (!onCachedApplied) {
      return;
    }

    try {
      onCachedApplied();
    } catch (_error) {
      // Ignore callback failures.
    }
  };

  const requestMetricsSummary = createGitlabRequestMetricsSummary();
  const assigneeEntries = collectTaskCardAssigneeEntries();
  if (assigneeEntries.length === 0) {
    signalCachedApplied();
    return requestMetricsSummary;
  }

  const uniqueAssigneeNames = [
    ...new Set(
      assigneeEntries
        .map((entry) => String(entry.assigneeName || "").trim())
        .filter(Boolean),
    ),
  ];
  if (uniqueAssigneeNames.length === 0) {
    signalCachedApplied();
    return requestMetricsSummary;
  }

  try {
    const cachedResult = await fetchGitlabAssigneeAvatars(
      redmineProjectName,
      uniqueAssigneeNames,
      { cacheOnly: true },
    );
    mergeGitlabRequestMetrics(
      requestMetricsSummary,
      cachedResult.requestMetrics,
    );
    applyTaskCardAssigneeAvatarsFromMap(
      assigneeEntries,
      cachedResult.avatarsByName,
    );
    signalCachedApplied();

    const unresolvedAssigneeNames = uniqueAssigneeNames.filter(
      (assigneeName) => !cachedResult.avatarsByName?.[assigneeName],
    );
    if (unresolvedAssigneeNames.length === 0) {
      return requestMetricsSummary;
    }

    const networkResult = await fetchGitlabAssigneeAvatars(
      redmineProjectName,
      unresolvedAssigneeNames,
    );
    mergeGitlabRequestMetrics(
      requestMetricsSummary,
      networkResult.requestMetrics,
    );
    applyTaskCardAssigneeAvatarsFromMap(
      assigneeEntries,
      networkResult.avatarsByName,
    );
  } catch (error) {
    console.warn("[Bluemine] Failed to load GitLab assignee avatars:", error);
    signalCachedApplied();
  }

  return requestMetricsSummary;
}

async function runGitlabMrStatusFeature() {
  const boardProjectName = getCurrentBoardProjectName();
  if (!boardProjectName) {
    return;
  }

  const startTimeMs = performance.now();
  const requestMetricsSummary = createGitlabRequestMetricsSummary();
  ensureMrStylesInjected();
  const boardIssueIds = collectBoardIssueIds();
  const boardCacheKey =
    normalizePageUrl(window.location.href) || boardProjectName;
  const hasVisibleOverlayAtStart = Boolean(
    document.getElementById(SCROLL_RESTORE_OVERLAY_ID),
  );
  const canCreateOverlayForGitlab =
    !hasVisibleOverlayAtStart &&
    getNavigationType() === "reload" &&
    boardIssueIds.length > 0;
  if (hasVisibleOverlayAtStart) {
    // Hold immediately to avoid a race where scroll restoration clears
    // the overlay before cached GitLab content is injected.
    setScrollRestoreOverlayHoldForGitlab(true);
  }
  const isGitlabReady = await isGitlabProjectReady(boardProjectName);
  const shouldWaitForGitlabCachedInjection =
    isGitlabReady && (hasVisibleOverlayAtStart || canCreateOverlayForGitlab);
  if (shouldWaitForGitlabCachedInjection && canCreateOverlayForGitlab) {
    ensureScrollRestoreOverlay();
    setScrollRestoreOverlayHoldForGitlab(true);
  } else if (hasVisibleOverlayAtStart && !shouldWaitForGitlabCachedInjection) {
    setScrollRestoreOverlayHoldForGitlab(false);
  }
  let hasAppliedCachedMrData = false;
  let hasAppliedCachedAvatarData = false;
  let hasRequestedOverlayReleaseAfterCache = false;
  const releaseScrollOverlayAfterGitlabCache = () => {
    if (!shouldWaitForGitlabCachedInjection) {
      return;
    }

    if (!hasAppliedCachedMrData || !hasAppliedCachedAvatarData) {
      return;
    }
    if (hasRequestedOverlayReleaseAfterCache) {
      return;
    }

    hasRequestedOverlayReleaseAfterCache = true;
    waitForNextPaint().then(() => {
      setScrollRestoreOverlayHoldForGitlab(false);
    });
  };

  const avatarMetricsPromise = applyGitlabAssigneeAvatarsToTaskCards(
    boardProjectName,
    {
      onCachedApplied: () => {
        hasAppliedCachedAvatarData = true;
        releaseScrollOverlayAfterGitlabCache();
      },
    },
  );
  try {
    if (boardIssueIds.length === 0) {
      applyGitlabMergeRequestsToBoard([], { animate: false });
      hasAppliedCachedMrData = true;
      releaseScrollOverlayAfterGitlabCache();
    } else {
      try {
        const cachedMrResult = await fetchGitlabMergeRequests(
          boardProjectName,
          boardIssueIds,
          { cacheOnly: true, boardCacheKey },
        );
        mergeGitlabRequestMetrics(
          requestMetricsSummary,
          cachedMrResult.requestMetrics,
        );
        applyGitlabMergeRequestsToBoard(cachedMrResult.mergeRequests, {
          animate: false,
        });
      } catch (error) {
        console.warn(
          "[Bluemine] Failed to load cached GitLab merge requests:",
          error,
        );
      } finally {
        hasAppliedCachedMrData = true;
        releaseScrollOverlayAfterGitlabCache();
      }

      try {
        const networkMrResult = await fetchGitlabMergeRequests(
          boardProjectName,
          boardIssueIds,
          { boardCacheKey },
        );
        mergeGitlabRequestMetrics(
          requestMetricsSummary,
          networkMrResult.requestMetrics,
        );
        applyGitlabMergeRequestsToBoard(networkMrResult.mergeRequests, {
          animate: true,
        });
      } catch (error) {
        console.warn("[Bluemine] Failed to load GitLab merge requests:", error);
      }
    }

    try {
      const avatarRequestMetrics = await avatarMetricsPromise;
      mergeGitlabRequestMetrics(requestMetricsSummary, avatarRequestMetrics);
    } catch (error) {
      console.warn(
        "[Bluemine] Failed to apply GitLab assignee avatars:",
        error,
      );
    }

    const durationMs = Math.max(0, Math.round(performance.now() - startTimeMs));
    const durationSeconds = (durationMs / 1000).toFixed(2);
    console.info(
      `[Bluemine] Loaded Gitlab info in ${durationSeconds} seconds with ${requestMetricsSummary.requestCount} requests (${durationMs} ms)`,
    );
  } finally {
    if (shouldWaitForGitlabCachedInjection) {
      setScrollRestoreOverlayHoldForGitlab(false);
    }
  }
}

chrome.storage.sync.get(
  {
    [FEATURE_KEY]: false,
    [GITLAB_MR_FEATURE_KEY]: false,
    [ENHANCED_AGILE_BOARD_FEATURE_KEY]: false,
  },
  async (result) => {
    if (result[ENHANCED_AGILE_BOARD_FEATURE_KEY] && isAgileBoardPage()) {
      window.addEventListener("pageshow", (event) => {
        if (event.persisted) {
          window.location.reload();
        }
      });
    }

    const matchesDetectedRedmineHeaders = await isDetectedRedmineTab();
    if (!matchesDetectedRedmineHeaders) {
      if (result[ENHANCED_AGILE_BOARD_FEATURE_KEY] && isAgileBoardPage()) {
        runRestoreScrollOnReloadFeature();
        runCollapsedGroupsFeature();
      } else {
        removeScrollRestoreOverlayIfReady();
      }
      return;
    }

    if (result[FEATURE_KEY]) {
      runHelloWorldFeature();
    }

    const hasVisibleScrollRestoreOverlay = Boolean(
      document.getElementById(SCROLL_RESTORE_OVERLAY_ID),
    );
    if (result[GITLAB_MR_FEATURE_KEY] && hasVisibleScrollRestoreOverlay) {
      // Pre-hold so runRestoreScrollOnReloadFeature cannot remove the
      // overlay before runGitlabMrStatusFeature has a chance to gate it.
      setScrollRestoreOverlayHoldForGitlab(true);
    }

    if (result[ENHANCED_AGILE_BOARD_FEATURE_KEY]) {
      runRestoreScrollOnReloadFeature();
      runCollapsedGroupsFeature();
    } else {
      removeScrollRestoreOverlayIfReady();
    }

    if (result[GITLAB_MR_FEATURE_KEY]) {
      await runGitlabMrStatusFeature();
    }
  },
);
