"use client";

import { useState } from "react";
import type { PriorityLetter } from "@/db/schema";
import {
  WISH_TYPE_CODES,
  type WishKind,
  type WishListRow,
} from "@/lib/detail/wishTypes";
import { priorityOrderValue } from "@/lib/priority/order";
import { formatPriority, parsePriority } from "@/lib/tree/format";
import type { ColumnDef } from "@/components/grid/columns";
import { selectValueOnFocus } from "@/components/selectValueOnFocus";

/**
 * Callbacks the Wish List columns close over. Same shape as the Notes columns: defs stay
 * pure data plus render, and the host swaps handlers freely.
 */
export type WishesColumnCtx = {
  onPriorityChange: (
    row: WishListRow,
    letter: PriorityLetter | null,
    rank: number | null,
  ) => void;
  onTitleChange: (row: WishListRow, title: string) => void;
  onDescriptionChange: (row: WishListRow, description: string) => void;
};

export const WISHES_COLUMN_IDS = ["priority", "type", "title", "description"] as const;

const TYPE_LABELS: Record<WishKind, string> = {
  wish_want_dont_have: "Want / Don't Have",
  wish_dont_want_have: "Don't Want / Have",
  wish_want_have: "Want / Have",
  wish_want_avoid: "Want to Avoid",
};

export const wishesColumns: ColumnDef<WishesColumnCtx, WishListRow>[] = [
  {
    id: "priority",
    label: "Pri",
    width: "3rem",
    align: "center",
    filterKind: "priority",
    filterValue: (row) =>
      formatPriority(row.node.priorityLetter, row.node.priorityRank) || null,
    sortValue: (row) =>
      priorityOrderValue(row.node.priorityLetter, row.node.priorityRank),
    render: (row, ctx) => (
      <WishPriorityCell
        key={`pri:${formatPriority(row.node.priorityLetter, row.node.priorityRank)}`}
        letter={row.node.priorityLetter}
        rank={row.node.priorityRank}
        onChange={(letter, rank) => ctx.onPriorityChange(row.node, letter, rank)}
      />
    ),
  },
  {
    id: "type",
    label: "Type",
    width: "4rem",
    filterKind: "enum",
    filterValue: (row) => TYPE_LABELS[row.node.kind],
    sortValue: (row) => WISH_TYPE_CODES[row.node.kind],
    render: (row) => (
      <span className="text-[0.75rem] font-medium text-ink-muted">
        {WISH_TYPE_CODES[row.node.kind]}
      </span>
    ),
  },
  {
    id: "title",
    label: "Title",
    width: "minmax(12rem,1fr)",
    hideable: false,
    filterKind: "text",
    filterValue: (row) => row.node.title || null,
    sortValue: (row) => row.node.title.toLowerCase(),
    render: (row, ctx) => (
      <WishTextCell
        key={`title:${row.node.title}`}
        value={row.node.title}
        ariaLabel="Title"
        onChange={(title) => ctx.onTitleChange(row.node, title)}
      />
    ),
  },
  {
    id: "description",
    label: "Description",
    width: "minmax(12rem,1.2fr)",
    filterKind: "text",
    filterValue: (row) => row.node.description || null,
    sortValue: (row) => row.node.description.toLowerCase(),
    render: (row, ctx) => (
      <WishTextCell
        key={`desc:${row.node.description}`}
        value={row.node.description}
        ariaLabel="Description"
        onChange={(description) => ctx.onDescriptionChange(row.node, description)}
      />
    ),
  },
];

function WishPriorityCell({
  letter,
  rank,
  onChange,
}: {
  letter: PriorityLetter | null;
  rank: number | null;
  onChange: (letter: PriorityLetter | null, rank: number | null) => void;
}) {
  const current = formatPriority(letter, rank);
  const [value, setValue] = useState(current);
  const [invalid, setInvalid] = useState(false);

  function commit() {
    const parsed = parsePriority(value);
    if (!parsed) {
      setInvalid(true);
      setValue(current);
      return;
    }
    setInvalid(false);
    onChange(parsed.letter, parsed.rank);
  }

  return (
    <input
      value={value}
      onClick={(event) => event.stopPropagation()}
      {...selectValueOnFocus}
      onChange={(event) => {
        setInvalid(false);
        setValue(event.target.value);
      }}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          commit();
          event.currentTarget.blur();
        } else if (event.key === "Escape") {
          event.preventDefault();
          setValue(current);
          setInvalid(false);
          event.currentTarget.blur();
        }
      }}
      aria-label="Priority"
      aria-invalid={invalid}
      placeholder="—"
      maxLength={3}
      className={[
        "tabular w-full border-none bg-transparent text-center text-[0.8125rem] font-medium uppercase outline-none placeholder:text-ink-faint/50",
        invalid ? "text-priority-a" : "text-ink-muted",
      ].join(" ")}
    />
  );
}

function WishTextCell({
  value,
  ariaLabel,
  onChange,
}: {
  value: string;
  ariaLabel: string;
  onChange: (next: string) => void;
}) {
  const [draft, setDraft] = useState(value);

  return (
    <input
      value={draft}
      onClick={(event) => event.stopPropagation()}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        const next = draft.trim();
        if (next !== value) onChange(next);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          event.currentTarget.blur();
        } else if (event.key === "Escape") {
          event.preventDefault();
          setDraft(value);
          event.currentTarget.blur();
        }
      }}
      aria-label={ariaLabel}
      className="w-full truncate border-none bg-transparent text-[0.8125rem] text-ink outline-none"
    />
  );
}
