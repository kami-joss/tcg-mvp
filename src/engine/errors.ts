/** Levée par `applyAction` quand l'action n'est pas légale dans l'état courant. */
export class IllegalActionError extends Error {
  override name = 'IllegalActionError';
}
