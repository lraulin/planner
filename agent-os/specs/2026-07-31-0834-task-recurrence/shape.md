# Shaping — Repeating routine tasks

**Status: active**

## The ask

> Pretty sure AP has a recurrence option to do recurrence without deadlines; to set an item
> to be recreated X amount of time after it is completed. Have we implemented that?

We had not. AP does (manual §3.9.1, "regeneration based" patterns). This spec builds our
version of it.

## The real problem, in Lee's words

> The key thing is that this is for tasks that DO NOT have a deadline. The intention is: I
> don't want to conflate "I should do it today" with a DEADLINE. Like, taxes have a deadline.
> Voting has a deadline. Bills have deadlines. I should play with my cats every day isn't a
> deadline. I should change my pool filter roughly every 2 weeks is not a deadline… Nothing
> explodes if I do it after 15 or even 18 days. […] When the system is overloaded with things
> that are "overdue" because I intend to do them regularly, but it isn't absolutely essential
> that they be done at all, it degrades the signal and makes the "overdue" status unreliable
> and meaningless. So a repeating routine task can appear in my task chooser, but it doesn't
> have a deadline. I can complete it, and then it should not appear in the task chooser until
> it needs to be done again. **Should be done ASAP <> deadline.**

This is a spec about protecting a signal, not about repeating things. Every design choice
below falls out of it.

## What already existed

Most of the machinery was here, half-wired:

| Piece                                                    | State before this spec                                                                                   |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `task_details.deferred_date`                             | Column exists, editable in `TaskForm`, **read by nothing**                                               |
| `postponed` node state                                   | AP's "Deferred"; already excluded from every Chooser view by default                                     |
| `recurrence_frequency` / `recurrence_end` enums          | Exist, used only by `appointments`                                                                       |
| `addDays` / `addMonths` / `addYears` with month clamping | Exist, module-private in `schedule/recurrence.ts`                                                        |
| Chooser `deadlines` view                                 | Already filters to `effectiveDeadline !== null`, so deadline-less routines are correctly invisible there |
| Node recurrence                                          | Nothing                                                                                                  |

So the feature is mostly a matter of connecting things that were already built, plus two
columns and one small table.

## Decisions and the alternatives rejected

### Reset in place, not regenerate a copy

AP creates a **new** node on completion and leaves the completed one behind. Three options
were considered:

| Option                              | Verdict                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Regenerate a copy (AP-faithful)     | **Rejected.** A daily routine leaves ~365 completed duplicates a year in the outline, which Lee explicitly does not want: _"I don't like it when the vast majority of my completed items consists of duplicates of various recurring tasks, many of which represent minor inconsequential habits."_ It also mints a new id every cycle, silently discarding the node's hand-ranked TC Priority position and Focus flag. |
| Reset in place                      | Good, but loses history.                                                                                                                                                                                                                                                                                                                                                                                                |
| **Reset in place + completion log** | **Chosen.** Lee: _"I want completion to create a record of having done it; I might want to check how consistent I've been with certain habits, and it might be important to know when was the last time I did X."_ One row cycles; `task_completions` keeps the history out of sight until something wants it.                                                                                                          |

This is a deliberate divergence from AP, and the reason is recorded here so nobody
"corrects" it back later.

### Date-driven deferral, not the `postponed` state

Parking a deferred routine in the `postponed` state would read nicely — the Chooser already
excludes that state. But something would have to flip it back to `not_started` when the date
arrives, which means a scheduled job. Deriving availability from `deferred_date > today` at
read time is pure, unit-testable, and needs no scheduler. The state stays `not_started`
throughout.

### Deadlines are never touched

AP's regeneration pattern uses the interval to set the **new deadline**. We use it to set the
**defer date** and never write a deadline. This is the entire point of the feature; see the
quote above.

### No staleness escalation (for now)

Lee noted the asymmetry himself — the pool filter arguably should nag at day 25, the cats
never should — but chose "no signal, just reappear" for this slice. Left as a follow-up, with
the constraint that whatever gets built must not route through the deadline machinery.

### Tasks only

> If projects use the exact same recurrence machinery otherwise, might be best to do it for
> consistency, but… If Projects doesn't yet have fields required to make this work, I don't
> think this is a good reason to change that.

Projects have no `deferred_date` — it lives on `task_details`. So: tasks only. Adding
projects later means moving both defer and recurrence up onto `nodes`.

### Children un-complete

Kept from AP §3.9 ("children initialized to the Not Started state"). Cheap here, because
reset-in-place makes it an `UPDATE` over the subtree rather than a deep copy — which is
another point in favour of that choice. Without it, a repeating checklist is useless on its
second run.

## Scope

**In:** two columns on `task_details`; a `task_completions` log; a shared
`applyStateTransition` covering both server write paths; subtree un-completion; a pure
`nextDue` / `isDeferred` engine; Chooser filtering; a derived `Deferred` status; inline form
fields on TaskForm's General tab.

**Out:** projects; AP's date-based patterns; end conditions; Skip Recurrence; lead-time
initialisation; any UI over the completion log. See `plan.md` for the follow-up list.

## The one thing that must not be missed

Node state is written in **two** places — `tree/mutations.ts` `setState` (every grid, the
outline, the Chooser) and `detail/mutations.ts` `saveNodeDetail` (the drawer's State
dropdown, which does not go through `setState`). Both already special-case completion
independently. Recurrence has to fire from both, which is why the logic is extracted into one
shared helper rather than added twice.
