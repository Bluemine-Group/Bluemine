chrome.runtime.onInstalled.addListener(() => {
  console.log("[Bluemine] Extension installed");
});

const GITLAB_BASE_URL_KEY = "settings.gitlabBaseUrl";
const GITLAB_API_KEY_KEY = "settings.gitlabApiKey";
const GITLAB_PROJECT_MAP_KEY = "settings.gitlabProjectMap";
const GITLAB_MR_FEATURE_KEY = "feature.gitlabMrStatus.enabled";
const REDMINE_SESSION_COOKIE_NAME = "_redmine_session=";
const redmineTabDetection = new Map();

function hasRedmineSessionSetCookie(responseHeaders) {
  if (!Array.isArray(responseHeaders)) {
    return false;
  }

  return responseHeaders.some((header) => {
    const headerName = String(header?.name || "").toLowerCase();
    if (headerName !== "set-cookie") {
      return false;
    }

    const headerValue = String(header?.value || "");
    return headerValue.includes(REDMINE_SESSION_COOKIE_NAME);
  });
}

function hasRedmineSessionCookieRequestHeader(requestHeaders) {
  if (!Array.isArray(requestHeaders)) {
    return false;
  }

  return requestHeaders.some((header) => {
    const headerName = String(header?.name || "").toLowerCase();
    if (headerName !== "cookie") {
      return false;
    }

    const headerValue = String(header?.value || "");
    return headerValue.includes(REDMINE_SESSION_COOKIE_NAME);
  });
}

chrome.webRequest.onBeforeSendHeaders.addListener(
  (details) => {
    if (details.tabId < 0 || details.type !== "main_frame") {
      return;
    }

    redmineTabDetection.set(
      details.tabId,
      hasRedmineSessionCookieRequestHeader(details.requestHeaders),
    );
  },
  {
    urls: ["https://*/*", "http://*/*"],
    types: ["main_frame"],
  },
  ["requestHeaders", "extraHeaders"],
);

chrome.webRequest.onHeadersReceived.addListener(
  (details) => {
    if (details.tabId < 0 || details.type !== "main_frame") {
      return;
    }

    const detectedFromRequestCookies = Boolean(
      redmineTabDetection.get(details.tabId),
    );
    const detectedFromSetCookie = hasRedmineSessionSetCookie(
      details.responseHeaders,
    );

    redmineTabDetection.set(
      details.tabId,
      detectedFromRequestCookies || detectedFromSetCookie,
    );
  },
  {
    urls: ["https://*/*", "http://*/*"],
    types: ["main_frame"],
  },
  ["responseHeaders", "extraHeaders"],
);

chrome.tabs.onRemoved.addListener((tabId) => {
  redmineTabDetection.delete(tabId);
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "BLUEMINE_PING") {
    sendResponse({ ok: true, source: "background" });
    return;
  }

  if (message?.type === "BLUEMINE_IS_REDMINE_TAB") {
    const tabId = Number(_sender?.tab?.id);
    sendResponse({
      ok: true,
      isRedmine: Number.isInteger(tabId) && tabId >= 0
        ? Boolean(redmineTabDetection.get(tabId))
        : false
    });
    return;
  }

  if (message?.type === "BLUEMINE_FETCH_GITLAB_MRS") {
    const redmineProjectName = String(message.redmineProjectName || "").trim();
    if (!redmineProjectName) {
      sendResponse({ ok: false, error: "Missing redmine project name" });
      return;
    }

    fetchGitlabMergeRequestsForRedmineProject(redmineProjectName)
      .then((mergeRequests) => {
        sendResponse({ ok: true, mergeRequests });
      })
      .catch((error) => {
        sendResponse({
          ok: false,
          error: error.message || "GitLab request failed",
          status: Number(error.status) || undefined
        });
      });

    return true;
  }
});

function parseProjectMap(rawMap) {
  const map = {};
  String(rawMap || "")
    .split(/\r?\n/)
    .forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        return;
      }

      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex <= 0) {
        return;
      }

      const redmineProject = trimmed.slice(0, separatorIndex).trim();
      const gitlabProjectId = trimmed.slice(separatorIndex + 1).trim();
      if (!redmineProject || !gitlabProjectId) {
        return;
      }

      map[redmineProject] = gitlabProjectId;
    });

  return map;
}

function getSyncSettings(defaults) {
  return new Promise((resolve) => {
    chrome.storage.sync.get(defaults, (result) => resolve(result));
  });
}

async function fetchGitlabMergeRequestsForRedmineProject(redmineProjectName) {
  const settings = await getSyncSettings({
    [GITLAB_MR_FEATURE_KEY]: false,
    [GITLAB_BASE_URL_KEY]: "",
    [GITLAB_API_KEY_KEY]: "",
    [GITLAB_PROJECT_MAP_KEY]: ""
  });

  if (!settings[GITLAB_MR_FEATURE_KEY]) {
    return [];
  }

  const gitlabBaseUrl = String(settings[GITLAB_BASE_URL_KEY] || "").trim();
  const apiKey = String(settings[GITLAB_API_KEY_KEY] || "").trim();
  const projectMap = parseProjectMap(settings[GITLAB_PROJECT_MAP_KEY]);
  const gitlabProjectId = String(projectMap[redmineProjectName] || "").trim();

  if (!gitlabBaseUrl || !apiKey || !gitlabProjectId) {
    return [];
  }

  return fetchGitlabMergeRequests(gitlabBaseUrl, gitlabProjectId, apiKey);
}

async function fetchGitlabMergeRequests(gitlabBaseUrl, gitlabProjectId, apiKey) {
  let normalizedBaseUrl;
  try {
    const parsed = new URL(gitlabBaseUrl);
    const path = parsed.pathname === "/" ? "" : parsed.pathname.replace(/\/+$/, "");
    normalizedBaseUrl = `${parsed.origin}${path}`;
  } catch (_error) {
    const invalidUrlError = new Error("Invalid GitLab base URL");
    invalidUrlError.status = 400;
    throw invalidUrlError;
  }

  const url =
    `${normalizedBaseUrl}/api/v4/projects/${encodeURIComponent(gitlabProjectId)}` +
    "/merge_requests?order_by=updated_at&sort=desc";
  const response = await fetch(url, {
    method: "GET",
    headers: {
      "PRIVATE-TOKEN": apiKey
    }
  });

  if (!response.ok) {
    const responseText = await response.text().catch(() => "");
    const error = new Error(
      `GitLab API request failed (${response.status})${responseText ? `: ${responseText}` : ""}`
    );
    error.status = response.status;
    throw error;
  }

  const data = await response.json();
  if (!Array.isArray(data)) {
    const error = new Error("Unexpected GitLab API response format");
    error.status = 502;
    throw error;
  }

  return data;
}
