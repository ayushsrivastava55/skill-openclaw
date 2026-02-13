export type ModelId =
  | "openrouter/anthropic/claude-opus-4.5"
  | "openrouter/anthropic/claude-opus-4.6"
  | "openrouter/minimax/minimax-m2.1"
  | "openrouter/moonshotai/kimi-k2.5"
  | "openrouter/openai/gpt-5.2"
  | "openrouter/google/gemini-3-flash-preview"
  | "openai/codex-mini-latest"
  | "openai/gpt-4"
  | "openai/gpt-4-turbo"
  | "openai/gpt-4.1"
  | "openai/gpt-4.1-mini"
  | "openai/gpt-4.1-nano"
  | "openai/gpt-4o"
  | "openai/gpt-4o-2024-05-13"
  | "openai/gpt-4o-2024-08-06"
  | "openai/gpt-4o-2024-11-20"
  | "openai/gpt-4o-mini"
  | "openai/gpt-5"
  | "openai/gpt-5-chat-latest"
  | "openai/gpt-5-codex"
  | "openai/gpt-5-mini"
  | "openai/gpt-5-nano"
  | "openai/gpt-5-pro"
  | "openai/gpt-5.1"
  | "openai/gpt-5.1-chat-latest"
  | "openai/gpt-5.1-codex"
  | "openai/gpt-5.1-codex-max"
  | "openai/gpt-5.1-codex-mini"
  | "openai/gpt-5.2"
  | "openai/gpt-5.2-chat-latest"
  | "openai/gpt-5.2-codex"
  | "openai/gpt-5.2-pro"
  | "openai/gpt-5.3-codex"
  | "openai/o1"
  | "openai/o1-pro"
  | "openai/o3"
  | "openai/o3-deep-research"
  | "openai/o3-mini"
  | "openai/o3-pro"
  | "openai/o4-mini"
  | "openai/o4-mini-deep-research"
  | "moonshot/kimi-k2.5"
  | "nvidia/moonshotai/kimi-k2.5";

export type ChannelId = "telegram" | "discord" | "slack";
export type PlanId = "starter" | "pro";
export type ModelProviderId = "openrouter" | "openai" | "moonshot" | "nvidia";

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
  currentDeploymentId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DeploymentRecord {
  id: string;
  userId: string;
  plan: PlanId;
  modelProvider?: ModelProviderId | null;
  selectedModel: ModelId;
  channel: ChannelId;
  encryptedChannelPrimaryToken: string;
  encryptedChannelSecondaryToken: string | null;
  encryptedModelApiKey: string | null;
  billingInterval?: "monthly" | "yearly" | null;
  paymentProvider?: "dodo" | "paypal" | "razorpay" | "mock" | null;
  checkoutSessionId?: string | null;
  subscriptionId?: string | null;
  subscriptionStatus?: string | null;
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
  paymentReference: string;
  createdAt: string;
}

export interface CheckUserResponse {
  exists: boolean;
  id?: string;
  deployment_status?: DeploymentStatus;
  plan?: PlanId;
  channel?: ChannelId;
  created_at?: string;
  subscription_id?: string | null;
  subscription_status?: string | null;
}

export type ChatRole = "user" | "assistant";

export interface ChatMessageRecord {
  id: string;
  deploymentId: string;
  sessionId: string;
  role: ChatRole;
  text: string;
  createdAt: string;
}

export interface UserStatusStreamEvent {
  deployment_status?: DeploymentStatus;
  error?: string;
  message?: string;
  createdAt: string;
}
