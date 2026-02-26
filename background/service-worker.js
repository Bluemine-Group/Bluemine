if (typeof importScripts === "function" && typeof browserAPI === "undefined") {
  importScripts("../lib/browser-polyfill.js");
}

const RELEASE_LAST_SEEN_TAG_KEY = "release.lastSeenTag";
const EXTENSION_LIFECYCLE_META_KEY = "meta.extensionLifecycle";

browserAPI.runtime.onInstalled.addListener((details) => {
  const installedAt = Date.now();

  browserAPI.storage.local.get({ [EXTENSION_LIFECYCLE_META_KEY]: {} }, (result) => {
    const previousMeta =
      result &&
      result[EXTENSION_LIFECYCLE_META_KEY] &&
      typeof result[EXTENSION_LIFECYCLE_META_KEY] === "object"
        ? result[EXTENSION_LIFECYCLE_META_KEY]
        : {};
    const previousInstallEpoch = Number(previousMeta.installEpoch);
    const nextMeta = {
      installEpoch:
        Number.isFinite(previousInstallEpoch) && previousInstallEpoch > 0
          ? previousInstallEpoch
          : installedAt,
      lastEventReason: String(details?.reason || "install"),
      lastEventEpoch: installedAt
    };

    if (details?.reason === "install") {
      nextMeta.installEpoch = installedAt;
      nextMeta.previousVersion = "";
    }

    if (details?.reason === "update") {
      nextMeta.lastUpdateEpoch = installedAt;
      nextMeta.previousVersion = String(details?.previousVersion || "").trim();
    }

    browserAPI.storage.local.set({
      [EXTENSION_LIFECYCLE_META_KEY]: nextMeta,
      [RELEASE_LAST_SEEN_TAG_KEY]: ""
    });

    console.log(`[Bluemine] Extension ${nextMeta.lastEventReason}`);
  });
});

const GITLAB_BASE_URL_KEY = "settings.gitlabBaseUrl";
const GITLAB_API_KEY_KEY = "settings.gitlabApiKey";
const GITLAB_PROJECT_MAP_KEY = "settings.gitlabProjectMap";
const GITLAB_MR_FEATURE_KEY = "feature.gitlabMrStatus.enabled";
const GITLAB_MR_CACHE_KEY = "cache.gitlabMergeRequests.v1";
const GITLAB_AVATAR_CACHE_KEY = "cache.gitlabAssigneeAvatars.v1";
const GITLAB_ASSIGNEE_NAME_CACHE_KEY = "cache.gitlabAssigneeNameAvatars.v1";
const GITLAB_AVATAR_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MR_TITLE_PREFIX_REGEX = /^(\d{5}(?:\s*[^\d\s]\s*\d{5})*) - /;
const redmineTabDetection = new Map();

function createGitlabRequestMetrics() {
  return {
    startedAtMs: Date.now(),
    apiRequestCount: 0,
    avatarRequestCount: 0,
    requestUrls: [],
  };
}

function buildGitlabRequestMetrics(metrics) {
  const apiRequestCount = Number(metrics?.apiRequestCount || 0);
  const avatarRequestCount = Number(metrics?.avatarRequestCount || 0);
  const requestUrls = Array.isArray(metrics?.requestUrls)
    ? metrics.requestUrls.map((url) => String(url || "")).filter(Boolean)
    : [];
  return {
    apiRequestCount,
    avatarRequestCount,
    requestCount: apiRequestCount + avatarRequestCount,
    durationMs: Math.max(0, Date.now() - Number(metrics?.startedAtMs || Date.now())),
    requestUrls,
  };
}

browserAPI.tabs.onRemoved.addListener((tabId) => {
  redmineTabDetection.delete(tabId);
});

browserAPI.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "BLUEMINE_PING") {
    sendResponse({ ok: true, source: "background" });
    return;
  }

  if (message?.type === "BLUEMINE_REGISTER_REDMINE_TAB") {
    const tabId = Number(_sender?.tab?.id);
    if (Number.isInteger(tabId) && tabId >= 0) {
      redmineTabDetection.set(tabId, Boolean(message.isRedmine));
    }
    sendResponse({ ok: true });
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

  if (message?.type === "BLUEMINE_IS_GITLAB_PROJECT_READY") {
    const redmineProjectName = String(message.redmineProjectName || "").trim();
    if (!redmineProjectName) {
      sendResponse({ ok: true, isReady: false });
      return;
    }

    getGitlabProjectSettings(redmineProjectName)
      .then((projectSettings) => {
        sendResponse({ ok: true, isReady: Boolean(projectSettings) });
      })
      .catch((_error) => {
        sendResponse({ ok: true, isReady: false });
      });

    return true;
  }

  if (message?.type === "BLUEMINE_FETCH_GITLAB_MRS") {
    const redmineProjectName = String(message.redmineProjectName || "").trim();
    const issueIds = Array.isArray(message.issueIds)
      ? message.issueIds.map((issueId) => String(issueId || "").trim()).filter(Boolean)
      : [];
    const cacheOnly = Boolean(message.cacheOnly);
    const boardCacheKey = String(message.boardCacheKey || "").trim();
    const metrics = createGitlabRequestMetrics();
    if (!redmineProjectName) {
      sendResponse({ ok: false, error: "Missing redmine project name" });
      return;
    }

    fetchGitlabMergeRequestsForRedmineProject(
      redmineProjectName,
      issueIds,
      { cacheOnly, boardCacheKey, metrics },
    )
      .then((mergeRequests) => {
        sendResponse({
          ok: true,
          mergeRequests,
          requestMetrics: buildGitlabRequestMetrics(metrics),
        });
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

  if (message?.type === "BLUEMINE_FETCH_GITLAB_ASSIGNEE_AVATARS") {
    const redmineProjectName = String(message.redmineProjectName || "").trim();
    const assigneeNames = Array.isArray(message.assigneeNames)
      ? message.assigneeNames.map((name) => String(name || "").trim()).filter(Boolean)
      : [];
    const cacheOnly = Boolean(message.cacheOnly);
    const metrics = createGitlabRequestMetrics();
    if (!redmineProjectName) {
      sendResponse({ ok: false, error: "Missing redmine project name" });
      return;
    }

    if (assigneeNames.length === 0) {
      sendResponse({ ok: true, avatarsByName: {} });
      return;
    }

    fetchGitlabAssigneeAvatarsForRedmineProject(
      redmineProjectName,
      assigneeNames,
      { cacheOnly, metrics },
    )
      .then((avatarsByName) => {
        sendResponse({
          ok: true,
          avatarsByName,
          requestMetrics: buildGitlabRequestMetrics(metrics),
        });
      })
      .catch((error) => {
        sendResponse({
          ok: false,
          error: error.message || "GitLab avatar request failed",
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

function getSettings(defaults) {
  return new Promise((resolve) => {
    browserAPI.storage.local.get(defaults, (result) => resolve(result));
  });
}

function getLocalSettings(defaults) {
  return new Promise((resolve) => {
    browserAPI.storage.local.get(defaults, (result) => resolve(result));
  });
}

function setLocalSettings(values) {
  return new Promise((resolve) => {
    browserAPI.storage.local.set(values, () => resolve());
  });
}

function normalizeGitlabBaseUrl(gitlabBaseUrl) {
  try {
    const parsed = new URL(gitlabBaseUrl);
    const path = parsed.pathname === "/" ? "" : parsed.pathname.replace(/\/+$/, "");
    return `${parsed.origin}${path}`;
  } catch (_error) {
    const invalidUrlError = new Error("Invalid GitLab base URL");
    invalidUrlError.status = 400;
    throw invalidUrlError;
  }
}

async function getGitlabProjectSettings(redmineProjectName) {
  const settings = await getSettings({
    [GITLAB_MR_FEATURE_KEY]: false,
    [GITLAB_BASE_URL_KEY]: "",
    [GITLAB_API_KEY_KEY]: "",
    [GITLAB_PROJECT_MAP_KEY]: ""
  });

  if (!settings[GITLAB_MR_FEATURE_KEY]) {
    return null;
  }

  const gitlabBaseUrl = String(settings[GITLAB_BASE_URL_KEY] || "").trim();
  const apiKey = String(settings[GITLAB_API_KEY_KEY] || "").trim();
  const projectMap = parseProjectMap(settings[GITLAB_PROJECT_MAP_KEY]);
  const gitlabProjectId = String(projectMap[redmineProjectName] || "").trim();
  if (!gitlabBaseUrl || !apiKey || !gitlabProjectId) {
    return null;
  }

  return {
    normalizedBaseUrl: normalizeGitlabBaseUrl(gitlabBaseUrl),
    apiKey,
    gitlabProjectId
  };
}

async function fetchGitlabMergeRequestsForRedmineProject(
  redmineProjectName,
  issueIds,
  options = {},
) {
  const issueIdSet = normalizeIssueIds(issueIds);
  const cacheOnly = Boolean(options.cacheOnly);
  const boardCacheKey = normalizeBoardCacheKey(
    options.boardCacheKey,
    redmineProjectName,
  );
  const projectSettings = await getGitlabProjectSettings(redmineProjectName);
  if (!projectSettings) {
    return [];
  }

  const mrCacheScopeKey = getMergeRequestCacheScopeKey(
    projectSettings.normalizedBaseUrl,
    projectSettings.gitlabProjectId,
    boardCacheKey,
  );
  if (cacheOnly) {
    return getCachedGitlabMergeRequests(mrCacheScopeKey, issueIdSet);
  }

  const mergeRequests = await fetchGitlabMergeRequests(
    projectSettings.normalizedBaseUrl,
    projectSettings.gitlabProjectId,
    projectSettings.apiKey,
    issueIdSet,
    options,
  );
  await setCachedGitlabMergeRequests(mrCacheScopeKey, mergeRequests, issueIdSet);
  return mergeRequests;
}

function normalizeIssueIds(issueIds) {
  if (!Array.isArray(issueIds)) {
    return new Set();
  }

  return new Set(
    issueIds
      .map((issueId) => String(issueId || "").trim())
      .filter((issueId) => /^\d+$/.test(issueId)),
  );
}

function normalizeIssueIdArray(issueIds) {
  if (!Array.isArray(issueIds)) {
    return [];
  }

  return [...new Set(
    issueIds
      .map((issueId) => String(issueId || "").trim())
      .filter((issueId) => /^\d+$/.test(issueId)),
  )];
}

function normalizeBoardCacheKey(rawBoardCacheKey, redmineProjectName) {
  const normalizedBoardCacheKey = String(rawBoardCacheKey || "").trim();
  if (!normalizedBoardCacheKey) {
    return `project:${String(redmineProjectName || "").trim()}`;
  }

  return normalizedBoardCacheKey.slice(0, 1000);
}

function getMergeRequestCacheScopeKey(
  normalizedBaseUrl,
  gitlabProjectId,
  boardCacheKey,
) {
  return `${normalizedBaseUrl}|${gitlabProjectId}|${boardCacheKey}`;
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

function extractIssueIdsFromMergeRequest(mergeRequest) {
  const cachedIssueIds = normalizeIssueIdArray(mergeRequest?.issueIds);
  if (cachedIssueIds.length > 0) {
    return cachedIssueIds;
  }

  return extractIssueIdsFromMrTitle(String(mergeRequest?.title || ""));
}

function sanitizeMergeRequestReviewer(reviewer) {
  const name = String(reviewer?.name || "").trim();
  if (!name) {
    return null;
  }

  const reviewerUrl = String(reviewer?.web_url || reviewer?.url || "").trim();
  return reviewerUrl ? { name, web_url: reviewerUrl } : { name };
}

function sanitizeMergeRequestForCache(mergeRequest, issueIdSet) {
  const issueIds = extractIssueIdsFromMergeRequest(mergeRequest).filter((issueId) =>
    issueIdSet instanceof Set && issueIdSet.size > 0 ? issueIdSet.has(issueId) : true,
  );
  if (issueIds.length === 0) {
    return null;
  }

  const reviewers = Array.isArray(mergeRequest?.reviewers)
    ? mergeRequest.reviewers
        .map((reviewer) => sanitizeMergeRequestReviewer(reviewer))
        .filter(Boolean)
    : [];

  return {
    iid: String(mergeRequest?.iid || "").trim(),
    issueIds,
    state: String(mergeRequest?.state || "").trim() || "unknown",
    web_url: String(mergeRequest?.web_url || "").trim(),
    reviewers,
    approved: Boolean(mergeRequest?.approved),
    totalComments: parseNonNegativeInteger(mergeRequest?.totalComments),
    unresolvedComments: parseNonNegativeInteger(mergeRequest?.unresolvedComments),
  };
}

function sanitizeMergeRequestsForCache(mergeRequests, issueIdSet) {
  if (!Array.isArray(mergeRequests)) {
    return [];
  }

  const sanitizedMergeRequests = [];
  mergeRequests.forEach((mergeRequest) => {
    const sanitizedMergeRequest = sanitizeMergeRequestForCache(
      mergeRequest,
      issueIdSet,
    );
    if (sanitizedMergeRequest) {
      sanitizedMergeRequests.push(sanitizedMergeRequest);
    }
  });

  return sanitizedMergeRequests;
}

function areMergeRequestsEqual(leftMergeRequests, rightMergeRequests) {
  return JSON.stringify(leftMergeRequests || []) === JSON.stringify(rightMergeRequests || []);
}

async function getCachedGitlabMergeRequests(cacheScopeKey, issueIdSet) {
  const storedCache = await getLocalSettings({
    [GITLAB_MR_CACHE_KEY]: {},
  });
  const rawMrCache = storedCache[GITLAB_MR_CACHE_KEY];
  const mrCache = rawMrCache && typeof rawMrCache === "object"
    ? { ...rawMrCache }
    : {};
  const cacheEntry = mrCache[cacheScopeKey];
  const rawMergeRequests = Array.isArray(cacheEntry?.mergeRequests)
    ? cacheEntry.mergeRequests
    : [];
  const sanitizedMergeRequests = sanitizeMergeRequestsForCache(
    rawMergeRequests,
    issueIdSet,
  );
  const cacheNeedsUpdate = !areMergeRequestsEqual(rawMergeRequests, sanitizedMergeRequests);
  if (!cacheNeedsUpdate) {
    return sanitizedMergeRequests;
  }

  if (sanitizedMergeRequests.length === 0) {
    delete mrCache[cacheScopeKey];
  } else {
    mrCache[cacheScopeKey] = {
      fetchedAt: Number(cacheEntry?.fetchedAt || Date.now()),
      mergeRequests: sanitizedMergeRequests,
    };
  }

  await setLocalSettings({
    [GITLAB_MR_CACHE_KEY]: mrCache,
  });

  return sanitizedMergeRequests;
}

async function setCachedGitlabMergeRequests(cacheScopeKey, mergeRequests, issueIdSet) {
  const sanitizedMergeRequests = sanitizeMergeRequestsForCache(
    mergeRequests,
    issueIdSet,
  );
  const storedCache = await getLocalSettings({
    [GITLAB_MR_CACHE_KEY]: {},
  });
  const rawMrCache = storedCache[GITLAB_MR_CACHE_KEY];
  const mrCache = rawMrCache && typeof rawMrCache === "object"
    ? { ...rawMrCache }
    : {};
  const cacheEntry = mrCache[cacheScopeKey];
  const existingMergeRequests = Array.isArray(cacheEntry?.mergeRequests)
    ? cacheEntry.mergeRequests
    : [];
  const isUnchanged = areMergeRequestsEqual(
    existingMergeRequests,
    sanitizedMergeRequests,
  );
  if (isUnchanged) {
    return;
  }

  if (sanitizedMergeRequests.length === 0) {
    delete mrCache[cacheScopeKey];
  } else {
    mrCache[cacheScopeKey] = {
      fetchedAt: Date.now(),
      mergeRequests: sanitizedMergeRequests,
    };
  }

  await setLocalSettings({
    [GITLAB_MR_CACHE_KEY]: mrCache,
  });
}

function filterMergeRequestsByIssueIds(mergeRequests, issueIdSet) {
  if (!(issueIdSet instanceof Set) || issueIdSet.size === 0) {
    return mergeRequests;
  }

  return mergeRequests.filter((mergeRequest) =>
    extractIssueIdsFromMergeRequest(mergeRequest).some((issueId) =>
      issueIdSet.has(issueId),
    ),
  );
}

function getPrimaryIssueMergeRequestIids(mergeRequests, issueIdSet) {
  const primaryIids = new Set();
  if (!(issueIdSet instanceof Set) || issueIdSet.size === 0) {
    mergeRequests.forEach((mergeRequest) => {
      const iid = String(mergeRequest?.iid || "").trim();
      if (iid) {
        primaryIids.add(iid);
      }
    });
    return primaryIids;
  }

  const unresolvedIssueIds = new Set(issueIdSet);
  for (const mergeRequest of mergeRequests) {
    const iid = String(mergeRequest?.iid || "").trim();
    if (!iid) {
      continue;
    }

    const matchedIssueIds = extractIssueIdsFromMergeRequest(mergeRequest).filter(
      (issueId) => unresolvedIssueIds.has(issueId),
    );
    if (matchedIssueIds.length === 0) {
      continue;
    }

    primaryIids.add(iid);
    matchedIssueIds.forEach((issueId) => unresolvedIssueIds.delete(issueId));
    if (unresolvedIssueIds.size === 0) {
      break;
    }
  }

  return primaryIids;
}

function pruneExpiredCacheEntries(cache, maxAgeMs, now) {
  let dirty = false;
  Object.keys(cache).forEach((cacheKey) => {
    const entry = cache[cacheKey];
    const fetchedAt = Number(entry?.fetchedAt || 0);
    if (!fetchedAt || now - fetchedAt >= maxAgeMs) {
      delete cache[cacheKey];
      dirty = true;
    }
  });

  return dirty;
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;
  const workerCount = Math.max(1, Math.min(concurrency, items.length));

  async function runWorker() {
    while (true) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      if (currentIndex >= items.length) {
        return;
      }

      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
  return results;
}

async function fetchGitlabMergeRequests(
  normalizedBaseUrl,
  gitlabProjectId,
  apiKey,
  issueIdSet,
  options = {},
) {
  const metrics = options.metrics;
  const projectPath = `${normalizedBaseUrl}/api/v4/projects/${encodeURIComponent(gitlabProjectId)}`;
  const mergeRequestsUrl = `${projectPath}/merge_requests?order_by=updated_at&sort=desc&per_page=100`;
  const mergeRequests = await fetchGitlabPaginatedArray(mergeRequestsUrl, apiKey, {
    metrics,
  });
  const relevantMergeRequests = filterMergeRequestsByIssueIds(mergeRequests, issueIdSet);
  if (relevantMergeRequests.length === 0) {
    return [];
  }

  const primaryIids = getPrimaryIssueMergeRequestIids(relevantMergeRequests, issueIdSet);

  const enrichedMergeRequests = await mapWithConcurrency(
    relevantMergeRequests,
    6,
    async (mergeRequest) => {
      const mrIid = String(mergeRequest?.iid || "").trim();
      if (!mrIid || !primaryIids.has(mrIid)) {
        return {
          ...mergeRequest,
          approved: false,
          totalComments: 0,
          unresolvedComments: 0
        };
      }

      return enrichMergeRequestWithReviewData(
        mergeRequest,
        projectPath,
        apiKey,
        { metrics },
      );
    },
  );

  return sanitizeMergeRequestsForCache(enrichedMergeRequests, issueIdSet);
}

async function fetchGitlabJson(url, apiKey, options = {}) {
  const metrics = options.metrics;
  if (metrics) {
    metrics.apiRequestCount = Number(metrics.apiRequestCount || 0) + 1;
    if (!Array.isArray(metrics.requestUrls)) {
      metrics.requestUrls = [];
    }
    metrics.requestUrls.push(String(url || ""));
  }

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
  return { data, response };
}

async function fetchGitlabPaginatedArray(url, apiKey, options = {}) {
  const allItems = [];
  let nextPage = "1";

  while (nextPage) {
    const pageUrl = new URL(url);
    pageUrl.searchParams.set("page", nextPage);
    if (!pageUrl.searchParams.has("per_page")) {
      pageUrl.searchParams.set("per_page", "100");
    }

    const { data, response } = await fetchGitlabJson(pageUrl.toString(), apiKey, options);
    if (!Array.isArray(data)) {
      const error = new Error("Unexpected GitLab API response format");
      error.status = 502;
      throw error;
    }

    allItems.push(...data);
    const rawNextPage = String(response.headers.get("x-next-page") || "").trim();
    nextPage = rawNextPage;
  }

  return allItems;
}

function parseNonNegativeInteger(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }

  return Math.floor(parsed);
}

function normalizeComparableName(name) {
  return String(name || "")
    .trim()
    .replace(/\s+/g, " ");
}

function getAssigneeNameCacheKey(normalizedBaseUrl, gitlabProjectId, normalizedName) {
  return `${normalizedBaseUrl}|${gitlabProjectId}|${normalizedName}`;
}

function arrayBufferToBase64(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const chunkSize = 0x8000;
  let binary = "";

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

function shouldAttachTokenForAvatar(avatarUrl, normalizedBaseUrl) {
  try {
    const avatarOrigin = new URL(avatarUrl).origin;
    const gitlabOrigin = new URL(normalizedBaseUrl).origin;
    return avatarOrigin === gitlabOrigin;
  } catch (_error) {
    return false;
  }
}

async function fetchAvatarAsDataUrl(
  avatarUrl,
  normalizedBaseUrl,
  apiKey,
  options = {},
) {
  const metrics = options.metrics;
  if (metrics) {
    metrics.avatarRequestCount = Number(metrics.avatarRequestCount || 0) + 1;
    if (!Array.isArray(metrics.requestUrls)) {
      metrics.requestUrls = [];
    }
    metrics.requestUrls.push(String(avatarUrl || ""));
  }

  const includeToken = shouldAttachTokenForAvatar(avatarUrl, normalizedBaseUrl);
  const headers = includeToken ? { "PRIVATE-TOKEN": apiKey } : {};
  const response = await fetch(avatarUrl, { method: "GET", headers });
  if (!response.ok) {
    const error = new Error(`GitLab avatar request failed (${response.status})`);
    error.status = response.status;
    throw error;
  }

  const blob = await response.blob();
  const mimeType = String(blob.type || response.headers.get("content-type") || "image/png");
  const buffer = await blob.arrayBuffer();
  const base64 = arrayBufferToBase64(buffer);
  return `data:${mimeType};base64,${base64}`;
}

async function fetchGitlabAssigneeAvatarsForRedmineProject(
  redmineProjectName,
  assigneeNames,
    options = {},
) {
  const cacheOnly = Boolean(options.cacheOnly);
  const metrics = options.metrics;
  const projectSettings = await getGitlabProjectSettings(redmineProjectName);
  if (!projectSettings) {
    return {};
  }

  const uniqueAssigneeNames = [...new Set(
    assigneeNames.map((name) => String(name || "").trim()).filter(Boolean),
  )];
  if (uniqueAssigneeNames.length === 0) {
    return {};
  }

  const storedCache = await getLocalSettings({
    [GITLAB_AVATAR_CACHE_KEY]: {},
    [GITLAB_ASSIGNEE_NAME_CACHE_KEY]: {},
  });
  const rawAvatarCache = storedCache[GITLAB_AVATAR_CACHE_KEY];
  const rawAssigneeNameCache = storedCache[GITLAB_ASSIGNEE_NAME_CACHE_KEY];
  const avatarCache = rawAvatarCache && typeof rawAvatarCache === "object"
    ? { ...rawAvatarCache }
    : {};
  const assigneeNameCache = rawAssigneeNameCache && typeof rawAssigneeNameCache === "object"
    ? { ...rawAssigneeNameCache }
    : {};
  const avatarsByName = {};
  const now = Date.now();
  let cacheDirty = pruneExpiredCacheEntries(
    avatarCache,
    GITLAB_AVATAR_CACHE_TTL_MS,
    now,
  );
  cacheDirty = pruneExpiredCacheEntries(
    assigneeNameCache,
    GITLAB_AVATAR_CACHE_TTL_MS,
    now,
  ) || cacheDirty;

  const unresolvedAssigneeNames = [];
  uniqueAssigneeNames.forEach((assigneeName) => {
    const normalizedAssigneeName = normalizeComparableName(assigneeName);
    if (!normalizedAssigneeName) {
      return;
    }

    const assigneeNameCacheKey = getAssigneeNameCacheKey(
      projectSettings.normalizedBaseUrl,
      projectSettings.gitlabProjectId,
      normalizedAssigneeName,
    );
    const cachedAssigneeEntry = assigneeNameCache[assigneeNameCacheKey];
    const cachedAssigneeFetchedAt = Number(cachedAssigneeEntry?.fetchedAt || 0);
    const hasValidAssigneeEntry = cachedAssigneeFetchedAt &&
      now - cachedAssigneeFetchedAt < GITLAB_AVATAR_CACHE_TTL_MS;
    if (hasValidAssigneeEntry) {
      const cachedDataUrl = String(cachedAssigneeEntry?.dataUrl || "").trim();
      if (cachedAssigneeEntry?.matched && cachedDataUrl) {
        avatarsByName[assigneeName] = cachedDataUrl;
      }
      return;
    }

    unresolvedAssigneeNames.push(assigneeName);
  });

  if (cacheOnly || unresolvedAssigneeNames.length === 0) {
    if (cacheDirty) {
      await setLocalSettings({
        [GITLAB_AVATAR_CACHE_KEY]: avatarCache,
        [GITLAB_ASSIGNEE_NAME_CACHE_KEY]: assigneeNameCache,
      });
    }
    return avatarsByName;
  }

  const projectPath =
    `${projectSettings.normalizedBaseUrl}/api/v4/projects/${encodeURIComponent(projectSettings.gitlabProjectId)}`;
  const membersUrl = `${projectPath}/members/all?per_page=100`;
  const members = await fetchGitlabPaginatedArray(membersUrl, projectSettings.apiKey, {
    metrics,
  });
  const membersByNormalizedName = new Map();

  members.forEach((member) => {
    const memberName = normalizeComparableName(member?.name);
    if (!memberName) {
      return;
    }

    const existing = membersByNormalizedName.get(memberName) || [];
    existing.push(member);
    membersByNormalizedName.set(memberName, existing);
  });

  for (const assigneeName of unresolvedAssigneeNames) {
    const normalizedAssigneeName = normalizeComparableName(assigneeName);
    if (!normalizedAssigneeName) {
      continue;
    }

    const assigneeNameCacheKey = getAssigneeNameCacheKey(
      projectSettings.normalizedBaseUrl,
      projectSettings.gitlabProjectId,
      normalizedAssigneeName,
    );
    const matchingMembers = (membersByNormalizedName.get(normalizedAssigneeName) || []).filter(
      (member) => normalizeComparableName(member?.name) === normalizedAssigneeName,
    );

    if (matchingMembers.length !== 1) {
      assigneeNameCache[assigneeNameCacheKey] = {
        matched: false,
        fetchedAt: Date.now(),
      };
      cacheDirty = true;
      continue;
    }

    const matchedMember = matchingMembers[0];
    const avatarUrl = String(matchedMember?.avatar_url || "").trim();
    if (!avatarUrl) {
      assigneeNameCache[assigneeNameCacheKey] = {
        matched: false,
        fetchedAt: Date.now(),
      };
      cacheDirty = true;
      continue;
    }

    const avatarCacheKey = `${projectSettings.normalizedBaseUrl}|${avatarUrl}`;
    const cachedAvatarEntry = avatarCache[avatarCacheKey];
    const cachedDataUrl = String(cachedAvatarEntry?.dataUrl || "").trim();
    const cachedFetchedAt = Number(cachedAvatarEntry?.fetchedAt || 0);
    if (
      cachedDataUrl &&
      cachedFetchedAt &&
      now - cachedFetchedAt < GITLAB_AVATAR_CACHE_TTL_MS
    ) {
      avatarsByName[assigneeName] = cachedDataUrl;
      assigneeNameCache[assigneeNameCacheKey] = {
        matched: true,
        dataUrl: cachedDataUrl,
        avatarUrl,
        fetchedAt: Date.now(),
      };
      cacheDirty = true;
      continue;
    }

    try {
      const dataUrl = await fetchAvatarAsDataUrl(
        avatarUrl,
        projectSettings.normalizedBaseUrl,
        projectSettings.apiKey,
        { metrics },
      );
      if (!dataUrl) {
        continue;
      }

      avatarsByName[assigneeName] = dataUrl;
      const fetchedAt = Date.now();
      avatarCache[avatarCacheKey] = {
        dataUrl,
        fetchedAt,
      };
      assigneeNameCache[assigneeNameCacheKey] = {
        matched: true,
        dataUrl,
        avatarUrl,
        fetchedAt,
      };
      cacheDirty = true;
    } catch (error) {
      console.warn("[Bluemine] Failed to fetch GitLab avatar image:", error);
    }
  }

  if (cacheDirty) {
    await setLocalSettings({
      [GITLAB_AVATAR_CACHE_KEY]: avatarCache,
      [GITLAB_ASSIGNEE_NAME_CACHE_KEY]: assigneeNameCache,
    });
  }

  return avatarsByName;
}

async function fetchMrApprovalStatus(projectPath, mrIid, apiKey, options = {}) {
  const approvalsUrl = `${projectPath}/merge_requests/${encodeURIComponent(mrIid)}/approvals`;
  try {
    const { data } = await fetchGitlabJson(approvalsUrl, apiKey, options);
    const approvedBy = Array.isArray(data?.approved_by) ? data.approved_by : [];
    return approvedBy.length > 0;
  } catch (error) {
    console.warn("[Bluemine] Failed to fetch GitLab approvals:", error);
    return false;
  }
}

async function fetchMrCommentStats(projectPath, mrIid, apiKey, options = {}) {
  const discussionsUrl = `${projectPath}/merge_requests/${encodeURIComponent(mrIid)}/discussions?per_page=100`;
  try {
    const discussions = await fetchGitlabPaginatedArray(discussionsUrl, apiKey, options);
    let totalComments = 0;
    let unresolvedComments = 0;

    discussions.forEach((discussion) => {
      const notes = Array.isArray(discussion?.notes) ? discussion.notes : [];
      notes.forEach((note) => {
        if (note?.system) {
          return;
        }

        totalComments += 1;
        if (note?.resolvable && !note?.resolved) {
          unresolvedComments += 1;
        }
      });
    });

    return { totalComments, unresolvedComments };
  } catch (error) {
    console.warn("[Bluemine] Failed to fetch GitLab discussions:", error);
    return { totalComments: 0, unresolvedComments: 0 };
  }
}

async function enrichMergeRequestWithReviewData(
  mergeRequest,
  projectPath,
  apiKey,
  options = {},
) {
  const mrIid = String(mergeRequest?.iid || "").trim();
  if (!mrIid) {
    return {
      ...mergeRequest,
      approved: false,
      totalComments: 0,
      unresolvedComments: 0
    };
  }

  const reviewers = Array.isArray(mergeRequest?.reviewers) ? mergeRequest.reviewers : [];
  const hasReviewer = reviewers.some((reviewer) =>
    Boolean(String(reviewer?.name || "").trim()),
  );
  const isMerged = String(mergeRequest?.state || "").trim() === "merged";
  const hasCommentCount = mergeRequest?.user_notes_count !== undefined &&
    mergeRequest?.user_notes_count !== null;
  const knownCommentCount = parseNonNegativeInteger(mergeRequest?.user_notes_count);
  const shouldFetchCommentStats = !isMerged && (!hasCommentCount || knownCommentCount > 0);

  const [approved, commentStats] = await Promise.all([
    hasReviewer && !isMerged
      ? fetchMrApprovalStatus(projectPath, mrIid, apiKey, options)
      : Promise.resolve(false),
    shouldFetchCommentStats
      ? fetchMrCommentStats(projectPath, mrIid, apiKey, options)
      : Promise.resolve({ totalComments: 0, unresolvedComments: 0 })
  ]);

  return {
    ...mergeRequest,
    approved,
    totalComments: parseNonNegativeInteger(commentStats.totalComments),
    unresolvedComments: parseNonNegativeInteger(commentStats.unresolvedComments)
  };
}
