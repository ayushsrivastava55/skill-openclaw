export type ModelId =
  | "openrouter/anthropic/claude-opus-4.5"
  | "openrouter/openai/gpt-5.2"
  | "openrouter/google/gemini-3-flash-preview";

export type ChannelId = "telegram" | "discord" | "whatsapp";

export type DeploymentStatus =
  | "setup_started"
  | "setup_complete"
  | "telegram_pairing_started"
  | "telegram_pairing_complete"
  | "setup_error"
  | "pairing_error";

export type BillingType = "deploy" | "credits";

export interface UserRecord {
  id: string;
  email: string;
  name: string;
  photoURL: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DeploymentRecord {
  id: string;
  userId: string;
  selectedModel: ModelId;
  channel: ChannelId;
  encryptedTelegramToken: string;
  encryptedModelApiKey: string | null;
  status: DeploymentStatus;
  runtimeSlotId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DeploymentEvent {
  id: string;
  deploymentId: string;
  status: DeploymentStatus;
  message?: string;
  createdAt: string;
}

export interface UsageRecord {
  deploymentId: string;
  limitTotal: number;
  limitRemaining: number;
  periodStart: string;
  periodEnd: string;
  updatedAt: string;
}

export interface WarmSlot {
  id: string;
  state: "warm_available" | "reserved" | "configuring" | "active";
  assignedDeploymentId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DeploymentJob {
  id: string;
  deploymentId: string;
  stripeSessionId: string;
  createdAt: string;
}

export interface CheckUserResponse {
  exists: boolean;
  id?: string;
  deployment_status?: DeploymentStatus;
}

export interface UserStatusStreamEvent {
  deployment_status?: DeploymentStatus;
  error?: string;
  message?: string;
  createdAt: string;
}
