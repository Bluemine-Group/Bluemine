const FEATURE_KEY = "feature.helloWorld.enabled";
const GITLAB_MR_FEATURE_KEY = "feature.gitlabMrStatus.enabled";
const ENHANCED_AGILE_BOARD_FEATURE_KEY = "feature.restoreScrollOnReload.enabled";
const GITLAB_BASE_URL_KEY = "settings.gitlabBaseUrl";
const GITLAB_API_KEY_KEY = "settings.gitlabApiKey";
const GITLAB_PROJECT_MAP_KEY = "settings.gitlabProjectMap";

const toggle = document.getElementById("hello-world-toggle");
const gitlabMrToggle = document.getElementById("gitlab-mr-toggle");
const restoreScrollOnReloadToggle = document.getElementById(
  "restore-scroll-on-reload-toggle",
);
const gitlabMrSettings = document.getElementById("gitlab-mr-settings");
const gitlabUrlInput = document.getElementById("gitlab-url");
const gitlabApiKeyInput = document.getElementById("gitlab-api-key");
const projectMapInput = document.getElementById("project-map");
const saveGitlabSettingsButton = document.getElementById("save-gitlab-settings");
const status = document.getElementById("status");

function setStatus(message) {
  status.textContent = message;
  window.setTimeout(() => {
    if (status.textContent === message) {
      status.textContent = "";
    }
  }, 1500);
}

function normalizeBaseUrl(raw) {
  const value = String(raw || "").trim();
  if (!value) {
    return "";
  }

  const parsed = new URL(value);
  const path = parsed.pathname === "/" ? "" : parsed.pathname.replace(/\/+$/, "");
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
    invalidLineCount
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
      [FEATURE_KEY]: false,
      [GITLAB_MR_FEATURE_KEY]: false,
      [ENHANCED_AGILE_BOARD_FEATURE_KEY]: false,
      [GITLAB_BASE_URL_KEY]: "",
      [GITLAB_API_KEY_KEY]: "",
      [GITLAB_PROJECT_MAP_KEY]: ""
    },
    (result) => {
      toggle.checked = Boolean(result[FEATURE_KEY]);
      gitlabMrToggle.checked = Boolean(result[GITLAB_MR_FEATURE_KEY]);
      restoreScrollOnReloadToggle.checked = Boolean(
        result[ENHANCED_AGILE_BOARD_FEATURE_KEY],
      );
      setGitlabSettingsVisible(gitlabMrToggle.checked);
      gitlabUrlInput.value = result[GITLAB_BASE_URL_KEY] || "";
      gitlabApiKeyInput.value = result[GITLAB_API_KEY_KEY] || "";
      projectMapInput.value = result[GITLAB_PROJECT_MAP_KEY] || "";
    }
  );
}

function saveFeatureState(enabled) {
  chrome.storage.sync.get({ [FEATURE_KEY]: false }, (result) => {
    const previous = Boolean(result[FEATURE_KEY]);
    if (previous === enabled) {
      setStatus("No changes to save");
      return;
    }

    chrome.storage.sync.set({ [FEATURE_KEY]: enabled }, () => {
      setStatus("Saved");
      reloadActiveTab();
    });
  });
}

function saveGitlabMrFeatureState(enabled) {
  chrome.storage.sync.get({ [GITLAB_MR_FEATURE_KEY]: false }, (result) => {
    const previous = Boolean(result[GITLAB_MR_FEATURE_KEY]);
    if (previous === enabled) {
      setStatus("No changes to save");
      return;
    }

    chrome.storage.sync.set({ [GITLAB_MR_FEATURE_KEY]: enabled }, () => {
      setStatus(enabled ? "GitLab MR status enabled" : "GitLab MR status disabled");
      reloadActiveTab();
    });
  });
}

function saveRestoreScrollOnReloadState(enabled) {
  chrome.storage.sync.get(
    { [ENHANCED_AGILE_BOARD_FEATURE_KEY]: false },
    (result) => {
      const previous = Boolean(result[ENHANCED_AGILE_BOARD_FEATURE_KEY]);
      if (previous === enabled) {
        setStatus("No changes to save");
        return;
      }

      chrome.storage.sync.set(
        { [ENHANCED_AGILE_BOARD_FEATURE_KEY]: enabled },
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
    const { normalizedMap, invalidLineCount } = parseProjectMap(projectMapInput.value);

    chrome.storage.sync.get(
      {
        [GITLAB_BASE_URL_KEY]: "",
        [GITLAB_API_KEY_KEY]: "",
        [GITLAB_PROJECT_MAP_KEY]: ""
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
            setStatus(`No changes, ignored ${invalidLineCount} invalid line${invalidLineCount === 1 ? "" : "s"}`);
            return;
          }
          setStatus("No changes to save");
          return;
        }

        chrome.storage.sync.set(
          {
            [GITLAB_BASE_URL_KEY]: normalizedGitlabUrl,
            [GITLAB_API_KEY_KEY]: apiKey,
            [GITLAB_PROJECT_MAP_KEY]: normalizedMap
          },
          () => {
            gitlabUrlInput.value = normalizedGitlabUrl;
            gitlabApiKeyInput.value = apiKey;
            projectMapInput.value = normalizedMap;

            if (invalidLineCount > 0) {
              setStatus(`GitLab settings saved, ignored ${invalidLineCount} invalid line${invalidLineCount === 1 ? "" : "s"}`);
              reloadActiveTab();
              return;
            }

            setStatus("GitLab settings saved");
            reloadActiveTab();
          }
        );
      }
    );
  } catch (_error) {
    setStatus("Invalid URL");
  }
}

toggle.addEventListener("change", (event) => {
  saveFeatureState(event.target.checked);
});

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
