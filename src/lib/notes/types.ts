import type { NodeType, NoteFlag } from "@/db/schema";

/** One note as loaded from the database, before derived values are computed. */
export type NoteRow = {
  id: string;
  parentId: string | null;
  sortKey: string;
  title: string;
  subject: string;
  /** Markdown source, exactly as typed. */
  body: string;
  noteDate: Date | null;
  flag: NoteFlag;
  contexts: string[];
  collapsed: boolean;
  depth: number;
  /** The record this note is kept against, if any. */
  nodeId: string | null;
  nodeName: string | null;
  nodeType: NodeType | null;
  /** The contact this note is filed against — Achieve's Contact History. */
  contactId: string | null;
  /** Resolved in the Notes read, so the grid can identify a contact-linked note. */
  contactName?: string | null;
  createdAt: Date;
  updatedAt: Date;
};

/** A note plus everything derived from its position in the tree. */
export type NoteNode = NoteRow & {
  childCount: number;
  hasChildren: boolean;
  /** True when an ancestor is collapsed, so the row should not render. */
  hidden: boolean;
};

/** Where a note goes among its new siblings. Mirrors `src/lib/tree/types.ts`. */
export type NotePosition =
  | { at: "first" }
  | { at: "last" }
  | { at: "before"; siblingId: string }
  | { at: "after"; siblingId: string };
