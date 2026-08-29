/** Immutable, explanatory evidence for a finance mutation. Not an operational ledger. */
export type FinanceAuditKind =
  | "bank_snapshot"
  | "simplefin_sync"
  | "finance_import"
  | "transaction_change"
  | "transaction_delete"
  | "transaction_split"
  | "transaction_classification"
  | "account_membership"
  | "account_delete"
  | "statement_change"
  | "budget_assignment"
  | "budget_transfer"
  | "budget_carryover"
  | "budget_bulk_funding"
  | "budget_delete"
  | "legacy_budget_movement";

export type FinanceAuditScope = {
  accountIds?: string[];
  accountNames?: string[];
  budgetMonths?: string[];
  envelopeIds?: string[];
};

export type FinanceAccountMoneyCheckpoint = {
  accountId: string;
  accountName: string;
  postedCents: number;
  selectedPendingCents: number;
  workingCents: number;
  ledgerCents: number;
  reconciliationCents: number;
};

export type FinanceEnvelopeMoneyCheckpoint = {
  envelopeId: string;
  envelopeName: string;
  assignedCents: number;
  activityCents: number;
  availableCents: number;
};

export type FinanceBudgetMoneyCheckpoint = {
  month: string;
  readyToAssignCents: number;
  accountPoolCents: number;
  accountReconciliationCents: number;
  uncategorizedCount: number;
  uncategorizedActivityCents: number;
  envelopes: FinanceEnvelopeMoneyCheckpoint[];
};

export type FinanceMoneyCheckpoint = {
  accounts: FinanceAccountMoneyCheckpoint[];
  selectedPendingCents: number;
  accountPoolCents: number;
  budgets: FinanceBudgetMoneyCheckpoint[];
};

export type FinanceAuditChange = {
  entityType: string;
  entityIdentity: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
};

export type FinanceAuditEvent = {
  id: string;
  batchId: string;
  kind: FinanceAuditKind;
  origin: string;
  occurredAt: Date;
  summary: string;
  scope: FinanceAuditScope;
  warnings: string[];
  sourceEvidence: Record<string, unknown>;
  beforeCheckpoint: FinanceMoneyCheckpoint | null;
  afterCheckpoint: FinanceMoneyCheckpoint | null;
  changes: FinanceAuditChange[];
};

export type FinanceAuditEventSummary = Pick<
  FinanceAuditEvent,
  "id" | "batchId" | "kind" | "origin" | "occurredAt" | "summary" | "scope" | "warnings"
> & {
  changeCount: number;
  /** Current account-pool movement across the event, when checkpoints exist. */
  headlineImpactCents: number | null;
};
