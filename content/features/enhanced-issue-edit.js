const ENHANCED_ISSUE_EDIT_ASSIGNEE_SELECTOR =
  'select#issue_assigned_to_id, select[name="issue[assigned_to_id]"]';
const ENHANCED_ISSUE_EDIT_ASSIGN_RANDOM_CLASS =
  "bluemine-assign-random-button";
const ENHANCED_ISSUE_EDIT_ASSIGNEE_ENHANCED_ATTRIBUTE =
  "data-bluemine-assign-random-enhanced";
const ENHANCED_ISSUE_EDIT_STYLE_ID = "bluemine-enhanced-issue-edit-style";

let _enhancedIssueEditObserver = null;

function enhancedIssueEditEnsureStyles() {
  if (document.getElementById(ENHANCED_ISSUE_EDIT_STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = ENHANCED_ISSUE_EDIT_STYLE_ID;
  style.textContent = `
    .${ENHANCED_ISSUE_EDIT_ASSIGN_RANDOM_CLASS} {
      display: inline-flex;
      align-items: center;
      margin-left: 6px;
      padding: 0;
      border: 0;
      background: transparent;
      color: #169;
      font: inherit;
      cursor: pointer;
      vertical-align: baseline;
      white-space: nowrap;
    }

    .${ENHANCED_ISSUE_EDIT_ASSIGN_RANDOM_CLASS}:hover {
      color: #c61a1a;
      text-decoration: underline;
    }

    .${ENHANCED_ISSUE_EDIT_ASSIGN_RANDOM_CLASS}:disabled {
      color: #999;
      cursor: default;
      text-decoration: none;
    }
  `;
  (document.head || document.documentElement).appendChild(style);
}

function enhancedIssueEditGetAssignableOptions(select) {
  return Array.from(select.options || []).filter((option) => {
    const value = String(option.value || "").trim();
    if (!value || option.disabled || option.hidden) return false;

    const group = option.closest("optgroup");
    return !group || !group.disabled;
  });
}

function enhancedIssueEditPickRandomOption(select) {
  const options = enhancedIssueEditGetAssignableOptions(select);
  if (options.length === 0) return null;

  const currentValue = String(select.value || "");
  const alternatives =
    options.length > 1
      ? options.filter((option) => String(option.value || "") !== currentValue)
      : [];
  const pool = alternatives.length > 0 ? alternatives : options;
  return pool[Math.floor(Math.random() * pool.length)] || null;
}

function enhancedIssueEditDispatchSelectionChange(select) {
  select.dispatchEvent(new Event("input", { bubbles: true }));
  select.dispatchEvent(new Event("change", { bubbles: true }));
}

function enhancedIssueEditFindAssignToMeControl(field) {
  const nativeLink = field?.querySelector(".assign-to-me-link");
  if (nativeLink) return nativeLink;

  return Array.from(field?.querySelectorAll("a, button") || []).find((node) =>
    /^assign\s+to\s+me$/i.test(String(node.textContent || "").trim()),
  );
}

function enhancedIssueEditAssignRandom(select, button) {
  const option = enhancedIssueEditPickRandomOption(select);
  if (!option) {
    if (button) button.disabled = true;
    return;
  }

  select.selectedIndex = option.index;
  enhancedIssueEditDispatchSelectionChange(select);
  if (button) button.disabled = false;
}

function enhancedIssueEditFindInsertionPoint(select) {
  const field =
    select.closest("p, .attribute, .form-field, .field, .splitcontentleft, .splitcontentright") ||
    select.parentElement;
  const assignToMe = enhancedIssueEditFindAssignToMeControl(field);
  if (assignToMe) {
    return { parent: assignToMe.parentNode, after: assignToMe };
  }

  const enhancedSelect =
    select.nextElementSibling?.matches?.(".select2-container, .chosen-container")
      ? select.nextElementSibling
      : field?.querySelector(".select2-container, .chosen-container");
  if (enhancedSelect) {
    return { parent: enhancedSelect.parentNode, after: enhancedSelect };
  }

  return { parent: select.parentNode, after: select };
}

function enhancedIssueEditRefreshButton(select, button) {
  button.disabled = enhancedIssueEditGetAssignableOptions(select).length === 0;
}

function enhancedIssueEditFindExistingButton(select) {
  const field =
    select.closest("p, .attribute, .form-field, .field, .splitcontentleft, .splitcontentright") ||
    select.parentElement;
  return field?.querySelector(`.${ENHANCED_ISSUE_EDIT_ASSIGN_RANDOM_CLASS}`);
}

function enhancedIssueEditEnhanceAssigneeSelect(select) {
  if (!select) {
    return;
  }

  if (select.getAttribute(ENHANCED_ISSUE_EDIT_ASSIGNEE_ENHANCED_ATTRIBUTE) === "1") {
    const existingButton = enhancedIssueEditFindExistingButton(select);
    if (existingButton) {
      enhancedIssueEditRefreshButton(select, existingButton);
      return;
    }
  }

  const insertionPoint = enhancedIssueEditFindInsertionPoint(select);
  if (!insertionPoint.parent || !insertionPoint.after) return;

  const button = document.createElement("button");
  button.type = "button";
  button.className = ENHANCED_ISSUE_EDIT_ASSIGN_RANDOM_CLASS;
  button.textContent = "Assign random";
  button.title = "Assign a random person";
  button.setAttribute("aria-label", "Assign a random person");
  button.addEventListener("click", () => {
    enhancedIssueEditAssignRandom(select, button);
  });

  enhancedIssueEditRefreshButton(select, button);
  insertionPoint.parent.insertBefore(button, insertionPoint.after.nextSibling);
  select.setAttribute(ENHANCED_ISSUE_EDIT_ASSIGNEE_ENHANCED_ATTRIBUTE, "1");
}

function enhancedIssueEditEnhanceAssigneeSelects(root = document) {
  const selectNodes = [];
  if (root.matches?.(ENHANCED_ISSUE_EDIT_ASSIGNEE_SELECTOR)) {
    selectNodes.push(root);
  }
  root
    .querySelectorAll?.(ENHANCED_ISSUE_EDIT_ASSIGNEE_SELECTOR)
    .forEach((select) => selectNodes.push(select));

  selectNodes.forEach(enhancedIssueEditEnhanceAssigneeSelect);
}

function enhancedIssueEditMutationNeedsRefresh(mutation) {
  if (mutation.target?.matches?.(ENHANCED_ISSUE_EDIT_ASSIGNEE_SELECTOR)) {
    return true;
  }

  return Array.from(mutation.addedNodes || []).some(
    (node) =>
      node.nodeType === Node.ELEMENT_NODE &&
      (node.matches?.(ENHANCED_ISSUE_EDIT_ASSIGNEE_SELECTOR) ||
        node.querySelector?.(ENHANCED_ISSUE_EDIT_ASSIGNEE_SELECTOR)),
  );
}

function runEnhancedIssueEditPageFeature() {
  if (!isIssueEditPage()) return;

  enhancedIssueEditEnsureStyles();
  enhancedIssueEditEnhanceAssigneeSelects();

  if (_enhancedIssueEditObserver) {
    _enhancedIssueEditObserver.disconnect();
    _enhancedIssueEditObserver = null;
  }

  if (!document.body) return;

  _enhancedIssueEditObserver = new MutationObserver((mutations) => {
    if (mutations.some(enhancedIssueEditMutationNeedsRefresh)) {
      enhancedIssueEditEnhanceAssigneeSelects();
    }
  });
  _enhancedIssueEditObserver.observe(document.body, {
    childList: true,
    subtree: true,
  });
}
