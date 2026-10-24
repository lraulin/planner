import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { brainThoughtTypes, brainThoughts } from "@/db/schema";
import type {
  PlexData,
  PlexLink,
  TagCount,
  ThoughtRef,
  ThoughtSearchHit,
  ThoughtType,
} from "./types";

type PlexRow = {
  active: {
    id: string;
    name: string;
    note: string;
    type_id: string | null;
    color: number | null;
    is_home: boolean;
    tags: string[];
    last_visited_at: string | null;
    updated_at: string;
  };
  links: {
    id: string;
    from_id: string;
    to_id: string;
    kind: "child" | "jump";
    label: string;
  }[];
  thoughts: {
    id: string;
    name: string;
    type_id: string | null;
    color: number | null;
  }[];
};

/**
 * The active thought, the links around it and every neighbour's name and colour, in one
 * statement — a plex click must not wait on a chain of reads. Null when the thought is
 * missing or not the user's.
 */
export async function loadPlex(
  userId: string,
  thoughtId: string,
): Promise<PlexData | null> {
  const result = await db.execute<PlexRow>(sql`
    WITH active AS (
      SELECT * FROM brain_thoughts WHERE id = ${thoughtId} AND user_id = ${userId}
    ),
    parents AS (
      SELECT from_id AS id FROM brain_links
      WHERE user_id = ${userId} AND kind = 'child' AND to_id = ${thoughtId}
    ),
    around AS (
      SELECT * FROM brain_links
      WHERE user_id = ${userId} AND (from_id = ${thoughtId} OR to_id = ${thoughtId})
      UNION
      SELECT * FROM brain_links
      WHERE user_id = ${userId} AND kind = 'child' AND from_id IN (SELECT id FROM parents)
    ),
    ids AS (
      SELECT id FROM active
      UNION SELECT from_id FROM around
      UNION SELECT to_id FROM around
    )
    SELECT
      json_build_object(
        'id', a.id, 'name', a.name, 'note', a.note, 'type_id', a.type_id,
        'color', ty.color, 'is_home', a.is_home,
        'last_visited_at', a.last_visited_at, 'updated_at', a.updated_at,
        'tags', (
          SELECT coalesce(json_agg(g.name ORDER BY g.name), '[]'::json)
          FROM brain_thought_tags tt
          JOIN brain_tags g ON g.id = tt.tag_id AND g.user_id = ${userId}
          WHERE tt.thought_id = a.id AND tt.user_id = ${userId}
        )
      ) AS active,
      (
        SELECT coalesce(
          json_agg(json_build_object(
            'id', l.id, 'from_id', l.from_id, 'to_id', l.to_id,
            'kind', l.kind, 'label', l.label
          ) ORDER BY l.created_at, l.id),
          '[]'::json
        ) FROM around l
      ) AS links,
      (
        SELECT coalesce(
          json_agg(json_build_object(
            'id', t.id, 'name', t.name, 'type_id', t.type_id, 'color', ty.color
          ) ORDER BY t.name, t.id),
          '[]'::json
        )
        FROM brain_thoughts t
        LEFT JOIN brain_thought_types ty ON ty.id = t.type_id AND ty.user_id = ${userId}
        WHERE t.user_id = ${userId} AND t.id IN (SELECT id FROM ids)
      ) AS thoughts
    FROM active a
    LEFT JOIN brain_thought_types ty ON ty.id = a.type_id AND ty.user_id = ${userId}
  `);

  const row = result.rows[0];
  if (!row?.active) return null;

  const links: PlexLink[] = row.links.map((l) => ({
    id: l.id,
    fromId: l.from_id,
    toId: l.to_id,
    kind: l.kind,
    label: l.label,
  }));
  const thoughts: Record<string, ThoughtRef> = {};
  for (const t of row.thoughts) {
    thoughts[t.id] = { id: t.id, name: t.name, typeId: t.type_id, color: t.color };
  }
  const a = row.active;
  return {
    active: {
      id: a.id,
      name: a.name,
      note: a.note,
      typeId: a.type_id,
      color: a.color,
      isHome: a.is_home,
      tags: a.tags,
      lastVisitedAt: a.last_visited_at ? new Date(a.last_visited_at) : null,
      updatedAt: new Date(a.updated_at),
    },
    links,
    thoughts,
  };
}

/** Where the page opens: Home, else the most recently visited thought, else nothing. */
export async function startThoughtId(userId: string): Promise<string | null> {
  const [row] = await db
    .select({ id: brainThoughts.id })
    .from(brainThoughts)
    .where(eq(brainThoughts.userId, userId))
    .orderBy(
      desc(brainThoughts.isHome),
      sql`${brainThoughts.lastVisitedAt} desc nulls last`,
      asc(brainThoughts.createdAt),
    )
    .limit(1);
  return row?.id ?? null;
}

export async function recentThoughts(
  userId: string,
  limit = 10,
): Promise<ThoughtRef[]> {
  const rows = await db
    .select({
      id: brainThoughts.id,
      name: brainThoughts.name,
      typeId: brainThoughts.typeId,
      color: brainThoughtTypes.color,
    })
    .from(brainThoughts)
    .leftJoin(
      brainThoughtTypes,
      and(
        eq(brainThoughtTypes.id, brainThoughts.typeId),
        eq(brainThoughtTypes.userId, userId),
      ),
    )
    .where(
      and(
        eq(brainThoughts.userId, userId),
        sql`${brainThoughts.lastVisitedAt} is not null`,
      ),
    )
    .orderBy(desc(brainThoughts.lastVisitedAt))
    .limit(limit);
  return rows;
}

function likePattern(text: string): string {
  return `%${text.replace(/[\\%_]/g, "\\$&")}%`;
}

const SNIPPET_CHARS = 80;

/** Names first, then notes; case-insensitive substring. Empty query matches nothing. */
export async function searchThoughts(
  userId: string,
  query: string,
  limit = 20,
): Promise<ThoughtSearchHit[]> {
  const q = query.trim();
  if (!q) return [];
  const pattern = likePattern(q);
  const rows = await db
    .select({
      id: brainThoughts.id,
      name: brainThoughts.name,
      typeId: brainThoughts.typeId,
      color: brainThoughtTypes.color,
      note: brainThoughts.note,
      nameHit: sql<boolean>`${brainThoughts.name} ilike ${pattern}`,
    })
    .from(brainThoughts)
    .leftJoin(
      brainThoughtTypes,
      and(
        eq(brainThoughtTypes.id, brainThoughts.typeId),
        eq(brainThoughtTypes.userId, userId),
      ),
    )
    .where(
      and(
        eq(brainThoughts.userId, userId),
        sql`(${brainThoughts.name} ilike ${pattern} or ${brainThoughts.note} ilike ${pattern})`,
      ),
    )
    .orderBy(
      sql`(${brainThoughts.name} ilike ${pattern}) desc`,
      asc(brainThoughts.name),
    )
    .limit(limit);

  return rows.map(({ note, nameHit, ...ref }) => {
    const at = nameHit ? -1 : note.toLowerCase().indexOf(q.toLowerCase());
    const start = Math.max(0, at - 20);
    return {
      ...ref,
      snippet:
        at < 0
          ? ""
          : note
              .slice(start, start + SNIPPET_CHARS)
              .replace(/\s+/g, " ")
              .trim(),
    };
  });
}

export async function listTypes(userId: string): Promise<ThoughtType[]> {
  return db
    .select({
      id: brainThoughtTypes.id,
      name: brainThoughtTypes.name,
      color: brainThoughtTypes.color,
    })
    .from(brainThoughtTypes)
    .where(eq(brainThoughtTypes.userId, userId))
    .orderBy(asc(brainThoughtTypes.name));
}

export async function listTags(userId: string): Promise<TagCount[]> {
  const result = await db.execute<{
    id: string;
    name: string;
    thought_count: number;
  }>(sql`
    SELECT g.id, g.name, count(tt.thought_id)::int AS thought_count
    FROM brain_tags g
    LEFT JOIN brain_thought_tags tt ON tt.tag_id = g.id AND tt.user_id = ${userId}
    WHERE g.user_id = ${userId}
    GROUP BY g.id, g.name
    ORDER BY g.name
  `);
  return result.rows.map((r) => ({
    id: r.id,
    name: r.name,
    thoughtCount: r.thought_count,
  }));
}
