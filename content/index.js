browserAPI.storage.local.get(
  {
    [GITLAB_MR_FEATURE_KEY]: false,
    [ENHANCED_AGILE_BOARD_FEATURE_KEY]: false,
    [SHIFT_HOVER_SELECTION_FEATURE_KEY]: false,
    [COMMAND_PALETTE_FEATURE_KEY]: false,
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

    if (result[GITLAB_MR_FEATURE_KEY]) {
      await runGitlabMrStatusFeature();
    }
  },
);
