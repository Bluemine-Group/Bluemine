const FEATURE_KEY = "feature.helloWorld.enabled";
const REDMINE_URL_KEY = "settings.redmineBaseUrl";

const toggle = document.getElementById("hello-world-toggle");
const redmineUrlInput = document.getElementById("redmine-url");
const saveRedmineUrlButton = document.getElementById("save-redmine-url");
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

function readSettings() {
  chrome.storage.sync.get({ [FEATURE_KEY]: false, [REDMINE_URL_KEY]: "" }, (result) => {
    toggle.checked = Boolean(result[FEATURE_KEY]);
    redmineUrlInput.value = result[REDMINE_URL_KEY] || "";
  });
}

function saveFeatureState(enabled) {
  chrome.storage.sync.set({ [FEATURE_KEY]: enabled }, () => {
    setStatus("Saved");
  });
}

function saveRedmineUrl() {
  try {
    const normalized = normalizeBaseUrl(redmineUrlInput.value);
    if (!normalized) {
      setStatus("Enter a valid URL");
      return;
    }

    chrome.storage.sync.set({ [REDMINE_URL_KEY]: normalized }, () => {
      redmineUrlInput.value = normalized;
      setStatus("Redmine URL saved");
    });
  } catch (_error) {
    setStatus("Invalid URL");
  }
}

toggle.addEventListener("change", (event) => {
  saveFeatureState(event.target.checked);
});

saveRedmineUrlButton.addEventListener("click", saveRedmineUrl);

redmineUrlInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    saveRedmineUrl();
  }
});

readSettings();
