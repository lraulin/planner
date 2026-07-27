import { db } from "./index";
import { nodes, resultAreaDetails, taskDetails, users } from "./schema";
import type { NodeType, PriorityLetter } from "./schema";
import { DEV_USER_EMAIL } from "@/lib/auth";
import { assertCanNest } from "@/lib/tree/hierarchy";
import { between } from "@/lib/tree/sortKey";
import { eq } from "drizzle-orm";

/**
 * Seeds the dev user and a sample hierarchy mirroring `screenshots/OutlineTabSS.png`, so a
 * fresh database looks like the reference the outline is built against.
 *
 * Destructive: deletes the dev user's existing nodes before inserting.
 */

type Seed = {
  name: string;
  type: NodeType;
  priority?: string;
  effort?: number;
  effortLeft?: number;
  children?: Seed[];
};

const HIERARCHY: Seed[] = [
  {
    name: "Work [Result Areas represent major life dimensions or roles]",
    type: "result_area",
    priority: "A1",
    children: [
      {
        name: "Projects represent the outcomes in your to-do list",
        type: "project",
        priority: "A1",
      },
      { name: "Some are complex multi-step projects", type: "project", priority: "A2" },
      {
        name: "ACME Account",
        type: "project",
        priority: "A",
        children: [
          {
            name: "Project proposal for new joint product",
            type: "project",
            priority: "A",
            children: [
              {
                name: "Requirements",
                type: "task",
                priority: "A1",
                children: [
                  {
                    name: "Gather requirements from client and other stakeholders",
                    type: "task",
                    priority: "A1",
                    effort: 240,
                    effortLeft: 240,
                  },
                  {
                    name: "Prepare requirements document",
                    type: "task",
                    priority: "A2",
                    effort: 120,
                    effortLeft: 120,
                  },
                  {
                    name: "Requirement review with ACME representative",
                    type: "task",
                    priority: "A3",
                    effort: 60,
                    effortLeft: 60,
                  },
                ],
              },
              {
                name: "Prepare project schedule",
                type: "task",
                priority: "A2",
                children: [
                  {
                    name: "Identify main tasks and milestones",
                    type: "task",
                    priority: "A1",
                    effort: 120,
                    effortLeft: 120,
                  },
                  {
                    name: "Select project team",
                    type: "task",
                    priority: "A2",
                    effort: 60,
                    effortLeft: 60,
                  },
                  {
                    name: "Prepare detailed schedule",
                    type: "task",
                    priority: "A3",
                    effort: 45,
                    effortLeft: 45,
                  },
                ],
              },
              {
                name: "Create design documentation",
                type: "task",
                priority: "B",
                effort: 1440,
                effortLeft: 1440,
              },
              {
                name: "Review proposal internally",
                type: "task",
                priority: "B",
                effort: 480,
                effortLeft: 480,
              },
              {
                name: "Present to ACME representative",
                type: "task",
                priority: "B",
                effort: 120,
                effortLeft: 120,
              },
            ],
          },
          {
            name: "Prepare marketing presentation for ACME",
            type: "project",
            priority: "B",
          },
          {
            name: "Develop newsletter and marketing brochure",
            type: "project",
            priority: "C",
          },
        ],
      },
      { name: "Steve's retirement party", type: "project", priority: "A" },
      {
        name: "Other projects could be simple things like",
        type: "project",
        priority: "B",
        children: [
          {
            name: "Respond to Bruce's email regarding marketing information",
            type: "project",
            priority: "A1",
          },
          { name: "Send Status Report to Bill", type: "project", priority: "A3" },
          { name: "Renew DMV license [DMV Folder]", type: "project", priority: "B" },
        ],
      },
      {
        name: "Someday/Maybe",
        type: "project",
        priority: "D",
        children: [
          {
            name: "You can use as many levels as you need to represent your projects",
            type: "project",
            priority: "B",
            children: [
              {
                name: "And then use the tasks view to capture all the low level tasks",
                type: "task",
                priority: "A1",
              },
            ],
          },
        ],
      },
    ],
  },
  {
    name: "Romance",
    type: "result_area",
    priority: "A",
    children: [{ name: "Anniversary Celebration", type: "project", priority: "A1" }],
  },
  {
    name: "Home",
    type: "result_area",
    priority: "B",
    children: [
      { name: "Take Rover to vet", type: "project", priority: "A" },
      { name: "Pick up dry-cleaning", type: "project", priority: "A" },
    ],
  },
];

/** Splits Achieve's combined priority notation ("A1", "B") into letter and rank. */
function parsePriority(priority: string | undefined): {
  letter: PriorityLetter | null;
  rank: number | null;
} {
  if (!priority) return { letter: null, rank: null };
  const match = /^([ABCD])(\d+)?$/.exec(priority);
  if (!match) throw new Error(`Unrecognized priority: ${priority}`);
  return {
    letter: match[1] as PriorityLetter,
    rank: match[2] ? Number(match[2]) : null,
  };
}

async function insertLevel(
  userId: string,
  parentId: string | null,
  parentType: NodeType | null,
  items: Seed[],
): Promise<number> {
  let count = 0;
  let sortKey: string | null = null;

  for (const item of items) {
    assertCanNest(item.type, parentType);
    sortKey = between(sortKey, null);

    const { letter, rank } = parsePriority(item.priority);
    const [row] = await db
      .insert(nodes)
      .values({
        userId,
        parentId,
        type: item.type,
        name: item.name,
        sortKey,
        priorityLetter: letter,
        priorityRank: rank,
      })
      .returning({ id: nodes.id });

    count++;

    if (item.type === "task") {
      await db.insert(taskDetails).values({
        nodeId: row.id,
        effortMinutes: item.effort ?? null,
        effortLeftMinutes: item.effortLeft ?? null,
      });
    }

    if (item.type === "result_area") {
      await db.insert(resultAreaDetails).values({ nodeId: row.id });
    }

    if (item.children?.length) {
      count += await insertLevel(userId, row.id, item.type, item.children);
    }
  }

  return count;
}

async function main() {
  const [user] = await db
    .insert(users)
    .values({ email: DEV_USER_EMAIL, name: "Dev User" })
    .onConflictDoUpdate({
      target: users.email,
      set: { updatedAt: new Date() },
    })
    .returning({ id: users.id });

  console.log(`Dev user: ${DEV_USER_EMAIL} (${user.id})`);

  // Children cascade, so deleting every node for this user clears the whole tree.
  await db.delete(nodes).where(eq(nodes.userId, user.id));

  const count = await insertLevel(user.id, null, null, HIERARCHY);
  console.log(`Seeded ${count} nodes.`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
