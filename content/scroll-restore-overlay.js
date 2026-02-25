(() => {
  const BOARD_PATH_REGEX = /\/projects\/([^/]+)\/agile\/board\/?$/;
  const SCROLL_RESTORE_STATE_KEY = "bluemine.scrollRestoreState.v1";
  const SCROLL_RESTORE_MAX_AGE_MS = 30 * 60 * 1000;
  const SCROLL_RESTORE_OVERLAY_ID = "bluemine-scroll-restore-overlay";
  const SCROLL_RESTORE_OVERLAY_STYLE_ID =
    "bluemine-scroll-restore-overlay-style";
  const GITLAB_MR_FEATURE_KEY = "feature.gitlabMrStatus.enabled";

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
      };
    } catch (_error) {
      return null;
    }
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

  function removeScrollRestoreOverlay() {
    document.getElementById(SCROLL_RESTORE_OVERLAY_ID)?.remove();
    document.getElementById(SCROLL_RESTORE_OVERLAY_STYLE_ID)?.remove();
  }

  if (!isAgileBoardPage()) {
    removeScrollRestoreOverlay();
    return;
  }

  const initialPageUrl = normalizePageUrl(window.location.href);
  if (!initialPageUrl) {
    removeScrollRestoreOverlay();
    return;
  }

  const storedState = readStoredScrollRestoreState();
  if (storedState && storedState.pageUrl === initialPageUrl) {
    ensureScrollRestoreOverlay();
    return;
  }

  chrome.storage.sync.get({ [GITLAB_MR_FEATURE_KEY]: false }, (result) => {
    const latestPageUrl = normalizePageUrl(window.location.href);
    const isStillEligibleBoardPage = isAgileBoardPage() &&
      latestPageUrl &&
      latestPageUrl === initialPageUrl;
    if (!isStillEligibleBoardPage) {
      removeScrollRestoreOverlay();
      return;
    }

    if (!result[GITLAB_MR_FEATURE_KEY]) {
      removeScrollRestoreOverlay();
      return;
    }

    ensureScrollRestoreOverlay();
  });
})();
