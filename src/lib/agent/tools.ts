/** Canonical executable contract for every Planner agent tool. */

import { z, type ZodType } from "zod";
import { getAgentUserId } from "@/lib/auth/identity";
import { AgentError, toAgentError } from "./errors";
import { asObject } from "./parse";
import { inputSchemas, outputSchemas } from "./contracts";
import {
  captureTool,
  createNodeTool,
  getContext,
  getNode,
  searchNodes,
  updateNodeTool,
} from "./outlineTools";
import {
  createNoteTool,
  getNoteTool,
  listNotesTool,
  searchNotesTool,
  updateNoteTool,
} from "./noteTools";
import {
  createAppointmentTool,
  deleteAppointmentTool,
  getWeekTool,
  updateAppointmentTool,
} from "./scheduleTools";
import {
  ensureWeeklyPlanTool,
  loadWeeklyPlanTool,
  setFocusAreaTool,
  setWeeklyPlanCompletedTool,
  updateWeeklyPlanEntriesTool,
  updateWeeklyPlanTool,
  upsertPlanEntryTool,
} from "./planTools";
import {
  createMetricTool,
  getMetricTool,
  listMetricsTool,
  logMetricEntryTool,
  updateMetricEntryTool,
  updateMetricTool,
} from "./metricTools";
import {
  getCashFlowTool,
  getDebtSummaryTool,
  getFinanceOverviewTool,
  getSpendingBreakdownTool,
  listCommitmentCandidatesTool,
  listCommitmentsTool,
  listPayeesTool,
  searchCommitmentsTool,
  findCommitmentCandidatesTool,
  saveSubscriptionTool,
  setCommitmentPayeesTool,
  listRecurringBillsTool,
  listStatementsTool,
  searchTransactionsTool,
  upsertSubscriptionTool,
} from "./financeTools";
import {
  createJobTool,
  createLifeEventTool,
  createResidenceTool,
  getJobTool,
  getLifeEventTool,
  getResidenceTool,
  listJobsTool,
  listLifeEventsTool,
  listResidencesTool,
  updateJobTool,
  updateLifeEventTool,
  updateResidenceTool,
} from "./historyTools";

export const AGENT_CONTRACT_VERSION = 2 as const;
const SYSTEM_TOOL_USER_ID = "00000000-0000-4000-8000-000000000000";

export type AgentToolDomain =
  | "system"
  | "outline"
  | "notes"
  | "schedule"
  | "planning"
  | "metrics"
  | "finances"
  | "history";
export type AgentToolExposure = "core" | "domain" | "legacy";
export type AgentToolEffects = {
  kind: "read" | "write";
  destructive: boolean;
  retry: "safe" | "safe_with_external_ref" | "unsafe";
  confirmation: "none" | "user_intent" | "explicit";
};

type AgentToolHandler = (
  userId: string,
  args: Record<string, unknown>,
) => Promise<unknown> | unknown;

export type AgentToolDefinition = {
  name: AgentToolName;
  domain: AgentToolDomain;
  summary: string;
  useWhen: string;
  avoidWhen: string;
  returns: string;
  inputSchema: ZodType;
  outputSchema: ZodType;
  effects: AgentToolEffects;
  exposure: AgentToolExposure;
  replacedBy?: string;
  examples: { title: string; arguments: Record<string, unknown> }[];
  handler: AgentToolHandler;
};

const read: AgentToolEffects = {
  kind: "read",
  destructive: false,
  retry: "safe",
  confirmation: "none",
};
const write: AgentToolEffects = {
  kind: "write",
  destructive: false,
  retry: "unsafe",
  confirmation: "user_intent",
};
const keyedWrite: AgentToolEffects = { ...write, retry: "safe_with_external_ref" };
const safeWrite: AgentToolEffects = { ...write, retry: "safe" };
const destructiveWrite: AgentToolEffects = {
  ...write,
  destructive: true,
  confirmation: "explicit",
};

type ContractName = keyof typeof inputSchemas & keyof typeof outputSchemas;
export type AgentToolName = ContractName;

function defineTool(
  name: ContractName,
  definition: Omit<
    AgentToolDefinition,
    "name" | "inputSchema" | "outputSchema" | "examples"
  > & { examples?: AgentToolDefinition["examples"] },
): AgentToolDefinition {
  return {
    name,
    inputSchema: inputSchemas[name],
    outputSchema: outputSchemas[name],
    examples: definition.examples ?? [],
    ...definition,
  };
}

const definitions: AgentToolDefinition[] = [
  defineTool("health", {
    domain: "system",
    summary: "Check API health and contract version.",
    useWhen: "Use for liveness checks and the discovery entry point.",
    avoidWhen: "Do not use it as the tool catalog; follow its discovery pointers.",
    returns:
      "Status, every callable compatibility name, contract version, and discovery tool names.",
    effects: read,
    exposure: "domain",
    handler: healthTool,
  }),
  defineTool("list_tools", {
    domain: "system",
    summary: "List the focused core surface or one tool domain.",
    useWhen:
      "Use first, or when a task moves into notes, schedule, planning, metrics, finances, or history.",
    avoidWhen: "Do not request all domains unless you truly need a broad inventory.",
    returns: "Compact selection metadata without full schemas.",
    effects: read,
    exposure: "core",
    examples: [{ title: "Discover metric tools", arguments: { domain: "metrics" } }],
    handler: listTools,
  }),
  defineTool("describe_tool", {
    domain: "system",
    summary: "Get the full executable contract for one tool.",
    useWhen: "Use after selecting a likely tool and before a non-obvious call.",
    avoidWhen: "Do not describe every tool up front; list the relevant domain first.",
    returns: "Intent guidance, effects, examples, and JSON Schema draft 2020-12.",
    effects: read,
    exposure: "core",
    examples: [{ title: "Inspect node creation", arguments: { name: "create_node" } }],
    handler: describeTool,
  }),
  defineTool("get_context", {
    domain: "outline",
    summary: "Read a compact current-planning dashboard.",
    useWhen: "Use to orient at the start of a planning conversation or briefing.",
    avoidWhen: "Use search_nodes or get_node for a named item or full detail.",
    returns: "Focus, bounded top open work, weekly-plan status, and appointment count.",
    effects: read,
    exposure: "core",
    handler: getContext,
  }),
  defineTool("search_nodes", {
    domain: "outline",
    summary: "Find outline items with compact paths and paging metadata.",
    useWhen:
      "Use to resolve a human name or filter open work before reading or changing it.",
    avoidWhen: "Use get_node when you already have an id and need full form fields.",
    returns: "A compact page of matching nodes plus total and next offset.",
    effects: read,
    exposure: "core",
    examples: [
      { title: "Find an open task", arguments: { query: "passport", type: "task" } },
    ],
    handler: searchNodes,
  }),
  defineTool("get_node", {
    domain: "outline",
    summary: "Read one outline item and its full detail form.",
    useWhen: "Use after search when full notes or type-specific fields matter.",
    avoidWhen: "Do not use for broad scanning or list building.",
    returns: "Full node detail, path, and linked-note summaries.",
    effects: read,
    exposure: "core",
    handler: getNode,
  }),
  defineTool("create_node", {
    domain: "outline",
    summary: "Create and optionally fully describe one outline item.",
    useWhen:
      "Use when the item type and parent are known, or a deliberate root item is intended.",
    avoidWhen:
      "Use capture_inbox for an unprocessed thought whose placement is not known.",
    returns: "Full created or replayed node and whether this call created it.",
    effects: keyedWrite,
    exposure: "core",
    handler: createNodeTool,
  }),
  defineTool("capture_inbox", {
    domain: "outline",
    summary: "Capture one or many unprocessed tasks into the Inbox.",
    useWhen: "Use for raw ideas, reminders, or a brain dump that has not been filed.",
    avoidWhen: "Use create_node when type and intended parent are already known.",
    returns:
      "The captured node or ordered batch results, including deduplication status.",
    effects: keyedWrite,
    exposure: "core",
    handler: captureTool,
  }),
  defineTool("capture", {
    domain: "outline",
    summary: "Legacy alias for capture_inbox.",
    useWhen: "Use only for an existing client that has not migrated.",
    avoidWhen: "New callers should use capture_inbox.",
    returns: "The same payload as capture_inbox.",
    effects: keyedWrite,
    exposure: "legacy",
    replacedBy: "capture_inbox",
    handler: captureTool,
  }),
  defineTool("update_node", {
    domain: "outline",
    summary: "Apply a strict partial update to one outline item.",
    useWhen: "Use after resolving one unambiguous node id.",
    avoidWhen: "Do not guess an id or use it to create work.",
    returns: "The full node after the update.",
    effects: safeWrite,
    exposure: "core",
    handler: updateNodeTool,
  }),
  defineTool("create_note", {
    domain: "notes",
    summary: "Create a standalone or node-linked note.",
    useWhen: "Use for durable prose that belongs in the Notes hierarchy.",
    avoidWhen: "Use a node's notes field for prose that is simply part of that record.",
    returns: "The full created or replayed note and whether this call created it.",
    effects: keyedWrite,
    exposure: "domain",
    handler: createNoteTool,
  }),
  defineTool("update_note", {
    domain: "notes",
    summary: "Apply a strict partial update to one note.",
    useWhen: "Use after resolving a note id through search_notes.",
    avoidWhen: "Do not use for node notes stored on an outline record.",
    returns: "The full note after the update.",
    effects: safeWrite,
    exposure: "domain",
    handler: updateNoteTool,
  }),
  defineTool("search_notes", {
    domain: "notes",
    summary: "Search note metadata and body text without returning full bodies.",
    useWhen: "Use to locate a note by words, context, or linked node.",
    avoidWhen: "Use get_note once an id is known and the full body is needed.",
    returns: "Compact note snippets with paging metadata.",
    effects: read,
    exposure: "core",
    handler: searchNotesTool,
  }),
  defineTool("get_note", {
    domain: "notes",
    summary: "Read the full body and metadata of one note.",
    useWhen: "Use after search_notes identifies the intended note.",
    avoidWhen: "Do not use to scan many notes.",
    returns: "One complete note including markdown body.",
    effects: read,
    exposure: "core",
    handler: getNoteTool,
  }),
  defineTool("list_notes", {
    domain: "notes",
    summary: "Legacy full-body note listing.",
    useWhen:
      "Use only for an existing client that requires the original full-body rows.",
    avoidWhen: "New callers should use search_notes and get_note.",
    returns: "A page of full notes plus paging metadata.",
    effects: read,
    exposure: "legacy",
    replacedBy: "search_notes,get_note",
    handler: listNotesTool,
  }),
  defineTool("get_week", {
    domain: "schedule",
    summary: "Read one week of appointments and expanded occurrences.",
    useWhen: "Use when answering or planning around the calendar.",
    avoidWhen: "Use get_context if only the current appointment count is needed.",
    returns: "Weekly plan summary, appointment masters, and occurrence times.",
    effects: read,
    exposure: "domain",
    handler: getWeekTool,
  }),
  defineTool("create_appointment", {
    domain: "schedule",
    summary: "Create one calendar appointment.",
    useWhen: "Use after the subject and exact start/end times are approved.",
    avoidWhen:
      "Do not retry automatically; Google synchronization is not atomic with local storage.",
    returns: "The created appointment summary.",
    effects: write,
    exposure: "domain",
    handler: createAppointmentTool,
  }),
  defineTool("update_appointment", {
    domain: "schedule",
    summary: "Update one calendar appointment.",
    useWhen: "Use after identifying the appointment and intended changes.",
    avoidWhen:
      "Do not retry automatically; Google synchronization is not atomic with local storage.",
    returns: "The updated appointment summary.",
    effects: write,
    exposure: "domain",
    handler: updateAppointmentTool,
  }),
  defineTool("delete_appointment", {
    domain: "schedule",
    summary: "Permanently delete one appointment.",
    useWhen:
      "Use only after the user explicitly intends that appointment to be removed.",
    avoidWhen: "Do not use to mark an appointment done or missed.",
    returns: "The deleted appointment id and confirmation flag.",
    effects: destructiveWrite,
    exposure: "domain",
    handler: deleteAppointmentTool,
  }),
  defineTool("ensure_weekly_plan", {
    domain: "planning",
    summary: "Load or create the weekly plan for a normalized week.",
    useWhen: "Use to begin the weekly-planning workflow.",
    avoidWhen: "Use load_weekly_plan for a read-only view.",
    returns: "The existing or newly initialized plan summary.",
    effects: safeWrite,
    exposure: "domain",
    handler: ensureWeeklyPlanTool,
  }),
  defineTool("update_weekly_plan", {
    domain: "planning",
    summary: "Update weekly-plan settings and time budget.",
    useWhen: "Use when the plan exists and the user has approved plan-level settings.",
    avoidWhen: "Use update_weekly_plan_entries for per-item review decisions.",
    returns: "The weekly plan after the update.",
    effects: safeWrite,
    exposure: "domain",
    handler: updateWeeklyPlanTool,
  }),
  defineTool("upsert_plan_entry", {
    domain: "planning",
    summary: "Create or update one weekly-plan item decision.",
    useWhen: "Use for an isolated entry edit outside a multi-item review stage.",
    avoidWhen: "Use update_weekly_plan_entries for three or more approved decisions.",
    returns: "The plan entry after the upsert.",
    effects: safeWrite,
    exposure: "domain",
    handler: upsertPlanEntryTool,
  }),
  defineTool("update_weekly_plan_entries", {
    domain: "planning",
    summary: "Atomically apply an ordered batch of weekly-plan item decisions.",
    useWhen: "Use once per approved review stage instead of repeated entry calls.",
    avoidWhen: "Do not include speculative or unapproved decisions in the batch.",
    returns:
      "Entries in input order and the applied count; any invalid item rolls back all.",
    effects: safeWrite,
    exposure: "domain",
    handler: updateWeeklyPlanEntriesTool,
  }),
  defineTool("set_focus_area", {
    domain: "planning",
    summary: "Legacy single-entry focus-area update.",
    useWhen:
      "Use only for an existing client that has not adopted batch weekly updates.",
    avoidWhen: "New weekly-planning callers should use update_weekly_plan_entries.",
    returns: "The focused plan entry.",
    effects: safeWrite,
    exposure: "legacy",
    replacedBy: "update_weekly_plan_entries",
    handler: setFocusAreaTool,
  }),
  defineTool("load_weekly_plan", {
    domain: "planning",
    summary: "Load the compact state needed for the weekly-planning workflow.",
    useWhen:
      "Use to review areas, goals, projects, prior rewrites, and schedule together.",
    avoidWhen: "Use get_context for a normal briefing outside weekly planning.",
    returns: "Plan machinery and compact candidate node summaries.",
    effects: read,
    exposure: "domain",
    handler: loadWeeklyPlanTool,
  }),
  defineTool("set_weekly_plan_completed", {
    domain: "planning",
    summary: "Close or reopen a weekly plan.",
    useWhen:
      "Use after the user finishes the planning workflow or explicitly reopens it.",
    avoidWhen: "Do not infer completion from merely editing the plan.",
    returns: "The plan id and resulting completion timestamp.",
    effects: safeWrite,
    exposure: "domain",
    handler: setWeeklyPlanCompletedTool,
  }),
  defineTool("list_metrics", {
    domain: "metrics",
    summary: "Find metrics with compact progress summaries.",
    useWhen: "Use to locate a tracked quantity or scan active metrics.",
    avoidWhen: "Use get_metric for descriptions, reasons, or entry history.",
    returns: "A compact metric page plus total and next offset.",
    effects: read,
    exposure: "domain",
    handler: listMetricsTool,
  }),
  defineTool("get_metric", {
    domain: "metrics",
    summary: "Read one metric and a page of tracking entries.",
    useWhen: "Use after list_metrics resolves the intended metric.",
    avoidWhen: "Do not use to list the whole metrics catalog.",
    returns: "Full metric detail with entry count and entry paging metadata.",
    effects: read,
    exposure: "domain",
    handler: getMetricTool,
  }),
  defineTool("create_metric", {
    domain: "metrics",
    summary: "Create one standalone or goal-owned metric.",
    useWhen: "Use when the tracked question and units are known.",
    avoidWhen: "Do not create a second metric for a natural-key retry.",
    returns: "Full created or replayed metric and whether this call created it.",
    effects: keyedWrite,
    exposure: "domain",
    handler: createMetricTool,
  }),
  defineTool("update_metric", {
    domain: "metrics",
    summary: "Apply a strict partial update to metric definition fields.",
    useWhen: "Use after resolving the metric id.",
    avoidWhen: "Use log_metric_entry to record a measurement.",
    returns: "Full metric detail after the update.",
    effects: safeWrite,
    exposure: "domain",
    handler: updateMetricTool,
  }),
  defineTool("log_metric_entry", {
    domain: "metrics",
    summary: "Record one dated measurement for a metric.",
    useWhen: "Use when the metric, value, and observation date are known.",
    avoidWhen: "Do not use update_metric for measurement history.",
    returns: "The created or replayed entry plus refreshed metric detail.",
    effects: keyedWrite,
    exposure: "domain",
    handler: logMetricEntryTool,
  }),
  defineTool("update_metric_entry", {
    domain: "metrics",
    summary: "Correct one existing metric measurement.",
    useWhen: "Use when the user explicitly changes a logged value or date.",
    avoidWhen: "Use log_metric_entry for a new observation.",
    returns: "The corrected entry plus refreshed metric detail.",
    effects: safeWrite,
    exposure: "domain",
    handler: updateMetricEntryTool,
  }),
  defineTool("get_finance_overview", {
    domain: "finances",
    summary: "Orient on accounts, imported history, coverage gaps, and carrying cost.",
    useWhen:
      "Start here for any money question. Use before cash flow, spending, or search so you know the coverage gap and which accounts exist.",
    avoidWhen:
      "Do not use it for a dated series or a named transaction; those are the other finance tools. Do not treat ledgerBalanceCents as the current balance when mismatchCents is nonzero.",
    returns:
      "Accounts with statement-anchored balances (plus ledger sum and mismatch), the imported date range, unclassified count, coverage (late starts, holes, mismatches), category vocabulary, and headline interest/fees.",
    effects: read,
    exposure: "domain",
    handler: getFinanceOverviewTool,
  }),
  defineTool("get_cash_flow", {
    domain: "finances",
    summary: "Total inflows, outflows, net movement, and statement reconciliation.",
    useWhen:
      "Use to inspect all recorded money movement, including gifts and Savings purchases. Use spending breakdown for cost of living.",
    avoidWhen:
      "Transfers inside the account pool are excluded. Net movement includes external transfers; externalTransferCents is an informational subset, not another amount to add to net. Compare netCents to statementNetCents; residualCents is the unexplained difference. Read coverage before treating history as complete.",
    returns:
      "Per-bucket income/spend/fixed/variable/net, signed external transfers, trailing averages, statement-anchored position and net, the residual the identity leaves unexplained, window totals and historical income details.",
    effects: read,
    exposure: "domain",
    examples: [{ title: "Last two years", arguments: { window: "24m" } }],
    handler: getCashFlowTool,
  }),
  defineTool("get_spending_breakdown", {
    domain: "finances",
    summary: "Envelope spending ranked by stable category, group or payee IDs.",
    useWhen: "Use after get_finance_overview when asking where the money went.",
    avoidWhen:
      "Category totals skip statement holes and unitemized unpaired payments. Read get_finance_overview coverage before treating an all-time chart as complete.",
    returns:
      "Ranked { id, name, groupId, parentGroupId, cents, share, count }, total spend, otherCents, and optional monthly spending vs actual regular income. Cost of living is the default; Savings and all spending are explicit scopes.",
    effects: read,
    exposure: "domain",
    examples: [
      {
        title: "Top merchants last year",
        arguments: { window: "12m", by: "merchant" },
      },
    ],
    handler: getSpendingBreakdownTool,
  }),
  defineTool("list_recurring_bills", {
    domain: "finances",
    summary: "Detected and declared recurring commitments, annualized.",
    useWhen:
      "Use to find the actual levers — subscriptions and bills whose annual cost is a decision.",
    avoidWhen:
      "Use get_spending_breakdown for envelope and group spending, get_cash_flow for total movement, and search_transactions for a named charge.",
    returns:
      "Recurring merchants with typical/low/high/annual cents, declared vs detected, the annual total, and upcoming due dates.",
    effects: read,
    exposure: "domain",
    handler: listRecurringBillsTool,
  }),
  defineTool("get_debt_summary", {
    domain: "finances",
    summary:
      "Asset vs debt trajectory, account contributions, and statement carrying cost.",
    useWhen:
      "Use to test whether cards are actually being paid down and what interest and fees cost.",
    avoidWhen: "Do not use it for spending categories or named transactions.",
    returns:
      "Per-bucket asset/debt/net, the latest snapshot and ratio, per-account contributions, and interest/fees/APR from statements.",
    effects: read,
    exposure: "domain",
    handler: getDebtSummaryTool,
  }),
  defineTool("list_statements", {
    domain: "finances",
    summary: "Official statement snapshots with the register check for each period.",
    useWhen:
      "Use to compare a bank's opening/closing to imported rows, or to see which cycles are missing.",
    avoidWhen:
      "Do not use it for current spend totals. Use get_finance_overview for the headline balance and search_transactions for named rows.",
    returns:
      "A page of period rows (open/close, activity, registerDeltaCents, holeAfter) plus the hole list and pageInfo.",
    effects: read,
    exposure: "domain",
    handler: listStatementsTool,
  }),
  defineTool("search_transactions", {
    domain: "finances",
    summary:
      "Find compact transaction rows and the income/spend/net of the whole match set.",
    useWhen:
      "Use to test a hypothesis about named rows — family gifts, a merchant, a category — after the aggregate tools frame the question.",
    avoidWhen:
      "Do not page through the whole register. Use get_cash_flow or get_spending_breakdown for totals.",
    returns:
      "A compact page of rows plus matchedIncomeCents, matchedSpendCents, and matchedNetCents over every match, not just the page.",
    effects: read,
    exposure: "domain",
    examples: [
      {
        title: "Family gifts",
        arguments: { query: "gift", direction: "income" },
      },
    ],
    handler: searchTransactionsTool,
  }),
  defineTool("list_commitments", {
    domain: "finances",
    summary: "List declared bills, with next due and annual cost.",
    useWhen:
      "Use to see what is already spoken for before creating or updating a commitment.",
    avoidWhen:
      "Do not use it to detect undeclared merchants — that is list_commitment_candidates.",
    returns: "Declared bills with next due and annual cost.",
    effects: read,
    exposure: "legacy",
    replacedBy: "search_commitments",
    handler: listCommitmentsTool,
  }),
  defineTool("list_commitment_candidates", {
    domain: "finances",
    summary: "Detected recurring merchants not yet claimed by a commitment.",
    useWhen:
      "Use after the user pastes a list of subscriptions, to see what is still unclaimed.",
    avoidWhen: "Do not use it to list declared commitments; that is list_commitments.",
    returns: "Unclaimed merchant strings, sorted.",
    effects: read,
    exposure: "legacy",
    replacedBy: "find_commitment_candidates",
    handler: listCommitmentCandidatesTool,
  }),
  defineTool("upsert_subscription", {
    domain: "finances",
    summary: "Create or correct a subscription or bill.",
    useWhen:
      "Use to declare a bill, rename its matchers, set the amount, or mark it paused, cancelled, or dismissed.",
    avoidWhen:
      "Prefer save_subscription, which uses stable payee ids instead of matcher strings.",
    returns: "The saved bill's name, matchers, and status.",
    effects: safeWrite,
    exposure: "legacy",
    replacedBy: "save_subscription",
    handler: upsertSubscriptionTool,
  }),
  defineTool("list_payees", {
    domain: "finances",
    summary: "Search stable payees and see their aliases and commitment claim.",
    useWhen:
      "Use before assigning payees to a commitment or resolving a merchant name.",
    avoidWhen: "Do not use statement spellings as commitment identity.",
    returns: "A compact page of id-bearing payees, aliases, claim, and pageInfo.",
    effects: read,
    exposure: "domain",
    handler: listPayeesTool,
  }),
  defineTool("search_commitments", {
    domain: "finances",
    summary: "Search declared bills by name or stable payee.",
    useWhen: "Use to resolve a commitment id before editing its payees.",
    avoidWhen: "Use find_commitment_candidates for undeclared recurring charges.",
    returns: "A compact page of id-bearing commitments and their payees.",
    effects: read,
    exposure: "domain",
    handler: searchCommitmentsTool,
  }),
  defineTool("find_commitment_candidates", {
    domain: "finances",
    summary: "Find unclaimed recurring payees that may be bills.",
    useWhen: "Use to propose commitments from transaction history.",
    avoidWhen: "Do not use it to list commitments already declared.",
    returns:
      "A page of stable payee ids, suggested tier, typical amount, and charge count.",
    effects: read,
    exposure: "domain",
    handler: findCommitmentCandidatesTool,
  }),
  defineTool("save_subscription", {
    domain: "finances",
    summary: "Create or correct a bill using stable payee ids.",
    useWhen: "Use for subscriptions and bills that charge unless cancelled.",
    avoidWhen:
      "Do not pass matcher strings — resolve payee ids first with list_payees.",
    returns: "The saved bill id, name, payees, and status.",
    effects: safeWrite,
    exposure: "domain",
    handler: saveSubscriptionTool,
  }),
  defineTool("set_commitment_payees", {
    domain: "finances",
    summary: "Replace a commitment's complete stable-payee set.",
    useWhen: "Use after resolving both the commitment id and all intended payee ids.",
    avoidWhen:
      "Do not pass merchant strings or omit existing payees you intend to keep.",
    returns: "The updated id-bearing commitment and its complete payee set.",
    effects: safeWrite,
    exposure: "domain",
    handler: setCommitmentPayeesTool,
  }),
  defineTool("list_jobs", {
    domain: "history",
    summary: "Find jobs with compact employer, title, dates, and location.",
    useWhen:
      "Use to resolve an employer or scan employment history before reading or changing it.",
    avoidWhen: "Use get_job for duties, pay, supervisor, or notes.",
    returns: "A compact job page plus total and next offset.",
    effects: read,
    exposure: "domain",
    examples: [{ title: "Current job", arguments: { currentOnly: true } }],
    handler: listJobsTool,
  }),
  defineTool("get_job", {
    domain: "history",
    summary: "Read one job and its full employment form.",
    useWhen: "Use after list_jobs resolves the intended job.",
    avoidWhen: "Do not use to scan the whole catalog.",
    returns: "Full job detail including address, pay, supervisor, and notes.",
    effects: read,
    exposure: "domain",
    handler: getJobTool,
  }),
  defineTool("create_job", {
    domain: "history",
    summary: "Create one employment record.",
    useWhen:
      "Use when the employer or role is known, or a résumé row is being imported.",
    avoidWhen: "Do not create a second job for a natural-key retry.",
    returns: "Full created or replayed job and whether this call created it.",
    effects: keyedWrite,
    exposure: "domain",
    handler: createJobTool,
  }),
  defineTool("update_job", {
    domain: "history",
    summary: "Apply a strict partial update to one job.",
    useWhen: "Use after resolving the job id.",
    avoidWhen: "Do not guess an id or use it to create work.",
    returns: "The full job after the update.",
    effects: safeWrite,
    exposure: "domain",
    handler: updateJobTool,
  }),
  defineTool("list_residences", {
    domain: "history",
    summary: "Find residences with compact address and move-in/out dates.",
    useWhen:
      "Use to resolve a place lived or scan housing history before reading or changing it.",
    avoidWhen: "Use get_residence for landlord, rent, or notes.",
    returns: "A compact residence page plus total and next offset.",
    effects: read,
    exposure: "domain",
    handler: listResidencesTool,
  }),
  defineTool("get_residence", {
    domain: "history",
    summary: "Read one residence and its full housing form.",
    useWhen: "Use after list_residences resolves the intended place.",
    avoidWhen: "Do not use to scan the whole catalog.",
    returns: "Full residence detail including address, rent, landlord, and notes.",
    effects: read,
    exposure: "domain",
    handler: getResidenceTool,
  }),
  defineTool("create_residence", {
    domain: "history",
    summary: "Create one housing record.",
    useWhen: "Use when the place or move-in date is known.",
    avoidWhen: "Do not create a second residence for a natural-key retry.",
    returns: "Full created or replayed residence and whether this call created it.",
    effects: keyedWrite,
    exposure: "domain",
    handler: createResidenceTool,
  }),
  defineTool("update_residence", {
    domain: "history",
    summary: "Apply a strict partial update to one residence.",
    useWhen: "Use after resolving the residence id.",
    avoidWhen: "Do not guess an id or use it to create work.",
    returns: "The full residence after the update.",
    effects: safeWrite,
    exposure: "domain",
    handler: updateResidenceTool,
  }),
  defineTool("list_life_events", {
    domain: "history",
    summary: "Find typed Timeline events by title, category, or date window.",
    useWhen: "Use to resolve a dated life fact before reading or changing it.",
    avoidWhen:
      "Do not use it for jobs or residences — those have their own tools. Derived Work/Home rows are not events.",
    returns: "A compact event page plus total and next offset.",
    effects: read,
    exposure: "domain",
    handler: listLifeEventsTool,
  }),
  defineTool("get_life_event", {
    domain: "history",
    summary: "Read one typed Timeline event including notes.",
    useWhen: "Use after list_life_events resolves the intended event.",
    avoidWhen: "Do not use to scan the whole catalog.",
    returns: "One complete life event.",
    effects: read,
    exposure: "domain",
    handler: getLifeEventTool,
  }),
  defineTool("create_life_event", {
    domain: "history",
    summary: "Create one dated life fact on the Timeline.",
    useWhen: "Use for a one-off historical date that is not a job start/end or a move.",
    avoidWhen:
      "Do not create a job or residence as an event. Do not create a second event for a natural-key retry.",
    returns: "Full created or replayed event and whether this call created it.",
    effects: keyedWrite,
    exposure: "domain",
    handler: createLifeEventTool,
  }),
  defineTool("update_life_event", {
    domain: "history",
    summary: "Apply a strict partial update to one typed Timeline event.",
    useWhen: "Use after resolving the event id.",
    avoidWhen: "Do not use it to edit a derived Work or Home chronology row.",
    returns: "The full event after the update.",
    effects: safeWrite,
    exposure: "domain",
    handler: updateLifeEventTool,
  }),
];

export const TOOL_REGISTRY = new Map(definitions.map((tool) => [tool.name, tool]));
export const AGENT_TOOLS = definitions.map(
  (tool) => tool.name,
) as readonly AgentToolName[];

if (TOOL_REGISTRY.size !== definitions.length) {
  throw new Error("Agent tool registry contains a duplicate name.");
}

export function isAgentTool(name: string): name is AgentToolName {
  return TOOL_REGISTRY.has(name as AgentToolName);
}

export function publicToolDefinition(tool: AgentToolDefinition) {
  return {
    name: tool.name,
    domain: tool.domain,
    summary: tool.summary,
    effects: tool.effects,
    exposure: tool.exposure,
    ...(tool.replacedBy ? { replacedBy: tool.replacedBy } : {}),
  };
}

const fieldDescriptions: Record<string, string> = {
  id: "Planner UUID returned by a prior search, read, or create call.",
  name: "Human-readable name or title.",
  domain: "Focused tool domain to discover; core is the default active surface.",
  includeLegacy: "Include compatibility aliases that new callers should normally omit.",
  type: "Outline item type.",
  state: "Lifecycle state; Result Areas have no state.",
  parentId: "Parent Planner UUID, or null for the outline root.",
  nodeId: "Outline item UUID returned by search_nodes or get_node.",
  planId: "Weekly-plan UUID returned by ensure_weekly_plan or load_weekly_plan.",
  metricId: "Metric UUID returned by list_metrics, get_metric, or create_metric.",
  query: "Case-insensitive text to match.",
  offset: "Zero-based offset for this result page.",
  limit: "Maximum rows to return in this page.",
  entryOffset: "Zero-based offset into the metric's entry history.",
  entryLimit: "Maximum metric entries to return.",
  externalSource: "Stable namespace for an external natural key; pair with externalId.",
  externalId:
    "Opaque id within externalSource; pair with externalSource for safe retries.",
  entries: "Ordered cohesive batch; the whole batch succeeds or rolls back.",
  weekStart: "Any ISO date in the desired week; Planner normalizes it to week start.",
  weekStartsOn: "Weekday index, 0 for Sunday through 6 for Saturday.",
  window:
    "Insights window: 3m, 6m, 12m, 24m, ytd, qtd, or all. Default 12m. Ignored when from/to are set.",
  from: "Inclusive start date YYYY-MM-DD.",
  to: "Inclusive end date YYYY-MM-DD.",
  axis: "Bucket axis: month or pay-period. pay_period is accepted as an alias.",
  levelRecurring:
    "Spread recurring bills across the periods they cover instead of landing them whole.",
  accountIds: "Restrict analysis to these account UUIDs. Empty means all.",
  categories: "Restrict analysis to these effective categories. Empty means all.",
  merchants: "Restrict analysis to these effective merchants. Empty means all.",
  by: "Rank spend by category or merchant.",
  trend: "When true, also return per-bucket spend for the top categories.",
  includeUpcoming: "When true, include the next expected date for each declared bill.",
  matchers:
    "Bank merchant strings this commitment covers, as effectiveMerchant produces them.",
  cadenceMonths: "How often the bill charges, in months. 1 monthly, 12 yearly.",
  expectedCents: "Stated amount in integer cents. Null means derive from history.",
  anchorDate:
    "YYYY-MM-DD next charge. Must be after the last posted charge when the bill has history; null clears the override and walks from that last charge.",
  status: "active, paused, or cancelled.",
  url: "Where the bill is managed — account, billing or cancel page. Stored, never followed.",
  scheduled: "Whether the dates are predictable. False for propane.",
  dueDay: "Day of the period the charge is expected, 1-31.",
  employer: "Employer or company name.",
  jobTitle: "Role or title held at that employer.",
  employmentType:
    "Open vocabulary such as Full-time, Contract, or Internship — not a closed list.",
  startDate: "First day at the job, YYYY-MM-DD. Null while unknown.",
  endDate: "Last day at the job, YYYY-MM-DD. Null means this is the current job.",
  currentOnly: "When true, only rows with no end / move-out date.",
  movedIn: "First day at the residence, YYYY-MM-DD. Null while unknown.",
  movedOut: "Last day at the residence, YYYY-MM-DD. Null means you still live there.",
  eventDate: "The calendar day this life fact happened, YYYY-MM-DD.",
  housingType: "Open vocabulary such as Rented, Owned, or Dorm — not a closed list.",
  payPeriod: "Open vocabulary such as Hourly, Monthly, or Annual — not a closed list.",
  location: "Employer city and country, formatted as one line.",
  address: "Full postal address on one line.",
  label: "Optional nickname for a residence, such as The Seoul apartment.",
  direction: "Keep income rows, spend rows (including refunds), or any flow.",
  minCents:
    "Inclusive minimum of abs(amountCents). Values are integer cents (100 = $1.00).",
  maxCents:
    "Inclusive maximum of abs(amountCents). Values are integer cents (100 = $1.00).",
  accountId: "Finance account UUID returned by get_finance_overview.",
  flow: "Effective flow kind: spend, income, internal_transfer, external_transfer, refund, interest_fee.",
  balanceCents:
    "Headline current balance in integer cents (100 = $1.00). Latest statement closing plus later txs when a snapshot exists; otherwise the ledger sum. Signed; positive is money into the account.",
  ledgerBalanceCents:
    "Sum of every imported transaction on the account, in integer cents. Diagnostic; can disagree with the official close.",
  mismatchCents:
    "ledgerBalanceCents minus the headline. Zero when the account has no statement.",
  statementClosingCents:
    "Official closing balance of the newest statement, in integer cents.",
  statementPeriodEnd: "Closing date of the newest statement (YYYY-MM-DD).",
  incomeCents: "Integer cents of money arriving.",
  spendCents: "Integer cents of reported spend, as a positive cost.",
  netCents:
    "Integer cents. incomeCents minus spendCents; the only figure that may be negative.",
};

function humanizeField(name: string): string {
  const words = name.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();
  return fieldDescriptions[name] ?? `Value for the ${words} field.`;
}

type JsonSchemaNode = {
  properties?: Record<string, JsonSchemaNode>;
  description?: string;
  anyOf?: JsonSchemaNode[];
  allOf?: JsonSchemaNode[];
  oneOf?: JsonSchemaNode[];
  items?: JsonSchemaNode;
  $defs?: Record<string, JsonSchemaNode>;
  [key: string]: unknown;
};

function describeSchemaFields(node: JsonSchemaNode): JsonSchemaNode {
  for (const [name, property] of Object.entries(node.properties ?? {})) {
    property.description ??= humanizeField(name);
    describeSchemaFields(property);
  }
  for (const branch of [
    ...(node.anyOf ?? []),
    ...(node.allOf ?? []),
    ...(node.oneOf ?? []),
  ]) {
    describeSchemaFields(branch);
  }
  if (node.items) describeSchemaFields(node.items);
  for (const definition of Object.values(node.$defs ?? {})) {
    describeSchemaFields(definition);
  }
  return node;
}

export function agentJsonSchema(schema: ZodType, describeFields = false) {
  const json = z.toJSONSchema(schema, {
    target: "draft-2020-12",
  }) as JsonSchemaNode;
  return describeFields ? describeSchemaFields(json) : json;
}

function healthTool() {
  return {
    status: "ok" as const,
    tools: AGENT_TOOLS,
    contractVersion: AGENT_CONTRACT_VERSION,
    discovery: {
      listTools: "list_tools" as const,
      describeTool: "describe_tool" as const,
    },
  };
}

function listTools(_userId: string, args: Record<string, unknown>) {
  const domain = args.domain as
    | "core"
    | "outline"
    | "notes"
    | "schedule"
    | "planning"
    | "metrics"
    | "finances"
    | "history"
    | "all";
  const includeLegacy = args.includeLegacy === true;
  return {
    tools: definitions
      .filter((tool) => includeLegacy || tool.exposure !== "legacy")
      .filter((tool) => {
        if (domain === "all") return true;
        if (domain === "core") return tool.exposure === "core";
        return tool.domain === domain;
      })
      .map(publicToolDefinition),
  };
}

function describeTool(_userId: string, args: Record<string, unknown>) {
  const name = args.name as string;
  const tool = TOOL_REGISTRY.get(name as AgentToolName);
  if (!tool) throw new AgentError("not_found", `Unknown tool: ${name}`);
  return {
    tool: {
      ...publicToolDefinition(tool),
      description: {
        what: tool.summary,
        useWhen: tool.useWhen,
        avoidWhen: tool.avoidWhen,
        returns: tool.returns,
      },
      inputSchema: agentJsonSchema(tool.inputSchema, true),
      outputSchema: agentJsonSchema(tool.outputSchema),
      examples: tool.examples,
    },
  };
}

function validationMessage(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "Request body does not match the tool schema";
  const path = issue.path.length > 0 ? issue.path.join(".") : "request body";
  if (issue.code === "unrecognized_keys") {
    const field = issue.keys[0] ?? "unknown";
    const prefix = issue.path.length > 0 ? `${issue.path.join(".")}.` : "";
    return `Unknown field ${prefix}${field}. Remove it or call describe_tool for the schema.`;
  }
  return `${path}: ${issue.message}`;
}

/** Resolve the account the Bearer key maps to (no browser session). */
export async function resolveAgentUserId(): Promise<string> {
  return getAgentUserId();
}

export async function dispatchAgentTool(
  toolName: string,
  body: unknown,
  userId?: string,
): Promise<unknown> {
  try {
    const tool = TOOL_REGISTRY.get(toolName as AgentToolName);
    if (!tool) throw new AgentError("not_found", `Unknown tool: ${toolName}`);
    const args = asObject(body);
    if (
      [
        "create_node",
        "create_note",
        "create_metric",
        "log_metric_entry",
        "create_job",
        "create_residence",
        "create_life_event",
      ].includes(toolName) &&
      "externalSource" in args !== "externalId" in args
    ) {
      throw new AgentError(
        "validation",
        "externalSource and externalId must be provided together",
      );
    }
    const parsed = tool.inputSchema.safeParse(args);
    if (!parsed.success) {
      throw new AgentError("validation", validationMessage(parsed.error));
    }
    const uid =
      userId ??
      (tool.domain === "system" ? SYSTEM_TOOL_USER_ID : await resolveAgentUserId());
    const result = await tool.handler(uid, parsed.data as Record<string, unknown>);
    const output = tool.outputSchema.safeParse(result);
    if (!output.success) {
      console.error(
        `Agent tool ${toolName} returned an invalid contract payload`,
        output.error,
      );
      throw new AgentError("internal", "Tool returned an invalid response");
    }
    return result;
  } catch (error) {
    throw toAgentError(error);
  }
}
