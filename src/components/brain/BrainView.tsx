"use client";

import { useCallback, useEffect, useMemo, useState, type MouseEvent } from "react";
import {
  createThoughtAction,
  createThoughtTypeAction,
  deleteThoughtAction,
  deleteThoughtTypeAction,
  linkThoughtsAction,
  markThoughtVisitedAction,
  renameThoughtAction,
  setHomeThoughtAction,
  setLinkLabelAction,
  setThoughtTagsAction,
  setThoughtTypeAction,
  unlinkThoughtsAction,
} from "@/app/(shell)/library/brain/actions";
import { ConfirmDialog } from "@/components/detail/ConfirmDialog";
import { CommandBar } from "@/components/grid/CommandBar";
import {
  ContextMenu,
  menuItemsFor,
  type MenuItem,
} from "@/components/grid/ContextMenu";
import { useRegisterCommands } from "@/components/shell/CommandProvider";
import { useIsCompact } from "@/components/shell/useIsCompact";
import { useNavigate } from "@/components/shell/useNavigate";
import { ErrorBanner, TabToolbar } from "@/components/tabs/tabChrome";
import {
  BRAIN_SEARCH_ID,
  BRAIN_TAGS_ID,
  buildBrainCommands,
  type BrainHooks,
} from "@/lib/brain/commands";
import { mirrorRelation, type LinkRelation } from "@/lib/brain/links";
import { neighbourhood } from "@/lib/brain/neighbourhood";
import { brainHref } from "@/lib/brain/thoughtId";
import type { PlexData, TagCount, ThoughtRef, ThoughtType } from "@/lib/brain/types";
import { rowMenuSections } from "@/lib/commands/menus";
import type { ActionResult } from "@/app/actionResult";
import { AddLinkInput } from "./AddLinkInput";
import { BrainMobile } from "./BrainMobile";
import { Plex } from "./Plex";
import { TextPromptDialog } from "./TextPromptDialog";
import { typeColor } from "./ThoughtChip";
import { ThoughtNotePane } from "./ThoughtNotePane";
import { ThoughtSearch } from "./ThoughtSearch";
import { TypesDialog } from "./TypesDialog";

type Prompt =
  | { kind: "new" }
  | { kind: "rename"; id: string; initial: string }
  | { kind: "label"; id: string; initial: string };

type Menu = { x: number; y: number; items: MenuItem[] };

/**
 * Brain: the plex, the note beside it, and the search and recent list that get you anywhere.
 *
 * The active thought is `?thought=` — every navigation here is a `navigate(...)`, so the
 * browser's Back and Forward walk the path you took. Mutations revalidate the page and the new
 * props flow in; nothing here keeps a second copy of the graph.
 */
export function BrainView({
  plex,
  homeId,
  recent,
  types,
}: {
  plex: PlexData | null;
  homeId: string | null;
  recent: ThoughtRef[];
  types: ThoughtType[];
  tags: TagCount[];
}) {
  const compact = useIsCompact();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [addingFor, setAdding] = useState<{
    relation: LinkRelation;
    forId: string;
  } | null>(null);
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [typesOpen, setTypesOpen] = useState(false);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [pointer, setPointer] = useState({ x: 240, y: 160 });

  const activeId = plex?.active.id ?? null;

  // Stamp the Recent list on activation. It revalidates nothing, so it cannot disturb the plex.
  useEffect(() => {
    if (activeId) void markThoughtVisitedAction(activeId);
  }, [activeId]);

  // A different thought closes whatever was half-done on the last one.
  const adding = addingFor && addingFor.forId === activeId ? addingFor.relation : null;

  const hood = useMemo(
    () => (plex ? neighbourhood(plex.active.id, plex.links) : null),
    [plex],
  );

  const act = useCallback(
    async (work: Promise<ActionResult>, then?: (id?: string) => void) => {
      setError(null);
      const result = await work;
      if (!result.ok) setError(result.error);
      else then?.(result.id);
    },
    [],
  );

  const open = useCallback((id: string) => navigate(brainHref(id)), [navigate]);

  const nameOf = useCallback((id: string) => plex?.thoughts[id]?.name ?? "", [plex]);

  const hooks: BrainHooks = useMemo(
    () => ({
      newThought: () => setPrompt({ kind: "new" }),
      addLink: (relation) => {
        if (activeId) setAdding({ relation, forId: activeId });
      },
      open,
      rename: (id) => setPrompt({ kind: "rename", id, initial: nameOf(id) }),
      editLinkLabel: (id) => {
        const link = plex?.links.find(
          (l) =>
            (l.fromId === activeId && l.toId === id) ||
            (l.toId === activeId && l.fromId === id),
        );
        if (link) setPrompt({ kind: "label", id: link.id, initial: link.label });
      },
      setType: (id) =>
        setMenu({
          ...pointer,
          items: [
            ...[null, ...types].map((type): MenuItem => ({
              label: type ? type.name : "No type",
              onSelect: () => void act(setThoughtTypeAction(id, type?.id ?? null)),
            })),
            "separator",
            { label: "Manage types…", onSelect: () => setTypesOpen(true) },
          ],
        }),
      editTags: () => document.getElementById(BRAIN_TAGS_ID)?.focus(),
      toggleHome: (id, makeHome) =>
        void act(setHomeThoughtAction(makeHome ? id : null)),
      unlink: (id) => {
        if (activeId) void act(unlinkThoughtsAction(activeId, id));
      },
      remove: (id) => setConfirmDelete(id),
      goHome: () => {
        if (homeId) open(homeId);
      },
      focusSearch: () => document.getElementById(BRAIN_SEARCH_ID)?.focus(),
      manageTypes: () => setTypesOpen(true),
    }),
    [act, activeId, homeId, nameOf, open, plex, pointer, types],
  );

  const commands = useMemo(
    () =>
      buildBrainCommands(
        plex
          ? {
              id: plex.active.id,
              name: plex.active.name,
              isHome: plex.active.isHome,
              isActive: true,
            }
          : null,
        hooks,
        homeId !== null,
      ),
    [hooks, homeId, plex],
  );
  useRegisterCommands(commands);

  function openMenuFor(id: string, event: MouseEvent) {
    const at = { x: event.clientX, y: event.clientY };
    setPointer(at);
    setMenu({
      ...at,
      items: menuItemsFor(
        rowMenuSections(
          buildBrainCommands(
            {
              id,
              name: nameOf(id),
              isHome: id === homeId,
              isActive: id === activeId,
            },
            hooks,
            homeId !== null,
          ),
        ),
      ),
    });
  }

  function openMore(hiddenIds: string[], event: MouseEvent) {
    const at = { x: event.clientX, y: event.clientY };
    setPointer(at);
    setMenu({
      ...at,
      items: hiddenIds.map((id): MenuItem => ({
        label: nameOf(id),
        onSelect: () => open(id),
      })),
    });
  }

  const deleting = confirmDelete ? nameOf(confirmDelete) : "";

  const dialogs = (
    <>
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={menu.items}
          onClose={() => setMenu(null)}
        />
      )}
      {prompt && (
        <TextPromptDialog
          title={
            prompt.kind === "new"
              ? "New thought"
              : prompt.kind === "rename"
                ? "Rename thought"
                : "Link label"
          }
          initial={prompt.kind === "new" ? "" : prompt.initial}
          placeholder={prompt.kind === "label" ? "e.g. works at" : undefined}
          submitLabel={prompt.kind === "new" ? "Create" : "Save"}
          allowEmpty={prompt.kind === "label"}
          onCancel={() => setPrompt(null)}
          onSubmit={(value) => {
            const current = prompt;
            setPrompt(null);
            if (current.kind === "new") {
              void act(createThoughtAction({ name: value }), (id) => id && open(id));
            } else if (current.kind === "rename") {
              void act(renameThoughtAction(current.id, value));
            } else {
              void act(setLinkLabelAction(current.id, value));
            }
          }}
        />
      )}
      <ConfirmDialog
        open={confirmDelete !== null}
        title="Delete thought?"
        message={`“${deleting}” and its links will be deleted. Thoughts it was linked to stay, and can still be found by search.`}
        confirmLabel="Delete"
        destructive
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => {
          const id = confirmDelete;
          setConfirmDelete(null);
          if (!id) return;
          void act(deleteThoughtAction(id), () => {
            if (id === activeId) navigate("/library/brain");
          });
        }}
      />
      {typesOpen && (
        <TypesDialog
          types={types}
          onClose={() => setTypesOpen(false)}
          onCreate={(name, color) => void act(createThoughtTypeAction({ name, color }))}
          onDelete={(typeId) => void act(deleteThoughtTypeAction(typeId))}
        />
      )}
    </>
  );

  const toolbar = (
    <TabToolbar commandRow={<CommandBar commands={commands} />}>
      <ThoughtSearch recent={recent} onOpen={open} />
    </TabToolbar>
  );

  if (!plex || !hood) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {toolbar}
        {error && <ErrorBanner message={error} />}
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
          <h2 className="text-[1rem] font-semibold text-ink">No thoughts yet</h2>
          <p className="max-w-sm text-[0.875rem] text-ink-muted">
            A thought is a note you can link to other thoughts. Start with whatever is
            on your mind, then add what it is part of, what it contains, and what it
            reminds you of.
          </p>
          <button
            type="button"
            onClick={() => setPrompt({ kind: "new" })}
            className="min-h-tap rounded bg-ink px-4 py-1.5 text-[0.8125rem] font-medium text-surface"
          >
            Create first thought
          </button>
        </div>
        {dialogs}
      </div>
    );
  }

  const { active } = plex;
  const header = (
    <header className="flex flex-none flex-wrap items-center gap-x-3 gap-y-1 border-b border-rule px-4 py-2">
      <span
        className="size-3 flex-none rounded-full"
        style={{ background: typeColor(active.color) }}
        title={types.find((t) => t.id === active.typeId)?.name ?? "No type"}
      />
      <h1 className="min-w-0 truncate text-[1rem] font-semibold text-ink">
        {active.name}
      </h1>
      {active.isHome && (
        <span className="rounded bg-surface-raised px-1.5 py-0.5 text-[0.6875rem] text-ink-muted">
          Home
        </span>
      )}
      {active.tags.map((tag) => (
        <span
          key={tag}
          className="rounded border border-rule px-1.5 py-0.5 text-[0.6875rem] text-ink-muted"
        >
          {tag}
        </span>
      ))}
    </header>
  );

  const addInput = adding && (
    <div className="flex-none border-b border-rule px-4 py-2">
      <AddLinkInput
        key={adding}
        relation={adding}
        activeId={active.id}
        onCancel={() => setAdding(null)}
        onChoose={(otherId) => {
          const relation = adding;
          setAdding(null);
          void act(linkThoughtsAction(active.id, relation, otherId));
        }}
        onCreate={(name) => {
          const relation = adding;
          setAdding(null);
          void act(
            createThoughtAction({
              name,
              linkTo: { thoughtId: active.id, relation: mirrorRelation(relation) },
            }),
          );
        }}
      />
    </div>
  );

  const notePane = (
    <ThoughtNotePane
      key={active.id}
      thought={active}
      types={types}
      onType={(typeId) => void act(setThoughtTypeAction(active.id, typeId))}
      onTags={(names) => void act(setThoughtTagsAction(active.id, names))}
      onManageTypes={() => setTypesOpen(true)}
    />
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {toolbar}
      {error && <ErrorBanner message={error} />}

      {compact ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          {header}
          {addInput}
          <BrainMobile
            hood={hood}
            thoughts={plex.thoughts}
            onOpen={open}
            onMenu={openMenuFor}
          />
          {notePane}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          <div className="flex min-w-0 flex-1 flex-col">
            {header}
            {addInput}
            <Plex
              plex={plex}
              onOpen={open}
              onMenu={openMenuFor}
              onMore={(hiddenIds, _node, event) => openMore(hiddenIds, event)}
              onLink={(thoughtId, relation, otherId) =>
                void act(linkThoughtsAction(thoughtId, relation, otherId))
              }
              onCreateLinked={(thoughtId, relation, name) =>
                void act(
                  createThoughtAction({
                    name,
                    linkTo: { thoughtId, relation: mirrorRelation(relation) },
                  }),
                )
              }
            />
          </div>
          <aside className="flex w-[26rem] flex-none flex-col border-l border-rule">
            {notePane}
          </aside>
        </div>
      )}
      {dialogs}
    </div>
  );
}
