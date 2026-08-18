import type { FindSettings } from "@/lib/settings/find";
import { FIELD_CLASS_LABELS, FIND_SOURCES } from "./sources";
import { FIND_FIELD_CLASSES } from "./types";

/**
 * What the collapsed scope row says on a phone.
 *
 * Worth a sentence rather than a bare "Scope": collapsed, this row is the only thing on
 * screen explaining why a result is missing, so it has to say what is switched on.
 *
 * Sources are **named** while there are few enough to name — "Notes and Finances" is the
 * useful sentence — and counted otherwise. Options appear only when one is on: "no options"
 * is the state you are in almost always, and printing it every time trains you to stop
 * reading the row.
 */
export function summarizeFindScope(settings: FindSettings): string {
  const total = FIND_SOURCES.length;
  const sources =
    settings.sources.length === total
      ? "everything"
      : settings.sources.length <= 2
        ? settings.sources
            .map((id) => FIND_SOURCES.find((source) => source.id === id)?.label ?? id)
            .join(" and ")
        : `${settings.sources.length} of ${total} sources`;

  const extras = [
    settings.fieldClasses.length < FIND_FIELD_CLASSES.length
      ? settings.fieldClasses
          .map((id) => FIELD_CLASS_LABELS[id].toLowerCase())
          .join(", ")
      : null,
    settings.match.matchCase ? "match case" : null,
    settings.match.wholeWord ? "whole word" : null,
    settings.match.regex ? "regex" : null,
    settings.include.completed ? "completed" : null,
    settings.include.shelved ? "past & shelved" : null,
  ].filter((entry): entry is string => entry !== null);

  return extras.length ? `${sources} · ${extras.join(" · ")}` : sources;
}
