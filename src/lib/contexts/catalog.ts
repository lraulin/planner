/** The master list is case-insensitive, while preserving the spelling the user chose. */
export function normaliseContextName(value: string): {
  name: string;
  normalizedName: string;
} {
  const name = value.trim();
  if (!name) throw new Error("Context name cannot be empty.");
  return { name, normalizedName: name.toLowerCase() };
}

/** Suggestions for the comma-delimited token currently being typed. */
export function contextSuggestions(
  catalog: readonly string[],
  input: string,
): string[] {
  const token = input.split(",").at(-1)?.trim().toLowerCase() ?? "";
  return catalog.filter((name) => name.toLowerCase().includes(token));
}
