function runCommandPaletteFeature(featureResult) {
  if (!isAgileBoardPage()) return;

  let isOpen = false;
  let allCommands = [];
  let filteredCommands = [];
  let activeIndex = 0;
  let paletteCSRFToken = "";
  let queuedCommands = [];

  function getSelectedIssueIds() {
    const seen = new Set();
    document
      .querySelectorAll('.context-menu-selection input[name="ids[]"]')
      .forEach((input) => {
        const id = String(input.value || "").trim();
        if (id) seen.add(id);
      });
    return [...seen];
  }

  function getPaletteCSRFToken() {
    return (
      document
        .querySelector('meta[name="csrf-token"]')
        ?.getAttribute("content") || ""
    );
  }

  function buildBulkEditUrl(issueIds) {
    const params = new URLSearchParams();
    for (const id of issueIds) params.append("ids[]", id);
    return `/issues/bulk_edit?${params}`;
  }

  async function fetchContextMenuHtml(issueIds) {
    const params = new URLSearchParams();
    for (const id of issueIds) params.append("ids[]", id);
    params.append(
      "back_url",
      window.location.pathname + window.location.search,
    );
    const res = await fetch(`/issues/context_menu?${params}`, {
      credentials: "same-origin",
      headers: { "X-Requested-With": "XMLHttpRequest" },
    });
    if (!res.ok) return null;
    return res.text();
  }

  function parseContextMenuCommands(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    const commands = [];

    for (const folder of doc.querySelectorAll("li.folder")) {
      const category = folder
        .querySelector(":scope > a.submenu")
        ?.textContent.trim();
      if (!category || !COMMAND_PALETTE_CATEGORIES.has(category)) continue;

      for (const li of folder.querySelectorAll(":scope > ul > li")) {
        const link = li.querySelector("a");
        if (!link) continue;

        const isDisabled =
          link.classList.contains("disabled") ||
          link.getAttribute("href") === "#";
        const iconLabel = link.querySelector(".icon-label");
        const label = (iconLabel?.textContent || link.textContent).trim();
        const href = link.getAttribute("href");

        if (!label) continue;

        commands.push({
          id: `${category}-${label}`.toLowerCase().replace(/\s+/g, "-"),
          category,
          label,
          disabled: isDisabled,
          action: isDisabled ? null : { type: "patch", url: href },
        });
      }
    }

    return commands;
  }

  // Person-name abbreviation: first letter of first name + first letter of
  // last name + last letter of last name, e.g. "Anna Berg" → "abg",
  // "Erik Holm" → "ehm".
  function matchesPersonAbbreviation(label, query) {
    const parts = label.trim().split(/\s+/);
    if (parts.length < 2) return false;
    const first = parts[0];
    const last = parts[parts.length - 1];
    if (!first.length || !last.length) return false;
    const abbrev = (first[0] + last[0] + last[last.length - 1]).toLowerCase();
    return abbrev.startsWith(query);
  }

  const PERSON_CATEGORIES = new Set(["Assignee", "Reviewer"]);

  function fuzzyMatch(target, query) {
    let qi = 0;
    const t = target.toLowerCase();
    for (let ti = 0; ti < t.length && qi < query.length; ti++) {
      if (t[ti] === query[qi]) qi++;
    }
    return qi === query.length;
  }

  function filterCommands(query) {
    const q = query.toLowerCase().trim();

    if (!q) return allCommands;

    if (q === "be") {
      return allCommands.filter((c) => c.category === "Bulk Edit");
    }

    for (const { prefix, category } of COMMAND_PALETTE_CATEGORY_PREFIXES) {
      if (q === prefix || q.startsWith(prefix + " ")) {
        const nameQ = q.slice(prefix.length).trim();
        const catItems = allCommands.filter((c) => c.category === category);
        if (!nameQ) return catItems;
        return catItems
          .map((c) => {
            if (matchesPersonAbbreviation(c.label, nameQ)) return { c, score: 0 };
            if (c.label.toLowerCase().includes(nameQ)) return { c, score: 1 };
            if (fuzzyMatch(c.label, nameQ)) return { c, score: 2 };
            return null;
          })
          .filter(Boolean)
          .sort((a, b) => a.score - b.score)
          .map(({ c }) => c);
      }
    }

    const shortcutTarget = COMMAND_PALETTE_STATUS_SHORTCUTS[q];
    if (shortcutTarget) {
      return allCommands.filter(
        (c) =>
          c.category === "Status" && c.label.toLowerCase() === shortcutTarget,
      );
    }

    return allCommands
      .map((c) => {
        if (PERSON_CATEGORIES.has(c.category) && matchesPersonAbbreviation(c.label, q)) return { c, score: 0 };
        const combined = `${c.category} ${c.label}`.toLowerCase();
        if (combined.includes(q)) return { c, score: 1 };
        if (fuzzyMatch(c.label, q)) return { c, score: 2 };
        return null;
      })
      .filter(Boolean)
      .sort((a, b) => a.score - b.score)
      .map(({ c }) => c);
  }

  function isBlockedCmd(cmd) {
    return (
      (cmd.category === "Bulk Edit" || cmd.category === "Copy") &&
      queuedCommands.length > 0
    );
  }

  function getFirstEnabledIndex(commands) {
    const idx = commands.findIndex((c) => !c.disabled);
    return idx >= 0 ? idx : 0;
  }

  function getFirstSelectableIndex(commands) {
    const idx = commands.findIndex((c) => !c.disabled && !isBlockedCmd(c));
    return idx >= 0 ? idx : getFirstEnabledIndex(commands);
  }

  function renderChips() {
    const row = document.getElementById("bluemine-chip-row");
    if (!row) return;
    row.innerHTML = "";
    queuedCommands.forEach((cmd, i) => {
      const chip = document.createElement("span");
      chip.className = "bluemine-chip";
      const label = document.createElement("span");
      label.textContent = `${cmd.category}: ${cmd.label}`;
      const removeBtn = document.createElement("button");
      removeBtn.className = "bluemine-chip-remove";
      removeBtn.type = "button";
      removeBtn.setAttribute("aria-label", "Remove");
      removeBtn.textContent = "\u00d7";
      removeBtn.addEventListener("click", () => {
        queuedCommands.splice(i, 1);
        renderChips();
      });
      chip.appendChild(label);
      chip.appendChild(removeBtn);
      row.appendChild(chip);
    });
  }

  async function executeCommandsBatch(commands, selectedIds) {
    const patchCmds = commands.filter((c) => c.action?.type === "patch");
    if (patchCmds.length === 0) return;

    // Single commands work by putting issue[*] params in the URL query string,
    // not the body. Mirror that: start from the first command's URL (which
    // already has back_url, ids[], and its own issue[*] param), then append
    // the issue[*] params from every subsequent command onto the same URL.
    let mergedUrl;
    try {
      const parsed = new URL(patchCmds[0].action.url, window.location.origin);
      for (let i = 1; i < patchCmds.length; i++) {
        try {
          const other = new URL(patchCmds[i].action.url, window.location.origin);
          for (const [key, val] of other.searchParams) {
            if (key.startsWith("issue[")) {
              parsed.searchParams.append(key, val);
            }
          }
        } catch (_e) {
          // ignore malformed URL
        }
      }
      mergedUrl = parsed.toString();
    } catch (_e) {
      mergedUrl = patchCmds[0].action.url;
    }

    const body = new URLSearchParams();
    body.append("_method", "patch");
    body.append("authenticity_token", paletteCSRFToken);

    try {
      await fetch(mergedUrl, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      });
    } catch (_e) {
      // fall through to reload
    }

    await softReloadBoard(featureResult, selectedIds);
  }

  async function executeCommand(command) {
    if (command.disabled || !command.action) return;

    if (command.action.type === "copy") {
      const ids = getSelectedIssueIds();
      closePalette();
      browserAPI.storage.local.get(
        { [COMMAND_PALETTE_ID_SEPARATOR_KEY]: "" },
        (result) => {
          const sep = result[COMMAND_PALETTE_ID_SEPARATOR_KEY] || " & ";
          navigator.clipboard.writeText(ids.join(sep)).catch(() => {});
        },
      );
      return;
    }

    const selectedIds = getSelectedIssueIds();
    closePalette();

    if (command.action.type === "navigate") {
      window.location.href = command.action.url;
      return;
    }

    const body = new URLSearchParams();
    body.append("_method", "patch");
    body.append("authenticity_token", paletteCSRFToken);

    try {
      await fetch(command.action.url, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      });
    } catch (_e) {
      // fall through to reload
    }

    await softReloadBoard(featureResult, selectedIds);
  }

  function renderCommandList() {
    const listEl = document.getElementById("bluemine-command-list");
    const statusEl = document.getElementById("bluemine-command-status-msg");
    if (!listEl || !statusEl) return;

    if (filteredCommands.length === 0) {
      listEl.innerHTML = "";
      statusEl.hidden = false;
      statusEl.textContent = "No matching commands";
      return;
    }

    statusEl.hidden = true;
    listEl.innerHTML = "";

    const renderOrder = filteredCommands
      .map((cmd, originalIndex) => ({ cmd, originalIndex }))
      .sort((a, b) => {
        const ab = isBlockedCmd(a.cmd), bb = isBlockedCmd(b.cmd);
        return ab === bb ? 0 : ab ? 1 : -1;
      });

    renderOrder.forEach(({ cmd, originalIndex }) => {
      const isBulkEditBlocked = isBlockedCmd(cmd);
      const isEffectivelyDisabled = cmd.disabled || isBulkEditBlocked;

      const li = document.createElement("li");
      li.className =
        "bluemine-command-item" +
        (isEffectivelyDisabled ? " is-disabled" : "") +
        (originalIndex === activeIndex ? " is-active" : "");

      const catSpan = document.createElement("span");
      catSpan.className = "bluemine-command-category";
      catSpan.textContent = cmd.category;

      const labelSpan = document.createElement("span");
      labelSpan.className = "bluemine-command-label";
      labelSpan.textContent = cmd.label;

      li.appendChild(catSpan);
      li.appendChild(labelSpan);

      if (isBulkEditBlocked) {
        const hintSpan = document.createElement("span");
        hintSpan.className = "bluemine-command-hint";
        hintSpan.textContent = "can\u2019t be chained";
        li.appendChild(hintSpan);
      }

      if (!isEffectivelyDisabled) {
        li.addEventListener("mousedown", (e) => {
          e.preventDefault();
          executeCommand(cmd);
        });
        li.addEventListener("mousemove", () => {
          if (activeIndex !== originalIndex) {
            activeIndex = originalIndex;
            renderCommandList();
          }
        });
      }

      listEl.appendChild(li);
    });

    const activeItem = listEl.querySelector(".is-active");
    if (activeItem) activeItem.scrollIntoView({ block: "nearest" });
  }

  function setCommandPaletteStatus(msg) {
    const listEl = document.getElementById("bluemine-command-list");
    const statusEl = document.getElementById("bluemine-command-status-msg");
    if (listEl) listEl.innerHTML = "";
    if (statusEl) {
      statusEl.hidden = false;
      statusEl.textContent = msg;
    }
  }

  function ensureCommandPaletteStyles() {
    if (document.getElementById(COMMAND_PALETTE_STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = COMMAND_PALETTE_STYLE_ID;
    style.textContent = `
      #bluemine-command-palette-overlay {
        position: fixed;
        inset: 0;
        background: transparent;
        z-index: 99999;
        display: flex;
        align-items: flex-start;
        justify-content: center;
        padding-top: 14vh;
        box-sizing: border-box;
      }
      #bluemine-command-palette {
        background: #fff;
        border-radius: 10px;
        box-shadow: 0 12px 40px rgba(0,0,0,0.22), 0 2px 8px rgba(0,0,0,0.12);
        width: 500px;
        max-width: 92vw;
        overflow: hidden;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 14px;
        line-height: 1.4;
        color: #1a1a1a;
      }
      #bluemine-command-input-wrap {
        display: flex;
        align-items: center;
        padding: 12px 14px;
        border-bottom: 1px solid #ebebeb;
        gap: 10px;
        box-sizing: border-box;
      }
      #bluemine-command-input {
        flex: 1;
        border: none;
        outline: none;
        font-size: 14px;
        font-family: inherit;
        color: #1a1a1a;
        background: transparent;
        min-width: 0;
        padding: 0;
        margin: 0;
      }
      #bluemine-command-input::placeholder {
        color: #aaa;
      }
      #bluemine-command-badge {
        font-size: 11px;
        font-weight: 600;
        background: #3d5afe;
        color: #fff;
        border-radius: 10px;
        padding: 2px 9px;
        white-space: nowrap;
        flex-shrink: 0;
        line-height: 1.6;
      }
      #bluemine-command-list {
        list-style: none;
        margin: 0;
        padding: 4px 0;
        max-height: 300px;
        overflow-y: auto;
      }
      .bluemine-command-item {
        display: flex;
        align-items: center;
        padding: 7px 14px;
        cursor: pointer;
        gap: 10px;
        user-select: none;
        box-sizing: border-box;
      }
      .bluemine-command-item.is-active {
        background: #eef1ff;
      }
      .bluemine-command-item.is-disabled {
        opacity: 0.42;
        cursor: default;
        pointer-events: none;
      }
      .bluemine-command-item.is-active.is-disabled {
        background: #f5f5f5;
      }
      .bluemine-command-hint {
        margin-left: auto;
        font-size: 10px;
        font-weight: 500;
        color: #888;
        font-style: italic;
        white-space: nowrap;
      }
      .bluemine-command-category {
        font-size: 10px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: #999;
        min-width: 68px;
        flex-shrink: 0;
      }
      .bluemine-command-label {
        font-size: 13px;
        color: #1a1a1a;
        flex: 1;
      }
      #bluemine-command-status-msg {
        padding: 14px;
        color: #888;
        font-size: 13px;
        text-align: center;
      }
      #bluemine-command-footer {
        border-top: 1px solid #f0f0f0;
        padding: 6px 14px;
        font-size: 11px;
        color: #bbb;
        text-align: center;
        letter-spacing: 0.02em;
      }
      #bluemine-chip-row {
        display: flex;
        flex-wrap: wrap;
        gap: 5px;
        padding: 8px 14px 4px;
      }
      #bluemine-chip-row:empty {
        display: none;
      }
      .bluemine-chip {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        background: #eef1ff;
        color: #3d5afe;
        border-radius: 6px;
        padding: 3px 4px 3px 9px;
        font-size: 12px;
        font-weight: 600;
        line-height: 1.4;
        user-select: none;
      }
      .bluemine-chip-remove {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 16px;
        height: 16px;
        border: none;
        background: none;
        color: #3d5afe;
        opacity: 0.6;
        font-size: 14px;
        line-height: 1;
        cursor: pointer;
        padding: 0;
        border-radius: 3px;
      }
      .bluemine-chip-remove:hover {
        opacity: 1;
        background: rgba(61, 90, 254, 0.12);
      }
    `;
    document.head.appendChild(style);
  }

  function openCommandPalette(selectedIds) {
    if (isOpen) return;
    isOpen = true;
    paletteCSRFToken = getPaletteCSRFToken();

    ensureCommandPaletteStyles();

    const overlay = document.createElement("div");
    overlay.id = COMMAND_PALETTE_OVERLAY_ID;

    const selectedCount = selectedIds.length;
    overlay.innerHTML = `
      <div id="bluemine-command-palette">
        <div id="bluemine-chip-row"></div>
        <div id="bluemine-command-input-wrap">
          <input
            id="bluemine-command-input"
            type="text"
            placeholder="Search for commands and people..."
            autocomplete="off"
            spellcheck="false"
          />
          <span id="bluemine-command-badge">${selectedCount} card${selectedCount !== 1 ? "s" : ""} selected</span>
        </div>
        <ul id="bluemine-command-list"></ul>
        <div id="bluemine-command-status-msg">Loading\u2026</div>
        <div id="bluemine-command-footer">\u2191\u2193 navigate \u00b7 Tab queue \u00b7 Enter run \u00b7 Esc close</div>
      </div>
    `;

    document.body.appendChild(overlay);

    overlay.addEventListener("mousedown", (e) => {
      if (e.target === overlay) closePalette();
    });

    const input = document.getElementById("bluemine-command-input");
    if (input) input.focus();

    fetchContextMenuHtml(selectedIds)
      .then((html) => {
        if (!isOpen) return;
        if (!html) {
          setCommandPaletteStatus("Could not load options");
          return;
        }
        const parsed = parseContextMenuCommands(html);
        allCommands = [
          {
            id: "copy-ids",
            category: "Copy",
            label: "Copy IDs",
            disabled: false,
            action: { type: "copy" },
          },
          {
            id: "bulk-edit",
            category: "Bulk Edit",
            label: "Bulk edit",
            disabled: false,
            action: { type: "navigate", url: buildBulkEditUrl(selectedIds) },
          },
          ...parsed,
        ];
        filteredCommands = allCommands;
        activeIndex = getFirstEnabledIndex(filteredCommands);
        renderCommandList();
      })
      .catch(() => {
        if (isOpen) setCommandPaletteStatus("Could not load options");
      });
  }

  function closePalette() {
    isOpen = false;
    allCommands = [];
    filteredCommands = [];
    activeIndex = 0;
    queuedCommands = [];
    const overlay = document.getElementById(COMMAND_PALETTE_OVERLAY_ID);
    if (overlay) overlay.remove();
  }

  document.addEventListener(
    "keydown",
    (e) => {
      if (!isOpen) {
        if (e.key !== " ") return;
        const tag = (document.activeElement?.tagName || "").toLowerCase();
        if (["input", "textarea", "select"].includes(tag)) return;
        if (document.activeElement?.isContentEditable) return;
        const selectedIds = getSelectedIssueIds();
        if (selectedIds.length === 0) return;
        e.preventDefault();
        openCommandPalette(selectedIds);
        return;
      }

      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        closePalette();
        return;
      }

      if (e.key === "Tab") {
        e.preventDefault();
        e.stopPropagation();
        const cmd = filteredCommands[activeIndex];
        // Only patch-type commands can be batched; skip navigate (Bulk Edit).
        if (cmd && !cmd.disabled && cmd.action?.type === "patch") {
          // Replace any existing chip in the same category (e.g. can't set
          // two statuses), otherwise append.
          const existingIdx = queuedCommands.findIndex(
            (c) => c.category === cmd.category,
          );
          if (existingIdx >= 0) {
            queuedCommands[existingIdx] = cmd;
          } else {
            queuedCommands.push(cmd);
          }
          renderChips();
          const input = document.getElementById("bluemine-command-input");
          if (input) input.value = "";
          filteredCommands = allCommands;
          activeIndex = getFirstSelectableIndex(filteredCommands);
          renderCommandList();
        }
        return;
      }

      if (e.key === "Backspace") {
        const input = document.getElementById("bluemine-command-input");
        if (input && input.value === "" && queuedCommands.length > 0) {
          e.preventDefault();
          queuedCommands.pop();
          renderChips();
          filteredCommands = allCommands;
          activeIndex = getFirstSelectableIndex(filteredCommands);
          renderCommandList();
        }
        return;
      }

      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (activeIndex < filteredCommands.length - 1) activeIndex++;
        renderCommandList();
        return;
      }

      if (e.key === "ArrowUp") {
        e.preventDefault();
        if (activeIndex > 0) activeIndex--;
        renderCommandList();
        return;
      }

      if (e.key === "Enter") {
        e.preventDefault();
        if (queuedCommands.length > 0) {
          // Execute all queued chips, also including the currently highlighted
          // item if it hasn't been queued yet.
          const toExecute = [...queuedCommands];
          const activeCmd = filteredCommands[activeIndex];
          if (activeCmd && !activeCmd.disabled && activeCmd.action?.type === "patch") {
            const existingIdx = toExecute.findIndex((c) => c.category === activeCmd.category);
            if (existingIdx >= 0) {
              toExecute[existingIdx] = activeCmd;
            } else {
              toExecute.push(activeCmd);
            }
          }
          const selectedIds = getSelectedIssueIds();
          closePalette();
          executeCommandsBatch(toExecute, selectedIds);
        } else {
          const cmd = filteredCommands[activeIndex];
          if (cmd) executeCommand(cmd);
        }
        return;
      }
    },
    { capture: true },
  );

  document.addEventListener("input", (e) => {
    if (!isOpen) return;
    const input = document.getElementById("bluemine-command-input");
    if (e.target !== input) return;
    filteredCommands = filterCommands(input.value);
    activeIndex = getFirstEnabledIndex(filteredCommands);
    renderCommandList();
  });
}
