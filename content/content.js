const FEATURE_KEY = "feature.helloWorld.enabled";
const REDMINE_URL_KEY = "settings.redmineBaseUrl";

function normalizeBaseUrl(raw) {
  const value = String(raw || "").trim();
  if (!value) {
    return "";
  }

  const parsed = new URL(value);
  const path = parsed.pathname === "/" ? "" : parsed.pathname.replace(/\/+$/, "");
  return `${parsed.origin}${path}`;
}

function isConfiguredRedmineUrlMatch(configuredBaseUrl) {
  if (!configuredBaseUrl) {
    return false;
  }

  try {
    const current = new URL(window.location.href);
    const currentBase = `${current.origin}${current.pathname.replace(/\/+$/, "")}`;

    return (
      currentBase === configuredBaseUrl ||
      currentBase.startsWith(`${configuredBaseUrl}/`)
    );
  } catch (_error) {
    return false;
  }
}

function runHelloWorldFeature() {
  console.info("[Bluemine] Hello World improvement is active on this configured site.");
}

chrome.storage.sync.get(
  { [FEATURE_KEY]: false, [REDMINE_URL_KEY]: "" },
  (result) => {
    const configuredBaseUrl = normalizeBaseUrl(result[REDMINE_URL_KEY]);
    if (!isConfiguredRedmineUrlMatch(configuredBaseUrl)) {
      return;
    }

    if (result[FEATURE_KEY]) {
      runHelloWorldFeature();
    }
  }
);
