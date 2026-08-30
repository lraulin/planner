import { extractHttpUrls } from "./extractHttpUrls";

export const ATTACH_NO_LINK = "The clipboard does not contain a link.";
export const CLIPBOARD_UNREADABLE = "Could not read the clipboard.";

/** Why this clipboard text cannot become attachments, or null when it can. */
export function clipboardAttachRefusal(text: string): string | null {
  return extractHttpUrls(text).length === 0 ? ATTACH_NO_LINK : null;
}

/** Status line after a successful attach. Zero created means every URL was already there. */
export function clipboardAttachStatus(created: number): string {
  if (created === 0) return "Already attached.";
  return created === 1 ? "Added 1 attachment." : `Added ${created} attachments.`;
}
