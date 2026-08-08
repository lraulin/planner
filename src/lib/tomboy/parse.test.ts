import { describe, expect, it } from "vitest";
import { toDateKey } from "@/lib/schedule/geometry";
import { mapTomboyFiles } from "./map";
import { parseTomboyNote, tomboyIdFromFilename } from "./parse";

const ID = "651b3053-e904-4ab8-b18e-19267b053caf";

function noteXml(
  overrides: {
    title?: string;
    content?: string;
    tags?: string[];
    created?: string;
    changed?: string;
    metadataChanged?: string;
  } = {},
): string {
  const title = overrides.title ?? "Reading list";
  const content = overrides.content ?? `${title}\n\n<bold>One</bold>`;
  const tags = (overrides.tags ?? ["system:notebook:Books"])
    .map((tag) => `<tag>${tag}</tag>`)
    .join("");
  return `<?xml version="1.0" encoding="utf-8"?>
<note version="0.3" xmlns:link="http://beatniksoftware.com/tomboy/link" xmlns:size="http://beatniksoftware.com/tomboy/size" xmlns="http://beatniksoftware.com/tomboy">
  <title>${title}</title>
  <text xml:space="preserve"><note-content version="0.1">${content}</note-content></text>
  <last-change-date>${overrides.changed ?? "2017-09-21T17:53:52.1911579-04:00"}</last-change-date>
  <last-metadata-change-date>${overrides.metadataChanged ?? "2017-10-25T02:37:26.8851136-04:00"}</last-metadata-change-date>
  <create-date>${overrides.created ?? "2017-09-21T17:53:47.8812648-04:00"}</create-date>
  <tags>${tags}</tags>
</note>`;
}

describe("tomboyIdFromFilename", () => {
  it("accepts a UUID note filename at any selected folder depth", () => {
    expect(tomboyIdFromFilename(`tomboy/0/0/${ID}.note`)).toBe(ID);
    expect(tomboyIdFromFilename("manifest.xml")).toBeNull();
  });
});

describe("parseTomboyNote", () => {
  it("maps title, body, notebooks, source instants and the creation day", () => {
    const parsed = parseTomboyNote({ name: `${ID}.note`, text: noteXml() });

    expect(parsed.sourceId).toBe(ID);
    expect(parsed.title).toBe("Reading list");
    expect(parsed.body).toBe("**One**");
    expect(parsed.contexts).toEqual(["Books"]);
    expect(toDateKey(parsed.noteDate)).toBe("2017-09-21");
    expect(parsed.createdAt.toISOString()).toBe("2017-09-21T21:53:47.881Z");
    // Metadata changes (such as notebook moves) can be later than content changes.
    expect(parsed.updatedAt.toISOString()).toBe("2017-10-25T06:37:26.885Z");
    expect(parsed.isTemplate).toBe(false);
  });

  it("keeps a first line that is not the current title", () => {
    const parsed = parseTomboyNote({
      name: `${ID}.note`,
      text: noteXml({
        title: "Current title",
        content: "An intentional heading\nBody",
      }),
    });

    expect(parsed.body).toBe("An intentional heading\nBody");
  });

  it("does not mistake note-content markup for a metadata tag", () => {
    const parsed = parseTomboyNote({
      name: `${ID}.note`,
      text: noteXml({ content: "Reading list\n<tag>Body marker</tag>" }),
    });

    expect(parsed.body).toBe("Body marker");
    expect(parsed.contexts).toEqual(["Books"]);
    expect(parsed.unknownMarkup).toEqual(["tag"]);
  });

  it("recognises Tomboy templates and excludes system-only tags from contexts", () => {
    const parsed = parseTomboyNote({
      name: `${ID}.note`,
      text: noteXml({
        tags: [
          "system:template",
          "system:template:save-size",
          "system:notebook:Work",
          "todo",
        ],
      }),
    });

    expect(parsed.isTemplate).toBe(true);
    expect(parsed.contexts).toEqual(["Work", "todo"]);
  });
});

describe("mapTomboyFiles", () => {
  it("keeps valid notes while reporting templates, unrelated files and malformed notes", () => {
    const otherId = "e2974bf6-7fd4-4915-b5c2-3ffca7d18cbe";
    const result = mapTomboyFiles([
      { name: `${ID}.note`, text: noteXml() },
      {
        name: `${otherId}.note`,
        text: noteXml({ tags: ["system:template"] }),
      },
      { name: "manifest.xml", text: "<sync />" },
      { name: "broken.note", text: "not xml" },
    ]);

    expect(result.notes).toHaveLength(1);
    expect(result.templatesSkipped).toBe(1);
    expect(result.ignoredFiles).toBe(1);
    expect(result.invalidFiles).toBe(1);
    expect(result.warnings).toHaveLength(2);
  });
});
