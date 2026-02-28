/* global browserAPI */

const GITLAB_MR_FEATURE_KEY = "feature.gitlabMrStatus.enabled";
const ENHANCED_AGILE_BOARD_FEATURE_KEY =
  "feature.restoreScrollOnReload.enabled";
const SHIFT_HOVER_SELECTION_FEATURE_KEY = "feature.shiftHoverSelection.enabled";
const COMMAND_PALETTE_FEATURE_KEY = "feature.commandPalette.enabled";
const COMMAND_PALETTE_OVERLAY_ID = "bluemine-command-palette-overlay";
const COMMAND_PALETTE_STYLE_ID = "bluemine-command-palette-style";
const COMMAND_PALETTE_CATEGORIES = new Set([
  "Status",
  "Assignee",
  "Tracker",
  "Target version",
  "Merged",
  "Reviewer",
  "Reviewed",
]);
const COMMAND_PALETTE_CATEGORY_PREFIXES = [
  { prefix: "as", category: "Assignee" },
  { prefix: "re", category: "Reviewer" },
  { prefix: "tr", category: "Tracker" },
  { prefix: "tv", category: "Target version" },
  { prefix: "mg", category: "Merged" },
  { prefix: "rd", category: "Reviewed" },
];
const COMMAND_PALETTE_ID_SEPARATOR_KEY = "settings.commandPalette.idSeparator";
const COMMAND_PALETTE_STATUS_SHORTCUTS = {
  cl: "closed",
  new: "new",
  ip: "in progress",
  rs: "resolved",
  fb: "feedback",
  rj: "rejected",
  oh: "on hold",
  co: "confirmed",
};
const BOARD_PATH_REGEX = /\/projects\/([^/]+)\/agile\/board\/?$/;
const MR_TITLE_PREFIX_REGEX = /^(\d{5}(?:\s*[^\d\s]\s*\d{5})*) - /;
const MR_CONTAINER_CLASS = "bluemine-mr-status";
const MR_STYLE_ID = "bluemine-mr-status-style";
const MR_ATTRIBUTE_LINE_CLASS = "bluemine-gitlab-attribute-line";
const GITLAB_ASSIGNEE_AVATAR_CLASS = "bluemine-gitlab-assignee-avatar";
const GITLAB_FADE_IN_CLASS = "bluemine-gitlab-fade-in";
const MR_CARD_STATUS_SIGNATURE_ATTRIBUTE =
  "data-bluemine-mr-card-status-signature";
const MR_STORY_STATUS_SIGNATURE_ATTRIBUTE =
  "data-bluemine-mr-story-status-signature";
const MR_DETAIL_SIGNATURE_ATTRIBUTE = "data-bluemine-mr-detail-signature";
const REDMINE_REVIEWER_NAME_ATTRIBUTE = "data-bluemine-redmine-reviewer-name";
const GITLAB_ICON_PATH =
  "M22.547 13.374l-2.266-6.977a.783.783 0 0 0-.744-.53h-3.03L12 19.78 7.494 5.867H4.463a.783.783 0 0 0-.744.53l-2.266 6.977a1.523 1.523 0 0 0 .553 1.704L12 22.422l9.994-7.344a1.523 1.523 0 0 0 .553-1.704Z";
const COLLAPSED_GROUPS_SESSION_KEY_PREFIX = "bluemine.collapsedGroups.v1.";
const COLLAPSED_GROUP_NONE_ID = "__none__";
const SWIMLANE_TOOLBAR_ID = "bluemine-swimlane-toolbar";
const SWIMLANE_TOOLBAR_STYLE_ID = "bluemine-swimlane-toolbar-style";

