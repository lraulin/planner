import type { NodeDetail } from "@/lib/detail/types";
import type { OutlineNode } from "@/lib/tree/types";
import { walkUp } from "@/lib/tree/walkUp";
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

/**
 * Full form payload for `get_node` / create / update — summary fields plus notes, plan
 * dates, the type-specific side table, and linked-note stubs (not `nodes.notes`).
 */
export function nodeDetailForAgent(
  detail: NodeDetail,
  outline: OutlineNode | undefined,
  pathById: Map<string, string>,
) {
  const base = outline
    ? nodeSummary(outline, pathById)
    : {
        id: detail.id,
        parentId: null as string | null,
        type: detail.type,
        name: detail.name,
        state: detail.state,
        priorityLetter: detail.priorityLetter,
        priorityRank: detail.priorityRank,
        deadline: iso(detail.deadline),
        focus: detail.focus,
        depth: 0,
        effortMinutes: detail.task?.effortMinutes ?? null,
        effortLeftMinutes: detail.task?.effortLeftMinutes ?? null,
        path: detail.name,
      };

  return {
    ...base,
    notes: detail.notes,
    targetStartDate: iso(detail.targetStartDate),
    targetEndDate: iso(detail.targetEndDate),
    deferredDate: iso(detail.deferredDate),
    resultArea: detail.resultArea ? stripNodeId(detail.resultArea) : null,
    goal: detail.goal ? jsonSafeSide(detail.goal) : null,
    project: detail.project ? jsonSafeSide(detail.project) : null,
    task: detail.task ? jsonSafeSide(detail.task) : null,
    linkedNotes: detail.linkedNotes.map((n) => ({
      id: n.id,
      title: n.title,
      noteDate: iso(n.noteDate),
      snippet: n.snippet,
    })),
  };
}

function stripNodeId<T extends { nodeId: string }>(row: T): Omit<T, "nodeId"> {
  const { nodeId: _n, ...rest } = row;
  return rest;
}

/** Dates → ISO; drop `nodeId` so the agent does not echo a redundant key. */
function jsonSafeSide<T extends { nodeId: string }>(row: T): Record<string, unknown> {
  const { nodeId: _n, ...rest } = row;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(rest)) {
    if (value instanceof Date) {
      out[key] = value.toISOString();
    } else {
      out[key] = value;
    }
  }
  return out;
}

/** Build "Area / Project / Task" labels from outline order. */
export function buildPathMap(outline: OutlineNode[]): Map<string, string> {
  const byId = new Map(outline.map((n) => [n.id, n]));
  const paths = new Map<string, string>();

  for (const node of outline) {
    const parts: string[] = [];
    for (const current of walkUp(node, byId)) {
      parts.unshift(current.name || `(unnamed ${current.type})`);
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

/** Compact note row for search/list responses. Full markdown is only returned by get_note. */
export function noteSearchSummary(note: NoteNode) {
  const plain = note.body
    .replace(/[#>*_`~\[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return {
    id: note.id,
    parentId: note.parentId,
    title: note.title,
    subject: note.subject,
    noteDate: note.noteDate ? note.noteDate.toISOString() : null,
    flag: note.flag,
    contexts: note.contexts,
    nodeId: note.nodeId,
    depth: note.depth,
    snippet: plain.length > 240 ? `${plain.slice(0, 237)}...` : plain,
  };
}

export function iso(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null;
}
