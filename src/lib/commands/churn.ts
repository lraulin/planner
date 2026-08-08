/**
 * A render loop changes a registration many times in one short burst. Ordinary command
 * context changes — selecting another row, for example — can have the same visible command
 * labels, but are spread across separate interactions and must not accumulate forever.
 */
export const COMMAND_CHURN_WINDOW_MS = 1_000;
export const COMMAND_CHURN_LIMIT = 20;

export type CommandChurnState = {
  signature: string;
  count: number;
  windowStartedAt: number;
  warned: boolean;
};

export function initialCommandChurnState(): CommandChurnState {
  return { signature: "", count: 0, windowStartedAt: 0, warned: false };
}

export function advanceCommandChurn(
  current: CommandChurnState,
  signature: string,
  now: number,
): { state: CommandChurnState; shouldWarn: boolean } {
  const continuesBurst =
    signature === current.signature &&
    current.count > 0 &&
    now - current.windowStartedAt <= COMMAND_CHURN_WINDOW_MS;

  const count = continuesBurst ? current.count + 1 : 1;
  const warned = continuesBurst ? current.warned : false;
  const shouldWarn = count > COMMAND_CHURN_LIMIT && !warned;

  return {
    state: {
      signature,
      count,
      windowStartedAt: continuesBurst ? current.windowStartedAt : now,
      warned: warned || shouldWarn,
    },
    shouldWarn,
  };
}
