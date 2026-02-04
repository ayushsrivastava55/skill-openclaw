import { EventEmitter } from "events";
import { env } from "@/lib/env";
import { makeId, nowIso } from "@/lib/security";
import type {
  DeploymentEvent,
  DeploymentJob,
  DeploymentRecord,
  DeploymentStatus,
  UsageRecord,
  UserRecord,
  WarmSlot
} from "@/lib/types";

type State = {
  usersByEmail: Map<string, UserRecord>;
  usersById: Map<string, UserRecord>;
  deploymentsByUserId: Map<string, DeploymentRecord>;
  deploymentsById: Map<string, DeploymentRecord>;
  usageByDeploymentId: Map<string, UsageRecord>;
  eventsByDeploymentId: Map<string, DeploymentEvent[]>;
  jobs: DeploymentJob[];
  checkoutSessionMap: Map<string, { deploymentId: string; type: "deploy" | "credits"; amount?: number }>;
  warmSlots: Map<string, WarmSlot>;
  emitter: EventEmitter;
};

declare global {
  // eslint-disable-next-line no-var
  var __simpleClawState: State | undefined;
}

function createState(): State {
  const state: State = {
    usersByEmail: new Map(),
    usersById: new Map(),
    deploymentsByUserId: new Map(),
    deploymentsById: new Map(),
    usageByDeploymentId: new Map(),
    eventsByDeploymentId: new Map(),
    jobs: [],
    checkoutSessionMap: new Map(),
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

export function upsertUser(input: Pick<UserRecord, "email" | "name" | "photoURL">): UserRecord {
  const existing = state.usersByEmail.get(input.email);
  const current = nowIso();
  if (existing) {
    const updated: UserRecord = { ...existing, ...input, updatedAt: current };
    state.usersByEmail.set(input.email, updated);
    state.usersById.set(updated.id, updated);
    return updated;
  }

  const created: UserRecord = {
    id: makeId("user"),
    email: input.email,
    name: input.name,
    photoURL: input.photoURL,
    createdAt: current,
    updatedAt: current
  };
  state.usersByEmail.set(created.email, created);
  state.usersById.set(created.id, created);
  return created;
}

export function getUserByEmail(email: string): UserRecord | null {
  return state.usersByEmail.get(email) ?? null;
}

export function getDeploymentByUserId(userId: string): DeploymentRecord | null {
  return state.deploymentsByUserId.get(userId) ?? null;
}

export function getDeploymentById(deploymentId: string): DeploymentRecord | null {
  return state.deploymentsById.get(deploymentId) ?? null;
}

export function createOrReplaceDeployment(
  data: Omit<DeploymentRecord, "id" | "createdAt" | "updatedAt" | "status" | "runtimeSlotId"> & {
    status?: DeploymentStatus;
  }
): DeploymentRecord {
  const existing = state.deploymentsByUserId.get(data.userId);
  const current = nowIso();

  if (existing) {
    const updated: DeploymentRecord = {
      ...existing,
      ...data,
      status: data.status ?? existing.status,
      updatedAt: current
    };
    state.deploymentsByUserId.set(updated.userId, updated);
    state.deploymentsById.set(updated.id, updated);
    return updated;
  }

  const created: DeploymentRecord = {
    id: makeId("dep"),
    userId: data.userId,
    selectedModel: data.selectedModel,
    channel: data.channel,
    encryptedTelegramToken: data.encryptedTelegramToken,
    encryptedModelApiKey: data.encryptedModelApiKey,
    status: data.status ?? "setup_started",
    runtimeSlotId: null,
    createdAt: current,
    updatedAt: current
  };
  state.deploymentsByUserId.set(created.userId, created);
  state.deploymentsById.set(created.id, created);
  return created;
}

export function updateDeploymentStatus(
  deploymentId: string,
  status: DeploymentStatus,
  message?: string
): DeploymentRecord {
  const deployment = state.deploymentsById.get(deploymentId);
  if (!deployment) {
    throw new Error("Deployment not found");
  }

  const updated: DeploymentRecord = { ...deployment, status, updatedAt: nowIso() };
  state.deploymentsById.set(deploymentId, updated);
  state.deploymentsByUserId.set(updated.userId, updated);

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

  return updated;
}

export function getLatestEvent(deploymentId: string): DeploymentEvent | null {
  const events = state.eventsByDeploymentId.get(deploymentId) ?? [];
  return events.length > 0 ? events[events.length - 1] : null;
}

export function subscribeDeployment(
  deploymentId: string,
  callback: (event: DeploymentEvent) => void
): () => void {
  const channel = `status:${deploymentId}`;
  state.emitter.on(channel, callback);
  return () => state.emitter.off(channel, callback);
}

export function queueDeploymentJob(deploymentId: string, stripeSessionId: string): DeploymentJob {
  const job: DeploymentJob = {
    id: makeId("job"),
    deploymentId,
    stripeSessionId,
    createdAt: nowIso()
  };
  state.jobs.push(job);
  return job;
}

export function saveCheckoutSession(
  sessionId: string,
  payload: { deploymentId: string; type: "deploy" | "credits"; amount?: number }
) {
  state.checkoutSessionMap.set(sessionId, payload);
}

export function getCheckoutSession(sessionId: string) {
  return state.checkoutSessionMap.get(sessionId) ?? null;
}

export function popNextJob(): DeploymentJob | null {
  return state.jobs.shift() ?? null;
}

export function reserveWarmSlot(deploymentId: string): WarmSlot | null {
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

  const deployment = getDeploymentById(deploymentId);
  if (deployment) {
    const updatedDeployment = {
      ...deployment,
      runtimeSlotId: updated.id,
      updatedAt: nowIso()
    };
    state.deploymentsById.set(deploymentId, updatedDeployment);
    state.deploymentsByUserId.set(updatedDeployment.userId, updatedDeployment);
  }

  return updated;
}

export function markSlotState(slotId: string, nextState: WarmSlot["state"]) {
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

export function releaseWarmSlot(slotId: string) {
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

export function refillWarmPool() {
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

export function upsertUsage(deploymentId: string, partial?: Partial<UsageRecord>): UsageRecord {
  const existing = state.usageByDeploymentId.get(deploymentId);
  const current = nowIso();
  if (existing) {
    const updated: UsageRecord = {
      ...existing,
      ...partial,
      updatedAt: current
    };
    state.usageByDeploymentId.set(deploymentId, updated);
    return updated;
  }

  const created: UsageRecord = {
    deploymentId,
    limitTotal: partial?.limitTotal ?? 150000,
    limitRemaining: partial?.limitRemaining ?? 150000,
    periodStart: partial?.periodStart ?? current,
    periodEnd: partial?.periodEnd ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: current
  };
  state.usageByDeploymentId.set(deploymentId, created);
  return created;
}

export function getUsage(deploymentId: string): UsageRecord | null {
  return state.usageByDeploymentId.get(deploymentId) ?? null;
}

export function addCredits(deploymentId: string, amountUnits: number): UsageRecord {
  const usage = upsertUsage(deploymentId);
  return upsertUsage(deploymentId, {
    limitTotal: usage.limitTotal + amountUnits,
    limitRemaining: usage.limitRemaining + amountUnits
  });
}

export function listWarmSlots() {
  return [...state.warmSlots.values()];
}
