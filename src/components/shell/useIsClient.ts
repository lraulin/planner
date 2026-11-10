import { useSyncExternalStore } from "react";

function subscribeNever() {
  return () => {};
}

/**
 * False during SSR and hydration; true after the client has painted the shell.
 *
 * A virtualized grid uses it to send no rows from the server: the server cannot know which
 * rows are in view, so rendering all of them into the HTML is the cost virtualizing exists
 * to avoid.
 */
export function useIsClient(): boolean {
  return useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false,
  );
}
