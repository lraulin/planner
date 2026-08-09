import type { NodeType } from "@/db/schema";
import { canNest, nodeFromKind, type NodeKind } from "./hierarchy";
import type { Position } from "./types";

export type ConversionTreeNode = {
  id: string;
  parentId: string | null;
  type: NodeType;
  name?: string;
  sortKey?: string;
};

export const COMMON_CONVERSION_FIELDS = [
  "name",
  "state",
  "priority",
  "deadline",
  "targetStartDate",
  "targetEndDate",
  "deferredDate",
  "focus",
  "notes",
  "completion state",
] as const;

export const TYPE_DETAIL_FIELDS: Record<NodeKind, readonly string[]> = {
  result_area: ["category", "importance", "mission", "vision", "SWOT details"],
  goal: [
    "dream flag",
    "range",
    "planned start",
    "values",
    "vision",
    "strategy",
    "progress review",
  ],
  dream: [
    "dream flag",
    "range",
    "planned start",
    "values",
    "vision",
    "strategy",
    "progress review",
  ],
  project: [
    "effort planning",
    "purpose",
    "assigned to",
    "contexts",
    "cost details",
    "project strategy",
  ],
  task: [
    "effort",
    "recurrence",
    "contact",
    "exercise",
    "completion history",
    "task description",
  ],
};

export type ConversionConflict = {
  id: string;
  name: string;
  type: NodeType;
};

export type ConversionPlacement = {
  parentId: string | null;
  /** Existing parent means the node can stay in place; otherwise the node is reinserted. */
  position: Position | null;
  hoisted: boolean;
  destinationLabel: string;
};

export type ConversionPlan = {
  sourceKind: NodeKind;
  targetKind: NodeKind;
  targetType: NodeType;
  placement: ConversionPlacement;
  retainedFields: string[];
  discardedFields: string[];
  descendantConflicts: ConversionConflict[];
};

function typeOf(kind: NodeKind): NodeType {
  return nodeFromKind(kind).type;
}

function sameDetailShape(source: NodeKind, target: NodeKind): boolean {
  return typeOf(source) === typeOf(target);
}

function placementFor(
  node: ConversionTreeNode,
  targetType: NodeType,
  allNodes: readonly ConversionTreeNode[],
): ConversionPlacement {
  const byId = new Map(allNodes.map((entry) => [entry.id, entry]));
  const currentParent = node.parentId ? (byId.get(node.parentId) ?? null) : null;

  if (!currentParent || canNest(targetType, currentParent.type)) {
    return {
      parentId: node.parentId,
      position: null,
      hoisted: false,
      destinationLabel: currentParent?.name?.trim() || "Top level",
    };
  }

  // Find the closest ancestor that can legally contain the new type. `branchRoot` is the
  // old branch's direct child under that ancestor, which gives the reparented node locality.
  let childOnBranch = currentParent;
  let ancestor = currentParent.parentId
    ? (byId.get(currentParent.parentId) ?? null)
    : null;
  const seen = new Set<string>();
  while (ancestor && !canNest(targetType, ancestor.type)) {
    if (seen.has(ancestor.id)) {
      ancestor = null;
      break;
    }
    seen.add(ancestor.id);
    childOnBranch = ancestor;
    ancestor = ancestor.parentId ? (byId.get(ancestor.parentId) ?? null) : null;
  }

  const parentId = ancestor?.id ?? null;
  return {
    parentId,
    position: { at: "after", siblingId: childOnBranch.id },
    hoisted: true,
    destinationLabel: ancestor?.name?.trim() || "Top level",
  };
}

/** Pure preview/planning step used by both the dialog and the transactional mutation. */
export function planNodeConversion(params: {
  nodeId: string;
  sourceKind: NodeKind;
  targetKind: NodeKind;
  nodes: readonly ConversionTreeNode[];
  sourceDetailFields?: readonly string[];
}): ConversionPlan {
  const node = params.nodes.find((entry) => entry.id === params.nodeId);
  if (!node) throw new Error("The selected item no longer exists.");

  const targetType = typeOf(params.targetKind);
  const children = params.nodes.filter((entry) => entry.parentId === node.id);
  const descendantConflicts = children
    .filter((child) => !canNest(child.type, targetType))
    .map((child) => ({
      id: child.id,
      name: child.name?.trim() || "Untitled item",
      type: child.type,
    }));

  const sourceFields = [
    ...(params.sourceDetailFields ?? TYPE_DETAIL_FIELDS[params.sourceKind]),
  ];
  const retainedFields = [
    ...COMMON_CONVERSION_FIELDS,
    ...(sameDetailShape(params.sourceKind, params.targetKind) ? sourceFields : []),
  ];
  const discardedFields = sameDetailShape(params.sourceKind, params.targetKind)
    ? []
    : sourceFields;

  return {
    sourceKind: params.sourceKind,
    targetKind: params.targetKind,
    targetType,
    placement: placementFor(node, targetType, params.nodes),
    retainedFields,
    discardedFields,
    descendantConflicts,
  };
}
