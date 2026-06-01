// Adds a "Start Claude Code" button to every Agile board issue card, sitting
// alongside the card's native hover actions (the show/zoom and add-comment
// icons). Clicking it builds a prompt from the issue's title and description
// and opens a configurable deeplink that launches Claude Code locally.
//
// The deeplink and the prompt construction are intentionally independent from
// the "Fix with Autofix" (GitLab pipeline) dispatch — only the prompt-building
// approach is shared in spirit, not the code path.

let _startClaudeObserver = null;
// Deep link options resolved for the current board; the prompt itself is always
// built from the task. An empty cwd opens Claude in the home directory.
let _startClaudeConfig = { promptPrefix: "", cwd: "" };
// issueId -> { promise, details }. Lets a hover warm the prompt so the click
// handler can fire the deeplink synchronously (see startClaudeBuildButton).
const _startClaudePromptCache = new Map();

function startClaudeEnsureStyles() {
  if (document.getElementById(START_CLAUDE_STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = START_CLAUDE_STYLE_ID;
  style.textContent = `
    .${START_CLAUDE_BUTTON_CLASS} {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 20px;
      height: 20px;
      padding: 0;
      margin: 0;
      border: none;
      border-radius: 4px;
      background: transparent;
      cursor: pointer;
      line-height: 1;
      vertical-align: middle;
    }

    .${START_CLAUDE_BUTTON_CLASS}:hover {
      background: rgba(217, 119, 87, 0.16);
    }

    .${START_CLAUDE_BUTTON_CLASS}[disabled] {
      cursor: default;
    }

    .${START_CLAUDE_BUTTON_CLASS}.is-loading {
      opacity: 0.55;
    }

    .bluemine-start-claude-icon {
      width: 14px;
      height: 14px;
      stroke: #d97757;
      stroke-width: 1.5;
      stroke-linecap: round;
      pointer-events: none;
    }

    .${START_CLAUDE_BUTTON_CLASS}:hover .bluemine-start-claude-icon {
      stroke: #c4613f;
    }

    .${START_CLAUDE_BUTTON_CLASS}.is-loading .bluemine-start-claude-icon {
      animation: bluemine-start-claude-spin 700ms linear infinite;
      transform-origin: 50% 50%;
    }

    @keyframes bluemine-start-claude-spin {
      to {
        transform: rotate(360deg);
      }
    }

    /* Fallback placement when a card exposes no native hover-tools container. */
    .issue-card.bluemine-has-start-claude {
      position: relative;
    }

    .${START_CLAUDE_TOOLS_CLASS} {
      position: absolute;
      top: 3px;
      right: 3px;
      z-index: 6;
      display: inline-flex;
      opacity: 0;
      transition: opacity 120ms ease;
    }

    .issue-card:hover .${START_CLAUDE_TOOLS_CLASS},
    .${START_CLAUDE_BUTTON_CLASS}:focus-visible {
      opacity: 1;
    }
  `;
  (document.head || document.documentElement).appendChild(style);
}

function startClaudeCreateIcon() {
  const svgNamespace = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNamespace, "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.classList.add("bluemine-start-claude-icon");

  // Claude-style sunburst: rays of alternating length radiating from centre.
  const centre = 8;
  const rayCount = 12;
  for (let index = 0; index < rayCount; index += 1) {
    const angle = (index * (360 / rayCount) * Math.PI) / 180;
    const length = index % 2 === 0 ? 5.6 : 3.6;
    const line = document.createElementNS(svgNamespace, "line");
    line.setAttribute("x1", String(centre));
    line.setAttribute("y1", String(centre));
    line.setAttribute("x2", (centre + Math.cos(angle) * length).toFixed(2));
    line.setAttribute("y2", (centre + Math.sin(angle) * length).toFixed(2));
    svg.appendChild(line);
  }

  return svg;
}

function startClaudeGetCardIssueId(card) {
  const dataId = String(card.getAttribute("data-id") || "").trim();
  if (/^\d+$/.test(dataId)) return dataId;

  const issueInput = card.querySelector('input[name="ids[]"]');
  const inputValue = String(issueInput?.value || "").trim();
  return /^\d+$/.test(inputValue) ? inputValue : "";
}

function startClaudeExtractTitleFromCard(issueId) {
  const card = document.querySelector(
    `.issue-card[data-id="${CSS.escape(issueId)}"]`,
  );
  if (!card) return "";

  const titleNode =
    card.querySelector("p.name a") ||
    card.querySelector(".name a") ||
    card.querySelector(".issue-subject") ||
    card.querySelector("a[href*='/issues/']");
  const rawTitle = String(
    titleNode?.textContent || card.textContent || "",
  ).trim();
  return rawTitle
    .replace(new RegExp(`^#?${issueId}\\s*[:\\-]?\\s*`), "")
    .replace(/\s+/g, " ")
    .trim();
}

function startClaudeExtractTitleFromDocument(doc, issueId) {
  const subject =
    doc.querySelector(".issue .subject h3") ||
    doc.querySelector(".issue .subject") ||
    doc.querySelector("#content h2") ||
    doc.querySelector("h2");
  const rawSubject = String(subject?.textContent || "").trim();
  if (rawSubject) {
    return rawSubject
      .replace(new RegExp(`^#?${issueId}\\s*[:\\-]?\\s*`), "")
      .trim();
  }

  return "";
}

function startClaudeExtractDescriptionFromDocument(doc) {
  const description =
    doc.querySelector(".issue .description .wiki") ||
    doc.querySelector(".description .wiki") ||
    doc.querySelector(".issue .description");
  return String(description?.textContent || "")
    .replace(/\s+\n/g, "\n")
    .trim();
}

async function startClaudeFetchPromptDetails(issueId) {
  let title = startClaudeExtractTitleFromCard(issueId);
  let description = "";

  try {
    const response = await fetch(`/issues/${encodeURIComponent(issueId)}`, {
      credentials: "same-origin",
    });
    if (response.ok) {
      const html = await response.text();
      const doc = new DOMParser().parseFromString(html, "text/html");
      title = startClaudeExtractTitleFromDocument(doc, issueId) || title;
      description = startClaudeExtractDescriptionFromDocument(doc);
    }
  } catch (_error) {
    // Card title fallback is enough to keep the deeplink usable.
  }

  const promptParts = [title, description].filter(Boolean);
  return {
    title: title || `Task ${issueId}`,
    description,
    prompt:
      promptParts.length > 0 ? promptParts.join("\n\n") : `Task ${issueId}`,
  };
}

function startClaudePrefetchPromptDetails(issueId) {
  if (!issueId) return Promise.resolve(null);

  const cached = _startClaudePromptCache.get(issueId);
  if (cached) return cached.promise;

  const entry = { promise: null, details: null };
  entry.promise = startClaudeFetchPromptDetails(issueId).then((details) => {
    entry.details = details;
    return details;
  });
  _startClaudePromptCache.set(issueId, entry);
  return entry.promise;
}

function startClaudeComposePromptText(taskPrompt) {
  const parts = [_startClaudeConfig.promptPrefix, taskPrompt]
    .map((part) => String(part || "").trim())
    .filter(Boolean);
  // Claude Code deep links reject a `q` value longer than 5,000 characters.
  return parts.join("\n\n").slice(0, START_CLAUDE_MAX_PROMPT_LENGTH);
}

// Keep path separators literal (the handler expects a real path) while still
// escaping spaces and other reserved characters per segment.
function startClaudeEncodePathValue(value) {
  return String(value)
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function startClaudeBuildDeeplink(taskPrompt) {
  const params = [`q=${encodeURIComponent(startClaudeComposePromptText(taskPrompt))}`];

  if (_startClaudeConfig.cwd) {
    params.push(`cwd=${startClaudeEncodePathValue(_startClaudeConfig.cwd)}`);
  }

  return `${START_CLAUDE_DEEPLINK_BASE}?${params.join("&")}`;
}

// Resolve the working directory for the current board from the configured
// `redmine-project-slug=/local/path` lines. Returns "" when unmapped, which
// opens Claude in the home directory.
function startClaudeResolveProjectPath(rawMap, projectName) {
  const targetProject = String(projectName || "").trim();
  if (!targetProject) return "";

  for (const line of String(rawMap || "").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) continue;

    const project = trimmed.slice(0, separatorIndex).trim();
    const path = trimmed.slice(separatorIndex + 1).trim();
    if (project === targetProject && path) return path;
  }

  return "";
}

function startClaudeOpenDeeplink(deeplink) {
  if (!deeplink) return;

  // A user-gesture anchor click hands custom-scheme URLs to the OS handler
  // without unloading the board.
  const link = document.createElement("a");
  link.href = deeplink;
  link.rel = "noopener noreferrer";
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function startClaudeOpenForDetails(details) {
  startClaudeOpenDeeplink(startClaudeBuildDeeplink(details.prompt));
}

function startClaudeBuildButton(issueId) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = START_CLAUDE_BUTTON_CLASS;
  button.title = "Start Claude Code";
  button.setAttribute("aria-label", "Start Claude Code");
  button.draggable = false;
  button.appendChild(startClaudeCreateIcon());

  // Warm the prompt while the user is reaching for the button so the click can
  // launch the deeplink within the same user gesture.
  const warm = () => {
    startClaudePrefetchPromptDetails(issueId).catch(() => {});
  };
  button.addEventListener("mouseenter", warm);
  button.addEventListener("focus", warm);

  // Keep clicks from selecting/opening the card or starting a drag.
  button.addEventListener("mousedown", (event) => event.stopPropagation());

  button.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (button.classList.contains("is-loading")) return;

    // Fast path: prompt already fetched, so the protocol launch stays inside
    // the click's user activation.
    const cached = _startClaudePromptCache.get(issueId);
    if (cached?.details) {
      startClaudeOpenForDetails(cached.details);
      return;
    }

    button.classList.add("is-loading");
    button.disabled = true;
    try {
      const details = await startClaudePrefetchPromptDetails(issueId);
      if (details) startClaudeOpenForDetails(details);
    } catch (error) {
      console.warn(
        "[Bluemine] Failed to start Claude for issue",
        issueId,
        error,
      );
    } finally {
      button.classList.remove("is-loading");
      button.disabled = false;
    }
  });

  return button;
}

// The native hover tools differ between Redmine/Agile versions, so try a few
// known containers before falling back to the floating placement.
function startClaudeFindToolsContainer(card) {
  const directContainer =
    card.querySelector(":scope > .tools") ||
    card.querySelector(":scope > .contextual") ||
    card.querySelector(".issue-card-tools") ||
    card.querySelector(".tools") ||
    card.querySelector(".contextual");
  if (directContainer) return directContainer;

  const actionIcon = card.querySelector(
    "a.icon-comment, a.icon-comments, a.add-note, a.icon-add, a.icon-zoom-in, a.show-issue",
  );
  if (actionIcon && actionIcon.parentElement !== card) {
    return actionIcon.parentElement;
  }

  return null;
}

function startClaudeInjectIntoCard(card) {
  if (!card || card.querySelector(`.${START_CLAUDE_BUTTON_CLASS}`)) return;

  const issueId = startClaudeGetCardIssueId(card);
  if (!issueId) return;

  const button = startClaudeBuildButton(issueId);

  const nativeTools = startClaudeFindToolsContainer(card);
  if (nativeTools) {
    nativeTools.appendChild(button);
    return;
  }

  card.classList.add("bluemine-has-start-claude");
  let tools = card.querySelector(`.${START_CLAUDE_TOOLS_CLASS}`);
  if (!tools) {
    tools = document.createElement("span");
    tools.className = START_CLAUDE_TOOLS_CLASS;
    card.appendChild(tools);
  }
  tools.appendChild(button);
}

function startClaudeInjectAllCards() {
  document.querySelectorAll(".issue-card[data-id]").forEach((card) => {
    startClaudeInjectIntoCard(card);
  });
}

function runStartClaudeButtonFeature(featureResult) {
  if (!isAgileBoardPage()) return;

  _startClaudeConfig = {
    promptPrefix: String(
      featureResult?.[START_CLAUDE_PROMPT_PREFIX_KEY] || "",
    ).trim(),
    cwd: startClaudeResolveProjectPath(
      featureResult?.[START_CLAUDE_PROJECT_PATH_MAP_KEY],
      getCurrentBoardProjectName(),
    ),
  };

  startClaudeEnsureStyles();
  startClaudeInjectAllCards();

  // Re-inject when the Agile plugin replaces cards on drag-drop and when a
  // Bluemine soft reload swaps the board's innerHTML. Our own button is not an
  // .issue-card, so adding it never re-triggers this — no injection loop.
  if (_startClaudeObserver) {
    _startClaudeObserver.disconnect();
    _startClaudeObserver = null;
  }

  const boardTable = findBoardTable();
  if (!boardTable) return;

  _startClaudeObserver = new MutationObserver((mutations) => {
    const hasNewCard = mutations.some((mutation) =>
      Array.from(mutation.addedNodes).some(
        (node) =>
          node.nodeType === Node.ELEMENT_NODE &&
          (node.classList?.contains("issue-card") ||
            node.querySelector?.(".issue-card[data-id]")),
      ),
    );
    if (hasNewCard) startClaudeInjectAllCards();
  });
  _startClaudeObserver.observe(boardTable, { childList: true, subtree: true });
}
