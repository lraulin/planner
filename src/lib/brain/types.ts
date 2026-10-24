import type { NeighbourLink } from "./neighbourhood";

/** A thought as the plex draws it: enough for a chip, nothing more. */
export type ThoughtRef = {
  id: string;
  name: string;
  typeId: string | null;
  /** Index into the categorical chart palette; null when the thought has no type. */
  color: number | null;
};

/** Which of a thought's four gates have a link behind them (TheBrain's filled gate). */
export type ThoughtGates = { parents: boolean; children: boolean; jumps: boolean };

/** A thought on the plex: a chip's worth, plus which gates are worth opening. */
export type PlexThought = ThoughtRef & { gates: ThoughtGates };

export type ThoughtDetail = ThoughtRef & {
  note: string;
  isHome: boolean;
  tags: string[];
  lastVisitedAt: Date | null;
  updatedAt: Date;
};

export type PlexLink = NeighbourLink & { label: string };

/** Everything the plex needs for one active thought, read in one round trip. */
export type PlexData = {
  active: ThoughtDetail;
  /** Links touching the active thought, plus each parent's child links (for siblings). */
  links: PlexLink[];
  /** The active thought and every thought those links name, by id. */
  thoughts: Record<string, PlexThought>;
};

export type ThoughtType = { id: string; name: string; color: number };

export type TagCount = { id: string; name: string; thoughtCount: number };

export type ThoughtSearchHit = ThoughtRef & { snippet: string };
