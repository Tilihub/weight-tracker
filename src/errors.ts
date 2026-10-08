// A caught error is typed unknown or any and can be anything thrown, not only
// an Error, so the narrowing happens here, once.
export function errorToString(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
