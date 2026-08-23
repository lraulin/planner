/** Payee ids embedded in schedule JSONB, including a malformed-but-recognizable condition. */
export function storedSchedulePayeeIds(conditions: unknown): string[] {
  if (!Array.isArray(conditions)) return [];
  const ids: string[] = [];

  for (const condition of conditions) {
    if (
      typeof condition !== "object" ||
      condition === null ||
      (condition as { field?: unknown }).field !== "payee"
    ) {
      continue;
    }
    const value = (condition as { value?: unknown }).value;
    if (typeof value === "string") ids.push(value);
    else if (Array.isArray(value)) {
      for (const entry of value) if (typeof entry === "string") ids.push(entry);
    }
  }

  return [...new Set(ids)];
}
