import type { SettingCodec } from "@/components/settings/SettingsProvider";
import {
  parseSchedules,
  serializeSchedules,
  type SchedulesSettings,
} from "@/lib/settings/finances";

export const SCHEDULES_CODEC: SettingCodec<SchedulesSettings> = {
  parse: parseSchedules,
  serialize: serializeSchedules,
};
