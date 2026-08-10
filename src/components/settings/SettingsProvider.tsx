"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  resetSettingScopeAction,
  resetSettingScopesAction,
  saveSettingsAction,
} from "@/app/settings/actions";
import {
  applyPending,
  coalesceWrites,
  readPending,
  type PendingWrite,
} from "@/lib/settings/queue";
import type { SettingsSnapshot } from "@/lib/settings/queries";
import { formatDateKey } from "@/lib/dateFormat";
import { parseDisplaySettings, serializeDisplaySettings } from "@/lib/settings/display";
import { DISPLAY_SCOPE } from "@/lib/settings/scopes";

/**
 * The app's single client-side store, and its only React context.
 *
 * Everything else here passes server-loaded data down as props, which works because each
 * page owns its own data. Preferences do not fit that shape: they are read by grids several
 * levels deep, on every tab, and written from headers, dialogs and toolbars.
 *
 * ## How a value is resolved
 *
 * The server render supplies the base snapshot; an **overlay** of this session's writes sits
 * on top. Reading the overlay through `useSyncExternalStore` — the same discipline the
 * column-layout and chooser hooks already used for `localStorage` — is what keeps the first
 * client paint identical to the server's (the server snapshot is empty) without an effect
 * that would re-render every grid on mount.
 *
 * The overlay is never cleared on a successful save. The base only refreshes on the next
 * server render, so dropping a confirmed write would flash the stale value back. What does
 * get cleared is the `localStorage` mirror, which exists solely so an *unsaved* write
 * survives a reload — see `@/lib/settings/queue`.
 */

const PENDING_KEY = "planner.settings.pending.v1";

/** Long enough to swallow a burst of clicks, short enough to survive closing the tab. */
const FLUSH_DELAY_MS = 600;

/** Referentially stable, so the server snapshot never looks like a change. */
const NO_WRITES: PendingWrite[] = [];

/**
 * Module-level rather than component state because it is read through
 * `useSyncExternalStore`, and because it must be readable from the flush timer without
 * going through a stale closure. There is exactly one provider.
 */
let overlay: PendingWrite[] = NO_WRITES;
let unflushed: PendingWrite[] = NO_WRITES;
let seeded = false;

const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

function mirrorUnflushed(): void {
  try {
    // Tombstones (`value: undefined`) are deliberately not mirrored. After a reload the
    // server render will not carry the reset row anyway, so there is nothing to suppress.
    const durable = unflushed.filter((write) => write.value !== undefined);
    if (durable.length === 0) window.localStorage.removeItem(PENDING_KEY);
    else window.localStorage.setItem(PENDING_KEY, JSON.stringify(durable));
  } catch {
    // Quota or private mode. The write still reaches the server on the next flush; it just
    // will not survive a reload that happens first.
  }
}

/**
 * Adopt whatever a previous session failed to save, once, on first client read. Doing this
 * lazily inside the store — rather than in an effect — is what lets the value be correct
 * the first time anything renders from it.
 */
function ensureSeeded(): void {
  if (seeded) return;
  seeded = true;

  let stored: PendingWrite[] = [];
  try {
    stored = readPending(window.localStorage.getItem(PENDING_KEY));
  } catch {
    stored = [];
  }
  if (stored.length === 0) return;

  overlay = stored;
  unflushed = stored;
}

function getOverlay(): PendingWrite[] {
  ensureSeeded();
  return overlay;
}

/** The server render has no overlay by definition, which is what keeps hydration quiet. */
function getServerOverlay(): PendingWrite[] {
  return NO_WRITES;
}

function queueWrite(scope: string, value: unknown): void {
  ensureSeeded();
  overlay = coalesceWrites([...overlay, { scope, value }]);
  unflushed = coalesceWrites([...unflushed, { scope, value }]);
  mirrorUnflushed();
  emit();
}

/**
 * Record that a scope is gone. A tombstone, not a removal: the base snapshot still holds
 * the old row until the next server render, so the overlay has to actively mask it.
 */
function queueReset(scope: string): void {
  ensureSeeded();
  overlay = coalesceWrites([...overlay, { scope, value: undefined }]);
  unflushed = unflushed.filter((write) => write.scope !== scope);
  mirrorUnflushed();
  emit();
}

function queueResetScopes(scopes: readonly string[]): void {
  ensureSeeded();
  const selected = new Set(scopes);
  if (selected.size === 0) return;
  overlay = coalesceWrites([
    ...overlay,
    ...[...selected].map((scope) => ({ scope, value: undefined })),
  ]);
  unflushed = unflushed.filter((write) => !selected.has(write.scope));
  mirrorUnflushed();
  emit();
}

export type SettingCodec<T> = {
  parse: (raw: unknown) => T;
  serialize: (value: T) => unknown;
};

const DISPLAY_CODEC = {
  parse: parseDisplaySettings,
  serialize: serializeDisplaySettings,
} satisfies SettingCodec<ReturnType<typeof parseDisplaySettings>>;

type SettingsContextValue = {
  snapshot: SettingsSnapshot;
  write: (scope: string, value: unknown) => void;
  resetScope: (scope: string) => void;
  resetScopes: (scopes: readonly string[]) => void;
  /** Set when the server refused or failed a save; the change is still queued locally. */
  saveError: string | null;
};

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({
  initial,
  children,
}: {
  initial: SettingsSnapshot;
  children: ReactNode;
}) {
  const [saveError, setSaveError] = useState<string | null>(null);

  const writes = useSyncExternalStore(subscribe, getOverlay, getServerOverlay);

  const snapshot = useMemo(() => applyPending(initial, writes), [initial, writes]);

  const flush = useCallback(async () => {
    const batch = coalesceWrites(unflushed).filter(
      (write) => write.value !== undefined,
    );
    if (batch.length === 0) return;

    const result = await saveSettingsAction(batch);
    if (!result.ok) {
      // Leave the queue intact so the next flush — or the next page load — retries.
      setSaveError(result.error);
      return;
    }

    // Only drop what this batch covered. A write that landed while the action was in
    // flight is newer than the server's copy and has to stay queued.
    const sent = new Map(batch.map((entry) => [entry.scope, entry.value]));
    unflushed = unflushed.filter(
      (entry) => !(sent.has(entry.scope) && sent.get(entry.scope) === entry.value),
    );
    mirrorUnflushed();
    setSaveError(null);
  }, []);

  // A pending write must not die with the tab. `visibilitychange` fires on mobile and on
  // tab close, where `beforeunload` does not.
  useEffect(() => {
    function onHidden() {
      if (document.visibilityState === "hidden") void flush();
    }
    document.addEventListener("visibilitychange", onHidden);
    return () => document.removeEventListener("visibilitychange", onHidden);
  }, [flush]);

  /**
   * The debounce, and also the replay path: writes left over from a previous session are
   * seeded into the store before the first client read, so they arrive here as a non-empty
   * `writes` and flush like any other change.
   *
   * A failed flush does not retry on a timer — it waits for the next write, the tab being
   * hidden, or the next page load. Retrying on a loop would hammer a server that has
   * already said no, and nothing is lost in the meantime: the queue and its mirror both
   * survive.
   */
  useEffect(() => {
    if (writes.length === 0) return;
    const timer = setTimeout(() => void flush(), FLUSH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [writes, flush]);

  const write = useCallback((scope: string, value: unknown) => {
    queueWrite(scope, value);
  }, []);

  const resetScope = useCallback((scope: string) => {
    queueReset(scope);
    void resetSettingScopeAction(scope).then((result) => {
      setSaveError(result.ok ? null : result.error);
    });
  }, []);

  const resetScopes = useCallback((scopes: readonly string[]) => {
    const selected = [...new Set(scopes)];
    if (selected.length === 0) return;
    queueResetScopes(selected);
    void resetSettingScopesAction(selected).then((result) => {
      setSaveError(result.ok ? null : result.error);
    });
  }, []);

  const value = useMemo(
    () => ({ snapshot, write, resetScope, resetScopes, saveError }),
    [snapshot, write, resetScope, resetScopes, saveError],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

function useSettingsContext(): SettingsContextValue {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error("useSetting must be used inside <SettingsProvider>");
  }
  return context;
}

/**
 * One scope's value, parsed through its codec, plus the writers for it.
 *
 * `codec` must be a module-level constant, or memoised where it depends on something —
 * a codec rebuilt inline would re-parse the blob on every render of every grid.
 */
export function useSetting<T>(scope: string, codec: SettingCodec<T>) {
  const { snapshot, write, resetScope } = useSettingsContext();

  const raw = snapshot[scope];
  const value = useMemo(() => codec.parse(raw), [codec, raw]);

  const update = useCallback(
    (next: T) => write(scope, codec.serialize(next)),
    [write, scope, codec],
  );

  /**
   * Patch from the current value. Takes a recipe rather than an object so a caller cannot
   * accidentally drop the fields it did not mention — a whole-scope write is how the
   * column layout would get wiped by a filter change.
   */
  const patch = useCallback(
    (recipe: (current: T) => T) => write(scope, codec.serialize(recipe(value))),
    [write, scope, codec, value],
  );

  const reset = useCallback(() => resetScope(scope), [resetScope, scope]);

  return { value, update, patch, reset };
}

/** The editable singleton display preference, including its immediate reset path. */
export function useDisplaySettings() {
  return useSetting(DISPLAY_SCOPE, DISPLAY_CODEC);
}

/**
 * Per-user standalone date formatter derived from this provider's server-loaded snapshot.
 *
 * The returned function is stable until the preference changes. Keeping the selected format
 * in React context — rather than mutable module state — also keeps concurrent server renders
 * for different users isolated by construction.
 */
export function useDateFormatter() {
  const { value } = useDisplaySettings();
  return useCallback(
    (dateKey: string | null | undefined) => formatDateKey(dateKey, value.dateFormat),
    [value.dateFormat],
  );
}

/**
 * Clear any scope by id, for the caller that is deleting the thing a scope belongs to
 * rather than editing it — `useSetting(...).reset` only reaches its own.
 */
export function useResetScope() {
  return useSettingsContext().resetScope;
}

/**
 * Copy one scope's stored value to another, for the caller **forking** a scope rather than
 * editing it.
 *
 * Saving a view has to carry the module's own per-view settings with it. Those live in their
 * own view-keyed scopes — the Task Chooser's weights in `chooser:{viewId}`, Notes' mode and
 * filter in `notes:{viewId}` — so a new view's scope starts empty and would fall back to the
 * module's defaults. The user would name the grid in front of them and get something else.
 *
 * Copies the raw stored value rather than a parsed one, deliberately: this has no business
 * knowing any module's payload shape, and a round-trip through the wrong codec would drop
 * fields it did not recognise.
 */
export function useCopyScope() {
  const { snapshot, write } = useSettingsContext();

  return useCallback(
    (from: string, to: string) => {
      const value = snapshot[from];
      // Nothing stored means the source is on its defaults, and so is the destination.
      if (value !== undefined) write(to, value);
    },
    [snapshot, write],
  );
}

export function useAllSettings() {
  const { snapshot, resetScope, resetScopes, saveError } = useSettingsContext();

  const scopes = useMemo(
    () =>
      Object.keys(snapshot)
        .filter((scope) => snapshot[scope] !== undefined)
        .sort(),
    [snapshot],
  );

  return { snapshot, scopes, resetScope, resetScopes, saveError };
}
