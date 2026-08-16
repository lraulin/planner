"use client";

import { useId } from "react";
import {
  parsePayday,
  serializePayday,
  type PaydaySettings,
} from "@/lib/settings/finances";
import { PAYDAY_SCOPE } from "@/lib/settings/scopes";
import { useSetting, type SettingCodec } from "./SettingsProvider";

/**
 * Correct the pay cadence the Finances dashboard detected.
 *
 * Detection reads a biweekly series out of the register by cadence rather than by employer
 * name, which is why it survived two job changes — but it is retrospective by construction.
 * After a job change, or while a sync runs a few days behind, it is confidently wrong about
 * the number the dashboard divides everything by. This is the correction, and the dashboard
 * says which of the two it used rather than presenting a projection as a fact.
 *
 * **Both fields or neither.** An anchor with no cadence is not a schedule, and completing it
 * with a fortnight would invent the half the user did not give — so `parsePayday` drops a
 * half-filled pair back to detection instead.
 */
const PAYDAY_CODEC: SettingCodec<PaydaySettings> = {
  parse: parsePayday,
  serialize: serializePayday,
};

export function PayCadencePanel() {
  const headingId = useId();
  const anchorId = useId();
  const cadenceId = useId();
  const { value, patch } = useSetting(PAYDAY_SCOPE, PAYDAY_CODEC);

  const complete = value.anchorDate !== null && value.cadenceDays !== null;

  return (
    <section aria-labelledby={headingId} className="mt-4 rounded border border-rule">
      <div className="border-b border-rule bg-surface-raised px-4 py-2.5">
        <h2
          id={headingId}
          className="text-[0.75rem] font-semibold tracking-wider text-ink-muted uppercase"
        >
          Pay cadence
        </h2>
      </div>
      <div className="px-4 py-3">
        <p className="text-[0.8125rem] leading-relaxed text-ink-muted">
          The Finances dashboard works out your next payday from the deposits already in
          the register. Set both fields here to override that — useful after a job
          change, when the detected series is still describing the old one. Leave either
          blank to go back to detection.
        </p>

        <div className="mt-3 flex flex-wrap items-end gap-4">
          <div>
            <label
              htmlFor={anchorId}
              className="block text-[0.8125rem] font-medium text-ink"
            >
              A payday
            </label>
            <input
              id={anchorId}
              type="date"
              value={value.anchorDate ?? ""}
              onChange={(event) =>
                patch((current) => ({
                  ...current,
                  anchorDate: event.target.value === "" ? null : event.target.value,
                }))
              }
              className="mt-1 min-h-tap rounded border border-rule bg-surface px-2 py-1 text-base text-ink md:min-h-0 md:text-[0.8125rem]"
            />
          </div>
          <div>
            <label
              htmlFor={cadenceId}
              className="block text-[0.8125rem] font-medium text-ink"
            >
              Days between paydays
            </label>
            <input
              id={cadenceId}
              type="number"
              inputMode="numeric"
              min={1}
              max={366}
              value={value.cadenceDays ?? ""}
              placeholder="14"
              onChange={(event) =>
                patch((current) => ({
                  ...current,
                  cadenceDays:
                    event.target.value === "" ? null : Number(event.target.value),
                }))
              }
              className="mt-1 min-h-tap w-24 rounded border border-rule bg-surface px-2 py-1 text-base text-ink md:min-h-0 md:text-[0.8125rem]"
            />
          </div>
        </div>

        <p className="mt-2 text-[0.75rem] text-ink-muted">
          {complete
            ? "The dashboard is using this instead of the detected cadence."
            : "The dashboard is detecting your cadence from your deposits."}
        </p>
      </div>
    </section>
  );
}
