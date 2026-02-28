function runShiftHoverSelectionFeature() {
  if (!isAgileBoardPage()) return;

  let shiftHeld = false;

  function selectCard(card) {
    if (!card || card.classList.contains("context-menu-selection")) return;
    card.classList.add("context-menu-selection");
    const checkbox = card.querySelector('input[name="ids[]"]');
    if (checkbox) {
      checkbox.checked = true;
      checkbox.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }

  document.addEventListener(
    "keydown",
    (e) => {
      if (e.key !== "Shift") return;
      shiftHeld = true;
      selectCard(document.querySelector(".issue-card:hover"));
    },
    { capture: true },
  );

  document.addEventListener(
    "keyup",
    (e) => {
      if (e.key === "Shift") shiftHeld = false;
    },
    { capture: true },
  );

  window.addEventListener("blur", () => {
    shiftHeld = false;
  });

  document.addEventListener("mouseover", (e) => {
    if (!shiftHeld) return;
    selectCard(e.target.closest(".issue-card"));
  });
}
