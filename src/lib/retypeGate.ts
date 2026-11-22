/**
 * After a miss (wrong typed answer, Reveal, or Skip), the learner must type a
 * matching answer before Enter / Space / Next can continue. A correct first
 * try does not require this step. Confirming the retype never changes the
 * already-recorded grade.
 */

export function mustConfirmRetype(
  revealed: boolean,
  correct: boolean | null,
  retypeConfirmed: boolean,
): boolean {
  return revealed && correct !== true && !retypeConfirmed;
}

export function canAdvanceAfterReveal(
  revealed: boolean,
  correct: boolean | null,
  retypeConfirmed: boolean,
): boolean {
  return revealed && (correct === true || retypeConfirmed);
}
