import { extractText, getDocumentProxy } from "unpdf";

/**
 * Pull plain text out of a bank-statement PDF. Pages are merged so a ledger that
 * crosses a page break is one stream; the statement parser skips the reprinted
 * headers. Not unit-tested — the parser is, against extracted-text fixtures.
 */
export async function extractPdfText(bytes: Uint8Array): Promise<string> {
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: true });
  return (Array.isArray(text) ? text.join("\n") : text).trim();
}

export function isPdfBytes(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46
  );
}
