/** Trigger a browser download of a text file. Client-only — uses `document`. */
export function downloadTextFile(
  filename: string,
  contents: string,
  mimeType = "text/csv;charset=utf-8",
): void {
  const blob = new Blob([contents], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
