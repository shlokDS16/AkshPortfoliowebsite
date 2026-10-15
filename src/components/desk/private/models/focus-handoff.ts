// Focus hand-off after he confirms a model's cells (final review M12). The confirm view unmounts when the page refreshes into the scenarios
// view, so it cannot move the focus itself. It arms this note instead, and the Inputs heading of the view that replaces it takes the focus
// when it mounts. The heading mounts twice (the read-only shell, then the loaded calculator), so the note is not consumed on use; it lapses
// after ten seconds, and a mounting heading never takes the focus from something he has already moved to.

const LAPSE_MS = 10_000;
let armedAt = 0;

export function armInputsFocus(): void {
  armedAt = Date.now();
}

export function disarmInputsFocus(): void {
  armedAt = 0;
}

/** True when a confirm just succeeded and nothing has been focused since (the document body holds the focus). */
export function shouldFocusInputs(): boolean {
  if (armedAt === 0 || Date.now() - armedAt > LAPSE_MS) return false;
  const active = document.activeElement;
  return !active || active === document.body;
}
