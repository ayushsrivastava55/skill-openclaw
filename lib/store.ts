import { EventEmitter } from "events";
import { getFirestore } from "firebase-admin/firestore";
import { env } from "@/lib/env";
import { initFirebaseAdmin } from "@/lib/firebase-admin";
import { makeId, nowIso } from "@/lib/security";
import type {
  ChatMessageRecord,
  DeploymentEvent,
  DeploymentJob,
  DeploymentRecord,
  DeploymentStatus,
  UsageRecord,
  UserRecord,
  WarmSlot,
  XConnectionRecord,
  XOAuthStateRecord
} from "@/lib/types";

type CheckoutSession = { deploymentId: string; type: "deploy" | "credits"; amount?: number };

type State = {
  eventsByDeploymentId: Map<string, DeploymentEvent[]>;
  jobs: DeploymentJob[];
  warmSlots: Map<string, WarmSlot>;
  emitter: EventEmitter;
};

declare global {
  // eslint-disable-next-line no-var
  var __simpleClawState: State | undefined;
}

function createState(): State {
  const state: State = {
    eventsByDeploymentId: new Map(),
    jobs: [],
    warmSlots: new Map(),
    emitter: new EventEmitter()
  };

  for (let i = 0; i < env.WARM_POOL_SIZE; i += 1) {
    const id = makeId("slot");
    const time = nowIso();
    state.warmSlots.set(id, {
      id,
      state: "warm_available",
      assignedDeploymentId: null,
      createdAt: time,
      updatedAt: time
    });
  }

  return state;
}

const state = globalThis.__simpleClawState ?? createState();
globalThis.__simpleClawState = state;

const db = getFirestore(initFirebaseAdmin());
const usersCol = db.collection("users");
const deploymentsCol = db.collection("deployments");
const usageCol = db.collection("usage");
const checkoutCol = db.collection("checkoutSessions");
const processedPayPalCol = db.collection("processedPayPalOrders");
const processedRazorpayCol = db.collection("processedRazorpayPayments");
const processedGumroadCol = db.collection("processedGumroadSales");
const processedDodoCol = db.collection("processedDodoEvents");
const openrouterKeysCol = db.collection("openrouterKeys");
const xConnectionsCol = db.collection("xConnections");
const xOAuthStatesCol = db.collection("xOAuthStates");

function normalizeEmail(email: string) {
  return email.toLowerCase().trim();
}

function withDocId<T>(id: string, data: T): T & { id: string } {
  return { id, ...(data as T) };
}

function stripUndefined<T extends object>(input: T): T {
  const entries = Object.entries(input as Record<string, unknown>).filter(([, value]) => value !== undefined);
  return Object.fromEntries(entries) as T;
}

export async function upsertUser(input: Pick<UserRecord, "email" | "name" | "photoURL">): Promise<UserRecord> {
  const email = normalizeEmail(input.email);
  const existing = await getUserByEmail(email);
  const current = nowIso();

  if (existing) {
    const updated: UserRecord = {
      ...existing,
      email,
      name: input.name,
      photoURL: input.photoURL,
      updatedAt: current
    };
    await usersCol.doc(updated.id).set(updated, { merge: true });
    return updated;
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
  await usersCol.doc(created.id).set(created);
  return created;
}

export async function getUserByEmail(email: string): Promise<UserRecord | null> {
  const normalized = normalizeEmail(email);
  const snap = await usersCol.where("email", "==", normalized).limit(1).get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  return withDocId(doc.id, doc.data() as UserRecord);
}

export async function getUserById(userId: string): Promise<UserRecord | null> {
  const doc = await usersCol.doc(userId).get();
  if (!doc.exists) return null;
  return withDocId(doc.id, doc.data() as UserRecord);
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

  // Fallback for older accounts: scan and pick the most recently updated deployment.
  // Avoid Firestore orderBy+where composite index requirements by sorting in memory.
  const snap = await deploymentsCol.where("userId", "==", userId).get();
  if (snap.empty) return null;
  const deployments = snap.docs.map((doc) => withDocId(doc.id, doc.data() as DeploymentRecord));
  deployments.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  const latest = deployments[0] ?? null;
  if (latest && user) {
    await usersCol.doc(user.id).set({ currentDeploymentId: latest.id, updatedAt: nowIso() }, { merge: true });
  }
  return latest;
}

export async function getDeploymentById(deploymentId: string): Promise<DeploymentRecord | null> {
  const doc = await deploymentsCol.doc(deploymentId).get();
  if (!doc.exists) return null;
  return withDocId(doc.id, doc.data() as DeploymentRecord);
}

export async function getDeploymentBySubscriptionId(subscriptionId: string): Promise<DeploymentRecord | null> {
  const snap = await deploymentsCol.where("subscriptionId", "==", subscriptionId).limit(1).get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  return withDocId(doc.id, doc.data() as DeploymentRecord);
}

export async function getDeploymentByCheckoutSessionId(sessionId: string): Promise<DeploymentRecord | null> {
  const snap = await deploymentsCol.where("checkoutSessionId", "==", sessionId).limit(1).get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  return withDocId(doc.id, doc.data() as DeploymentRecord);
}

export async function listDeploymentsByUserId(userId: string): Promise<DeploymentRecord[]> {
  const snap = await deploymentsCol.where("userId", "==", userId).get();
  if (snap.empty) return [];
  const deployments = snap.docs.map((doc) => withDocId(doc.id, doc.data() as DeploymentRecord));
  deployments.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  return deployments;
}

export async function createDeployment(
  data: Omit<DeploymentRecord, "id" | "createdAt" | "updatedAt" | "status" | "runtimeSlotId"> & {
    status?: DeploymentStatus;
  }
): Promise<DeploymentRecord> {
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
  await deploymentsCol.doc(created.id).set(stripUndefined(created));
  await usersCol.doc(created.userId).set({ currentDeploymentId: created.id, updatedAt: nowIso() }, { merge: true });
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
    const updated: DeploymentRecord = {
      ...existing,
      ...data,
      status: data.status ?? existing.status,
      updatedAt: current
    };
    await deploymentsCol.doc(updated.id).set(stripUndefined(updated), { merge: true });
    // Keep user pointer consistent for navigation (chat/dashboard).
    await usersCol.doc(updated.userId).set({ currentDeploymentId: updated.id, updatedAt: nowIso() }, { merge: true });
    return updated;
  }

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
  await deploymentsCol.doc(created.id).set(stripUndefined(created));
  await usersCol.doc(created.userId).set({ currentDeploymentId: created.id, updatedAt: nowIso() }, { merge: true });
  return created;
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

  const updated: DeploymentRecord = { ...deployment, status, updatedAt: nowIso() };
  await deploymentsCol.doc(deploymentId).set(stripUndefined(updated), { merge: true });

  const event: DeploymentEvent = {
    id: makeId("evt"),
    deploymentId,
    status,
    message,
    createdAt: nowIso()
  };

  const events = state.eventsByDeploymentId.get(deploymentId) ?? [];
  events.push(event);
  state.eventsByDeploymentId.set(deploymentId, events);
  state.emitter.emit(`status:${deploymentId}`, event);

  // Ensure the event is persisted before we return so clients don't briefly see stale
  // "complete" events from a previous run (important when a deploymentId is reused).
  await deploymentsCol.doc(deploymentId).collection("events").doc(event.id).set(stripUndefined(event));

  return updated;
}

export async function updateDeploymentById(
  deploymentId: string,
  partial: Partial<DeploymentRecord>
): Promise<DeploymentRecord> {
  const deployment = await getDeploymentById(deploymentId);
  if (!deployment) {
    throw new Error("Deployment not found");
  }
  const updated: DeploymentRecord = {
    ...deployment,
    ...partial,
    updatedAt: nowIso()
  };
  await deploymentsCol.doc(deploymentId).set(stripUndefined(updated), { merge: true });
  return updated;
}

export function getLatestEvent(deploymentId: string): DeploymentEvent | null {
  const events = state.eventsByDeploymentId.get(deploymentId) ?? [];
  return events.length > 0 ? events[events.length - 1] : null;
}

export async function getLatestPersistedEvent(deploymentId: string): Promise<DeploymentEvent | null> {
  const snap = await deploymentsCol
    .doc(deploymentId)
    .collection("events")
    .orderBy("createdAt", "desc")
    .limit(1)
    .get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  return withDocId(doc.id, doc.data() as DeploymentEvent);
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
  state.jobs.push(job);
  return job;
}

export async function saveCheckoutSession(sessionId: string, payload: CheckoutSession) {
  await checkoutCol.doc(sessionId).set(stripUndefined(payload));
}

export async function getCheckoutSession(sessionId: string): Promise<CheckoutSession | null> {
  const doc = await checkoutCol.doc(sessionId).get();
  if (!doc.exists) return null;
  return doc.data() as CheckoutSession;
}

export async function popNextJob(): Promise<DeploymentJob | null> {
  return state.jobs.shift() ?? null;
}

export async function reserveWarmSlot(deploymentId: string): Promise<WarmSlot | null> {
  const candidate = [...state.warmSlots.values()].find((slot) => slot.state === "warm_available");
  if (!candidate) {
    return null;
  }

  const updated: WarmSlot = {
    ...candidate,
    state: "reserved",
    assignedDeploymentId: deploymentId,
    updatedAt: nowIso()
  };
  state.warmSlots.set(updated.id, updated);

  const deployment = await getDeploymentById(deploymentId);
  if (deployment) {
    const updatedDeployment: DeploymentRecord = {
      ...deployment,
      runtimeSlotId: updated.id,
      updatedAt: nowIso()
    };
    await deploymentsCol.doc(deploymentId).set(stripUndefined(updatedDeployment), { merge: true });
  }

  return updated;
}

export async function markSlotState(slotId: string, nextState: WarmSlot["state"]) {
  const slot = state.warmSlots.get(slotId);
  if (!slot) {
    return;
  }
  state.warmSlots.set(slotId, {
    ...slot,
    state: nextState,
    updatedAt: nowIso()
  });
}

export async function releaseWarmSlot(slotId: string) {
  const slot = state.warmSlots.get(slotId);
  if (!slot) {
    return;
  }
  state.warmSlots.set(slotId, {
    ...slot,
    state: "warm_available",
    assignedDeploymentId: null,
    updatedAt: nowIso()
  });
}

export async function refillWarmPool() {
  const warmCount = [...state.warmSlots.values()].filter(
    (slot) => slot.state === "warm_available"
  ).length;

  for (let i = warmCount; i < env.WARM_POOL_SIZE; i += 1) {
    const id = makeId("slot");
    const current = nowIso();
    state.warmSlots.set(id, {
      id,
      state: "warm_available",
      assignedDeploymentId: null,
      createdAt: current,
      updatedAt: current
    });
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
    await usageCol.doc(deploymentId).set(stripUndefined(updated), { merge: true });
    return updated;
  }

  // Default to "unknown" (0) until we can sync from OpenRouter. Avoid fake numbers.
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
  await usageCol.doc(deploymentId).set(stripUndefined(created));
  return created;
}

export async function getUsage(deploymentId: string): Promise<UsageRecord | null> {
  const doc = await usageCol.doc(deploymentId).get();
  if (!doc.exists) return null;
  return doc.data() as UsageRecord;
}

export async function addCredits(deploymentId: string, amountUnits: number): Promise<UsageRecord> {
  const usage = await upsertUsage(deploymentId);
  return upsertUsage(deploymentId, {
    limitTotal: usage.limitTotal + amountUnits,
    limitRemaining: usage.limitRemaining + amountUnits
  });
}

export function listWarmSlots() {
  return [...state.warmSlots.values()];
}

export async function isGumroadSaleProcessed(saleId: string): Promise<boolean> {
  const doc = await processedGumroadCol.doc(saleId).get();
  return doc.exists;
}

export async function markGumroadSaleProcessed(saleId: string) {
  await processedGumroadCol.doc(saleId).set({ id: saleId, createdAt: nowIso() });
}

export async function isRazorpayPaymentProcessed(id: string): Promise<boolean> {
  const doc = await processedRazorpayCol.doc(id).get();
  return doc.exists;
}

export async function markRazorpayPaymentProcessed(id: string) {
  await processedRazorpayCol.doc(id).set({ id, createdAt: nowIso() });
}

export async function isPayPalOrderProcessed(orderId: string): Promise<boolean> {
  const doc = await processedPayPalCol.doc(orderId).get();
  return doc.exists;
}

export async function markPayPalOrderProcessed(orderId: string) {
  await processedPayPalCol.doc(orderId).set({ id: orderId, createdAt: nowIso() });
}

export async function isDodoEventProcessed(eventId: string): Promise<boolean> {
  const doc = await processedDodoCol.doc(eventId).get();
  return doc.exists;
}

export async function markDodoEventProcessed(eventId: string) {
  await processedDodoCol.doc(eventId).set({ id: eventId, createdAt: nowIso() });
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
  await openrouterKeysCol.doc(input.deploymentId).set(
    stripUndefined({
      userId: input.userId,
      deploymentId: input.deploymentId,
      encryptedKey: input.encryptedKey,
      keyId: input.keyId ?? null,
      keyHash: input.keyHash ?? null,
      limitUsd: input.limitUsd ?? null,
      limitRemaining: input.limitRemaining ?? null,
      updatedAt: nowIso()
    })
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
  const doc = await openrouterKeysCol.doc(deploymentId).get();
  if (!doc.exists) return null;
  return doc.data() as {
    userId: string;
    deploymentId: string;
    encryptedKey: string;
    keyId?: string | null;
    limitUsd?: number | null;
    limitRemaining?: number | null;
  };
}

export async function saveXConnection(
  input: Omit<XConnectionRecord, "createdAt" | "updatedAt"> & { createdAt?: string; updatedAt?: string }
) {
  const existing = await getXConnectionByDeploymentId(input.deploymentId);
  const createdAt = existing?.createdAt ?? input.createdAt ?? nowIso();
  const updatedAt = input.updatedAt ?? nowIso();

  const payload: XConnectionRecord = {
    deploymentId: input.deploymentId,
    userId: input.userId,
    xUserId: input.xUserId,
    username: input.username,
    name: input.name ?? null,
    encryptedAccessToken: input.encryptedAccessToken,
    encryptedRefreshToken: input.encryptedRefreshToken ?? null,
    tokenType: input.tokenType,
    scope: input.scope,
    expiresAt: input.expiresAt ?? null,
    createdAt,
    updatedAt
  };

  await xConnectionsCol.doc(input.deploymentId).set(stripUndefined(payload), { merge: true });
  return payload;
}

export async function getXConnectionByDeploymentId(deploymentId: string): Promise<XConnectionRecord | null> {
  const doc = await xConnectionsCol.doc(deploymentId).get();
  if (!doc.exists) return null;
  return doc.data() as XConnectionRecord;
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
    expiresAt: input.expiresAt !== undefined ? input.expiresAt : existing.expiresAt,
    scope: input.scope ?? existing.scope,
    updatedAt: nowIso()
  };
  await xConnectionsCol.doc(deploymentId).set(stripUndefined(updated), { merge: true });
  return updated;
}

export async function saveXOAuthState(
  input: Omit<XOAuthStateRecord, "createdAt"> & { createdAt?: string }
) {
  const payload: XOAuthStateRecord = {
    ...input,
    createdAt: input.createdAt ?? nowIso()
  };
  await xOAuthStatesCol.doc(payload.state).set(stripUndefined(payload));
  return payload;
}

export async function consumeXOAuthState(stateId: string): Promise<XOAuthStateRecord | null> {
  const ref = xOAuthStatesCol.doc(stateId);
  const doc = await ref.get();
  if (!doc.exists) return null;
  const data = doc.data() as XOAuthStateRecord;
  await ref.delete();
  return data;
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
  await deploymentsCol
    .doc(message.deploymentId)
    .collection("messages")
    .doc(message.id)
    .set(stripUndefined(message));
  return message;
}

export async function listChatMessages(deploymentId: string, limit = 50): Promise<ChatMessageRecord[]> {
  const snap = await deploymentsCol
    .doc(deploymentId)
    .collection("messages")
    .orderBy("createdAt", "asc")
    .limit(Math.max(1, Math.min(200, limit)))
    .get();
  if (snap.empty) return [];
  return snap.docs.map((doc) => withDocId(doc.id, doc.data() as ChatMessageRecord));
}
