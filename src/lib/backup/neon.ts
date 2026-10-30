const NEON_API = "https://console.neon.tech/api/v2";
const DAY_MS = 24 * 60 * 60 * 1_000;
const HISTORY_SECONDS = 7 * 24 * 60 * 60;
const SNAPSHOT_RETENTION_DAYS = 90;

export type NeonRecoveryConfig = {
  apiKey: string;
  projectId: string;
  branchId: string;
};

export type NeonRecoveryStatus = {
  historyRetentionSeconds: number;
  weeklySnapshots: number;
  newestWeeklySnapshotAt: string | null;
};

export async function configureNeonRecovery(
  apiKey: string,
): Promise<NeonRecoveryConfig> {
  const organizationList = await neonRequest(apiKey, "/users/me/organizations");
  const projectLists = await Promise.all(
    organizationProjectResources(organizationList).map((resource) =>
      neonRequest(apiKey, resource),
    ),
  );
  const projects = projectLists
    .flatMap((projectList) => recordArray(projectList, "projects"))
    .filter((project) => project.name === "planner");
  if (projects.length !== 1) {
    throw new Error(
      `Expected one Neon project named planner; found ${projects.length}.`,
    );
  }
  const projectId = stringProperty(projects[0], "id");

  const branchList = await neonRequest(
    apiKey,
    `/projects/${encodeURIComponent(projectId)}/branches`,
  );
  const branches = recordArray(branchList, "branches");
  const branch =
    branches.find((candidate) => candidate.default === true) ??
    branches.find((candidate) => candidate.name === "main" && !candidate.parent_id);
  if (!branch) throw new Error("Could not identify the default root branch in Neon.");
  const branchId = stringProperty(branch, "id");

  await neonRequest(apiKey, `/projects/${encodeURIComponent(projectId)}`, {
    method: "PATCH",
    body: JSON.stringify({ project: { history_retention_seconds: HISTORY_SECONDS } }),
  });
  return { apiKey, projectId, branchId };
}

export function organizationProjectResources(
  organizationList: Record<string, unknown>,
): string[] {
  return recordArray(organizationList, "organizations").map((organization) => {
    const query = new URLSearchParams({
      org_id: stringProperty(organization, "id"),
      search: "planner",
      limit: "100",
    });
    return `/projects?${query.toString()}`;
  });
}

/**
 * Neon limits built-in backup-schedule retention to 35 days. A manual snapshot may carry a
 * longer expires_at, so the Mac's six-hour job creates one idempotent 90-day generation for
 * the most recent Sunday instead of pretending the provider schedule can meet the contract.
 */
export async function ensureWeeklyNeonSnapshot(
  config: NeonRecoveryConfig,
  now = new Date(),
): Promise<"created" | "existing"> {
  const name = weeklySnapshotName(now);
  const snapshots = await listSnapshots(config);
  if (
    snapshots.some(
      (snapshot) =>
        snapshot.name === name && snapshot.source_branch_id === config.branchId,
    )
  ) {
    return "existing";
  }

  const expiresAt = new Date(
    now.getTime() + SNAPSHOT_RETENTION_DAYS * DAY_MS,
  ).toISOString();
  const query = new URLSearchParams({ name, expires_at: expiresAt });
  await neonRequest(
    config.apiKey,
    `/projects/${encodeURIComponent(config.projectId)}/branches/${encodeURIComponent(config.branchId)}/snapshot?${query.toString()}`,
    { method: "POST" },
  );
  return "created";
}

export async function neonRecoveryStatus(
  config: NeonRecoveryConfig,
): Promise<NeonRecoveryStatus> {
  const [projectResponse, snapshots] = await Promise.all([
    neonRequest(config.apiKey, `/projects/${encodeURIComponent(config.projectId)}`),
    listSnapshots(config),
  ]);
  const project = recordProperty(projectResponse, "project");
  const weekly = snapshots
    .filter(
      (snapshot) =>
        typeof snapshot.name === "string" &&
        snapshot.name.startsWith("planner-weekly-") &&
        snapshot.source_branch_id === config.branchId,
    )
    .sort((left, right) =>
      String(right.created_at ?? "").localeCompare(String(left.created_at ?? "")),
    );
  return {
    historyRetentionSeconds: numberProperty(project, "history_retention_seconds"),
    weeklySnapshots: weekly.length,
    newestWeeklySnapshotAt:
      typeof weekly[0]?.created_at === "string" ? weekly[0].created_at : null,
  };
}

export function weeklySnapshotName(now: Date): string {
  const sunday = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  sunday.setUTCDate(sunday.getUTCDate() - sunday.getUTCDay());
  return `planner-weekly-${sunday.toISOString().slice(0, 10)}`;
}

/**
 * A throwaway copy of production for agents' dry runs (`docs/production-access.md`). Every
 * agent branch carries this prefix, which is how a later run finds and deletes one an
 * interrupted run left behind.
 */
export const AGENT_BRANCH_PREFIX = "agent-dry-run-";
const AGENT_BRANCH_MAX_AGE_MS = 60 * 60 * 1_000;
const OPERATION_TIMEOUT_MS = 180_000;

export type AgentBranch = {
  branchId: string;
  name: string;
  /** Connects as the database owner with a password reset on this branch alone. */
  databaseUrl: string;
};

/** Where to connect on a fresh branch: its read-write host, its one database, that database's owner. */
export function branchConnectionTarget(response: Record<string, unknown>): {
  branchId: string;
  host: string;
  database: string;
  role: string;
} {
  const branchId = stringProperty(recordProperty(response, "branch"), "id");
  const endpoint = recordArray(response, "endpoints").find(
    (candidate) => candidate.type === "read_write",
  );
  if (!endpoint)
    throw new Error("Neon created the branch without a read-write endpoint.");
  const databases = recordArray(response, "databases");
  if (databases.length !== 1) {
    throw new Error(`Expected one database on the branch; found ${databases.length}.`);
  }
  return {
    branchId,
    host: stringProperty(endpoint, "host"),
    database: stringProperty(databases[0], "name"),
    role: stringProperty(databases[0], "owner_name"),
  };
}

export function branchDatabaseUrl(
  target: { host: string; database: string; role: string },
  password: string,
): string {
  return `postgresql://${encodeURIComponent(target.role)}:${encodeURIComponent(password)}@${target.host}/${encodeURIComponent(target.database)}?sslmode=verify-full`;
}

/** Agent branches older than an hour: an interrupted run's leftovers, never a live one. */
export function staleAgentBranchIds(
  branches: readonly Record<string, unknown>[],
  now: Date,
): string[] {
  return branches
    .filter((branch) => {
      const name = branch.name;
      const createdAt = branch.created_at;
      return (
        typeof name === "string" &&
        name.startsWith(AGENT_BRANCH_PREFIX) &&
        typeof createdAt === "string" &&
        now.getTime() - Date.parse(createdAt) > AGENT_BRANCH_MAX_AGE_MS
      );
    })
    .map((branch) => stringProperty(branch, "id"));
}

/** `finished` and `skipped` are done; these end without success. */
const FAILED_OPERATION = new Set(["failed", "error", "cancelled"]);
const DONE_OPERATION = new Set(["finished", "skipped"]);

/**
 * Branch production as it is now, give the owner role a password of its own on the branch, and
 * return a URL for it. The reset is the point: a branch's roles start with production's
 * passwords, so without it the URL handed to a dry run would also open production.
 */
export async function createAgentBranch(
  config: NeonRecoveryConfig,
  now = new Date(),
): Promise<AgentBranch> {
  const project = `/projects/${encodeURIComponent(config.projectId)}`;
  const name = `${AGENT_BRANCH_PREFIX}${now.toISOString().replace(/[:.]/gu, "-")}`;
  const created = await neonRequest(config.apiKey, `${project}/branches`, {
    method: "POST",
    body: JSON.stringify({
      branch: { parent_id: config.branchId, name },
      endpoints: [{ type: "read_write" }],
    }),
  });
  const target = branchConnectionTarget(created);
  try {
    await waitForOperations(config, created);
    const reset = await neonRequest(
      config.apiKey,
      `${project}/branches/${encodeURIComponent(target.branchId)}/roles/${encodeURIComponent(target.role)}/reset_password`,
      { method: "POST" },
    );
    const password = stringProperty(recordProperty(reset, "role"), "password");
    await waitForOperations(config, reset);
    return {
      branchId: target.branchId,
      name,
      databaseUrl: branchDatabaseUrl(target, password),
    };
  } catch (error) {
    await deleteAgentBranch(config, target.branchId).catch(() => undefined);
    throw error;
  }
}

export async function deleteAgentBranch(
  config: NeonRecoveryConfig,
  branchId: string,
): Promise<void> {
  if (branchId === config.branchId)
    throw new Error("Refusing to delete the production branch.");
  await neonRequest(
    config.apiKey,
    `/projects/${encodeURIComponent(config.projectId)}/branches/${encodeURIComponent(branchId)}`,
    { method: "DELETE" },
  );
}

/** Delete agent branches an interrupted run left behind; returns how many. */
export async function sweepStaleAgentBranches(
  config: NeonRecoveryConfig,
  now = new Date(),
): Promise<number> {
  const list = await neonRequest(
    config.apiKey,
    `/projects/${encodeURIComponent(config.projectId)}/branches`,
  );
  const stale = staleAgentBranchIds(recordArray(list, "branches"), now);
  for (const branchId of stale) await deleteAgentBranch(config, branchId);
  return stale.length;
}

/**
 * A named recovery point on production taken right before a deliberate write, kept 30 days —
 * the restore target if an apply goes wrong, on top of the seven-day history window.
 */
export async function createPreApplySnapshot(
  config: NeonRecoveryConfig,
  now = new Date(),
): Promise<string> {
  const name = `pre-apply-${now.toISOString().replace(/[:.]/gu, "-")}`;
  const expiresAt = new Date(now.getTime() + 30 * DAY_MS).toISOString();
  const query = new URLSearchParams({ name, expires_at: expiresAt });
  const response = await neonRequest(
    config.apiKey,
    `/projects/${encodeURIComponent(config.projectId)}/branches/${encodeURIComponent(config.branchId)}/snapshot?${query.toString()}`,
    { method: "POST" },
  );
  await waitForOperations(config, response);
  return name;
}

async function waitForOperations(
  config: NeonRecoveryConfig,
  response: Record<string, unknown>,
): Promise<void> {
  const pending = Array.isArray(response.operations)
    ? response.operations
        .filter(isRecord)
        .map((operation) => stringProperty(operation, "id"))
    : [];
  const deadline = Date.now() + OPERATION_TIMEOUT_MS;
  for (const operationId of pending) {
    for (;;) {
      const { operation } = (await neonRequest(
        config.apiKey,
        `/projects/${encodeURIComponent(config.projectId)}/operations/${encodeURIComponent(operationId)}`,
      )) as { operation?: unknown };
      const status = isRecord(operation) ? operation.status : undefined;
      if (typeof status === "string" && DONE_OPERATION.has(status)) break;
      if (typeof status === "string" && FAILED_OPERATION.has(status)) {
        throw new Error(`Neon operation ${operationId} ended ${status}.`);
      }
      if (Date.now() > deadline)
        throw new Error(`Neon operation ${operationId} timed out.`);
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
  }
}

async function listSnapshots(
  config: NeonRecoveryConfig,
): Promise<Record<string, unknown>[]> {
  const response = await neonRequest(
    config.apiKey,
    `/projects/${encodeURIComponent(config.projectId)}/snapshots`,
  );
  return recordArray(response, "snapshots");
}

async function neonRequest(
  apiKey: string,
  resource: string,
  init: RequestInit = {},
): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await fetch(`${NEON_API}${resource}`, {
      ...init,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
      },
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new Error("Neon recovery API is unavailable.");
  }
  if (!response.ok) {
    throw new Error(`Neon recovery API returned HTTP ${response.status}.`);
  }
  const value = (await response.json()) as unknown;
  if (!isRecord(value))
    throw new Error("Neon recovery API returned an invalid response.");
  return value;
}

function recordArray(
  value: Record<string, unknown>,
  key: string,
): Record<string, unknown>[] {
  const items = value[key];
  if (!Array.isArray(items) || !items.every(isRecord)) {
    throw new Error(`Neon recovery API response is missing ${key}.`);
  }
  return items;
}

function recordProperty(
  value: Record<string, unknown>,
  key: string,
): Record<string, unknown> {
  const item = value[key];
  if (!isRecord(item)) throw new Error(`Neon recovery API response is missing ${key}.`);
  return item;
}

function stringProperty(value: Record<string, unknown>, key: string): string {
  const item = value[key];
  if (typeof item !== "string" || !item) {
    throw new Error(`Neon recovery API response is missing ${key}.`);
  }
  return item;
}

function numberProperty(value: Record<string, unknown>, key: string): number {
  const item = value[key];
  if (typeof item !== "number" || !Number.isFinite(item)) {
    throw new Error(`Neon recovery API response is missing ${key}.`);
  }
  return item;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
