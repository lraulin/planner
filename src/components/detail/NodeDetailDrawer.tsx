"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";

/**
 * The detail drawer is closed on first paint of every grid that hosts it. Loading its
 * forms, item lists, and recurrence fields as part of that paint is what turned outline
 * hydration into a 700ms+ blocking task. The body chunk loads the first time a row is
 * opened; until then this module is a few lines and a `null`.
 */
const NodeDetailDrawerBody = dynamic(
  () =>
    import("./NodeDetailDrawerBody").then((mod) => ({
      default: mod.NodeDetailDrawer,
    })),
  { ssr: false },
);

export function NodeDetailDrawer(props: ComponentProps<typeof NodeDetailDrawerBody>) {
  if (!props.node) return null;
  return <NodeDetailDrawerBody {...props} />;
}
