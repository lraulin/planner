import { describe, expect, it } from "vitest";
import { rtfToPlainText } from "./rtf";

describe("rtfToPlainText", () => {
  it("returns plain text unchanged", () => {
    expect(rtfToPlainText("just a note")).toBe("just a note");
    expect(rtfToPlainText("")).toBe("");
    expect(rtfToPlainText(null)).toBe("");
  });

  it("strips a minimal RTF document to its body text", () => {
    const rtf =
      "{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Arial;}}\\f0\\fs24 Hello\\par world}";
    expect(rtfToPlainText(rtf)).toBe("Hello\nworld");
  });

  it("reads \\'hh as Windows-1252, so curly quotes and dashes are not C1 controls", () => {
    const rtf =
      "{\\rtf1\\ansi\\ansicpg1252 It\\'92s \\'93quoted\\'94 \\'96 caf\\'e9 \\'85}";
    expect(rtfToPlainText(rtf)).toBe(
      "It\u2019s \u201cquoted\u201d \u2013 caf\u00e9 \u2026",
    );
  });

  it("reads \\u as a signed 16-bit number and skips its fallback character", () => {
    // U+1F600 is the surrogate pair D83D DE00, written as -10179 and -8704.
    const rtf = "{\\rtf1\\ansi ok \\u-10179?\\u-8704? \\u44032? \\u8217\\'92 end}";
    expect(rtfToPlainText(rtf)).toBe("ok \u{1F600} \uAC00 \u2019 end");
  });

  it("honours \\ucN when skipping the fallback after \\u", () => {
    expect(rtfToPlainText("{\\rtf1\\uc2\\u233ab c}")).toBe("\u00e9 c");
    expect(rtfToPlainText("{\\rtf1\\uc0\\u233 b}")).toBe("\u00e9b");
  });

  it("keeps a literal brace or backslash that was escaped", () => {
    expect(rtfToPlainText("{\\rtf1 use \\{x\\} and C:\\\\temp}")).toBe(
      "use {x} and C:\\temp",
    );
  });

  it("drops destinations that are not body text", () => {
    const rtf =
      "{\\rtf1{\\info{\\author Lee}{\\title Secret}}{\\*\\generator Riched20 10.0;}" +
      '{\\pict\\wmetafile8 0102abcd}Body {\\field{\\*\\fldinst HYPERLINK "x"}{\\fldrslt link}}}';
    expect(rtfToPlainText(rtf)).toBe("Body link");
  });

  it("ignores raw line breaks between control words, as RTF does", () => {
    expect(rtfToPlainText("{\\rtf1\\ansi\r\none\\par\r\ntwo\\par\r\n}")).toBe(
      "one\ntwo",
    );
  });

  it("does not take a longer control word for \\par, \\line or \\tab", () => {
    expect(rtfToPlainText("{\\rtf1\\paperw12240\\lineppage a \\tabsnone b}")).toBe(
      "a b",
    );
  });

  it("renders the named punctuation words", () => {
    expect(rtfToPlainText("{\\rtf1 \\lquote a\\rquote \\emdash \\bullet\\~x}")).toBe(
      "\u2018a\u2019\u2014\u2022\u00a0x",
    );
  });

  it("drops the NUL padding some writers leave after the closing brace", () => {
    expect(rtfToPlainText("{\\rtf1 text}\u0000\u0000")).toBe("text");
  });
});
