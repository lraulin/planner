"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { findAction } from "@/app/find/actions";
import type { GridDefaults } from "@/components/grid/useGridState";
import { useModuleViews } from "@/components/grid/useModuleViews";
import { useToday } from "@/components/grid/useToday";
import { useSetting, type SettingCodec } from "@/components/settings/SettingsProvider";
import { useViewStateUrl } from "@/components/url/useViewStateUrl";
import { makeMatcher } from "@/lib/find/matcher";
import { FIND_MIN_QUERY_LENGTH, type FindOutcome } from "@/lib/find/types";
import { parseFindSettings, type FindSettings } from "@/lib/settings/find";
import { FIND_COLUMN_IDS, findColumns } from "./findColumns";
import { FindResults } from "./FindResults";
import { FindScope } from "./FindScope";

const FIND_SCOPE = "find";
const FIND_CODEC = {
  parse: parseFindSettings,
  serialize: (value: FindSettings) => value,
} satisfies SettingCodec<FindSettings>;

const FIND_VIEWS = [{ id: "all", label: "All Results" }] as const;

function viewDefaults(): GridDefaults {
  return {
    order: [...FIND_COLUMN_IDS],
    // Type first, which is the clustering Achieve's dialog got from its Type column and the
    // question people ask of a mixed result list ("show me the notes"). The search itself
    // already ranked best-hit-first; a default sort is a starting point, not a lock.
    sorts: [{ columnId: "type", direction: "asc" }],
  };
}

const EMPTY: FindOutcome = { results: [], totalMatched: 0, capped: false };

export function FindView({ initialQuery }: { initialQuery: string }) {
  const todayKey = useToday();
  const { value: settings, update: setSettings } = useSetting(FIND_SCOPE, FIND_CODEC);
  const { setQuery } = useViewStateUrl();

  const [draft, setDraft] = useState(initialQuery);
  const [outcome, setOutcome] = useState<FindOutcome>(EMPTY);
  /** The query the results on screen came from, so the empty state can name it. */
  const [ranQuery, setRanQuery] = useState<string | null>(null);
  /** Bumped per completed search; keys `FindResults` so each one starts clean. */
  const [generation, setGeneration] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const views = useModuleViews({
    moduleId: "find",
    builtIn: FIND_VIEWS,
    defaultViewId: "all",
    columns: findColumns,
    defaultsFor: viewDefaults,
  });

  const run = useCallback(
    (query: string, current: FindSettings) => {
      const trimmed = query.trim();
      if (trimmed.length < FIND_MIN_QUERY_LENGTH) {
        setError(`Type at least ${FIND_MIN_QUERY_LENGTH} characters to search.`);
        return;
      }

      // Validate the pattern here as well as on the server, so a half-typed regex reports
      // itself without a round trip and without discarding the results already on screen.
      const matcher = makeMatcher(trimmed, current.match);
      if (!matcher.ok) {
        setError(matcher.error);
        return;
      }

      setError(null);
      startTransition(async () => {
        const result = await findAction(
          {
            query: trimmed,
            sources: current.sources,
            fieldClasses: current.fieldClasses,
            match: current.match,
            include: current.include,
          },
          todayKey,
        );
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setOutcome(result.data);
        setRanQuery(trimmed);
        setGeneration((value) => value + 1);
        // Only a search that ran goes in the address bar. Writing it before validation left
        // `?q=` holding a pattern that reproduces the error on every reload.
        setQuery(trimmed);
      });
    },
    [todayKey, setQuery],
  );

  /**
   * Run the search the URL asked for, once the browser can say what day it is.
   *
   * `todayKey` is null until hydration and decides whether a shelf has expired, so searching
   * before it settles would silently use "never expires". That is also why the first render is
   * not server-side: the server does not know the reader's wall-clock day.
   */
  const ranForUrl = useRef<string | null>(null);
  useEffect(() => {
    if (!initialQuery || !todayKey) return;
    if (ranForUrl.current === initialQuery) return;
    ranForUrl.current = initialQuery;
    setDraft(initialQuery);
    run(initialQuery, settings);
  }, [initialQuery, todayKey, run, settings]);

  /** Changing the scope re-runs an existing search, so the chips feel live. */
  const changeSettings = useCallback(
    (next: FindSettings) => {
      setSettings(next);
      if (ranQuery) run(ranQuery, next);
    },
    [setSettings, ranQuery, run],
  );

  const submit = useCallback(() => {
    run(draft, settings);
  }, [draft, run, settings]);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface">
      <div className="flex flex-none items-center gap-2 px-3 py-2">
        <input
          type="search"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              submit();
            }
          }}
          placeholder="Find text in everything…"
          aria-label="Find text in everything"
          autoFocus
          className="min-h-tap min-w-0 flex-1 rounded border border-rule bg-surface-raised px-2 py-1 text-ink placeholder:text-ink-faint focus:border-rule-strong focus:outline-none md:min-h-0"
        />
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="min-h-tap flex-none rounded border border-rule-strong bg-surface-raised px-3 py-1 text-[0.8125rem] text-ink hover:bg-select disabled:opacity-60 md:min-h-0"
        >
          {pending ? "Finding…" : "Find"}
        </button>
        {/*
          The result count belongs here, not in the grid's chip bar. `Showing N of M` is the
          grid saying how much *it* is narrowing; this is how much the search found, and it
          has to be visible even when the grid is narrowing nothing.
        */}
        {ranQuery !== null && !pending && (
          <span className="tabular flex-none whitespace-nowrap text-[0.75rem] text-ink-muted">
            {outcome.totalMatched === 1
              ? "1 result"
              : `${outcome.totalMatched} results`}
          </span>
        )}
      </div>

      <FindScope settings={settings} onChange={changeSettings} />

      {error && (
        <p role="status" className="flex-none px-3 py-1 text-[0.75rem] text-priority-a">
          {error}
        </p>
      )}
      {outcome.capped && (
        <p role="status" className="flex-none px-3 py-1 text-[0.75rem] text-ink-muted">
          Showing the first {outcome.results.length} — narrow your search to see the
          rest.
        </p>
      )}

      <FindResults
        key={generation}
        results={outcome.results}
        views={views}
        emptyState={
          <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center text-[0.9375rem] text-ink-muted">
            {ranQuery ? (
              <>
                <p>Nothing matches “{ranQuery}”.</p>
                <p className="text-[0.8125rem] text-ink-faint">
                  Try more sources, or turn on Completed and Past &amp; shelved.
                </p>
              </>
            ) : (
              <>
                <p>Search every record in the app.</p>
                <p className="text-[0.8125rem] text-ink-faint">
                  Outline items and their sub-records, notes, appointments, contacts,
                  the library, metrics, workouts and finances.
                </p>
              </>
            )}
          </div>
        }
      />
    </div>
  );
}
