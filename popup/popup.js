/* global browserAPI */

const GITLAB_MR_FEATURE_KEY = "feature.gitlabMrStatus.enabled";
const ENHANCED_AGILE_BOARD_FEATURE_KEY =
  "feature.restoreScrollOnReload.enabled";
const ENHANCED_ISSUE_EDIT_PAGE_FEATURE_KEY =
  "feature.enhancedIssueEditPage.enabled";
const SHIFT_HOVER_SELECTION_FEATURE_KEY = "feature.shiftHoverSelection.enabled";
const COMMAND_PALETTE_FEATURE_KEY = "feature.commandPalette.enabled";
const COMMAND_PALETTE_ID_SEPARATOR_KEY = "settings.commandPalette.idSeparator";
const FIX_WITH_AUTOFIX_FEATURE_KEY = "feature.fixWithAutofix.enabled";
const START_CLAUDE_FEATURE_KEY = "feature.startClaude.enabled";
const START_CLAUDE_PROMPT_PREFIX_KEY = "settings.startClaude.promptPrefix";
const START_CLAUDE_PROJECT_PATH_MAP_KEY = "settings.startClaude.projectPathMap";
const GITLAB_BASE_URL_KEY = "settings.gitlabBaseUrl";
const GITLAB_API_KEY_KEY = "settings.gitlabApiKey";
const GITLAB_PROJECT_MAP_KEY = "settings.gitlabProjectMap";
const CLAUDE_DISPATCH_PIPELINE_EXECUTION_URL_KEY =
  "settings.claudeDispatch.pipelineExecutionUrl";
const CLAUDE_DISPATCH_TRIGGER_TOKEN_KEY =
  "settings.claudeDispatch.triggerToken";
const GITHUB_REPO_URL = "https://github.com/Bluemine-Group/Bluemine";
const GITHUB_RELEASES_URL = `${GITHUB_REPO_URL}/releases`;
const GITHUB_LATEST_RELEASE_URL =
  "https://api.github.com/repos/Bluemine-Group/bluemine/releases/latest";
const LATEST_RELEASE_CACHE_KEY = "cache.githubLatestRelease";
const RELEASE_LAST_SEEN_TAG_KEY = "release.lastSeenTag";

const gitlabMrToggle = document.getElementById("gitlab-mr-toggle");
const restoreScrollOnReloadToggle = document.getElementById(
  "restore-scroll-on-reload-toggle",
);
const enhancedIssueEditPageToggle = document.getElementById(
  "enhanced-issue-edit-page-toggle",
);
const shiftHoverSelectionToggle = document.getElementById(
  "shift-hover-selection-toggle",
);
const commandPaletteToggle = document.getElementById("command-palette-toggle");
const commandPaletteSettings = document.getElementById(
  "command-palette-settings",
);
const commandPaletteSeparatorInput = document.getElementById(
  "command-palette-separator",
);
const startClaudeToggle = document.getElementById("start-claude-toggle");
const startClaudeSettings = document.getElementById("start-claude-settings");
const startClaudePathMapInput = document.getElementById(
  "start-claude-path-map",
);
const startClaudePromptPrefixInput = document.getElementById(
  "start-claude-prompt-prefix",
);
const saveStartClaudeSettingsButton = document.getElementById(
  "save-start-claude-settings",
);
const startClaudeStatus = document.getElementById("start-claude-status");
const autofixToggle = document.getElementById("autofix-toggle");
const autofixSettings = document.getElementById("autofix-settings");
const gitlabMrSettings = document.getElementById("gitlab-mr-settings");
const gitlabUrlInput = document.getElementById("gitlab-url");
const gitlabApiKeyInput = document.getElementById("gitlab-api-key");
const projectMapInput = document.getElementById("project-map");
const saveGitlabSettingsButton = document.getElementById(
  "save-gitlab-settings",
);
const autofixPipelineUrlInput = document.getElementById("autofix-pipeline-url");
const autofixTriggerTokenInput = document.getElementById(
  "autofix-trigger-token",
);
const saveAutofixSettingsButton = document.getElementById(
  "save-autofix-settings",
);
const status = document.getElementById("status");
const autofixStatus = document.getElementById("autofix-status");
const githubLink = document.getElementById("github-link");

function setTimedStatus(statusElement, message) {
  statusElement.textContent = message;
  window.setTimeout(() => {
    if (statusElement.textContent === message) {
      statusElement.textContent = "";
    }
  }, 1500);
}

function setStatus(message) {
  setTimedStatus(status, message);
}

function setAutofixStatus(message) {
  setTimedStatus(autofixStatus, message);
}

function setStartClaudeStatus(message) {
  setTimedStatus(startClaudeStatus, message);
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
    browserAPI.storage.local.get(values, resolve);
  });
}

function setLocalStorage(values) {
  return new Promise((resolve) => {
    browserAPI.storage.local.set(values, resolve);
  });
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

function normalizePipelineExecutionUrl(raw) {
  const value = String(raw || "").trim();
  if (!value) {
    return "";
  }

  const parsed = new URL(value);
  parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  parsed.hash = "";
  return parsed.toString();
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

function resolveAutofixEnabled(settings) {
  const explicitValue = settings[FIX_WITH_AUTOFIX_FEATURE_KEY];
  if (typeof explicitValue === "boolean") {
    return explicitValue;
  }

  return Boolean(
    String(settings[CLAUDE_DISPATCH_PIPELINE_EXECUTION_URL_KEY] || "").trim() &&
    String(settings[CLAUDE_DISPATCH_TRIGGER_TOKEN_KEY] || "").trim(),
  );
}

function setGitlabSettingsVisible(isVisible) {
  gitlabMrSettings.classList.toggle("is-hidden", !isVisible);
  gitlabMrSettings.setAttribute("aria-hidden", isVisible ? "false" : "true");
}

function setCommandPaletteSettingsVisible(isVisible) {
  commandPaletteSettings.classList.toggle("is-hidden", !isVisible);
  commandPaletteSettings.setAttribute(
    "aria-hidden",
    isVisible ? "false" : "true",
  );
}

function setStartClaudeSettingsVisible(isVisible) {
  startClaudeSettings.classList.toggle("is-hidden", !isVisible);
  startClaudeSettings.setAttribute("aria-hidden", isVisible ? "false" : "true");
}

function setAutofixSettingsVisible(isVisible) {
  autofixSettings.classList.toggle("is-hidden", !isVisible);
  autofixSettings.setAttribute("aria-hidden", isVisible ? "false" : "true");
}

function reloadActiveTab() {
  browserAPI.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const activeTab = tabs && tabs[0];
    if (!activeTab || typeof activeTab.id !== "number") {
      return;
    }

    browserAPI.tabs.reload(activeTab.id);
  });
}

function readSettings() {
  browserAPI.storage.local.get(
    {
      [GITLAB_MR_FEATURE_KEY]: false,
      [ENHANCED_AGILE_BOARD_FEATURE_KEY]: false,
      [ENHANCED_ISSUE_EDIT_PAGE_FEATURE_KEY]: false,
      [SHIFT_HOVER_SELECTION_FEATURE_KEY]: false,
      [COMMAND_PALETTE_FEATURE_KEY]: false,
      [COMMAND_PALETTE_ID_SEPARATOR_KEY]: "",
      [FIX_WITH_AUTOFIX_FEATURE_KEY]: null,
      [START_CLAUDE_FEATURE_KEY]: false,
      [START_CLAUDE_PROMPT_PREFIX_KEY]: "",
      [START_CLAUDE_PROJECT_PATH_MAP_KEY]: "",
      [GITLAB_BASE_URL_KEY]: "",
      [GITLAB_API_KEY_KEY]: "",
      [GITLAB_PROJECT_MAP_KEY]: "",
      [CLAUDE_DISPATCH_PIPELINE_EXECUTION_URL_KEY]: "",
      [CLAUDE_DISPATCH_TRIGGER_TOKEN_KEY]: "",
    },
    (result) => {
      gitlabMrToggle.checked = Boolean(result[GITLAB_MR_FEATURE_KEY]);
      restoreScrollOnReloadToggle.checked = Boolean(
        result[ENHANCED_AGILE_BOARD_FEATURE_KEY],
      );
      enhancedIssueEditPageToggle.checked = Boolean(
        result[ENHANCED_ISSUE_EDIT_PAGE_FEATURE_KEY],
      );
      shiftHoverSelectionToggle.checked = Boolean(
        result[SHIFT_HOVER_SELECTION_FEATURE_KEY],
      );
      commandPaletteToggle.checked = Boolean(
        result[COMMAND_PALETTE_FEATURE_KEY],
      );
      commandPaletteSeparatorInput.value =
        result[COMMAND_PALETTE_ID_SEPARATOR_KEY] || "";
      autofixToggle.checked = resolveAutofixEnabled(result);
      startClaudeToggle.checked = Boolean(result[START_CLAUDE_FEATURE_KEY]);
      startClaudePathMapInput.value =
        result[START_CLAUDE_PROJECT_PATH_MAP_KEY] || "";
      startClaudePromptPrefixInput.value =
        result[START_CLAUDE_PROMPT_PREFIX_KEY] || "";
      setGitlabSettingsVisible(gitlabMrToggle.checked);
      setCommandPaletteSettingsVisible(commandPaletteToggle.checked);
      setStartClaudeSettingsVisible(startClaudeToggle.checked);
      setAutofixSettingsVisible(autofixToggle.checked);
      gitlabUrlInput.value = result[GITLAB_BASE_URL_KEY] || "";
      gitlabApiKeyInput.value = result[GITLAB_API_KEY_KEY] || "";
      projectMapInput.value = result[GITLAB_PROJECT_MAP_KEY] || "";
      autofixPipelineUrlInput.value =
        result[CLAUDE_DISPATCH_PIPELINE_EXECUTION_URL_KEY] || "";
      autofixTriggerTokenInput.value =
        result[CLAUDE_DISPATCH_TRIGGER_TOKEN_KEY] || "";
    },
  );
}

function saveGitlabMrFeatureState(enabled) {
  browserAPI.storage.local.get({ [GITLAB_MR_FEATURE_KEY]: false }, (result) => {
    const previous = Boolean(result[GITLAB_MR_FEATURE_KEY]);
    if (previous === enabled) {
      return;
    }

    browserAPI.storage.local.set(
      { [GITLAB_MR_FEATURE_KEY]: enabled },
      reloadActiveTab,
    );
  });
}

function saveRestoreScrollOnReloadState(enabled) {
  browserAPI.storage.local.get(
    { [ENHANCED_AGILE_BOARD_FEATURE_KEY]: false },
    (result) => {
      const previous = Boolean(result[ENHANCED_AGILE_BOARD_FEATURE_KEY]);
      if (previous === enabled) {
        return;
      }

      browserAPI.storage.local.set(
        { [ENHANCED_AGILE_BOARD_FEATURE_KEY]: enabled },
        reloadActiveTab,
      );
    },
  );
}

function saveEnhancedIssueEditPageState(enabled) {
  browserAPI.storage.local.get(
    { [ENHANCED_ISSUE_EDIT_PAGE_FEATURE_KEY]: false },
    (result) => {
      const previous = Boolean(result[ENHANCED_ISSUE_EDIT_PAGE_FEATURE_KEY]);
      if (previous === enabled) {
        return;
      }

      browserAPI.storage.local.set(
        { [ENHANCED_ISSUE_EDIT_PAGE_FEATURE_KEY]: enabled },
        reloadActiveTab,
      );
    },
  );
}

function saveShiftHoverSelectionState(enabled) {
  browserAPI.storage.local.get(
    { [SHIFT_HOVER_SELECTION_FEATURE_KEY]: false },
    (result) => {
      const previous = Boolean(result[SHIFT_HOVER_SELECTION_FEATURE_KEY]);
      if (previous === enabled) {
        return;
      }

      browserAPI.storage.local.set(
        { [SHIFT_HOVER_SELECTION_FEATURE_KEY]: enabled },
        reloadActiveTab,
      );
    },
  );
}

function saveCommandPaletteState(enabled) {
  browserAPI.storage.local.get(
    { [COMMAND_PALETTE_FEATURE_KEY]: false },
    (result) => {
      const previous = Boolean(result[COMMAND_PALETTE_FEATURE_KEY]);
      if (previous === enabled) {
        return;
      }

      browserAPI.storage.local.set(
        { [COMMAND_PALETTE_FEATURE_KEY]: enabled },
        reloadActiveTab,
      );
    },
  );
}

function saveCommandPaletteSeparator() {
  const value = String(commandPaletteSeparatorInput.value);
  browserAPI.storage.local.set({ [COMMAND_PALETTE_ID_SEPARATOR_KEY]: value });
}

function saveStartClaudeState(enabled) {
  browserAPI.storage.local.get(
    { [START_CLAUDE_FEATURE_KEY]: false },
    (result) => {
      const previous = Boolean(result[START_CLAUDE_FEATURE_KEY]);
      if (previous === enabled) {
        return;
      }

      browserAPI.storage.local.set(
        { [START_CLAUDE_FEATURE_KEY]: enabled },
        reloadActiveTab,
      );
    },
  );
}

function saveAutofixState(enabled) {
  browserAPI.storage.local.get(
    { [FIX_WITH_AUTOFIX_FEATURE_KEY]: null },
    (result) => {
      const previous = result[FIX_WITH_AUTOFIX_FEATURE_KEY];
      if (typeof previous === "boolean" && previous === enabled) {
        return;
      }

      browserAPI.storage.local.set(
        { [FIX_WITH_AUTOFIX_FEATURE_KEY]: enabled },
        reloadActiveTab,
      );
    },
  );
}

function saveStartClaudeSettings() {
  const promptPrefix = String(startClaudePromptPrefixInput.value || "").trim();
  const { normalizedMap, invalidLineCount } = parseProjectMap(
    startClaudePathMapInput.value,
  );

  browserAPI.storage.local.get(
    {
      [START_CLAUDE_PROJECT_PATH_MAP_KEY]: "",
      [START_CLAUDE_PROMPT_PREFIX_KEY]: "",
    },
    (result) => {
      const previousMap = String(
        result[START_CLAUDE_PROJECT_PATH_MAP_KEY] || "",
      );
      const previousPrefix = String(
        result[START_CLAUDE_PROMPT_PREFIX_KEY] || "",
      );
      const hasChanges =
        previousMap !== normalizedMap || previousPrefix !== promptPrefix;

      if (!hasChanges) {
        if (invalidLineCount > 0) {
          setStartClaudeStatus(
            `No changes, ignored ${invalidLineCount} invalid line${invalidLineCount === 1 ? "" : "s"}`,
          );
          return;
        }
        setStartClaudeStatus("No changes to save");
        return;
      }

      // The content script reads these once at start-up, so reload the active
      // tab to apply the new values.
      browserAPI.storage.local.set(
        {
          [START_CLAUDE_PROJECT_PATH_MAP_KEY]: normalizedMap,
          [START_CLAUDE_PROMPT_PREFIX_KEY]: promptPrefix,
        },
        () => {
          startClaudePathMapInput.value = normalizedMap;
          startClaudePromptPrefixInput.value = promptPrefix;
          if (invalidLineCount > 0) {
            setStartClaudeStatus(
              `Start Claude Code settings saved, ignored ${invalidLineCount} invalid line${invalidLineCount === 1 ? "" : "s"}`,
            );
          } else {
            setStartClaudeStatus("Start Claude Code settings saved");
          }
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

    browserAPI.storage.local.get(
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

        browserAPI.storage.local.set(
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

function saveAutofixSettings() {
  try {
    const normalizedPipelineExecutionUrl = normalizePipelineExecutionUrl(
      autofixPipelineUrlInput.value,
    );
    const triggerToken = String(autofixTriggerTokenInput.value || "").trim();

    browserAPI.storage.local.get(
      {
        [CLAUDE_DISPATCH_PIPELINE_EXECUTION_URL_KEY]: "",
        [CLAUDE_DISPATCH_TRIGGER_TOKEN_KEY]: "",
      },
      (result) => {
        const previousUrl = String(
          result[CLAUDE_DISPATCH_PIPELINE_EXECUTION_URL_KEY] || "",
        );
        const previousTriggerToken = String(
          result[CLAUDE_DISPATCH_TRIGGER_TOKEN_KEY] || "",
        );

        const hasChanges =
          previousUrl !== normalizedPipelineExecutionUrl ||
          previousTriggerToken !== triggerToken;

        if (!hasChanges) {
          setAutofixStatus("No changes to save");
          return;
        }

        browserAPI.storage.local.set(
          {
            [CLAUDE_DISPATCH_PIPELINE_EXECUTION_URL_KEY]:
              normalizedPipelineExecutionUrl,
            [CLAUDE_DISPATCH_TRIGGER_TOKEN_KEY]: triggerToken,
          },
          () => {
            autofixPipelineUrlInput.value = normalizedPipelineExecutionUrl;
            autofixTriggerTokenInput.value = triggerToken;

            setAutofixStatus("Autofix settings saved");
            reloadActiveTab();
          },
        );
      },
    );
  } catch (_error) {
    setAutofixStatus("Invalid URL");
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

enhancedIssueEditPageToggle.addEventListener("change", (event) => {
  saveEnhancedIssueEditPageState(Boolean(event.target.checked));
});

shiftHoverSelectionToggle.addEventListener("change", (event) => {
  saveShiftHoverSelectionState(Boolean(event.target.checked));
});

commandPaletteToggle.addEventListener("change", (event) => {
  const enabled = Boolean(event.target.checked);
  setCommandPaletteSettingsVisible(enabled);
  saveCommandPaletteState(enabled);
});

commandPaletteSeparatorInput.addEventListener(
  "change",
  saveCommandPaletteSeparator,
);

startClaudeToggle.addEventListener("change", (event) => {
  const enabled = Boolean(event.target.checked);
  setStartClaudeSettingsVisible(enabled);
  saveStartClaudeState(enabled);
});

autofixToggle.addEventListener("change", (event) => {
  const enabled = Boolean(event.target.checked);
  setAutofixSettingsVisible(enabled);
  saveAutofixState(enabled);
});

saveStartClaudeSettingsButton.addEventListener(
  "click",
  saveStartClaudeSettings,
);

saveGitlabSettingsButton.addEventListener("click", saveGitlabSettings);
saveAutofixSettingsButton.addEventListener("click", saveAutofixSettings);

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

[autofixPipelineUrlInput, autofixTriggerTokenInput].forEach((input) => {
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      saveAutofixSettings();
    }
  });
});

readSettings();
loadLatestReleaseInfo();
