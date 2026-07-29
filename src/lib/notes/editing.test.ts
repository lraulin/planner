import { describe, expect, it } from "vitest";
import {
  continueListOnEnter,
  indentOnTab,
  toggleWrap,
  type EditResult,
} from "./editing";

/**
 * Cases are written with `|` marking the caret and `«...»` marking a selection, because
 * offsets by hand are exactly the thing these functions get wrong.
 *
 * The selection markers are guillemets rather than square brackets on purpose: `[` and `]`
 * are task-list syntax, so bracket markers would misread `- [ ] wash up|` as a selection.
 */
function parse(marked: string): { text: string; start: number; end: number } {
  if (marked.includes("«")) {
    const start = marked.indexOf("«");
    const end = marked.indexOf("»") - 1;
    return { text: marked.replace("«", "").replace("»", ""), start, end };
  }
  const start = marked.indexOf("|");
  return { text: marked.replace("|", ""), start, end: start };
}

function render(result: EditResult | null): string | null {
  if (result === null) return null;
  const { text, selection } = result;
  if (selection.start === selection.end) {
    return `${text.slice(0, selection.start)}|${text.slice(selection.start)}`;
  }
  return `${text.slice(0, selection.start)}«${text.slice(selection.start, selection.end)}»${text.slice(selection.end)}`;
}

function onEnter(marked: string): string | null {
  const { text, start, end } = parse(marked);
  return render(continueListOnEnter(text, { start, end }));
}

function onTab(marked: string, outdent = false): string | null {
  const { text, start, end } = parse(marked);
  return render(indentOnTab(text, { start, end }, outdent));
}

function onWrap(marked: string, marker: string): string | null {
  const { text, start, end } = parse(marked);
  return render(toggleWrap(text, { start, end }, marker));
}

describe("continueListOnEnter — bullets", () => {
  it("continues an unordered list", () => {
    expect(onEnter("- milk|")).toBe("- milk\n- |");
  });

  it("keeps the bullet character the list already uses", () => {
    expect(onEnter("* milk|")).toBe("* milk\n* |");
    expect(onEnter("+ milk|")).toBe("+ milk\n+ |");
  });

  it("preserves indentation on a nested item", () => {
    expect(onEnter("  - nested|")).toBe("  - nested\n  - |");
  });

  it("clears the marker on an empty item instead of adding another", () => {
    // The single most irritating bug a naive implementation has: Enter on an empty bullet
    // should end the list, not produce an endless column of them.
    expect(onEnter("- milk\n- |")).toBe("- milk\n|");
  });

  it("keeps the indent when clearing a nested empty item", () => {
    expect(onEnter("- milk\n  - |")).toBe("- milk\n  |");
  });
});

describe("continueListOnEnter — ordered lists", () => {
  it("increments the number", () => {
    expect(onEnter("1. first|")).toBe("1. first\n2. |");
  });

  it("increments from wherever the list is, not from 1", () => {
    expect(onEnter("8. eighth|")).toBe("8. eighth\n9. |");
    expect(onEnter("9. ninth|")).toBe("9. ninth\n10. |");
  });

  it("keeps the delimiter style", () => {
    expect(onEnter("1) first|")).toBe("1) first\n2) |");
  });

  it("clears an empty numbered item", () => {
    expect(onEnter("1. first\n2. |")).toBe("1. first\n|");
  });
});

describe("continueListOnEnter — task lists", () => {
  it("continues with a fresh unchecked box", () => {
    expect(onEnter("- [ ] wash up|")).toBe("- [ ] wash up\n- [ ] |");
  });

  it("does not carry a tick forward onto the new item", () => {
    // Continuing `- [x]` as `- [x]` would silently mark the next task done.
    expect(onEnter("- [x] wash up|")).toBe("- [x] wash up\n- [ ] |");
  });

  it("clears an empty task item", () => {
    expect(onEnter("- [ ] |")).toBe("|");
  });
});

describe("continueListOnEnter — blockquotes", () => {
  it("continues a quote", () => {
    expect(onEnter("> quoted|")).toBe("> quoted\n> |");
  });

  it("ends the quote on an empty line", () => {
    expect(onEnter("> quoted\n> |")).toBe("> quoted\n|");
  });
});

describe("continueListOnEnter — when it should not fire", () => {
  it("stands aside on an ordinary paragraph", () => {
    expect(onEnter("just prose|")).toBeNull();
  });

  it("stands aside mid-item, where Enter is a normal split", () => {
    expect(onEnter("- mi|lk")).toBeNull();
  });

  it("stands aside when text is selected", () => {
    expect(onEnter("- «milk»")).toBeNull();
  });

  it("does not treat a horizontal rule as a bullet", () => {
    // `---` starts with a dash but is a thematic break, not a list item.
    expect(onEnter("---|")).toBeNull();
  });
});

describe("indentOnTab", () => {
  it("inserts an indent at a bare caret", () => {
    expect(onTab("- milk|")).toBe("- milk  |");
  });

  it("indents every line of a multi-line selection", () => {
    expect(onTab("«- one\n- two»")).toBe("«  - one\n  - two»");
  });

  it("outdents every line of a multi-line selection", () => {
    expect(onTab("«  - one\n  - two»", true)).toBe("«- one\n- two»");
  });

  it("outdents a single line from a bare caret", () => {
    expect(onTab("  - milk|", true)).toBe("- milk|");
  });

  it("removes a tab as readily as spaces", () => {
    expect(onTab("\t- milk|", true)).toBe("- milk|");
  });

  it("takes only the spaces that are there, without eating the bullet", () => {
    // A line indented by one space must not lose two characters.
    expect(onTab(" - milk|", true)).toBe("- milk|");
  });

  it("stands aside when there is nothing left to outdent", () => {
    expect(onTab("- milk|", true)).toBeNull();
  });

  it("leaves already-flush lines alone within a mixed outdent", () => {
    expect(onTab("«- one\n  - two»", true)).toBe("«- one\n- two»");
  });
});

describe("toggleWrap", () => {
  it("wraps a selection and keeps it selected", () => {
    expect(onWrap("say «hello» there", "**")).toBe("say **«hello»** there");
  });

  it("unwraps when the markers are inside the selection", () => {
    expect(onWrap("say «**hello**» there", "**")).toBe("say «hello» there");
  });

  it("unwraps when the markers sit just outside the selection", () => {
    // Selecting the word by double-click leaves the asterisks outside it, which is the
    // common case and the one a naive implementation double-wraps.
    expect(onWrap("say **«hello»** there", "**")).toBe("say «hello» there");
  });

  it("inserts an empty pair with the caret between them", () => {
    expect(onWrap("say | there", "**")).toBe("say **|** there");
  });

  it("works for single-character markers too", () => {
    expect(onWrap("say «hello» there", "_")).toBe("say _«hello»_ there");
    expect(onWrap("say _«hello»_ there", "_")).toBe("say «hello» there");
  });

  it("does not mistake a lone marker for a wrapped pair", () => {
    // "*" is one marker character, not an empty `**` wrap around nothing.
    expect(onWrap("«*»", "**")).toBe("**«*»**");
  });
});
