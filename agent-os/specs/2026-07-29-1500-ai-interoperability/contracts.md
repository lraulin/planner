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
  parentId?: string | null; // required unless result_area
  name?: string;
  state?: NodeState;
  priorityLetter?: "A"|"B"|"C"|"D"|null;
  priorityRank?: number;
  deadline?: string | null; // ISO
  focus?: boolean;
  effortMinutes?: number | null; // tasks only
}
```

Returns: `{ node }`

## update_node

Args: `{ id: string }` plus any of the optional create fields (except `type`/`parentId`).  
Returns: `{ node }`

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
