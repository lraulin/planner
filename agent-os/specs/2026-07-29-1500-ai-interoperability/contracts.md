# Agent tool contracts (MVP)

`POST /api/agent/{tool}` with JSON body. Envelope per `api/response-format`.

## health

Args: `{}`  
Returns: `{ status: "ok", tools: string[] }`

## get_context

Args: `{ weekStartsOn?: number }`  
Returns: `{ asOf, weekStart, focus[], topOpenWork[], weeklyPlan, weekAppointmentCount }`

## search_nodes

Args:

```ts
{
  type?: NodeType | NodeType[];
  state?: NodeState | NodeState[];
  focus?: boolean;
  query?: string;
  parentId?: string | null;
  includeCompleted?: boolean;
  limit?: number; // default 50, max 200
}
```

Returns: `{ nodes: AgentNodeSummary[] }`

## get_node

Args: `{ id: string }`  
Returns: `{ node: AgentNodeSummary }`

## create_node

Args:

```ts
{
  type: NodeType;
  parentId?: string | null; // omit → top level (any type)
  name?: string;
  // Core (optional — empty is fine)
  state?: NodeState;
  priorityLetter?: "A"|"B"|"C"|"D"|null;
  priorityRank?: number; // requires priorityLetter
  deadline?: string | null; // ISO or YYYY-MM-DD
  targetStartDate?: string | null;
  targetEndDate?: string | null;
  deferredDate?: string | null;
  focus?: boolean;
  notes?: string; // main item notes (nodes.notes)
  // Type halves — same columns as the detail forms / saveNodeDetail allowlists
  project?: { purpose?, idealVision?, sufficientVision?, strategy?, description?, … };
  task?: { description?, effortMinutes?, contexts?, place?, … };
  goal?: { purpose?, definition?, vision?, strategy?, … };
  resultArea?: { description?, mission?, … };
  // Legacy shortcut (merged into task.effortMinutes when nested key absent)
  effortMinutes?: number | null;
}
```

Returns: `{ node }` — full form via `get_node` (notes, side table, linked-note stubs).

## update_node

Args: `{ id: string }` plus any of the optional create fields (except `type`/`parentId`).
Partial writes only change supplied keys.  
Returns: `{ node }` (full form)

## get_node

Args: `{ id: string }`  
Returns: `{ node }` with summary fields **plus** `notes`, plan dates, type half, `linkedNotes[]`.

## create_note

Args: `{ title?, subject?, body?, nodeId?, noteDate?, flag?, contexts? }`  
Returns: `{ note }`

## update_note

Args: `{ id: string, …partial fields }`  
Returns: `{ note }`

## list_notes

Args: `{ nodeId?: string, limit?: number }`  
Returns: `{ notes: NoteSummary[] }`

## get_week

Args: `{ weekStart?: string, weekStartsOn?: number }`  
Returns: plan summary + appointments + occurrences

## create_appointment

Args: `{ subject?, startAt: ISO, endAt: ISO, location?, allDay?, projectId?, notes?, contexts? }`  
Returns: `{ appointment }`

## update_appointment

Args: `{ id, …partial }` including optional `checkState: open|done|missed`

## delete_appointment

Args: `{ id }` → `{ deleted: true, id }`

## ensure_weekly_plan

Args: `{ weekStart?, weekStartsOn?, reviewAreasGoals? }` → `{ plan }`

## update_weekly_plan

Args: `{ id, availableMinutes?, timeChartId?, blockSizeMinutes?, avoidCollisions?, … }`

## upsert_plan_entry

Args: `{ planId, nodeId, focus?, reviewed?, rewrite?, committedMinutes? }`

## set_focus_area

Args: `{ planId, nodeId, focus: boolean }`

## load_weekly_plan

Args: `{ weekStart?, weekStartsOn? }`  
Returns: compact plan + result areas + goals + projects + entries + schedule glance

## set_weekly_plan_completed

Args: `{ id, completed: boolean }`

## list_metrics

Args:

```ts
{
  ownerNodeId?: string | null; // filter to goal owner (null = standalone only)
  query?: string;              // case-insensitive match on title/category/question/units/owner
  activeOnly?: boolean;        // default false
  limit?: number;              // default 50, max 200
}
```

Returns: `{ metrics: MetricListSummary[] }` (id, title, units, metricType, lastValue, lastDate, owner…)

## get_metric

Args: `{ id: string, entryLimit?: number }` (default 30, max 200)  
Returns: `{ metric }` with recent `entries[]` and `entryCount`

## create_metric

Args:

```ts
{
  title?: string;
  category?: string;
  question?: string;
  description?: string;
  reason?: string;
  units?: string;
  active?: boolean;
  metricType?: "instance" | "cumulative" | "total";
  priorityLetter?: "A"|"B"|"C"|"D"|null;
  priorityRank?: number | null;
  objectiveTarget?: number | null;
  ownerNodeId?: string | null; // goal id, or null for standalone
}
```

Returns: `{ metric }` (same shape as `get_metric`)

## update_metric

Args: `{ id: string, …partial create fields }`  
Returns: `{ metric }`

## log_metric_entry

Record a tracking value (main “save a reading” tool).

Args:

```ts
{
  metricId: string;
  value: number;
  entryDate?: string; // YYYY-MM-DD; defaults to today (local)
  target?: number | null;
  entryType?: string; // default new_total
}
```

Returns: `{ entryId, entryDate, value, metric }`

## update_metric_entry

Args: `{ id: string, entryDate?, value?, target?, entryType? }`  
Returns: `{ entry, metric }`
