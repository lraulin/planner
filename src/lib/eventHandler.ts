/**
 * Adapts an async function to a void-returning event prop.
 *
 * Passing an `async` function straight to `onClick` type-checks, but React drops the
 * promise on the floor: a rejected server action becomes an unhandled rejection and the
 * UI simply never updates — no error, no spinner reset, nothing to tell the user the
 * click did nothing. Wrapping routes the rejection to the view's own error surface.
 *
 * Handlers still report their *expected* failures themselves (an `{ ok: false }` result
 * carries a message worth showing). `onError` here is the fallback for the transport
 * failing outright, which no handler has a specific message for.
 */
export function asyncHandler<A extends unknown[]>(
  fn: (...args: A) => Promise<unknown>,
  onError: (message: string) => void,
): (...args: A) => void {
  return (...args) => {
    void fn(...args).catch(() => {
      onError("Something went wrong. Please try again.");
    });
  };
}
