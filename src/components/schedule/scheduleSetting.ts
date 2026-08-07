import type { SettingCodec } from "@/components/settings/SettingsProvider";
import {
  parseScheduleView,
  serializeScheduleView,
  type ScheduleViewSettings,
} from "@/lib/settings/schedule";

/**
 * The `schedule` scope's codec, in its own module because two components read it.
 *
 * A module constant, not a literal at the call site: `useSetting` memoises the parsed value on
 * the codec's identity, so a fresh object every render re-parses the blob every render.
 */
export const SCHEDULE_VIEW_CODEC: SettingCodec<ScheduleViewSettings> = {
  parse: parseScheduleView,
  serialize: serializeScheduleView,
};
