function detectRedmineFromDOM() {
  const hasRedmineMetaTag = Boolean(
    document.querySelector(
      'meta[name="csrf-param"][content="authenticity_token"]',
    ),
  );
  const hasRedmineBody = Boolean(
    document.querySelector("body.controller-agile_boards") ||
    document.querySelector("body.controller-issues") ||
    document.querySelector("body.controller-projects") ||
    document.querySelector("body.controller-wiki") ||
    document.querySelector("body.controller-timelog") ||
    document.getElementById("main-menu"),
  );
  return hasRedmineMetaTag || hasRedmineBody;
}

function registerRedmineTabDetection() {
  const isRedmine = detectRedmineFromDOM();
  return new Promise((resolve) => {
    browserAPI.runtime.sendMessage(
      {
        type: "BLUEMINE_REGISTER_REDMINE_TAB",
        isRedmine,
      },
      (response) => {
        if (browserAPI.runtime.lastError) {
          resolve(isRedmine);
          return;
        }

        resolve(Boolean(response?.ok) ? isRedmine : false);
      },
    );
  });
}

function isDetectedRedmineTab() {
  return registerRedmineTabDetection();
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

function findBoardTable() {
  const agileTable = document.querySelector("table.agile-board");
  if (agileTable) return agileTable;
  const groupRow = document.querySelector("tr.group.swimlane[data-id]");
  return groupRow ? groupRow.closest("table") : null;
}

function findRedmineToolbar() {
  const queryButtons =
    document.querySelector("#query_form_with_buttons .buttons") ||
    document.querySelector("#query_form .buttons") ||
    document.querySelector(".query-buttons") ||
    document.querySelector("p.buttons");
  return queryButtons;
}

function ensureBoardScrollbarVisible() {
  const id = "bluemine-board-scrollbar-style";
  if (document.getElementById(id)) return;
  const style = document.createElement("style");
  style.id = id;
  style.textContent = "html { overflow-y: scroll !important; }";
  (document.head || document.documentElement).appendChild(style);
}
