"use client";

import { useEffect, useMemo, useState } from "react";
import { signInWithPopup, signOut } from "firebase/auth";
import { toast } from "sonner";
import { getFirebaseAuth, googleProvider } from "@/lib/firebase-client";
import type { CheckUserResponse, DeploymentStatus, ModelId } from "@/lib/types";

type SessionUser = {
  email: string;
  name: string;
  photoURL?: string | null;
};

const modelOptions: { id: ModelId; name: string; image: string }[] = [
  {
    id: "openrouter/anthropic/claude-opus-4.5",
    name: "Claude Opus 4.5",
    image: "https://upload.wikimedia.org/wikipedia/commons/b/b0/Claude_AI_symbol.svg"
  },
  {
    id: "openrouter/openai/gpt-5.2",
    name: "GPT-5.2",
    image: "https://img.icons8.com/androidL/512/FFFFFF/chatgpt.png"
  },
  {
    id: "openrouter/google/gemini-3-flash-preview",
    name: "Gemini 3 Flash",
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1d/Google_Gemini_icon_2025.svg/960px-Google_Gemini_icon_2025.svg.png"
  }
];

const channelOptions = [
  {
    id: "telegram",
    name: "Telegram",
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/8/82/Telegram_logo.svg/960px-Telegram_logo.svg.png",
    enabled: true
  },
  {
    id: "discord",
    name: "Discord",
    image: "https://scbwi-storage-prod.s3.amazonaws.com/images/discord-mark-blue_rA6tXJo.png",
    enabled: false
  },
  {
    id: "whatsapp",
    name: "WhatsApp",
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6b/WhatsApp.svg/960px-WhatsApp.svg.png",
    enabled: false
  }
] as const;

const statusCopy: Record<DeploymentStatus, string> = {
  setup_started: "Payment received. Setting up your OpenClaw runtime.",
  setup_complete: "Runtime setup complete. Starting Telegram pairing.",
  telegram_pairing_started: "Waiting for first Telegram DM to complete pairing.",
  telegram_pairing_complete: "Telegram connected. Your deployment is ready.",
  setup_error: "Setup failed. Please contact support.",
  pairing_error: "Pairing failed. Re-open Telegram connection and retry."
};

function readUser() {
  if (typeof window === "undefined") {
    return null;
  }
  const raw = window.localStorage.getItem("simpleclaw_user");
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as SessionUser;
  } catch {
    return null;
  }
}

function saveUser(user: SessionUser | null) {
  if (typeof window === "undefined") {
    return;
  }
  if (!user) {
    window.localStorage.removeItem("simpleclaw_user");
    return;
  }
  window.localStorage.setItem("simpleclaw_user", JSON.stringify(user));
}

function OptionCard({
  selected,
  title,
  image,
  onClick,
  disabled,
  badge
}: {
  selected: boolean;
  title: string;
  image: string;
  onClick: () => void;
  disabled?: boolean;
  badge?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`options-card ${selected ? "selected" : ""} transition-all duration-300 rounded-xl py-3 px-4 flex flex-row items-center gap-2 w-full sm:w-[220px]`}>
      <img src={image} alt="" className="h-5 w-5 object-contain" />
      <span className={`text-sm font-medium ${selected ? "text-white" : "text-zinc-400"}`}>{title}</span>
      {badge ? <span className="ml-auto text-[11px] text-zinc-400">{badge}</span> : null}
    </button>
  );
}

function TelegramModal({
  open,
  token,
  onToken,
  onClose,
  onSave
}: {
  open: boolean;
  token: string;
  onToken: (next: string) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-40 bg-black/70 px-4 py-10">
      <div className="mx-auto max-w-xl panel p-6 flex flex-col gap-4">
        <h2 className="text-xl font-semibold">Connect Telegram</h2>
        <ol className="list-decimal pl-5 text-sm text-zinc-300 space-y-1">
          <li>
            Open Telegram and go to <a href="https://t.me/BotFather" className="text-indigo-400">@BotFather</a>
          </li>
          <li>Type /newbot and follow the prompts.</li>
          <li>Paste your bot token here and click Save &amp; Connect.</li>
        </ol>
        <input
          value={token}
          onChange={(event) => onToken(event.target.value)}
          placeholder="Enter bot token"
          className="w-full rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm"
        />
        <div className="flex gap-3 justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-zinc-700 px-4 py-2 text-sm">
            Cancel
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={!token.trim()}
            className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium disabled:opacity-60">
            Save &amp; Connect
          </button>
        </div>
      </div>
    </div>
  );
}

export function LandingApp() {
  const [selectedModel, setSelectedModel] = useState<ModelId>(modelOptions[0].id);
  const [selectedChannel, setSelectedChannel] = useState("telegram");
  const [telegramToken, setTelegramToken] = useState("");
  const [telegramModalOpen, setTelegramModalOpen] = useState(false);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [deploymentId, setDeploymentId] = useState<string | null>(null);
  const [status, setStatus] = useState<DeploymentStatus | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modelApiKey, setModelApiKey] = useState("");
  const [usage, setUsage] = useState<{ limit_total: number; limit_remaining: number } | null>(null);

  useEffect(() => {
    const cached = readUser();
    if (cached) {
      setUser(cached);
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const checkout = params.get("checkout");
    const creditPurchase = params.get("credit_purchase");
    if (checkout === "cancelled") {
      toast.error("Checkout cancelled. You can try again whenever you're ready.");
    }
    if (checkout === "success") {
      toast.success("Payment received! Setting up your deployment...");
    }
    if (creditPurchase === "cancelled") {
      toast.error("Credit purchase cancelled.");
    }
    if (creditPurchase === "success") {
      toast.success("Credits purchased successfully.");
    }
    if (checkout || creditPurchase) {
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  useEffect(() => {
    if (!user?.email) {
      return;
    }

    const check = async () => {
      const response = await fetch(`/api/check-user?email=${encodeURIComponent(user.email)}`);
      const payload = (await response.json()) as CheckUserResponse;
      if (payload.exists && payload.id) {
        setDeploymentId(payload.id);
        setStatus(payload.deployment_status ?? null);
      }
    };

    void check();
  }, [user?.email]);

  useEffect(() => {
    if (!deploymentId) {
      return;
    }
    const source = new EventSource(`/api/user-status/stream?rowId=${deploymentId}`);
    source.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as {
          deployment_status?: DeploymentStatus;
          message?: string;
        };
        if (payload.deployment_status) {
          setStatus(payload.deployment_status);
        }
        if (payload.message) {
          toast.info(payload.message);
        }
      } catch {
        // ignore malformed events
      }
    };
    source.onerror = () => source.close();
    return () => source.close();
  }, [deploymentId]);

  useEffect(() => {
    if (!deploymentId || status !== "telegram_pairing_complete") {
      return;
    }
    const loadUsage = async () => {
      const response = await fetch(`/api/api-usage?rowId=${deploymentId}`);
      const payload = (await response.json()) as {
        data?: { limit_total: number; limit_remaining: number };
      };
      if (payload.data) {
        setUsage(payload.data);
      }
    };

    void loadUsage();
  }, [deploymentId, status]);

  const canDeploy = useMemo(
    () => Boolean(user?.email && selectedChannel === "telegram" && telegramToken.trim()),
    [selectedChannel, telegramToken, user?.email]
  );

  const handleGoogleSignIn = async () => {
    const auth = getFirebaseAuth();

    if (!auth) {
      const email = window.prompt("Firebase is not configured. Enter your email to continue:");
      if (!email) {
        return;
      }
      const fallback = { email, name: email.split("@")[0], photoURL: null };
      setUser(fallback);
      saveUser(fallback);
      toast.success("Signed in (fallback mode)");
      return;
    }

    try {
      const result = await signInWithPopup(auth, googleProvider);
      const nextUser: SessionUser = {
        email: result.user.email ?? "",
        name: result.user.displayName ?? "User",
        photoURL: result.user.photoURL
      };
      setUser(nextUser);
      saveUser(nextUser);
      toast.success("Signed in successfully");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to sign in";
      if (message.includes("popup-closed-by-user")) {
        return;
      }
      toast.error(message);
    }
  };

  const handleSignOut = async () => {
    const auth = getFirebaseAuth();
    if (auth) {
      await signOut(auth);
    }
    saveUser(null);
    setUser(null);
    setDeploymentId(null);
    setStatus(null);
    toast.success("Signed out");
  };

  const handleDeploy = async () => {
    if (!user) {
      toast.error("Sign in first");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: user.name,
          email: user.email,
          cloud_plan: "2gb_50gb",
          credits_per_month: "15",
          default_model: selectedModel,
          channel: selectedChannel,
          telegram_bot_token: telegramToken,
          profile_picture: user.photoURL ?? null,
          model_api_key: modelApiKey.trim() || undefined
        })
      });

      const payload = (await response.json()) as { error?: string; url?: string; sessionId?: string };
      if (!response.ok || !payload.url) {
        throw new Error(payload.error ?? "Failed to start checkout");
      }
      window.location.href = payload.url;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not start checkout");
      setIsSubmitting(false);
    }
  };

  const handleCreditTopup = async () => {
    if (!deploymentId) {
      return;
    }
    const amountRaw = window.prompt("Top-up amount in USD (min $10)", "25");
    if (!amountRaw) {
      return;
    }
    const amount = Number(amountRaw);
    const response = await fetch("/api/checkout-credits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rowId: deploymentId, amount })
    });
    const payload = (await response.json()) as { error?: string; url?: string };
    if (!response.ok || !payload.url) {
      toast.error(payload.error ?? "Failed to start top-up checkout");
      return;
    }
    window.location.href = payload.url;
  };

  return (
    <main className="max-w-5xl mx-auto p-4 sm:p-8 flex flex-col gap-6">
      <header className="flex justify-between items-center">
        <h1 className="text-lg sm:text-xl font-semibold">SimpleClaw.com</h1>
        <a
          className="text-sm text-zinc-300 hover:text-white"
          href="mailto:savio@simpleclaw.com?subject=SimpleClaw%20Support%20Inquiry">
          Contact Support
        </a>
      </header>

      <section className="panel p-4 sm:p-8 space-y-6">
        <div>
          <h2 className="text-2xl sm:text-4xl font-semibold">Deploy OpenClaw under 1 minute</h2>
          <p className="mt-2 text-zinc-400">
            Avoid technical complexity and one-click deploy your own 24/7 OpenClaw runtime.
          </p>
        </div>

        <div className="space-y-3">
          <h3 className="text-base font-medium">Which model do you want as default?</h3>
          <div className="flex flex-col sm:flex-row gap-3">
            {modelOptions.map((model) => (
              <OptionCard
                key={model.id}
                selected={selectedModel === model.id}
                title={model.name}
                image={model.image}
                onClick={() => setSelectedModel(model.id)}
              />
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <h3 className="text-base font-medium">Which channel do you want to use for sending messages?</h3>
          <div className="flex flex-col sm:flex-row gap-3">
            {channelOptions.map((channel) => (
              <OptionCard
                key={channel.id}
                selected={selectedChannel === channel.id}
                title={channel.name}
                image={channel.image}
                disabled={!channel.enabled}
                badge={!channel.enabled ? "Coming soon" : undefined}
                onClick={() => {
                  if (!channel.enabled) {
                    return;
                  }
                  setSelectedChannel(channel.id);
                  setTelegramModalOpen(true);
                }}
              />
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm text-zinc-400">Optional: custom OpenRouter API key (hybrid mode)</label>
          <input
            value={modelApiKey}
            onChange={(event) => setModelApiKey(event.target.value)}
            placeholder="sk-or-v1-..."
            className="w-full rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm"
          />
        </div>

        <div className="space-y-2">
          {user ? (
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="text-sm text-zinc-300">
                Signed in as <span className="text-white">{user.email}</span>
              </p>
              <button type="button" onClick={handleSignOut} className="text-sm text-zinc-300 underline">
                Sign out
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleGoogleSignIn}
              className="bg-white text-black font-medium text-sm sm:text-base px-5 py-2.5 w-full rounded-lg">
              Sign in with Google
            </button>
          )}

          <button
            type="button"
            disabled={!canDeploy || isSubmitting}
            onClick={handleDeploy}
            className="w-full rounded-lg bg-indigo-500 px-5 py-2.5 font-medium disabled:opacity-60">
            {isSubmitting ? "Starting checkout..." : "Deploy now"}
          </button>

          <p className="text-sm text-zinc-400">
            Sign in to deploy your AI assistant and connect your channels. Limited cloud servers — only 18 left
          </p>
        </div>
      </section>

      {status ? (
        <section className="panel p-4 sm:p-6 space-y-3">
          <h3 className="text-lg font-semibold">Deployment status</h3>
          <p className="text-zinc-300">{statusCopy[status]}</p>
          <p className="text-xs text-zinc-500">Current: {status}</p>

          {status === "telegram_pairing_complete" && usage ? (
            <div className="rounded-lg border border-zinc-700 p-4 space-y-2">
              <p className="text-sm text-zinc-300">Monthly quota: {usage.limit_total.toLocaleString()} tokens</p>
              <p className="text-sm text-zinc-300">
                Remaining: <span className="text-white">{usage.limit_remaining.toLocaleString()}</span>
              </p>
              <button
                type="button"
                onClick={handleCreditTopup}
                className="rounded bg-zinc-100 text-zinc-900 px-3 py-1 text-sm font-medium">
                Purchase extra credits
              </button>
            </div>
          ) : null}
        </section>
      ) : null}

      <TelegramModal
        open={telegramModalOpen}
        token={telegramToken}
        onToken={setTelegramToken}
        onClose={() => setTelegramModalOpen(false)}
        onSave={() => {
          setTelegramModalOpen(false);
          toast.success("Telegram connected", {
            description: "Your bot is now linked. You are ready to send & receive messages."
          });
        }}
      />
    </main>
  );
}
