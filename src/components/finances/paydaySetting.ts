import type { SettingCodec } from "@/components/settings/SettingsProvider";
import {
  parsePayday,
  serializePayday,
  type PaydaySettings,
} from "@/lib/settings/finances";

/**
 * The payday override, ready for `useSetting`.
 *
 * Shared rather than declared per page: the dashboard and the Commitments grid both compute
 * holds against the next payday, and two copies of this codec would let them disagree about
 * when that is. It sits in the component layer because `SettingCodec` does — `src/lib` does not
 * import from `src/components`.
 */
export const PAYDAY_CODEC: SettingCodec<PaydaySettings> = {
  parse: parsePayday,
  serialize: serializePayday,
};
