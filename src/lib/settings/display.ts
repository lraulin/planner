import {
  DEFAULT_DATE_FORMAT,
  isDateFormatId,
  type DateFormatId,
} from "@/lib/dateFormat";
import { asRecord } from "./parse";
import { SETTINGS_VERSION } from "./scopes";

export type DisplaySettings = {
  dateFormat: DateFormatId;
};

export const DEFAULT_DISPLAY_SETTINGS: DisplaySettings = {
  dateFormat: DEFAULT_DATE_FORMAT,
};

export function parseDisplaySettings(value: unknown): DisplaySettings {
  const record = asRecord(value);
  return {
    dateFormat:
      record && isDateFormatId(record.dateFormat)
        ? record.dateFormat
        : DEFAULT_DATE_FORMAT,
  };
}

export function serializeDisplaySettings(settings: DisplaySettings): unknown {
  return { v: SETTINGS_VERSION, dateFormat: settings.dateFormat };
}
