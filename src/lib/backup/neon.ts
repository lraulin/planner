const NEON_API = "https://console.neon.tech/api/v2";
const DAY_MS = 24 * 60 * 60 * 1_000;
const HISTORY_SECONDS = 7 * 24 * 60 * 60;
const SNAPSHOT_RETENTION_DAYS = 90;

export interface NeonRecoveryConfig {
  apiKey: string;
  projectId: string;
  branchId: string;
}

export interface NeonRecoveryStatus {
  historyRetentionSeconds: number;
  weeklySnapshots: number;
  newestWeeklySnapshotAt: string | null;
}

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
