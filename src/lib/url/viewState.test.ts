import { describe, expect, it } from "vitest";
import {
  asRecordId,
  asViewId,
  hrefWithViewState,
  notesPath,
  readDetailParam,
  readNoteParam,
  readViewParam,
  readViewState,
  writeViewState,
} from "./viewState";

describe("asRecordId", () => {
  it("accepts a normal opaque id", () => {
    expect(asRecordId("a1b2c3d4-e5f6-7890-abcd-ef1234567890")).toBe(
      "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    );
  });

  it("rejects empty, whitespace, and junk that would break a query", () => {
    for (const value of [null, undefined, 7, "", "   ", "a b", "x&y", "a?b", "a#b"]) {
      expect(asRecordId(value)).toBeNull();
    }
  });
});

describe("asViewId", () => {
  it("accepts the ids the tabs actually use", () => {
    expect(asViewId("active-status")).toBe("active-status");
    expect(asViewId("nested")).toBe("nested");
    expect(asViewId("best-overall")).toBe("best-overall");
  });

  it("rejects upper-case, spaces, and empty", () => {
    for (const value of [null, "", "Active", "a b", "view!", "X"]) {
      expect(asViewId(value)).toBeNull();
    }
  });
});

describe("readViewState", () => {
  it("returns nulls when params are absent", () => {
    expect(readViewState(new URLSearchParams())).toEqual({
      detail: null,
      view: null,
      note: null,
      mode: null,
      zoom: null,
    });
  });

  it("round-trips a full set", () => {
    const written = writeViewState(new URLSearchParams(), {
      detail: "node-1",
      view: "active-status",
      note: "note-9",
      mode: "flat",
      zoom: "node-1",
    });
    expect(readViewState(written)).toEqual({
      detail: "node-1",
      view: "active-status",
      note: "note-9",
      mode: "flat",
      zoom: "node-1",
    });
  });

  it("treats multi-value and empty params as absent", () => {
    const params = new URLSearchParams();
    params.append("detail", "a");
    params.append("detail", "b");
    params.set("view", "");
    params.set("note", "  ");
    expect(readDetailParam(params)).toBeNull();
    expect(readViewParam(params)).toBeNull();
    expect(readNoteParam(params)).toBeNull();
  });

  it("preserves unrelated params when patching", () => {
    const current = new URLSearchParams("foo=bar&detail=old");
    const next = writeViewState(current, { detail: "new", view: "all" });
    expect(next.get("foo")).toBe("bar");
    expect(next.get("detail")).toBe("new");
    expect(next.get("view")).toBe("all");
  });

  it("clears with null and leaves others when undefined", () => {
    const current = writeViewState(new URLSearchParams(), {
      detail: "n1",
      view: "all",
      note: "note-1",
    });
    const next = writeViewState(current, { detail: null });
    expect(readViewState(next)).toEqual({
      detail: null,
      view: "all",
      note: "note-1",
      mode: null,
      zoom: null,
    });
  });

  it("clears mode alongside a view switch", () => {
    // A mode override belongs to the view it was set on. Left behind, it would pin Notes to
    // Flat through every view you picked afterwards.
    const current = writeViewState(new URLSearchParams(), {
      view: "notes",
      mode: "flat",
    });
    const next = writeViewState(current, { view: "saved-1a2b", mode: null });
    expect(next.get("view")).toBe("saved-1a2b");
    expect(next.has("mode")).toBe(false);
  });
});

describe("hrefWithViewState", () => {
  it("drops the query when everything is cleared", () => {
    const current = new URLSearchParams("detail=n1");
    expect(hrefWithViewState("/tasks", current, { detail: null })).toBe("/tasks");
  });

  it("builds a clean notes deep-link", () => {
    expect(notesPath("abc")).toBe("/notes?note=abc");
    expect(notesPath(null)).toBe("/notes");
    expect(notesPath()).toBe("/notes");
  });
});
