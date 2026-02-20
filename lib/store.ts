import { EventEmitter } from "events";
import { dbQuery, withDbClient } from "@/lib/neon-db";
import { env } from "@/lib/env";
import { makeId, nowIso } from "@/lib/security";
import type {
  BrandResearchFactRecord,
  BrandResearchRunRecord,
  BrandResearchSourceRecord,
  ChatMessageRecord,
  DeploymentArtifactRecord,
  DeploymentEvent,
  DeploymentJob,
  DeploymentRecord,
  DeploymentStatus,
  UsageRecord,
  UserRecord,
  WarmSlot,
  XActionLogRecord,
  XActionStatus,
  XActionType,
  XConnectionRecord,
  XOAuthStateRecord,
  XUserConnectionRecord
} from "@/lib/types";

type CheckoutSession = { deploymentId: string; type: "deploy" | "credits"; amount?: number };

type State = {
  emitter: EventEmitter;
};

declare global {
  // eslint-disable-next-line no-var
  var __simpleClawStoreState: State | undefined;
}

const state: State = globalThis.__simpleClawStoreState ?? {
  emitter: new EventEmitter()
};
globalThis.__simpleClawStoreState = state;

function normalizeEmail(email: string) {
  return email.toLowerCase().trim();
}

function toIso(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }
  return nowIso();
}

function toNullableString(value: unknown): string | null {
  if (typeof value === "string") return value;
  return value == null ? null : String(value);
}

function toNullableIso(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }
  return null;
}

function mapUser(row: Record<string, unknown>): UserRecord {
  return {
    id: String(row.id),
    email: String(row.email),
    name: String(row.name),
    photoURL: toNullableString(row.photo_url),
    currentDeploymentId: toNullableString(row.current_deployment_id),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  };
}

function mapDeployment(row: Record<string, unknown>): DeploymentRecord {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    plan: String(row.plan) as DeploymentRecord["plan"],
    modelProvider: (toNullableString(row.model_provider) as DeploymentRecord["modelProvider"]) ?? null,
    selectedModel: String(row.selected_model) as DeploymentRecord["selectedModel"],
    channel: String(row.channel) as DeploymentRecord["channel"],
    encryptedChannelPrimaryToken: String(row.encrypted_channel_primary_token),
    encryptedChannelSecondaryToken: toNullableString(row.encrypted_channel_secondary_token),
    encryptedModelApiKey: toNullableString(row.encrypted_model_api_key),
    billingInterval: (toNullableString(row.billing_interval) as DeploymentRecord["billingInterval"]) ?? null,
    paymentProvider: (toNullableString(row.payment_provider) as DeploymentRecord["paymentProvider"]) ?? null,
    checkoutSessionId: toNullableString(row.checkout_session_id),
    subscriptionId: toNullableString(row.subscription_id),
    subscriptionStatus: toNullableString(row.subscription_status),
    status: String(row.status) as DeploymentStatus,
    runtimeSlotId: toNullableString(row.runtime_slot_id),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  };
}

function mapDeploymentEvent(row: Record<string, unknown>): DeploymentEvent {
  return {
    id: String(row.id),
    deploymentId: String(row.deployment_id),
    status: String(row.status) as DeploymentStatus,
    message: toNullableString(row.message) ?? undefined,
    createdAt: toIso(row.created_at)
  };
}

function mapWarmSlot(row: Record<string, unknown>): WarmSlot {
  return {
    id: String(row.id),
    state: String(row.state) as WarmSlot["state"],
    assignedDeploymentId: toNullableString(row.assigned_deployment_id),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  };
}

function mapUsage(row: Record<string, unknown>): UsageRecord {
  return {
    deploymentId: String(row.deployment_id),
    limitTotal: Number(row.limit_total ?? 0),
    limitRemaining: Number(row.limit_remaining ?? 0),
    periodStart: toIso(row.period_start),
    periodEnd: toIso(row.period_end),
    updatedAt: toIso(row.updated_at)
  };
}

function mapXConnection(row: Record<string, unknown>): XConnectionRecord {
  return {
    deploymentId: String(row.deployment_id),
    userId: String(row.user_id),
    xUserId: String(row.x_user_id),
    username: String(row.username),
    name: toNullableString(row.name),
    encryptedAccessToken: String(row.encrypted_access_token),
    encryptedRefreshToken: toNullableString(row.encrypted_refresh_token),
    tokenType: String(row.token_type),
    scope: Array.isArray(row.scope) ? row.scope.map((item) => String(item)) : [],
    expiresAt: toNullableIso(row.expires_at),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  };
}

function mapXUserConnection(row: Record<string, unknown>): XUserConnectionRecord {
  return {
    userId: String(row.user_id),
    xUserId: String(row.x_user_id),
    username: String(row.username),
    name: toNullableString(row.name),
    encryptedAccessToken: String(row.encrypted_access_token),
    encryptedRefreshToken: toNullableString(row.encrypted_refresh_token),
    tokenType: String(row.token_type),
    scope: Array.isArray(row.scope) ? row.scope.map((item) => String(item)) : [],
    expiresAt: toNullableIso(row.expires_at),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  };
}

function mapXActionLog(row: Record<string, unknown>): XActionLogRecord {
  return {
    id: String(row.id),
    deploymentId: String(row.deployment_id),
    actionType: String(row.action_type) as XActionType,
    status: String(row.status) as XActionStatus,
    targetTweetId: toNullableString(row.target_tweet_id),
    targetAuthorId: toNullableString(row.target_author_id),
    conversationId: toNullableString(row.conversation_id),
    contentHash: String(row.content_hash),
    content: String(row.content),
    reason: toNullableString(row.reason),
    metadata:
      row.metadata && typeof row.metadata === "object"
        ? (row.metadata as Record<string, unknown>)
        : null,
    createdAt: toIso(row.created_at)
  };
}

function mapChatMessage(row: Record<string, unknown>): ChatMessageRecord {
  return {
    id: String(row.id),
    deploymentId: String(row.deployment_id),
    sessionId: String(row.session_id),
    role: String(row.role) as ChatMessageRecord["role"],
    text: String(row.text),
    createdAt: toIso(row.created_at)
  };
}

function mapDeploymentArtifact(row: Record<string, unknown>): DeploymentArtifactRecord {
  return {
    deploymentId: String(row.deployment_id),
    kind: String(row.kind) as DeploymentArtifactRecord["kind"],
    fileName: String(row.file_name),
    content: String(row.content),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  };
}

function mapBrandResearchRun(row: Record<string, unknown>): BrandResearchRunRecord {
  return {
    id: String(row.id),
    deploymentId: String(row.deployment_id),
    phase: String(row.phase) as BrandResearchRunRecord["phase"],
    status: String(row.status) as BrandResearchRunRecord["status"],
    confidenceOverall: row.confidence_overall == null ? null : Number(row.confidence_overall),
    error: toNullableString(row.error),
    startedAt: toIso(row.started_at),
    completedAt: row.completed_at == null ? null : toIso(row.completed_at),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  };
}

function mapBrandResearchSource(row: Record<string, unknown>): BrandResearchSourceRecord {
  return {
    id: String(row.id),
    runId: String(row.run_id),
    url: String(row.url),
    domain: toNullableString(row.domain),
    sourceType: String(row.source_type) as BrandResearchSourceRecord["sourceType"],
    fetchedAt: row.fetched_at == null ? null : toIso(row.fetched_at),
    title: toNullableString(row.title),
    excerpt: toNullableString(row.excerpt),
    reliabilityScore: row.reliability_score == null ? null : Number(row.reliability_score),
    createdAt: toIso(row.created_at)
  };
}

function mapBrandResearchFact(row: Record<string, unknown>): BrandResearchFactRecord {
  return {
    id: String(row.id),
    runId: String(row.run_id),
    key: String(row.key),
    value: String(row.value),
    confidence: Number(row.confidence ?? 0),
    confidenceLabel: String(row.confidence_label) as BrandResearchFactRecord["confidenceLabel"],
    evidenceSourceIds: Array.isArray(row.evidence_source_ids)
      ? row.evidence_source_ids.map((item) => String(item))
      : [],
    factType: String(row.fact_type) as BrandResearchFactRecord["factType"],
    createdAt: toIso(row.created_at)
  };
}

async function initializeWarmPoolIfEmpty() {
  const countResult = await dbQuery<{ count: number }>(`SELECT COUNT(*)::int AS count FROM warm_slots`);
  const count = countResult.rows[0]?.count ?? 0;
  if (count > 0) return;

  for (let i = 0; i < env.WARM_POOL_SIZE; i += 1) {
    const id = makeId("slot");
    const current = nowIso();
    await dbQuery(
      `INSERT INTO warm_slots (id, state, assigned_deployment_id, created_at, updated_at)
       VALUES ($1, 'warm_available', NULL, $2::timestamptz, $2::timestamptz)
       ON CONFLICT (id) DO NOTHING`,
      [id, current]
    );
  }
}

let warmPoolInitPromise: Promise<void> | null = null;
async function ensureWarmPoolInitialized() {
  if (!warmPoolInitPromise) {
    warmPoolInitPromise = initializeWarmPoolIfEmpty();
  }
  await warmPoolInitPromise;
}

export async function upsertUser(input: Pick<UserRecord, "email" | "name" | "photoURL">): Promise<UserRecord> {
  const email = normalizeEmail(input.email);
  const existing = await getUserByEmail(email);
  const current = nowIso();

  if (existing) {
    const updatedResult = await dbQuery(
      `UPDATE users
       SET email = $2, name = $3, photo_url = $4, updated_at = $5::timestamptz
       WHERE id = $1
       RETURNING *`,
      [existing.id, email, input.name, input.photoURL, current]
    );
    return mapUser(updatedResult.rows[0] as Record<string, unknown>);
  }

  const created: UserRecord = {
    id: makeId("user"),
    email,
    name: input.name,
    photoURL: input.photoURL,
    currentDeploymentId: null,
    createdAt: current,
    updatedAt: current
  };

  await dbQuery(
    `INSERT INTO users (id, email, name, photo_url, current_deployment_id, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6::timestamptz, $7::timestamptz)`,
    [
      created.id,
      created.email,
      created.name,
      created.photoURL,
      created.currentDeploymentId,
      created.createdAt,
      created.updatedAt
    ]
  );

  return created;
}

export async function getUserByEmail(email: string): Promise<UserRecord | null> {
  const normalized = normalizeEmail(email);
  const result = await dbQuery(`SELECT * FROM users WHERE email = $1 LIMIT 1`, [normalized]);
  if (result.rowCount === 0) return null;
  return mapUser(result.rows[0] as Record<string, unknown>);
}

export async function getUserById(userId: string): Promise<UserRecord | null> {
  const result = await dbQuery(`SELECT * FROM users WHERE id = $1 LIMIT 1`, [userId]);
  if (result.rowCount === 0) return null;
  return mapUser(result.rows[0] as Record<string, unknown>);
}

export async function getDeploymentByUserId(userId: string): Promise<DeploymentRecord | null> {
  const user = await getUserById(userId);
  const currentId = user?.currentDeploymentId?.trim?.() ? String(user.currentDeploymentId).trim() : "";
  if (currentId) {
    const current = await getDeploymentById(currentId);
    if (current && current.userId === userId) {
      return current;
    }
  }

  const latestResult = await dbQuery(
    `SELECT * FROM deployments WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 1`,
    [userId]
  );
  if (latestResult.rowCount === 0) return null;

  const latest = mapDeployment(latestResult.rows[0] as Record<string, unknown>);
  if (user) {
    await dbQuery(
      `UPDATE users SET current_deployment_id = $2, updated_at = $3::timestamptz WHERE id = $1`,
      [user.id, latest.id, nowIso()]
    );
  }

  return latest;
}

export async function getDeploymentById(deploymentId: string): Promise<DeploymentRecord | null> {
  const result = await dbQuery(`SELECT * FROM deployments WHERE id = $1 LIMIT 1`, [deploymentId]);
  if (result.rowCount === 0) return null;
  return mapDeployment(result.rows[0] as Record<string, unknown>);
}

export async function getDeploymentBySubscriptionId(subscriptionId: string): Promise<DeploymentRecord | null> {
  const result = await dbQuery(`SELECT * FROM deployments WHERE subscription_id = $1 LIMIT 1`, [subscriptionId]);
  if (result.rowCount === 0) return null;
  return mapDeployment(result.rows[0] as Record<string, unknown>);
}

export async function getDeploymentByCheckoutSessionId(sessionId: string): Promise<DeploymentRecord | null> {
  const result = await dbQuery(`SELECT * FROM deployments WHERE checkout_session_id = $1 LIMIT 1`, [sessionId]);
  if (result.rowCount === 0) return null;
  return mapDeployment(result.rows[0] as Record<string, unknown>);
}

export async function listDeploymentsByUserId(userId: string): Promise<DeploymentRecord[]> {
  const result = await dbQuery(`SELECT * FROM deployments WHERE user_id = $1 ORDER BY updated_at DESC`, [userId]);
  return result.rows.map((row) => mapDeployment(row as Record<string, unknown>));
}

export async function createDeployment(
  data: Omit<DeploymentRecord, "id" | "createdAt" | "updatedAt" | "status" | "runtimeSlotId"> & {
    status?: DeploymentStatus;
  }
): Promise<DeploymentRecord> {
  await ensureWarmPoolInitialized();

  const current = nowIso();
  const created: DeploymentRecord = {
    id: makeId("dep"),
    userId: data.userId,
    plan: data.plan,
    modelProvider: data.modelProvider ?? "openrouter",
    selectedModel: data.selectedModel,
    channel: data.channel,
    encryptedChannelPrimaryToken: data.encryptedChannelPrimaryToken,
    encryptedChannelSecondaryToken: data.encryptedChannelSecondaryToken ?? null,
    encryptedModelApiKey: data.encryptedModelApiKey ?? null,
    billingInterval: data.billingInterval ?? null,
    paymentProvider: data.paymentProvider ?? null,
    checkoutSessionId: data.checkoutSessionId ?? null,
    subscriptionId: data.subscriptionId ?? null,
    subscriptionStatus: data.subscriptionStatus ?? null,
    status: data.status ?? "setup_started",
    runtimeSlotId: null,
    createdAt: current,
    updatedAt: current
  };

  await dbQuery(
    `INSERT INTO deployments (
      id, user_id, plan, model_provider, selected_model, channel,
      encrypted_channel_primary_token, encrypted_channel_secondary_token, encrypted_model_api_key,
      billing_interval, payment_provider, checkout_session_id, subscription_id, subscription_status,
      status, runtime_slot_id, created_at, updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6,
      $7, $8, $9,
      $10, $11, $12, $13, $14,
      $15, $16, $17::timestamptz, $18::timestamptz
    )`,
    [
      created.id,
      created.userId,
      created.plan,
      created.modelProvider,
      created.selectedModel,
      created.channel,
      created.encryptedChannelPrimaryToken,
      created.encryptedChannelSecondaryToken,
      created.encryptedModelApiKey,
      created.billingInterval,
      created.paymentProvider,
      created.checkoutSessionId,
      created.subscriptionId,
      created.subscriptionStatus,
      created.status,
      created.runtimeSlotId,
      created.createdAt,
      created.updatedAt
    ]
  );

  await dbQuery(
    `UPDATE users SET current_deployment_id = $2, updated_at = $3::timestamptz WHERE id = $1`,
    [created.userId, created.id, nowIso()]
  );

  return created;
}

export async function createOrReplaceDeployment(
  data: Omit<DeploymentRecord, "id" | "createdAt" | "updatedAt" | "status" | "runtimeSlotId"> & {
    status?: DeploymentStatus;
  }
): Promise<DeploymentRecord> {
  const existing = await getDeploymentByUserId(data.userId);
  const current = nowIso();

  if (existing) {
    const merged: DeploymentRecord = {
      ...existing,
      ...data,
      status: data.status ?? existing.status,
      updatedAt: current
    };

    await dbQuery(
      `UPDATE deployments SET
        user_id = $2,
        plan = $3,
        model_provider = $4,
        selected_model = $5,
        channel = $6,
        encrypted_channel_primary_token = $7,
        encrypted_channel_secondary_token = $8,
        encrypted_model_api_key = $9,
        billing_interval = $10,
        payment_provider = $11,
        checkout_session_id = $12,
        subscription_id = $13,
        subscription_status = $14,
        status = $15,
        runtime_slot_id = $16,
        updated_at = $17::timestamptz
      WHERE id = $1`,
      [
        merged.id,
        merged.userId,
        merged.plan,
        merged.modelProvider,
        merged.selectedModel,
        merged.channel,
        merged.encryptedChannelPrimaryToken,
        merged.encryptedChannelSecondaryToken,
        merged.encryptedModelApiKey,
        merged.billingInterval,
        merged.paymentProvider,
        merged.checkoutSessionId,
        merged.subscriptionId,
        merged.subscriptionStatus,
        merged.status,
        merged.runtimeSlotId,
        merged.updatedAt
      ]
    );

    await dbQuery(
      `UPDATE users SET current_deployment_id = $2, updated_at = $3::timestamptz WHERE id = $1`,
      [merged.userId, merged.id, nowIso()]
    );

    return merged;
  }

  return createDeployment(data);
}

export async function updateDeploymentStatus(
  deploymentId: string,
  status: DeploymentStatus,
  message?: string
): Promise<DeploymentRecord> {
  const deployment = await getDeploymentById(deploymentId);
  if (!deployment) {
    throw new Error("Deployment not found");
  }

  const updated: DeploymentRecord = {
    ...deployment,
    status,
    updatedAt: nowIso()
  };

  await dbQuery(
    `UPDATE deployments SET status = $2, updated_at = $3::timestamptz WHERE id = $1`,
    [deploymentId, status, updated.updatedAt]
  );

  const event: DeploymentEvent = {
    id: makeId("evt"),
    deploymentId,
    status,
    message,
    createdAt: nowIso()
  };

  await dbQuery(
    `INSERT INTO deployment_events (id, deployment_id, status, message, created_at)
     VALUES ($1, $2, $3, $4, $5::timestamptz)`,
    [event.id, event.deploymentId, event.status, event.message ?? null, event.createdAt]
  );

  state.emitter.emit(`status:${deploymentId}`, event);

  return updated;
}

export async function updateDeploymentById(
  deploymentId: string,
  partial: Partial<DeploymentRecord>
): Promise<DeploymentRecord> {
  const existing = await getDeploymentById(deploymentId);
  if (!existing) {
    throw new Error("Deployment not found");
  }

  const updated: DeploymentRecord = {
    ...existing,
    ...partial,
    updatedAt: nowIso()
  };

  await dbQuery(
    `UPDATE deployments SET
      user_id = $2,
      plan = $3,
      model_provider = $4,
      selected_model = $5,
      channel = $6,
      encrypted_channel_primary_token = $7,
      encrypted_channel_secondary_token = $8,
      encrypted_model_api_key = $9,
      billing_interval = $10,
      payment_provider = $11,
      checkout_session_id = $12,
      subscription_id = $13,
      subscription_status = $14,
      status = $15,
      runtime_slot_id = $16,
      updated_at = $17::timestamptz
    WHERE id = $1`,
    [
      updated.id,
      updated.userId,
      updated.plan,
      updated.modelProvider,
      updated.selectedModel,
      updated.channel,
      updated.encryptedChannelPrimaryToken,
      updated.encryptedChannelSecondaryToken,
      updated.encryptedModelApiKey,
      updated.billingInterval,
      updated.paymentProvider,
      updated.checkoutSessionId,
      updated.subscriptionId,
      updated.subscriptionStatus,
      updated.status,
      updated.runtimeSlotId,
      updated.updatedAt
    ]
  );

  return updated;
}

export async function getLatestPersistedEvent(deploymentId: string): Promise<DeploymentEvent | null> {
  const result = await dbQuery(
    `SELECT * FROM deployment_events WHERE deployment_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [deploymentId]
  );
  if (result.rowCount === 0) return null;
  return mapDeploymentEvent(result.rows[0] as Record<string, unknown>);
}

export async function listPersistedEvents(
  deploymentId: string,
  limit: number = 100
): Promise<DeploymentEvent[]> {
  const boundedLimit = Math.max(1, Math.min(limit, 500));
  const result = await dbQuery(
    `SELECT * FROM deployment_events
     WHERE deployment_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [deploymentId, boundedLimit]
  );
  return result.rows.map((row) => mapDeploymentEvent(row as Record<string, unknown>));
}

export function subscribeDeployment(
  deploymentId: string,
  callback: (event: DeploymentEvent) => void
): () => void {
  const channel = `status:${deploymentId}`;
  state.emitter.on(channel, callback);
  return () => state.emitter.off(channel, callback);
}

export async function queueDeploymentJob(deploymentId: string, paymentReference: string): Promise<DeploymentJob> {
  const job: DeploymentJob = {
    id: makeId("job"),
    deploymentId,
    paymentReference,
    createdAt: nowIso()
  };

  await dbQuery(
    `INSERT INTO deployment_jobs (id, deployment_id, payment_reference, created_at)
     VALUES ($1, $2, $3, $4::timestamptz)`,
    [job.id, job.deploymentId, job.paymentReference, job.createdAt]
  );

  return job;
}

export async function saveCheckoutSession(sessionId: string, payload: CheckoutSession) {
  await dbQuery(
    `INSERT INTO checkout_sessions (session_id, deployment_id, checkout_type, amount, created_at)
     VALUES ($1, $2, $3, $4, $5::timestamptz)
     ON CONFLICT (session_id) DO UPDATE SET
      deployment_id = EXCLUDED.deployment_id,
      checkout_type = EXCLUDED.checkout_type,
      amount = EXCLUDED.amount`,
    [sessionId, payload.deploymentId, payload.type, payload.amount ?? null, nowIso()]
  );
}

export async function getCheckoutSession(sessionId: string): Promise<CheckoutSession | null> {
  const result = await dbQuery(
    `SELECT deployment_id, checkout_type, amount FROM checkout_sessions WHERE session_id = $1 LIMIT 1`,
    [sessionId]
  );
  if (result.rowCount === 0) return null;

  const row = result.rows[0] as Record<string, unknown>;
  return {
    deploymentId: String(row.deployment_id),
    type: String(row.checkout_type) as CheckoutSession["type"],
    amount: row.amount == null ? undefined : Number(row.amount)
  };
}

export async function popNextJob(): Promise<DeploymentJob | null> {
  return withDbClient(async (client) => {
    await client.query("BEGIN");
    try {
      const select = await client.query<Record<string, unknown>>(
        `SELECT * FROM deployment_jobs ORDER BY created_at ASC LIMIT 1 FOR UPDATE SKIP LOCKED`
      );

      if (select.rowCount === 0) {
        await client.query("ROLLBACK");
        return null;
      }

      const row = select.rows[0];
      await client.query(`DELETE FROM deployment_jobs WHERE id = $1`, [row.id]);
      await client.query("COMMIT");

      return {
        id: String(row.id),
        deploymentId: String(row.deployment_id),
        paymentReference: String(row.payment_reference),
        createdAt: toIso(row.created_at)
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

export async function reserveWarmSlot(deploymentId: string): Promise<WarmSlot | null> {
  await ensureWarmPoolInitialized();

  return withDbClient(async (client) => {
    await client.query("BEGIN");
    try {
      const candidate = await client.query<Record<string, unknown>>(
        `SELECT * FROM warm_slots
         WHERE state = 'warm_available'
         ORDER BY created_at ASC
         LIMIT 1
         FOR UPDATE SKIP LOCKED`
      );

      if (candidate.rowCount === 0) {
        await client.query("ROLLBACK");
        return null;
      }

      const row = candidate.rows[0];
      const updatedAt = nowIso();

      await client.query(
        `UPDATE warm_slots
         SET state = 'reserved', assigned_deployment_id = $2, updated_at = $3::timestamptz
         WHERE id = $1`,
        [row.id, deploymentId, updatedAt]
      );

      await client.query(
        `UPDATE deployments SET runtime_slot_id = $2, updated_at = $3::timestamptz WHERE id = $1`,
        [deploymentId, row.id, nowIso()]
      );

      await client.query("COMMIT");

      return {
        id: String(row.id),
        state: "reserved",
        assignedDeploymentId: deploymentId,
        createdAt: toIso(row.created_at),
        updatedAt
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

export async function markSlotState(slotId: string, nextState: WarmSlot["state"]) {
  await dbQuery(
    `UPDATE warm_slots SET state = $2, updated_at = $3::timestamptz WHERE id = $1`,
    [slotId, nextState, nowIso()]
  );
}

export async function releaseWarmSlot(slotId: string) {
  await dbQuery(
    `UPDATE warm_slots
     SET state = 'warm_available', assigned_deployment_id = NULL, updated_at = $2::timestamptz
     WHERE id = $1`,
    [slotId, nowIso()]
  );
}

export async function refillWarmPool() {
  await ensureWarmPoolInitialized();

  const countResult = await dbQuery<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM warm_slots WHERE state = 'warm_available'`
  );
  const warmCount = countResult.rows[0]?.count ?? 0;

  for (let i = warmCount; i < env.WARM_POOL_SIZE; i += 1) {
    const id = makeId("slot");
    const current = nowIso();
    await dbQuery(
      `INSERT INTO warm_slots (id, state, assigned_deployment_id, created_at, updated_at)
       VALUES ($1, 'warm_available', NULL, $2::timestamptz, $2::timestamptz)
       ON CONFLICT (id) DO NOTHING`,
      [id, current]
    );
  }
}

export async function upsertUsage(deploymentId: string, partial?: Partial<UsageRecord>): Promise<UsageRecord> {
  const existing = await getUsage(deploymentId);
  const current = nowIso();

  if (existing) {
    const updated: UsageRecord = {
      ...existing,
      ...partial,
      updatedAt: current
    };

    await dbQuery(
      `UPDATE usage
       SET limit_total = $2, limit_remaining = $3, period_start = $4::timestamptz,
           period_end = $5::timestamptz, updated_at = $6::timestamptz
       WHERE deployment_id = $1`,
      [
        deploymentId,
        updated.limitTotal,
        updated.limitRemaining,
        updated.periodStart,
        updated.periodEnd,
        updated.updatedAt
      ]
    );

    return updated;
  }

  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(1);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);

  const created: UsageRecord = {
    deploymentId,
    limitTotal: partial?.limitTotal ?? 0,
    limitRemaining: partial?.limitRemaining ?? 0,
    periodStart: partial?.periodStart ?? start.toISOString(),
    periodEnd: partial?.periodEnd ?? end.toISOString(),
    updatedAt: current
  };

  await dbQuery(
    `INSERT INTO usage (deployment_id, limit_total, limit_remaining, period_start, period_end, updated_at)
     VALUES ($1, $2, $3, $4::timestamptz, $5::timestamptz, $6::timestamptz)`,
    [
      created.deploymentId,
      created.limitTotal,
      created.limitRemaining,
      created.periodStart,
      created.periodEnd,
      created.updatedAt
    ]
  );

  return created;
}

export async function getUsage(deploymentId: string): Promise<UsageRecord | null> {
  const result = await dbQuery(`SELECT * FROM usage WHERE deployment_id = $1 LIMIT 1`, [deploymentId]);
  if (result.rowCount === 0) return null;
  return mapUsage(result.rows[0] as Record<string, unknown>);
}

export async function addCredits(deploymentId: string, amountUnits: number): Promise<UsageRecord> {
  const usage = await upsertUsage(deploymentId);
  return upsertUsage(deploymentId, {
    limitTotal: usage.limitTotal + amountUnits,
    limitRemaining: usage.limitRemaining + amountUnits
  });
}

export async function listWarmSlots() {
  const result = await dbQuery(`SELECT * FROM warm_slots ORDER BY created_at ASC`);
  return result.rows.map((row) => mapWarmSlot(row as Record<string, unknown>));
}

export async function saveOpenRouterKey(input: {
  userId: string;
  deploymentId: string;
  encryptedKey: string;
  keyId?: string;
  keyHash?: string;
  limitUsd?: number;
  limitRemaining?: number;
}) {
  await dbQuery(
    `INSERT INTO openrouter_keys (
      deployment_id, user_id, encrypted_key, key_id, key_hash, limit_usd, limit_remaining, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::timestamptz)
    ON CONFLICT (deployment_id) DO UPDATE SET
      user_id = EXCLUDED.user_id,
      encrypted_key = EXCLUDED.encrypted_key,
      key_id = EXCLUDED.key_id,
      key_hash = EXCLUDED.key_hash,
      limit_usd = EXCLUDED.limit_usd,
      limit_remaining = EXCLUDED.limit_remaining,
      updated_at = EXCLUDED.updated_at`,
    [
      input.deploymentId,
      input.userId,
      input.encryptedKey,
      input.keyId ?? null,
      input.keyHash ?? null,
      input.limitUsd ?? null,
      input.limitRemaining ?? null,
      nowIso()
    ]
  );
}

export async function getOpenRouterKeyByDeploymentId(deploymentId: string): Promise<{
  userId: string;
  deploymentId: string;
  encryptedKey: string;
  keyId?: string | null;
  keyHash?: string | null;
  limitUsd?: number | null;
  limitRemaining?: number | null;
} | null> {
  const result = await dbQuery(
    `SELECT deployment_id, user_id, encrypted_key, key_id, key_hash, limit_usd, limit_remaining
     FROM openrouter_keys WHERE deployment_id = $1 LIMIT 1`,
    [deploymentId]
  );
  if (result.rowCount === 0) return null;
  const row = result.rows[0] as Record<string, unknown>;
  return {
    deploymentId: String(row.deployment_id),
    userId: String(row.user_id),
    encryptedKey: String(row.encrypted_key),
    keyId: toNullableString(row.key_id),
    keyHash: toNullableString(row.key_hash),
    limitUsd: row.limit_usd == null ? null : Number(row.limit_usd),
    limitRemaining: row.limit_remaining == null ? null : Number(row.limit_remaining)
  };
}

export async function saveXConnection(
  input: Omit<XConnectionRecord, "createdAt" | "updatedAt"> & { createdAt?: string; updatedAt?: string }
) {
  const existing = await getXConnectionByDeploymentId(input.deploymentId);
  const createdAt = existing?.createdAt ?? input.createdAt ?? nowIso();
  const updatedAt = input.updatedAt ?? nowIso();
  const normalizedExpiresAt = toNullableIso(input.expiresAt);

  await dbQuery(
    `INSERT INTO x_connections (
      deployment_id, user_id, x_user_id, username, name,
      encrypted_access_token, encrypted_refresh_token, token_type, scope,
      expires_at, created_at, updated_at
    ) VALUES (
      $1, $2, $3, $4, $5,
      $6, $7, $8, $9,
      $10::timestamptz, $11::timestamptz, $12::timestamptz
    )
    ON CONFLICT (deployment_id) DO UPDATE SET
      user_id = EXCLUDED.user_id,
      x_user_id = EXCLUDED.x_user_id,
      username = EXCLUDED.username,
      name = EXCLUDED.name,
      encrypted_access_token = EXCLUDED.encrypted_access_token,
      encrypted_refresh_token = EXCLUDED.encrypted_refresh_token,
      token_type = EXCLUDED.token_type,
      scope = EXCLUDED.scope,
      expires_at = EXCLUDED.expires_at,
      updated_at = EXCLUDED.updated_at`,
    [
      input.deploymentId,
      input.userId,
      input.xUserId,
      input.username,
      input.name ?? null,
      input.encryptedAccessToken,
      input.encryptedRefreshToken ?? null,
      input.tokenType,
      input.scope,
      normalizedExpiresAt,
      createdAt,
      updatedAt
    ]
  );

  return {
    deploymentId: input.deploymentId,
    userId: input.userId,
    xUserId: input.xUserId,
    username: input.username,
    name: input.name ?? null,
    encryptedAccessToken: input.encryptedAccessToken,
    encryptedRefreshToken: input.encryptedRefreshToken ?? null,
    tokenType: input.tokenType,
    scope: input.scope,
    expiresAt: normalizedExpiresAt,
    createdAt,
    updatedAt
  } as XConnectionRecord;
}

export async function getXConnectionByDeploymentId(deploymentId: string): Promise<XConnectionRecord | null> {
  const result = await dbQuery(`SELECT * FROM x_connections WHERE deployment_id = $1 LIMIT 1`, [deploymentId]);
  if (result.rowCount === 0) return null;
  return mapXConnection(result.rows[0] as Record<string, unknown>);
}

export async function updateXConnectionTokens(
  deploymentId: string,
  input: Pick<XConnectionRecord, "encryptedAccessToken" | "tokenType"> & {
    encryptedRefreshToken?: string | null;
    expiresAt?: string | null;
    scope?: string[];
  }
) {
  const existing = await getXConnectionByDeploymentId(deploymentId);
  if (!existing) {
    throw new Error("X connection not found");
  }

  const updated: XConnectionRecord = {
    ...existing,
    encryptedAccessToken: input.encryptedAccessToken,
    encryptedRefreshToken:
      input.encryptedRefreshToken !== undefined
        ? input.encryptedRefreshToken
        : existing.encryptedRefreshToken,
    tokenType: input.tokenType,
    expiresAt: input.expiresAt !== undefined ? toNullableIso(input.expiresAt) : existing.expiresAt,
    scope: input.scope ?? existing.scope,
    updatedAt: nowIso()
  };

  await dbQuery(
    `UPDATE x_connections
     SET encrypted_access_token = $2,
         encrypted_refresh_token = $3,
         token_type = $4,
         scope = $5,
         expires_at = $6::timestamptz,
         updated_at = $7::timestamptz
     WHERE deployment_id = $1`,
    [
      deploymentId,
      updated.encryptedAccessToken,
      updated.encryptedRefreshToken,
      updated.tokenType,
      updated.scope,
      updated.expiresAt,
      updated.updatedAt
    ]
  );

  return updated;
}

export async function saveXUserConnection(
  input: Omit<XUserConnectionRecord, "createdAt" | "updatedAt"> & { createdAt?: string; updatedAt?: string }
) {
  const existing = await getXUserConnectionByUserId(input.userId);
  const createdAt = existing?.createdAt ?? input.createdAt ?? nowIso();
  const updatedAt = input.updatedAt ?? nowIso();
  const normalizedExpiresAt = toNullableIso(input.expiresAt);

  await dbQuery(
    `INSERT INTO x_user_connections (
      user_id, x_user_id, username, name,
      encrypted_access_token, encrypted_refresh_token, token_type, scope,
      expires_at, created_at, updated_at
    ) VALUES (
      $1, $2, $3, $4,
      $5, $6, $7, $8,
      $9::timestamptz, $10::timestamptz, $11::timestamptz
    )
    ON CONFLICT (user_id) DO UPDATE SET
      x_user_id = EXCLUDED.x_user_id,
      username = EXCLUDED.username,
      name = EXCLUDED.name,
      encrypted_access_token = EXCLUDED.encrypted_access_token,
      encrypted_refresh_token = EXCLUDED.encrypted_refresh_token,
      token_type = EXCLUDED.token_type,
      scope = EXCLUDED.scope,
      expires_at = EXCLUDED.expires_at,
      updated_at = EXCLUDED.updated_at`,
    [
      input.userId,
      input.xUserId,
      input.username,
      input.name ?? null,
      input.encryptedAccessToken,
      input.encryptedRefreshToken ?? null,
      input.tokenType,
      input.scope,
      normalizedExpiresAt,
      createdAt,
      updatedAt
    ]
  );

  return {
    userId: input.userId,
    xUserId: input.xUserId,
    username: input.username,
    name: input.name ?? null,
    encryptedAccessToken: input.encryptedAccessToken,
    encryptedRefreshToken: input.encryptedRefreshToken ?? null,
    tokenType: input.tokenType,
    scope: input.scope,
    expiresAt: normalizedExpiresAt,
    createdAt,
    updatedAt
  } as XUserConnectionRecord;
}

export async function getXUserConnectionByUserId(userId: string): Promise<XUserConnectionRecord | null> {
  const result = await dbQuery(`SELECT * FROM x_user_connections WHERE user_id = $1 LIMIT 1`, [userId]);
  if (result.rowCount === 0) return null;
  return mapXUserConnection(result.rows[0] as Record<string, unknown>);
}

export async function updateXUserConnectionTokens(
  userId: string,
  input: Pick<XUserConnectionRecord, "encryptedAccessToken" | "tokenType"> & {
    encryptedRefreshToken?: string | null;
    expiresAt?: string | null;
    scope?: string[];
  }
) {
  const existing = await getXUserConnectionByUserId(userId);
  if (!existing) {
    throw new Error("User-level X connection not found");
  }

  const updated: XUserConnectionRecord = {
    ...existing,
    encryptedAccessToken: input.encryptedAccessToken,
    encryptedRefreshToken:
      input.encryptedRefreshToken !== undefined
        ? input.encryptedRefreshToken
        : existing.encryptedRefreshToken,
    tokenType: input.tokenType,
    expiresAt: input.expiresAt !== undefined ? toNullableIso(input.expiresAt) : existing.expiresAt,
    scope: input.scope ?? existing.scope,
    updatedAt: nowIso()
  };

  await dbQuery(
    `UPDATE x_user_connections
     SET encrypted_access_token = $2,
         encrypted_refresh_token = $3,
         token_type = $4,
         scope = $5,
         expires_at = $6::timestamptz,
         updated_at = $7::timestamptz
     WHERE user_id = $1`,
    [
      userId,
      updated.encryptedAccessToken,
      updated.encryptedRefreshToken,
      updated.tokenType,
      updated.scope,
      updated.expiresAt,
      updated.updatedAt
    ]
  );

  return updated;
}

export async function saveXOAuthState(
  input: Omit<XOAuthStateRecord, "createdAt"> & { createdAt?: string }
) {
  const payload: XOAuthStateRecord = {
    ...input,
    createdAt: input.createdAt ?? nowIso()
  };

  await dbQuery(
    `INSERT INTO x_oauth_states (
      state, deployment_id, user_id, code_verifier, redirect_uri, created_at, expires_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6::timestamptz, $7::timestamptz
    )
    ON CONFLICT (state) DO UPDATE SET
      deployment_id = EXCLUDED.deployment_id,
      user_id = EXCLUDED.user_id,
      code_verifier = EXCLUDED.code_verifier,
      redirect_uri = EXCLUDED.redirect_uri,
      created_at = EXCLUDED.created_at,
      expires_at = EXCLUDED.expires_at`,
    [
      payload.state,
      payload.deploymentId ?? null,
      payload.userId,
      payload.codeVerifier,
      payload.redirectUri,
      payload.createdAt,
      payload.expiresAt
    ]
  );

  return payload;
}

export async function consumeXOAuthState(stateId: string): Promise<XOAuthStateRecord | null> {
  return withDbClient(async (client) => {
    await client.query("BEGIN");
    try {
      const result = await client.query<Record<string, unknown>>(
        `SELECT * FROM x_oauth_states WHERE state = $1 LIMIT 1 FOR UPDATE`,
        [stateId]
      );

      if (result.rowCount === 0) {
        await client.query("ROLLBACK");
        return null;
      }

      await client.query(`DELETE FROM x_oauth_states WHERE state = $1`, [stateId]);
      await client.query("COMMIT");

      const row = result.rows[0];
      return {
        state: String(row.state),
        deploymentId: toNullableString(row.deployment_id),
        userId: String(row.user_id),
        codeVerifier: String(row.code_verifier),
        redirectUri: String(row.redirect_uri),
        createdAt: toIso(row.created_at),
        expiresAt: toIso(row.expires_at)
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

export async function appendXActionLog(input: {
  deploymentId: string;
  actionType: XActionType;
  status?: XActionStatus;
  targetTweetId?: string | null;
  targetAuthorId?: string | null;
  conversationId?: string | null;
  contentHash: string;
  content: string;
  reason?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt?: string;
}): Promise<XActionLogRecord> {
  const record: XActionLogRecord = {
    id: makeId("xact"),
    deploymentId: input.deploymentId,
    actionType: input.actionType,
    status: input.status ?? "sent",
    targetTweetId: input.targetTweetId ?? null,
    targetAuthorId: input.targetAuthorId ?? null,
    conversationId: input.conversationId ?? null,
    contentHash: input.contentHash,
    content: input.content,
    reason: input.reason ?? null,
    metadata: input.metadata ?? null,
    createdAt: input.createdAt ?? nowIso()
  };

  await dbQuery(
    `INSERT INTO x_action_logs (
      id, deployment_id, action_type, status,
      target_tweet_id, target_author_id, conversation_id,
      content_hash, content, reason, metadata, created_at
    ) VALUES (
      $1, $2, $3, $4,
      $5, $6, $7,
      $8, $9, $10, $11::jsonb, $12::timestamptz
    )`,
    [
      record.id,
      record.deploymentId,
      record.actionType,
      record.status,
      record.targetTweetId,
      record.targetAuthorId,
      record.conversationId,
      record.contentHash,
      record.content,
      record.reason,
      record.metadata ? JSON.stringify(record.metadata) : null,
      record.createdAt
    ]
  );

  return record;
}

export async function getLatestXActionLog(
  deploymentId: string,
  actionType: XActionType,
  status: XActionStatus = "sent"
): Promise<XActionLogRecord | null> {
  const result = await dbQuery(
    `SELECT * FROM x_action_logs
     WHERE deployment_id = $1
       AND action_type = $2
       AND status = $3
     ORDER BY created_at DESC
     LIMIT 1`,
    [deploymentId, actionType, status]
  );
  if (result.rowCount === 0) return null;
  return mapXActionLog(result.rows[0] as Record<string, unknown>);
}

export async function hasSentXActionWithContentHash(
  deploymentId: string,
  actionType: XActionType,
  contentHash: string,
  sinceIso: string
): Promise<boolean> {
  const result = await dbQuery(
    `SELECT 1
     FROM x_action_logs
     WHERE deployment_id = $1
       AND action_type = $2
       AND status = 'sent'
       AND content_hash = $3
       AND created_at >= $4::timestamptz
     LIMIT 1`,
    [deploymentId, actionType, contentHash, sinceIso]
  );
  return (result.rowCount ?? 0) > 0;
}

export async function hasSentXReplyToTweet(
  deploymentId: string,
  targetTweetId: string
): Promise<boolean> {
  const result = await dbQuery(
    `SELECT 1
     FROM x_action_logs
     WHERE deployment_id = $1
       AND action_type = 'reply'
       AND status = 'sent'
       AND target_tweet_id = $2
     LIMIT 1`,
    [deploymentId, targetTweetId]
  );
  return (result.rowCount ?? 0) > 0;
}

export async function countSentXRepliesForAuthorInConversation(
  deploymentId: string,
  targetAuthorId: string,
  conversationId: string
): Promise<number> {
  const result = await dbQuery<{ count: number }>(
    `SELECT COUNT(*)::int AS count
     FROM x_action_logs
     WHERE deployment_id = $1
       AND action_type = 'reply'
       AND status = 'sent'
       AND target_author_id = $2
       AND conversation_id = $3`,
    [deploymentId, targetAuthorId, conversationId]
  );
  return result.rows[0]?.count ?? 0;
}

export async function getXActionMetrics(
  deploymentId: string,
  windowHours: number
): Promise<{
  deploymentId: string;
  windowHours: number;
  since: string;
  sentPosts: number;
  sentReplies: number;
  blocked: number;
  failed: number;
  total: number;
  lastActionAt: string | null;
  lastPostAt: string | null;
  lastReplyAt: string | null;
}> {
  const boundedWindow = Math.max(1, Math.min(24 * 30, Math.floor(windowHours)));
  const since = new Date(Date.now() - boundedWindow * 60 * 60 * 1000).toISOString();

  const grouped = await dbQuery<{ action_type: string; status: string; count: number }>(
    `SELECT action_type, status, COUNT(*)::int AS count
     FROM x_action_logs
     WHERE deployment_id = $1
       AND created_at >= $2::timestamptz
     GROUP BY action_type, status`,
    [deploymentId, since]
  );

  let sentPosts = 0;
  let sentReplies = 0;
  let blocked = 0;
  let failed = 0;

  for (const row of grouped.rows) {
    const count = Number(row.count ?? 0);
    const actionType = String(row.action_type);
    const status = String(row.status);
    if (status === "sent" && actionType === "post") sentPosts += count;
    if (status === "sent" && actionType === "reply") sentReplies += count;
    if (status === "blocked") blocked += count;
    if (status === "failed") failed += count;
  }

  const [lastAction, lastPost, lastReply] = await Promise.all([
    dbQuery<{ created_at: string }>(
      `SELECT created_at
       FROM x_action_logs
       WHERE deployment_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [deploymentId]
    ),
    dbQuery<{ created_at: string }>(
      `SELECT created_at
       FROM x_action_logs
       WHERE deployment_id = $1
         AND action_type = 'post'
         AND status = 'sent'
       ORDER BY created_at DESC
       LIMIT 1`,
      [deploymentId]
    ),
    dbQuery<{ created_at: string }>(
      `SELECT created_at
       FROM x_action_logs
       WHERE deployment_id = $1
         AND action_type = 'reply'
         AND status = 'sent'
       ORDER BY created_at DESC
       LIMIT 1`,
      [deploymentId]
    )
  ]);

  return {
    deploymentId,
    windowHours: boundedWindow,
    since,
    sentPosts,
    sentReplies,
    blocked,
    failed,
    total: sentPosts + sentReplies + blocked + failed,
    lastActionAt: (lastAction.rowCount ?? 0) > 0 ? toIso(lastAction.rows[0].created_at) : null,
    lastPostAt: (lastPost.rowCount ?? 0) > 0 ? toIso(lastPost.rows[0].created_at) : null,
    lastReplyAt: (lastReply.rowCount ?? 0) > 0 ? toIso(lastReply.rows[0].created_at) : null
  };
}

export async function saveDeploymentArtifact(input: {
  deploymentId: string;
  kind: DeploymentArtifactRecord["kind"];
  fileName: string;
  content: string;
}): Promise<DeploymentArtifactRecord> {
  const existing = await getDeploymentArtifact(input.deploymentId, input.kind);
  const createdAt = existing?.createdAt ?? nowIso();
  const updatedAt = nowIso();

  await dbQuery(
    `INSERT INTO deployment_artifacts (
      deployment_id, kind, file_name, content, created_at, updated_at
    ) VALUES (
      $1, $2, $3, $4, $5::timestamptz, $6::timestamptz
    )
    ON CONFLICT (deployment_id, kind) DO UPDATE SET
      file_name = EXCLUDED.file_name,
      content = EXCLUDED.content,
      updated_at = EXCLUDED.updated_at`,
    [input.deploymentId, input.kind, input.fileName, input.content, createdAt, updatedAt]
  );

  return {
    deploymentId: input.deploymentId,
    kind: input.kind,
    fileName: input.fileName,
    content: input.content,
    createdAt,
    updatedAt
  };
}

export async function getDeploymentArtifact(
  deploymentId: string,
  kind: DeploymentArtifactRecord["kind"]
): Promise<DeploymentArtifactRecord | null> {
  const result = await dbQuery(
    `SELECT * FROM deployment_artifacts WHERE deployment_id = $1 AND kind = $2 LIMIT 1`,
    [deploymentId, kind]
  );
  if (result.rowCount === 0) return null;
  return mapDeploymentArtifact(result.rows[0] as Record<string, unknown>);
}

export async function createBrandResearchRun(input: {
  deploymentId: string;
  phase: BrandResearchRunRecord["phase"];
  status?: BrandResearchRunRecord["status"];
  startedAt?: string;
}): Promise<BrandResearchRunRecord> {
  const createdAt = nowIso();
  const startedAt = input.startedAt ?? createdAt;
  const run: BrandResearchRunRecord = {
    id: makeId("rsr"),
    deploymentId: input.deploymentId,
    phase: input.phase,
    status: input.status ?? "running",
    confidenceOverall: null,
    error: null,
    startedAt,
    completedAt: null,
    createdAt,
    updatedAt: createdAt
  };

  await dbQuery(
    `INSERT INTO brand_research_runs (
      id, deployment_id, phase, status, confidence_overall, error,
      started_at, completed_at, created_at, updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6,
      $7::timestamptz, $8::timestamptz, $9::timestamptz, $10::timestamptz
    )`,
    [
      run.id,
      run.deploymentId,
      run.phase,
      run.status,
      run.confidenceOverall,
      run.error,
      run.startedAt,
      run.completedAt,
      run.createdAt,
      run.updatedAt
    ]
  );

  return run;
}

export async function updateBrandResearchRun(
  runId: string,
  partial: {
    status?: BrandResearchRunRecord["status"];
    confidenceOverall?: number | null;
    error?: string | null;
    completedAt?: string | null;
  }
): Promise<BrandResearchRunRecord> {
  const existingResult = await dbQuery(`SELECT * FROM brand_research_runs WHERE id = $1 LIMIT 1`, [runId]);
  if (existingResult.rowCount === 0) {
    throw new Error("Research run not found");
  }

  const existing = mapBrandResearchRun(existingResult.rows[0] as Record<string, unknown>);
  const updated: BrandResearchRunRecord = {
    ...existing,
    status: partial.status ?? existing.status,
    confidenceOverall:
      partial.confidenceOverall === undefined ? existing.confidenceOverall : partial.confidenceOverall,
    error: partial.error === undefined ? existing.error : partial.error,
    completedAt: partial.completedAt === undefined ? existing.completedAt : partial.completedAt,
    updatedAt: nowIso()
  };

  await dbQuery(
    `UPDATE brand_research_runs
     SET status = $2,
         confidence_overall = $3,
         error = $4,
         completed_at = $5::timestamptz,
         updated_at = $6::timestamptz
     WHERE id = $1`,
    [
      runId,
      updated.status,
      updated.confidenceOverall,
      updated.error,
      updated.completedAt,
      updated.updatedAt
    ]
  );

  return updated;
}

export async function getBrandResearchRunById(runId: string): Promise<BrandResearchRunRecord | null> {
  const result = await dbQuery(`SELECT * FROM brand_research_runs WHERE id = $1 LIMIT 1`, [runId]);
  if (result.rowCount === 0) return null;
  return mapBrandResearchRun(result.rows[0] as Record<string, unknown>);
}

export async function getLatestBrandResearchRun(
  deploymentId: string,
  phase?: BrandResearchRunRecord["phase"]
): Promise<BrandResearchRunRecord | null> {
  const result = phase
    ? await dbQuery(
        `SELECT * FROM brand_research_runs
         WHERE deployment_id = $1 AND phase = $2
         ORDER BY created_at DESC
         LIMIT 1`,
        [deploymentId, phase]
      )
    : await dbQuery(
        `SELECT * FROM brand_research_runs
         WHERE deployment_id = $1
         ORDER BY created_at DESC
         LIMIT 1`,
        [deploymentId]
      );
  if (result.rowCount === 0) return null;
  return mapBrandResearchRun(result.rows[0] as Record<string, unknown>);
}

export async function saveBrandResearchSource(input: {
  runId: string;
  url: string;
  domain?: string | null;
  sourceType: BrandResearchSourceRecord["sourceType"];
  fetchedAt?: string | null;
  title?: string | null;
  excerpt?: string | null;
  reliabilityScore?: number | null;
}): Promise<BrandResearchSourceRecord> {
  const createdAt = nowIso();
  const source: BrandResearchSourceRecord = {
    id: makeId("rss"),
    runId: input.runId,
    url: input.url,
    domain: input.domain ?? null,
    sourceType: input.sourceType,
    fetchedAt: input.fetchedAt ?? null,
    title: input.title ?? null,
    excerpt: input.excerpt ?? null,
    reliabilityScore: input.reliabilityScore ?? null,
    createdAt
  };

  await dbQuery(
    `INSERT INTO brand_research_sources (
      id, run_id, url, domain, source_type, fetched_at, title, excerpt, reliability_score, created_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6::timestamptz, $7, $8, $9, $10::timestamptz
    )`,
    [
      source.id,
      source.runId,
      source.url,
      source.domain,
      source.sourceType,
      source.fetchedAt,
      source.title,
      source.excerpt,
      source.reliabilityScore,
      source.createdAt
    ]
  );

  return source;
}

export async function saveBrandResearchFact(input: {
  runId: string;
  key: string;
  value: string;
  confidence: number;
  confidenceLabel: BrandResearchFactRecord["confidenceLabel"];
  evidenceSourceIds?: string[];
  factType: BrandResearchFactRecord["factType"];
}): Promise<BrandResearchFactRecord> {
  const createdAt = nowIso();
  const fact: BrandResearchFactRecord = {
    id: makeId("rsf"),
    runId: input.runId,
    key: input.key,
    value: input.value,
    confidence: input.confidence,
    confidenceLabel: input.confidenceLabel,
    evidenceSourceIds: input.evidenceSourceIds ?? [],
    factType: input.factType,
    createdAt
  };

  await dbQuery(
    `INSERT INTO brand_research_facts (
      id, run_id, key, value, confidence, confidence_label, evidence_source_ids, fact_type, created_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7::text[], $8, $9::timestamptz
    )`,
    [
      fact.id,
      fact.runId,
      fact.key,
      fact.value,
      fact.confidence,
      fact.confidenceLabel,
      fact.evidenceSourceIds,
      fact.factType,
      fact.createdAt
    ]
  );

  return fact;
}

export async function listBrandResearchSourcesByRunId(runId: string): Promise<BrandResearchSourceRecord[]> {
  const result = await dbQuery(
    `SELECT * FROM brand_research_sources WHERE run_id = $1 ORDER BY created_at ASC`,
    [runId]
  );
  return result.rows.map((row) => mapBrandResearchSource(row as Record<string, unknown>));
}

export async function listBrandResearchFactsByRunId(runId: string): Promise<BrandResearchFactRecord[]> {
  const result = await dbQuery(
    `SELECT * FROM brand_research_facts WHERE run_id = $1 ORDER BY created_at ASC`,
    [runId]
  );
  return result.rows.map((row) => mapBrandResearchFact(row as Record<string, unknown>));
}

export async function appendChatMessage(input: Omit<ChatMessageRecord, "id" | "createdAt">) {
  const message: ChatMessageRecord = {
    id: makeId("msg"),
    deploymentId: input.deploymentId,
    sessionId: input.sessionId,
    role: input.role,
    text: input.text,
    createdAt: nowIso()
  };

  await dbQuery(
    `INSERT INTO chat_messages (id, deployment_id, session_id, role, text, created_at)
     VALUES ($1, $2, $3, $4, $5, $6::timestamptz)`,
    [
      message.id,
      message.deploymentId,
      message.sessionId,
      message.role,
      message.text,
      message.createdAt
    ]
  );

  return message;
}

export async function listChatMessages(deploymentId: string, limit = 50): Promise<ChatMessageRecord[]> {
  const bounded = Math.max(1, Math.min(200, limit));
  const result = await dbQuery(
    `SELECT * FROM chat_messages WHERE deployment_id = $1 ORDER BY created_at ASC LIMIT $2`,
    [deploymentId, bounded]
  );
  return result.rows.map((row) => mapChatMessage(row as Record<string, unknown>));
}
