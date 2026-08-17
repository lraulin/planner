import { extractHttpUrls } from "./extractHttpUrls";

export const ATTACH_NO_LINK = "The clipboard does not contain a link.";

/** Why this clipboard text cannot become attachments, or null when it can. */
export function clipboardAttachRefusal(text: string): string | null {
  return extractHttpUrls(text).length === 0 ? ATTACH_NO_LINK : null;
}
