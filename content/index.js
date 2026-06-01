const _removeBoardOverlay = (() => {
  if (!isAgileBoardPage()) return null;
  const el = document.createElement("div");
  el.style.cssText =
    "position:fixed;inset:0;background:#fff;z-index:999999;pointer-events:none";
  document.documentElement.appendChild(el);
  let removed = false;
  return () => {
    if (removed) return;
    removed = true;
    requestIdleCallback(() => el.remove(), { timeout: 3000 });
  };
})();

browserAPI.storage.local.get(
  {
    [GITLAB_MR_FEATURE_KEY]: false,
    [ENHANCED_AGILE_BOARD_FEATURE_KEY]: false,
    [ENHANCED_ISSUE_EDIT_PAGE_FEATURE_KEY]: false,
    [SHIFT_HOVER_SELECTION_FEATURE_KEY]: false,
    [COMMAND_PALETTE_FEATURE_KEY]: false,
    [START_CLAUDE_FEATURE_KEY]: false,
    [START_CLAUDE_PROMPT_PREFIX_KEY]: "",
    [START_CLAUDE_PROJECT_PATH_MAP_KEY]: "",
  },
  async (result) => {
    if (result[ENHANCED_AGILE_BOARD_FEATURE_KEY] && isAgileBoardPage()) {
      window.addEventListener("pageshow", (event) => {
        if (event.persisted) {
          softReloadBoard(result);
        }
      });
    }

    const matchesDetectedRedmineHeaders = await isDetectedRedmineTab();
    if (!matchesDetectedRedmineHeaders) {
      if (result[ENHANCED_AGILE_BOARD_FEATURE_KEY] && isAgileBoardPage()) {
        ensureBoardScrollbarVisible();
        runCollapsedGroupsFeature();
        runNativeContextMenuSoftReload(result);
      }
      if (result[SHIFT_HOVER_SELECTION_FEATURE_KEY] && isAgileBoardPage()) {
        runShiftHoverSelectionFeature();
      }
      if (result[COMMAND_PALETTE_FEATURE_KEY] && isAgileBoardPage()) {
        runCommandPaletteFeature(result);
      }
      if (result[START_CLAUDE_FEATURE_KEY] && isAgileBoardPage()) {
        runStartClaudeButtonFeature(result);
      }
      if (result[ENHANCED_ISSUE_EDIT_PAGE_FEATURE_KEY] && isIssueEditPage()) {
        runEnhancedIssueEditPageFeature();
      }
      _removeBoardOverlay?.();
      return;
    }

    if (result[ENHANCED_AGILE_BOARD_FEATURE_KEY]) {
      if (isAgileBoardPage()) ensureBoardScrollbarVisible();
      runCollapsedGroupsFeature();
      runNativeContextMenuSoftReload(result);
    }
    if (result[SHIFT_HOVER_SELECTION_FEATURE_KEY] && isAgileBoardPage()) {
      runShiftHoverSelectionFeature();
    }
    if (result[COMMAND_PALETTE_FEATURE_KEY] && isAgileBoardPage()) {
      runCommandPaletteFeature(result);
    }
    if (result[START_CLAUDE_FEATURE_KEY] && isAgileBoardPage()) {
      runStartClaudeButtonFeature(result);
    }
    if (result[ENHANCED_ISSUE_EDIT_PAGE_FEATURE_KEY] && isIssueEditPage()) {
      runEnhancedIssueEditPageFeature();
    }

    if (result[GITLAB_MR_FEATURE_KEY]) {
      await runGitlabMrStatusFeature({ onCachedApplied: _removeBoardOverlay });
    }
    _removeBoardOverlay?.();
  },
);
