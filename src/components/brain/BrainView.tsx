"use client";

import type { PlexData, TagCount, ThoughtRef, ThoughtType } from "@/lib/brain/types";

export function BrainView({
  plex,
}: {
  plex: PlexData | null;
  recent: ThoughtRef[];
  types: ThoughtType[];
  tags: TagCount[];
}) {
  return (
    <div className="min-h-0 flex-1 p-4">{plex?.active.name ?? "No thoughts yet"}</div>
  );
}
