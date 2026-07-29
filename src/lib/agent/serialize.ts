import type { OutlineNode } from "@/lib/tree/types";
import type { NoteNode } from "@/lib/notes/types";

/** Compact node row for agent responses. */
export type AgentNodeSummary = {
  id: string;
  parentId: string | null;
  type: OutlineNode["type"];
  name: string;
  state: OutlineNode["state"];
  priorityLetter: OutlineNode["priorityLetter"];
  priorityRank: number | null;
  deadline: string | null;
  focus: boolean;
  depth: number;
  effortMinutes: number | null;
  effortLeftMinutes: number | null;
  path: string;
};

export function nodeSummary(
  node: OutlineNode,
  pathById: Map<string, string>,
): AgentNodeSummary {
  return {
    id: node.id,
    parentId: node.parentId,
    type: node.type,
    name: node.name,
    state: node.state,
    priorityLetter: node.priorityLetter,
    priorityRank: node.priorityRank,
    deadline: node.deadline ? node.deadline.toISOString() : null,
    focus: node.focus,
    depth: node.depth,
    effortMinutes: node.effortMinutes,
    effortLeftMinutes: node.effortLeftMinutes,
    path: pathById.get(node.id) ?? node.name,
  };
}

/** Build "Area / Project / Task" labels from outline order. */
export function buildPathMap(outline: OutlineNode[]): Map<string, string> {
  const byId = new Map(outline.map((n) => [n.id, n]));
  const paths = new Map<string, string>();

  for (const node of outline) {
    const parts: string[] = [];
    let current: OutlineNode | undefined = node;
    while (current) {
      parts.unshift(current.name || `(unnamed ${current.type})`);
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
    paths.set(node.id, parts.join(" / "));
  }
  return paths;
}

export function noteSummary(note: NoteNode) {
  return {
    id: note.id,
    parentId: note.parentId,
    title: note.title,
    subject: note.subject,
    body: note.body,
    noteDate: note.noteDate ? note.noteDate.toISOString() : null,
    flag: note.flag,
    contexts: note.contexts,
    nodeId: note.nodeId,
    depth: note.depth,
  };
}

export function iso(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null;
}
