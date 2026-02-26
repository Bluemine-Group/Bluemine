const GITLAB_MR_FEATURE_KEY = "feature.gitlabMrStatus.enabled";
const RESTORE_SCROLL_ON_RELOAD_FEATURE_KEY =
  "feature.restoreScrollOnReload.enabled";
const GITLAB_BASE_URL_KEY = "settings.gitlabBaseUrl";
const GITLAB_API_KEY_KEY = "settings.gitlabApiKey";
const GITLAB_PROJECT_MAP_KEY = "settings.gitlabProjectMap";
const GITHUB_REPO_URL = "https://github.com/webjocke/Bluemine";
const GITHUB_RELEASES_URL = `${GITHUB_REPO_URL}/releases`;
const GITHUB_LATEST_RELEASE_URL =
  "https://api.github.com/repos/webjocke/bluemine/releases/latest";
const LATEST_RELEASE_CACHE_KEY = "cache.githubLatestRelease";
const RELEASE_LAST_SEEN_TAG_KEY = "release.lastSeenTag";
const LATEST_RELEASE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const gitlabMrToggle = document.getElementById("gitlab-mr-toggle");
const restoreScrollOnReloadToggle = document.getElementById(
  "restore-scroll-on-reload-toggle",
);
const gitlabMrSettings = document.getElementById("gitlab-mr-settings");
const gitlabUrlInput = document.getElementById("gitlab-url");
const gitlabApiKeyInput = document.getElementById("gitlab-api-key");
const projectMapInput = document.getElementById("project-map");
const saveGitlabSettingsButton = document.getElementById(
  "save-gitlab-settings",
);
const status = document.getElementById("status");
const githubLink = document.getElementById("github-link");

function setStatus(message) {
  status.textContent = message;
  window.setTimeout(() => {
    if (status.textContent === message) {
      status.textContent = "";
    }
  }, 1500);
}

function normalizeReleaseTag(rawTag) {
  return String(rawTag || "")
    .trim()
    .toLowerCase();
}

function normalizeReleaseUrl(rawUrl) {
  return String(rawUrl || "").trim();
}

function renderGithubLinkUpdateState(isUpdateAvailable, latestReleaseUrl) {
  if (!githubLink) {
    return;
  }

  const targetUrl = isUpdateAvailable
    ? normalizeReleaseUrl(latestReleaseUrl) || GITHUB_RELEASES_URL
    : GITHUB_REPO_URL;

  githubLink.href = targetUrl;
  githubLink.classList.toggle("has-update", isUpdateAvailable);
  githubLink.setAttribute(
    "title",
    isUpdateAvailable
      ? "Open latest Bluemine release"
      : "Open Bluemine on GitHub",
  );
  githubLink.setAttribute(
    "aria-label",
    isUpdateAvailable
      ? "Open latest Bluemine release"
      : "Open Bluemine on GitHub",
  );
}

function getLocalStorage(values) {
  return new Promise((resolve) => {
    chrome.storage.local.get(values, resolve);
  });
}

function setLocalStorage(values) {
  return new Promise((resolve) => {
    chrome.storage.local.set(values, resolve);
  });
}

function hasFreshReleaseCache(cacheEntry) {
  const fetchedAt = Number(cacheEntry && cacheEntry.fetchedAt);
  if (!Number.isFinite(fetchedAt) || fetchedAt <= 0) {
    return false;
  }

  return Date.now() - fetchedAt < LATEST_RELEASE_CACHE_TTL_MS;
}

async function fetchLatestReleaseData() {
  const response = await fetch(GITHUB_LATEST_RELEASE_URL, {
    headers: { Accept: "application/vnd.github+json" },
  });
  if (!response.ok) {
    throw new Error(`GitHub API request failed (${response.status})`);
  }

  const releasePayload = await response.json();
  const tagName = String(releasePayload.tag_name || "").trim();
  if (!tagName) {
    throw new Error("Missing tag_name in GitHub release payload");
  }

  const releaseUrl = normalizeReleaseUrl(releasePayload.html_url);
  return {
    tagName,
    releaseUrl:
      releaseUrl ||
      `${GITHUB_REPO_URL}/releases/tag/${encodeURIComponent(tagName)}`,
  };
}

async function syncReleaseLinkState(
  latestTagName,
  latestReleaseUrl,
  lastSeenTag,
) {
  const normalizedLatestTag = normalizeReleaseTag(latestTagName);
  const normalizedLastSeenTag = normalizeReleaseTag(lastSeenTag);

  if (!normalizedLatestTag) {
    renderGithubLinkUpdateState(false, "");
    return normalizedLastSeenTag;
  }

  if (!normalizedLastSeenTag) {
    await setLocalStorage({ [RELEASE_LAST_SEEN_TAG_KEY]: normalizedLatestTag });
    renderGithubLinkUpdateState(false, latestReleaseUrl);
    return normalizedLatestTag;
  }

  renderGithubLinkUpdateState(
    normalizedLatestTag !== normalizedLastSeenTag,
    latestReleaseUrl,
  );
  return normalizedLastSeenTag;
}

async function loadLatestReleaseInfo() {
  renderGithubLinkUpdateState(false, "");

  const localResult = await getLocalStorage({
    [LATEST_RELEASE_CACHE_KEY]: null,
    [RELEASE_LAST_SEEN_TAG_KEY]: "",
  });
  const cachedRelease = localResult[LATEST_RELEASE_CACHE_KEY];
  const lastSeenTag = localResult[RELEASE_LAST_SEEN_TAG_KEY];
  const cachedTagName =
    cachedRelease && typeof cachedRelease.tagName === "string"
      ? cachedRelease.tagName.trim()
      : "";
  const cachedReleaseUrl =
    cachedRelease && typeof cachedRelease.releaseUrl === "string"
      ? cachedRelease.releaseUrl.trim()
      : "";

  if (cachedTagName && hasFreshReleaseCache(cachedRelease)) {
    await syncReleaseLinkState(cachedTagName, cachedReleaseUrl, lastSeenTag);
    return;
  }

  try {
    const latestRelease = await fetchLatestReleaseData();
    await setLocalStorage({
      [LATEST_RELEASE_CACHE_KEY]: {
        tagName: latestRelease.tagName,
        releaseUrl: latestRelease.releaseUrl,
        fetchedAt: Date.now(),
      },
    });
    await syncReleaseLinkState(
      latestRelease.tagName,
      latestRelease.releaseUrl,
      lastSeenTag,
    );
  } catch (error) {
    if (cachedTagName) {
      await syncReleaseLinkState(cachedTagName, cachedReleaseUrl, lastSeenTag);
    } else {
      renderGithubLinkUpdateState(false, "");
    }
    console.warn("Unable to fetch latest Bluemine release tag", error);
  }
}

function normalizeBaseUrl(raw) {
  const value = String(raw || "").trim();
  if (!value) {
    return "";
  }

  const parsed = new URL(value);
  const path =
    parsed.pathname === "/" ? "" : parsed.pathname.replace(/\/+$/, "");
  return `${parsed.origin}${path}`;
}

function parseProjectMap(rawMap) {
  const lines = String(rawMap || "").split(/\r?\n/);
  const validLines = [];
  let invalidLineCount = 0;

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      return;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) {
      invalidLineCount += 1;
      return;
    }

    const redmineProject = trimmed.slice(0, separatorIndex).trim();
    const gitlabProjectId = trimmed.slice(separatorIndex + 1).trim();
    if (!redmineProject || !gitlabProjectId) {
      invalidLineCount += 1;
      return;
    }

    validLines.push(`${redmineProject}=${gitlabProjectId}`);
  });

  return {
    normalizedMap: validLines.join("\n"),
    invalidLineCount,
  };
}

function setGitlabSettingsVisible(isVisible) {
  gitlabMrSettings.classList.toggle("is-hidden", !isVisible);
  gitlabMrSettings.setAttribute("aria-hidden", isVisible ? "false" : "true");
}

function reloadActiveTab() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const activeTab = tabs && tabs[0];
    if (!activeTab || typeof activeTab.id !== "number") {
      return;
    }

    chrome.tabs.reload(activeTab.id);
  });
}

function readSettings() {
  chrome.storage.sync.get(
    {
      [GITLAB_MR_FEATURE_KEY]: false,
      [RESTORE_SCROLL_ON_RELOAD_FEATURE_KEY]: false,
      [GITLAB_BASE_URL_KEY]: "",
      [GITLAB_API_KEY_KEY]: "",
      [GITLAB_PROJECT_MAP_KEY]: "",
    },
    (result) => {
      gitlabMrToggle.checked = Boolean(result[GITLAB_MR_FEATURE_KEY]);
      restoreScrollOnReloadToggle.checked = Boolean(
        result[RESTORE_SCROLL_ON_RELOAD_FEATURE_KEY],
      );
      setGitlabSettingsVisible(gitlabMrToggle.checked);
      gitlabUrlInput.value = result[GITLAB_BASE_URL_KEY] || "";
      gitlabApiKeyInput.value = result[GITLAB_API_KEY_KEY] || "";
      projectMapInput.value = result[GITLAB_PROJECT_MAP_KEY] || "";
    },
  );
}

function saveGitlabMrFeatureState(enabled) {
  chrome.storage.sync.get({ [GITLAB_MR_FEATURE_KEY]: false }, (result) => {
    const previous = Boolean(result[GITLAB_MR_FEATURE_KEY]);
    if (previous === enabled) {
      setStatus("No changes to save");
      return;
    }

    chrome.storage.sync.set({ [GITLAB_MR_FEATURE_KEY]: enabled }, () => {
      setStatus(
        enabled ? "GitLab MR status enabled" : "GitLab MR status disabled",
      );
      reloadActiveTab();
    });
  });
}

function saveRestoreScrollOnReloadState(enabled) {
  chrome.storage.sync.get(
    { [RESTORE_SCROLL_ON_RELOAD_FEATURE_KEY]: false },
    (result) => {
      const previous = Boolean(result[RESTORE_SCROLL_ON_RELOAD_FEATURE_KEY]);
      if (previous === enabled) {
        setStatus("No changes to save");
        return;
      }

      chrome.storage.sync.set(
        { [RESTORE_SCROLL_ON_RELOAD_FEATURE_KEY]: enabled },
        () => {
          setStatus(
            enabled
              ? "Scroll restore on reload enabled"
              : "Scroll restore on reload disabled",
          );
          reloadActiveTab();
        },
      );
    },
  );
}

function saveGitlabSettings() {
  try {
    const rawUrl = String(gitlabUrlInput.value || "").trim();
    const normalizedGitlabUrl = rawUrl ? normalizeBaseUrl(rawUrl) : "";
    const apiKey = String(gitlabApiKeyInput.value || "").trim();
    const { normalizedMap, invalidLineCount } = parseProjectMap(
      projectMapInput.value,
    );

    chrome.storage.sync.get(
      {
        [GITLAB_BASE_URL_KEY]: "",
        [GITLAB_API_KEY_KEY]: "",
        [GITLAB_PROJECT_MAP_KEY]: "",
      },
      (result) => {
        const previousUrl = String(result[GITLAB_BASE_URL_KEY] || "");
        const previousApiKey = String(result[GITLAB_API_KEY_KEY] || "");
        const previousMap = String(result[GITLAB_PROJECT_MAP_KEY] || "");

        const hasChanges =
          previousUrl !== normalizedGitlabUrl ||
          previousApiKey !== apiKey ||
          previousMap !== normalizedMap;

        if (!hasChanges) {
          if (invalidLineCount > 0) {
            setStatus(
              `No changes, ignored ${invalidLineCount} invalid line${invalidLineCount === 1 ? "" : "s"}`,
            );
            return;
          }
          setStatus("No changes to save");
          return;
        }

        chrome.storage.sync.set(
          {
            [GITLAB_BASE_URL_KEY]: normalizedGitlabUrl,
            [GITLAB_API_KEY_KEY]: apiKey,
            [GITLAB_PROJECT_MAP_KEY]: normalizedMap,
          },
          () => {
            gitlabUrlInput.value = normalizedGitlabUrl;
            gitlabApiKeyInput.value = apiKey;
            projectMapInput.value = normalizedMap;

            if (invalidLineCount > 0) {
              setStatus(
                `GitLab settings saved, ignored ${invalidLineCount} invalid line${invalidLineCount === 1 ? "" : "s"}`,
              );
              reloadActiveTab();
              return;
            }

            setStatus("GitLab settings saved");
            reloadActiveTab();
          },
        );
      },
    );
  } catch (_error) {
    setStatus("Invalid URL");
  }
}

gitlabMrToggle.addEventListener("change", (event) => {
  const enabled = Boolean(event.target.checked);
  setGitlabSettingsVisible(enabled);
  saveGitlabMrFeatureState(enabled);
});

restoreScrollOnReloadToggle.addEventListener("change", (event) => {
  saveRestoreScrollOnReloadState(Boolean(event.target.checked));
});

saveGitlabSettingsButton.addEventListener("click", saveGitlabSettings);

gitlabUrlInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    saveGitlabSettings();
  }
});

gitlabApiKeyInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    saveGitlabSettings();
  }
});

readSettings();
loadLatestReleaseInfo();
