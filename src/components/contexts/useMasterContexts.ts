"use client";

import { useEffect, useState } from "react";
import { listMasterContextsAction } from "@/app/contexts/actions";
import { MASTER_CONTEXTS_CHANGED_EVENT } from "./MasterContextsDialog";

async function loadNames(): Promise<string[]> {
  const result = await listMasterContextsAction();
  return result.ok ? result.data.map((context) => context.name) : [];
}

export function useMasterContexts(): readonly string[] {
  const [names, setNames] = useState<readonly string[]>([]);

  useEffect(() => {
    let alive = true;
    void loadNames().then((next) => alive && setNames(next));

    function reload() {
      void loadNames().then((next) => alive && setNames(next));
    }
    window.addEventListener(MASTER_CONTEXTS_CHANGED_EVENT, reload);
    return () => {
      alive = false;
      window.removeEventListener(MASTER_CONTEXTS_CHANGED_EVENT, reload);
    };
  }, []);

  return names;
}
