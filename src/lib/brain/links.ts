import type { BrainLinkKind } from "@/db/schema";

/** How the other thought relates to the one being edited, as the add-link input phrases it. */
export type LinkRelation = "parent" | "child" | "jump";

/** The same link seen from the other end: "X is my parent" is "I am X's child". */
export function mirrorRelation(relation: LinkRelation): LinkRelation {
  return relation === "parent" ? "child" : relation === "child" ? "parent" : "jump";
}

export type LinkRow = { id: string; fromId: string; toId: string; kind: BrainLinkKind };

export type CanonicalLink = { fromId: string; toId: string; kind: BrainLinkKind };

export type LinkPlan =
  | { action: "insert"; link: CanonicalLink }
  | { action: "update"; id: string; link: CanonicalLink }
  | { action: "noop"; id: string };

/**
 * Turn "`otherId` is a parent / child / jump of `thoughtId`" into the one stored shape.
 * A child link runs parent → child; a jump has no direction, so its ids are put in order.
 */
export function canonicalLink(
  thoughtId: string,
  relation: LinkRelation,
  otherId: string,
): CanonicalLink {
  if (thoughtId === otherId) throw new Error("A thought cannot link to itself");
  switch (relation) {
    case "parent":
      return { fromId: otherId, toId: thoughtId, kind: "child" };
    case "child":
      return { fromId: thoughtId, toId: otherId, kind: "child" };
    case "jump":
      return thoughtId < otherId
        ? { fromId: thoughtId, toId: otherId, kind: "jump" }
        : { fromId: otherId, toId: thoughtId, kind: "jump" };
  }
}

/**
 * Insert, or change the row that already joins this pair — in whichever direction it was
 * written. A pair has exactly one link, so relinking is an update, never a second row.
 */
export function planLink(wanted: CanonicalLink, existing: LinkRow | null): LinkPlan {
  if (!existing) return { action: "insert", link: wanted };
  const same =
    existing.kind === wanted.kind &&
    existing.fromId === wanted.fromId &&
    existing.toId === wanted.toId;
  return same
    ? { action: "noop", id: existing.id }
    : { action: "update", id: existing.id, link: wanted };
}
