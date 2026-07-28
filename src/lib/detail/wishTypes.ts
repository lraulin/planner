import type { NodeItemKind, NodeType, PriorityLetter } from "@/db/schema";

export const WISH_KINDS = [
  "wish_want_dont_have",
  "wish_dont_want_have",
  "wish_want_have",
  "wish_want_avoid",
] as const satisfies readonly NodeItemKind[];

export type WishKind = (typeof WISH_KINDS)[number];

/** Achieve's four wish type codes shown in the Wish List Type column. */
export const WISH_TYPE_CODES: Record<WishKind, string> = {
  wish_want_dont_have: "W/DH",
  wish_dont_want_have: "DW/DH",
  wish_want_have: "W/H",
  wish_want_avoid: "W/A",
};

export type WishListRow = {
  id: string;
  nodeId: string;
  kind: WishKind;
  priorityLetter: PriorityLetter | null;
  priorityRank: number | null;
  title: string;
  description: string;
  ownerName: string;
  ownerType: NodeType;
  resultAreaId: string | null;
  resultAreaName: string | null;
  category: string | null;
};
