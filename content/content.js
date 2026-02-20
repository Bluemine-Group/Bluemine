const FEATURE_KEY = "feature.helloWorld.enabled";
const GITLAB_MR_FEATURE_KEY = "feature.gitlabMrStatus.enabled";
const BOARD_PATH_REGEX = /\/projects\/([^/]+)\/agile\/board\/?$/;
const MR_TITLE_PREFIX_REGEX = /^(\d{5}(?:,\s*\d{5})*) - /;
const MR_CONTAINER_CLASS = "bluemine-mr-status";
const MR_STYLE_ID = "bluemine-mr-status-style";

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

  return [...new Set(titleMatch[1].split(/\s*,\s*/).filter(Boolean))];
}

function ensureMrStylesInjected() {
  if (document.getElementById(MR_STYLE_ID)) {
    return;
  }

  const style = document.createElement("style");
  style.id = MR_STYLE_ID;
  style.textContent = `
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
  `;
  document.head.appendChild(style);
}

function buildIssueMrMap(mergeRequests) {
  const issueMrMap = new Map();

  for (const mergeRequest of mergeRequests) {
    if (!mergeRequest) {
      continue;
    }

    const issueIds = extractIssueIdsFromMrTitle(mergeRequest.title);
    if (issueIds.length === 0) {
      continue;
    }

    const state = mapMrState(mergeRequest.state);
    const mergeRequestEntry = {
      stateLabel: state.label,
      stateClassName: state.className,
      url: String(mergeRequest.web_url || "").trim(),
    };

    issueIds.forEach((issueId) => {
      const existing = issueMrMap.get(issueId) || [];
      existing.push(mergeRequestEntry);
      issueMrMap.set(issueId, existing);
    });
  }

  return issueMrMap;
}

function createMrStatusNode(relatedMergeRequests) {
  const wrapper = document.createElement("span");
  wrapper.className = MR_CONTAINER_CLASS;

  for (const mergeRequest of relatedMergeRequests) {
    if (!mergeRequest.url) {
      continue;
    }

    const link = document.createElement("a");
    link.className = `bluemine-mr-link ${mergeRequest.stateClassName || "is-unknown"}`;
    link.href = mergeRequest.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = mergeRequest.stateLabel;
    wrapper.appendChild(link);
  }

  if (wrapper.childElementCount === 0) {
    return null;
  }

  return wrapper;
}

function applyStatusesToCardIssues(issueMrMap) {
  const issueIdContainers = document.querySelectorAll("p.issue-id");
  issueIdContainers.forEach((container) => {
    container
      .querySelectorAll(`.${MR_CONTAINER_CLASS}`)
      .forEach((existingNode) => {
        existingNode.remove();
      });

    const issueInput = container.querySelector('input[name="ids[]"]');
    const issueId = issueInput?.value ? String(issueInput.value).trim() : "";
    if (!issueId) {
      return;
    }

    const relatedMergeRequests = issueMrMap.get(issueId);
    if (!relatedMergeRequests || relatedMergeRequests.length === 0) {
      return;
    }

    const statusNode = createMrStatusNode(relatedMergeRequests);
    if (!statusNode) {
      return;
    }

    container.appendChild(statusNode);
  });
}

function applyStatusesToStoryRows(issueMrMap) {
  const storyRows = document.querySelectorAll("tr.group.swimlane[data-id]");
  storyRows.forEach((storyRow) => {
    const storyCell = storyRow.querySelector("td");
    if (!storyCell) {
      return;
    }

    storyCell
      .querySelectorAll(`.${MR_CONTAINER_CLASS}`)
      .forEach((existingNode) => {
        existingNode.remove();
      });

    const issueId = String(storyRow.getAttribute("data-id") || "").trim();
    if (!issueId) {
      return;
    }

    const relatedMergeRequests = issueMrMap.get(issueId);
    if (!relatedMergeRequests || relatedMergeRequests.length === 0) {
      return;
    }

    const statusNode = createMrStatusNode(relatedMergeRequests);
    if (!statusNode) {
      return;
    }

    storyCell.appendChild(statusNode);
  });
}

function fetchGitlabMergeRequests(redmineProjectName) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      {
        type: "BLUEMINE_FETCH_GITLAB_MRS",
        redmineProjectName,
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

        resolve(
          Array.isArray(response.mergeRequests) ? response.mergeRequests : [],
        );
      },
    );
  });
}

async function runGitlabMrStatusFeature() {
  const boardProjectName = getCurrentBoardProjectName();
  if (!boardProjectName) {
    return;
  }

  try {
    const mergeRequests = await fetchGitlabMergeRequests(boardProjectName);
    ensureMrStylesInjected();
    const issueMrMap = buildIssueMrMap(mergeRequests);
    applyStatusesToCardIssues(issueMrMap);
    applyStatusesToStoryRows(issueMrMap);
  } catch (error) {
    console.warn("[Bluemine] Failed to load GitLab merge requests:", error);
  }
}

chrome.storage.sync.get(
  {
    [FEATURE_KEY]: false,
    [GITLAB_MR_FEATURE_KEY]: false,
  },
  async (result) => {
    const matchesDetectedRedmineHeaders = await isDetectedRedmineTab();
    if (!matchesDetectedRedmineHeaders) {
      return;
    }

    if (result[FEATURE_KEY]) {
      runHelloWorldFeature();
    }

    if (result[GITLAB_MR_FEATURE_KEY]) {
      await runGitlabMrStatusFeature();
    }
  },
);
