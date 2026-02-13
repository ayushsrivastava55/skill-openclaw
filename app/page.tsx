"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { signInWithPopup, signOut } from "firebase/auth";
import { toast } from "sonner";
import { CheckCircle2, Globe, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { getFirebaseAuth, getFirebaseIdToken, googleProvider } from "@/lib/firebase-client";
import type { ModelId } from "@/lib/types";

type SessionUser = {
  email: string;
  name: string;
  photoURL?: string | null;
};

type ModelProviderId = "openrouter" | "openai" | "moonshot" | "nvidia";

const OPENROUTER_MODEL_OPTIONS: { id: ModelId; label: string; group: string }[] = [
  { id: "openrouter/openai/gpt-5.2", label: "OpenAI (GPT-5.2)", group: "OpenAI" },
  { id: "openrouter/anthropic/claude-opus-4.5", label: "Anthropic (Claude Opus 4.5)", group: "Anthropic" },
  { id: "openrouter/anthropic/claude-opus-4.6", label: "Anthropic (Claude Opus 4.6)", group: "Anthropic" },
  { id: "openrouter/google/gemini-3-flash-preview", label: "Google (Gemini 3 Flash)", group: "Google" },
  { id: "openrouter/moonshotai/kimi-k2.5", label: "Moonshot (Kimi K2.5)", group: "China" },
  { id: "openrouter/minimax/minimax-m2.1", label: "MiniMax (M2.1)", group: "China" }
];

const OPENAI_MODEL_OPTIONS: { id: ModelId; label: string; group: string }[] = [
  { id: "openai/gpt-5.2", label: "GPT-5.2", group: "GPT-5" },
  { id: "openai/gpt-5.2-chat-latest", label: "GPT-5.2 Chat (latest)", group: "GPT-5" },
  { id: "openai/gpt-5.2-pro", label: "GPT-5.2 Pro", group: "GPT-5" },
  { id: "openai/gpt-5.2-codex", label: "GPT-5.2 Codex", group: "Codex" },
  { id: "openai/gpt-5.1", label: "GPT-5.1", group: "GPT-5" },
  { id: "openai/gpt-5.1-chat-latest", label: "GPT-5.1 Chat (latest)", group: "GPT-5" },
  { id: "openai/gpt-5.1-codex", label: "GPT-5.1 Codex", group: "Codex" },
  { id: "openai/gpt-5.1-codex-max", label: "GPT-5.1 Codex Max", group: "Codex" },
  { id: "openai/gpt-5.1-codex-mini", label: "GPT-5.1 Codex Mini", group: "Codex" },
  { id: "openai/gpt-5", label: "GPT-5", group: "GPT-5" },
  { id: "openai/gpt-5-chat-latest", label: "GPT-5 Chat (latest)", group: "GPT-5" },
  { id: "openai/gpt-5-pro", label: "GPT-5 Pro", group: "GPT-5" },
  { id: "openai/gpt-5-mini", label: "GPT-5 Mini", group: "GPT-5" },
  { id: "openai/gpt-5-nano", label: "GPT-5 Nano", group: "GPT-5" },
  { id: "openai/gpt-5-codex", label: "GPT-5 Codex", group: "Codex" },
  { id: "openai/gpt-5.3-codex", label: "GPT-5.3 Codex", group: "Codex" },

  { id: "openai/gpt-4.1", label: "GPT-4.1", group: "GPT-4" },
  { id: "openai/gpt-4.1-mini", label: "GPT-4.1 Mini", group: "GPT-4" },
  { id: "openai/gpt-4.1-nano", label: "GPT-4.1 Nano", group: "GPT-4" },
  { id: "openai/gpt-4o", label: "GPT-4o", group: "GPT-4" },
  { id: "openai/gpt-4o-mini", label: "GPT-4o Mini", group: "GPT-4" },
  { id: "openai/gpt-4o-2024-05-13", label: "GPT-4o (2024-05-13)", group: "GPT-4" },
  { id: "openai/gpt-4o-2024-08-06", label: "GPT-4o (2024-08-06)", group: "GPT-4" },
  { id: "openai/gpt-4o-2024-11-20", label: "GPT-4o (2024-11-20)", group: "GPT-4" },
  { id: "openai/gpt-4-turbo", label: "GPT-4 Turbo", group: "GPT-4" },
  { id: "openai/gpt-4", label: "GPT-4", group: "GPT-4" },

  { id: "openai/o4-mini", label: "o4-mini", group: "Reasoning (o-series)" },
  { id: "openai/o4-mini-deep-research", label: "o4-mini Deep Research", group: "Reasoning (o-series)" },
  { id: "openai/o3", label: "o3", group: "Reasoning (o-series)" },
  { id: "openai/o3-pro", label: "o3 Pro", group: "Reasoning (o-series)" },
  { id: "openai/o3-mini", label: "o3 Mini", group: "Reasoning (o-series)" },
  { id: "openai/o3-deep-research", label: "o3 Deep Research", group: "Reasoning (o-series)" },
  { id: "openai/o1", label: "o1", group: "Reasoning (o-series)" },
  { id: "openai/o1-pro", label: "o1 Pro", group: "Reasoning (o-series)" },

  { id: "openai/codex-mini-latest", label: "Codex Mini (latest)", group: "Codex" }
];

const MOONSHOT_MODEL_OPTIONS: { id: ModelId; label: string; group: string }[] = [
  { id: "moonshot/kimi-k2.5", label: "Kimi (K2.5)", group: "Moonshot" }
];

const NVIDIA_MODEL_OPTIONS: { id: ModelId; label: string; group: string }[] = [
  { id: "nvidia/moonshotai/kimi-k2.5", label: "Kimi (K2.5) via NVIDIA", group: "NVIDIA" }
];

function getModelProviderLabel(model: ModelId): string {
  if (model.startsWith("nvidia/")) return "NVIDIA";
  if (model.startsWith("moonshot/")) return "Moonshot";
  if (model.startsWith("openai/")) return "OpenAI";
  const provider = model.split("/")[1] ?? "";
  if (provider === "openai") return "OpenAI";
  if (provider === "anthropic") return "Anthropic";
  if (provider === "google") return "Google";
  if (provider === "moonshotai") return "Moonshot (Kimi)";
  if (provider === "minimax") return "MiniMax";
  return provider || "OpenRouter";
}

function readUser() {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem("clawpilot_user") ?? window.localStorage.getItem("simpleclaw_user");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SessionUser;
  } catch {
    return null;
  }
}

function saveUser(user: SessionUser | null) {
  if (typeof window === "undefined") return;
  if (!user) {
    window.localStorage.removeItem("clawpilot_user");
    window.localStorage.removeItem("simpleclaw_user");
    return;
  }
  window.localStorage.setItem("clawpilot_user", JSON.stringify(user));
}

function saveDeployPrefs(plan: "starter" | "pro" | null, interval: "monthly" | "yearly") {
  if (typeof window === "undefined") return;
  if (plan) {
    window.localStorage.setItem("quickclaw_plan", plan);
  }
  window.localStorage.setItem("quickclaw_billing_interval", interval);
}

function saveProvider(provider: ModelProviderId) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem("quickclaw_provider", provider);
}

function loadDeployPrefs() {
  if (typeof window === "undefined") return { plan: null as "starter" | "pro" | null, interval: "monthly" as const };
  const plan = window.localStorage.getItem("quickclaw_plan") as "starter" | "pro" | null;
  const interval =
    (window.localStorage.getItem("quickclaw_billing_interval") as "monthly" | "yearly" | null) ?? "monthly";
  return { plan, interval };
}

function loadSelectedModel(provider: ModelProviderId): ModelId {
  if (typeof window === "undefined") return "openrouter/openai/gpt-5.2";
  const raw = (window.localStorage.getItem("quickclaw_model") ?? "").trim();
  const options =
    provider === "moonshot"
      ? MOONSHOT_MODEL_OPTIONS
      : provider === "nvidia"
        ? NVIDIA_MODEL_OPTIONS
        : provider === "openai"
          ? OPENAI_MODEL_OPTIONS
          : OPENROUTER_MODEL_OPTIONS;
  if (options.some((option) => option.id === (raw as ModelId))) return raw as ModelId;
  if (provider === "moonshot") return "moonshot/kimi-k2.5";
  if (provider === "nvidia") return "nvidia/moonshotai/kimi-k2.5";
  if (provider === "openai") return "openai/gpt-5.1-codex";
  return "openrouter/openai/gpt-5.2";
}

async function ensureRazorpayLoaded(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (window.Razorpay) return true;

  await new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Razorpay checkout"));
    document.head.appendChild(script);
  }).catch(() => undefined);

  return Boolean(window.Razorpay);
}

export default function HomePage() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [existingAccount, setExistingAccount] = useState<boolean>(false);
  const [plan, setPlan] = useState<"starter" | "pro" | null>(null);
  const [billingInterval, setBillingInterval] = useState<"monthly" | "yearly">("monthly");
  const [channel, setChannel] = useState<"telegram" | "discord">("telegram");
  const [telegramToken, setTelegramToken] = useState("");
  const [discordToken, setDiscordToken] = useState("");
  const [modelProvider, setModelProvider] = useState<ModelProviderId>("openrouter");
  const [byokKey, setByokKey] = useState("");
  const [selectedModel, setSelectedModel] = useState<ModelId>("openrouter/openai/gpt-5.2");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const getAuthHeaders = async () => {
    const token = await getFirebaseIdToken();
    if (!token) {
      throw new Error("Sign in with Google to continue.");
    }
    return { Authorization: `Bearer ${token}` };
  };

  useEffect(() => {
    const cached = readUser();
    if (cached) {
      setUser(cached);
    }
    const prefs = loadDeployPrefs();
    if (prefs.plan) setPlan(prefs.plan);
    setBillingInterval(prefs.interval);
    const storedProvider = (window.localStorage.getItem("quickclaw_provider") as ModelProviderId | null) ?? "openrouter";
    const normalized: ModelProviderId =
      storedProvider === "moonshot"
        ? "moonshot"
        : storedProvider === "nvidia"
          ? "nvidia"
          : storedProvider === "openai"
            ? "openai"
            : "openrouter";
    setModelProvider(normalized);
    setSelectedModel(loadSelectedModel(normalized));
  }, []);

  useEffect(() => {
    // Pro always uses OpenRouter credits provisioning.
    if (plan === "pro") {
      setModelProvider("openrouter");
      saveProvider("openrouter");
      if (
        selectedModel.startsWith("moonshot/") ||
        selectedModel.startsWith("nvidia/") ||
        selectedModel.startsWith("openai/")
      ) {
        setSelectedModel("openrouter/openai/gpt-5.2");
      }
      return;
    }

    // Starter: keep model compatible with selected provider.
    const options =
      modelProvider === "moonshot"
        ? MOONSHOT_MODEL_OPTIONS
        : modelProvider === "nvidia"
          ? NVIDIA_MODEL_OPTIONS
          : modelProvider === "openai"
            ? OPENAI_MODEL_OPTIONS
          : OPENROUTER_MODEL_OPTIONS;
    if (!options.some((option) => option.id === selectedModel)) {
      setSelectedModel(
        modelProvider === "moonshot"
          ? "moonshot/kimi-k2.5"
          : modelProvider === "nvidia"
            ? "nvidia/moonshotai/kimi-k2.5"
            : modelProvider === "openai"
              ? "openai/gpt-5.1-codex"
            : "openrouter/openai/gpt-5.2"
      );
    }
    saveProvider(modelProvider);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, modelProvider]);

  useEffect(() => {
    if (!user?.email) return;

    const check = async () => {
      try {
        const authHeaders = await getAuthHeaders();
        const response = await fetch(`/api/check-user?email=${encodeURIComponent(user.email)}`, {
          headers: authHeaders
        });
        const payload = (await response.json().catch(() => ({}))) as { exists?: boolean };
        setExistingAccount(Boolean(response.ok && payload.exists));
      } catch {
        setExistingAccount(false);
      }
    };

    void check();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.email]);

  const handleGoogleSignIn = async () => {
    const auth = getFirebaseAuth();
    if (!auth) {
      toast.error("Google OAuth is not configured yet.");
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
      if (message.includes("popup-closed-by-user")) return;
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
    toast.success("Signed out");
  };

  const planPrice = (target: "starter" | "pro") => {
    if (target === "starter") {
      return billingInterval === "yearly" ? "$190/year" : "$19/month";
    }
    return billingInterval === "yearly" ? "$390/year" : "$39/month";
  };

  const handleDeploy = async () => {
    if (!plan) {
      toast.error("Pick a plan first.");
      return;
    }
    if (!user?.email) {
      toast.error("Sign in with Google to continue.");
      return;
    }

    const primaryToken = channel === "telegram" ? telegramToken.trim() : discordToken.trim();
    if (!primaryToken) {
      toast.error(channel === "telegram" ? "Add your Telegram bot token." : "Add your Discord bot token.");
      return;
    }

    const byok = byokKey.trim();
    if (plan === "starter" && !byok) {
      toast.error(
        modelProvider === "openai"
          ? "Starter requires your OpenAI API key."
          : modelProvider === "moonshot"
            ? "Starter requires your Moonshot API key."
            : modelProvider === "nvidia"
              ? "Starter requires your NVIDIA API key."
              : "Starter requires your OpenRouter API key."
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const authHeaders = await getAuthHeaders();

      const validateRes = await fetch("/api/tokens/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ channel, token: primaryToken })
      });
      if (!validateRes.ok) {
        const validatePayload = (await validateRes.json().catch(() => ({}))) as { error?: string };
        throw new Error(validatePayload.error ?? "Token validation failed");
      }

      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({
          name: user.name,
          email: user.email,
          plan,
          cloud_plan: "2gb_50gb",
          credits_per_month: "15",
          model_provider: plan === "starter" ? modelProvider : "openrouter",
          default_model: selectedModel,
          billing_interval: billingInterval,
          channel,
          telegram_bot_token: channel === "telegram" ? primaryToken : undefined,
          discord_bot_token: channel === "discord" ? primaryToken : undefined,
          profile_picture: user.photoURL ?? null,
          // Starter: BYOK (OpenRouter key). Pro: we provision a per-deployment OpenRouter key automatically.
          model_api_key: plan === "starter" ? byokKey : undefined
        })
      });

      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        url?: string;
        mode?: "mock" | "razorpay" | "paypal" | "dodo";
        keyId?: string;
        subscriptionId?: string;
        sessionId?: string;
        deploymentId?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to start checkout");
      }

      saveDeployPrefs(plan, billingInterval);
      try {
        window.localStorage.setItem("quickclaw_model", selectedModel);
      } catch {
        // ignore
      }

      if (payload.mode === "mock" && payload.url) {
        window.location.href = payload.url;
        return;
      }

      if (payload.mode === "paypal" && payload.url) {
        window.location.href = payload.url;
        return;
      }

      if (payload.mode === "dodo" && payload.url) {
        window.location.href = payload.url;
        return;
      }

      if (payload.mode !== "razorpay") {
        throw new Error("Payment provider not ready.");
      }
      if (!payload.keyId || !payload.subscriptionId || !payload.deploymentId) {
        throw new Error("Checkout missing required fields.");
      }
      const loaded = await ensureRazorpayLoaded();
      if (!loaded) {
        throw new Error("Razorpay checkout failed to load. Please try again.");
      }

      const options = {
        key: payload.keyId,
        subscription_id: payload.subscriptionId,
        name: "QuickClaw",
        description: `${plan.toUpperCase()} ${billingInterval.toUpperCase()} subscription`,
        image: "/quickclaw-logo.png",
        handler: async (response: {
          razorpay_payment_id?: string;
          razorpay_subscription_id?: string;
          razorpay_signature?: string;
        }) => {
          try {
            const verifyRes = await fetch("/api/razorpay/verify", {
              method: "POST",
              headers: { "Content-Type": "application/json", ...authHeaders },
              body: JSON.stringify({
                deploymentId: payload.deploymentId,
                type: "deploy",
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_subscription_id: response.razorpay_subscription_id,
                razorpay_signature: response.razorpay_signature
              })
            });
            if (!verifyRes.ok) {
              const verifyPayload = (await verifyRes.json().catch(() => ({}))) as { error?: string };
              throw new Error(verifyPayload.error ?? "Payment verification failed");
            }
            window.location.href = `/checkout/success?type=deploy&deploymentId=${payload.deploymentId}&captured=1&paidAt=${Date.now()}`;
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Payment verification failed");
            setIsSubmitting(false);
          }
        },
        modal: {
          ondismiss: () => setIsSubmitting(false)
        },
        notes: {
          deploymentId: payload.deploymentId
        },
        theme: {
          color: "#E63946"
        }
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rz = new (window.Razorpay as any)(options);
      rz.open();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not start checkout");
      setIsSubmitting(false);
    }
  };

  const deployReady = Boolean(
    plan &&
      user?.email &&
      (channel === "telegram" ? telegramToken.trim() : discordToken.trim()) &&
      (plan === "starter" ? byokKey.trim() : true)
  );

  return (
    <main className="relative min-h-screen">
      <div className="hero-grid absolute inset-0 opacity-20" />

      <header className="fixed left-0 right-0 top-0 z-50 border-b border-white/10 bg-void/80 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-6 px-6 py-4">
          <div className="flex items-center gap-4">
            <a href="/" className="relative h-12 w-12 rounded-2xl border border-pilot/40 bg-white/5">
              <Image src="/quickclaw-logo.png" alt="QuickClaw logo" fill className="object-contain p-1.5" priority />
            </a>
            <p className="font-heading text-base text-holo">QuickClaw</p>
          </div>

          <div className="flex items-center gap-4 text-sm">
            <a
              href="/dashboard"
              className="text-holo transition hover:text-pilot"
            >
              Dashboard
            </a>
            {user ? (
              <button
                type="button"
                onClick={handleSignOut}
                className="rounded-full border border-white/10 px-4 py-2 text-holo transition hover:border-pilot/40"
              >
                {user.email}
              </button>
            ) : (
              <button
                type="button"
                onClick={handleGoogleSignIn}
                className="rounded-full border border-white/10 px-4 py-2 text-holo transition hover:border-pilot/40"
              >
                Sign in
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="relative mx-auto min-h-screen w-full max-w-5xl px-6 pt-32 pb-16">
        {/* Hero */}
        <div className="mb-16 text-center">
          <h1 className="font-heading text-4xl text-holo md:text-5xl lg:text-6xl">
            Deploy OpenClaw in <span className="text-pilot text-glow">60 seconds</span>
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-base text-muted">
            No VPS. No CLI. No configuration. Just paste your bot token and go.
          </p>
          {existingAccount ? (
            <p className="mx-auto mt-4 max-w-xl text-sm text-muted">
              You already have a deployment. You can keep using this page to redeploy, or jump to{" "}
              <a className="text-pilot hover:text-pilot/80" href="/dashboard">
                Dashboard
              </a>
              .
            </p>
          ) : null}
        </div>

        {/* Main Card */}
        <Card className="overflow-hidden border-white/10 bg-panel bg-void/90">
          <div className="p-8 md:p-12">
            <div className="grid gap-12 lg:grid-cols-[1.2fr_0.8fr]">
              {/* Left: Configuration */}
              <div className="space-y-10">
                {/* Plan */}
                <div>
                  <label className="mb-4 block text-sm font-medium text-holo">Choose your plan</label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {(["starter", "pro"] as const).map((id) => {
                      const active = plan === id;
                      return (
                        <button
                          key={id}
                          onClick={() => setPlan(id)}
                          className={cn(
                            "group relative rounded-2xl border p-5 text-left transition-all",
                            active
                              ? "border-pilot bg-pilot/10 shadow-[0_0_20px_rgba(230,57,70,0.15)]"
                              : "border-white/10 bg-void/50 hover:border-pilot/40"
                          )}
                        >
                          <div className="flex items-start justify-between">
                            <div>
                              <p className="font-heading text-xl text-holo">{id === "starter" ? "Starter" : "Pro"}</p>
                              <p className="mt-1 text-xs uppercase tracking-wider text-muted">
                                {id === "starter" ? "Bring your own API key" : "Credits included"}
                              </p>
                            </div>
                            <div className={cn(
                              "h-5 w-5 rounded-full border-2 flex items-center justify-center transition-all",
                              active ? "border-pilot bg-pilot" : "border-white/20"
                            )}>
                              {active && <div className="h-2 w-2 rounded-full bg-white" />}
                            </div>
                          </div>
                          <p className="mt-3 text-base font-medium text-pilot">{planPrice(id)}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Billing */}
                <div>
                  <label className="mb-4 block text-sm font-medium text-holo">Billing cycle</label>
                  <div className="inline-flex rounded-2xl border border-white/10 bg-void/50 p-1">
                    {[
                      { id: "monthly" as const, label: "Monthly" },
                      { id: "yearly" as const, label: "Yearly", badge: "Save 2 months" }
                    ].map((option) => {
                      const active = billingInterval === option.id;
                      return (
                        <button
                          key={option.id}
                          onClick={() => setBillingInterval(option.id)}
                          className={cn(
                            "relative rounded-xl px-6 py-3 text-sm transition-all",
                            active ? "bg-pilot text-void font-medium" : "text-muted hover:text-holo"
                          )}
                        >
                          {option.label}
                          {option.badge && (
                            <span className="ml-2 text-xs opacity-75">{option.badge}</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* AI Provider / Model */}
                <div>
                  <label className="mb-2 block text-sm font-medium text-holo">AI provider</label>
                  <p className="mb-4 text-xs text-muted">
                    {plan === "pro"
                      ? "Pro uses a managed OpenRouter key. Pick a model."
                      : modelProvider === "openai"
                        ? "Starter uses your OpenAI key. Pick a model."
                      : modelProvider === "moonshot"
                        ? "Starter uses your Moonshot key. Pick Kimi."
                        : modelProvider === "nvidia"
                          ? "Starter uses your NVIDIA key (build.nvidia.com). Pick Kimi."
                        : "Starter uses your OpenRouter key. Pick a model."}
                  </p>
                  {plan === "starter" ? (
                    <div className="mb-4">
                      <label className="mb-2 block text-xs font-medium text-muted">Provider</label>
                      <select
                        value={modelProvider}
                        onChange={(e) => setModelProvider(e.target.value as ModelProviderId)}
                        className="w-full rounded-2xl border border-white/10 bg-void/50 px-5 py-4 text-holo focus:border-pilot focus:outline-none focus:ring-2 focus:ring-pilot/20"
                      >
                        <option value="openrouter">OpenRouter</option>
                        <option value="openai">OpenAI (direct)</option>
                        <option value="moonshot">Moonshot (Kimi)</option>
                        <option value="nvidia">NVIDIA (Kimi)</option>
                      </select>
                    </div>
                  ) : null}
                  <select
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value as ModelId)}
                    className="w-full rounded-2xl border border-white/10 bg-void/50 px-5 py-4 text-holo focus:border-pilot focus:outline-none focus:ring-2 focus:ring-pilot/20"
                  >
                    {Array.from(
                      new Set(
                        (
                          modelProvider === "moonshot"
                            ? MOONSHOT_MODEL_OPTIONS
                            : modelProvider === "nvidia"
                              ? NVIDIA_MODEL_OPTIONS
                              : modelProvider === "openai"
                                ? OPENAI_MODEL_OPTIONS
                              : OPENROUTER_MODEL_OPTIONS
                        ).map((m) => m.group)
                      )
                    ).map((group) => (
                      <optgroup key={group} label={group}>
                        {(
                          modelProvider === "moonshot"
                            ? MOONSHOT_MODEL_OPTIONS
                            : modelProvider === "nvidia"
                              ? NVIDIA_MODEL_OPTIONS
                              : modelProvider === "openai"
                                ? OPENAI_MODEL_OPTIONS
                              : OPENROUTER_MODEL_OPTIONS
                        )
                          .filter((m) => m.group === group)
                          .map((model) => (
                          <option key={model.id} value={model.id}>
                            {model.label}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>

                {/* Channel */}
                <div>
                  <label className="mb-4 block text-sm font-medium text-holo">Connect your channel</label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {[
                      { id: "telegram" as const, label: "Telegram" },
                      { id: "discord" as const, label: "Discord" }
                    ].map((option) => {
                      const active = channel === option.id;
                      return (
                        <button
                          key={option.id}
                          onClick={() => setChannel(option.id)}
                          className={cn(
                            "group rounded-2xl border p-4 text-left transition-all",
                            active
                              ? "border-pilot bg-pilot/10"
                              : "border-white/10 bg-void/50 hover:border-pilot/40"
                          )}
                        >
                          <div className="flex items-center justify-between">
                            <span className={cn(
                              "font-medium transition-colors",
                              active ? "text-holo" : "text-muted"
                            )}>{option.label}</span>
                            <div className={cn(
                              "h-4 w-4 rounded-full border-2 transition-all",
                              active ? "border-pilot bg-pilot" : "border-white/20"
                            )}>
                              {active && <div className="m-0.5 h-1.5 w-1.5 rounded-full bg-white" />}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Token Input */}
                <div>
                  <label className="mb-4 block text-sm font-medium text-holo">
                    {channel === "telegram" ? "Telegram bot token" : "Discord bot token"}
                  </label>
                  <input
                    value={channel === "telegram" ? telegramToken : discordToken}
                    onChange={(e) => channel === "telegram" ? setTelegramToken(e.target.value) : setDiscordToken(e.target.value)}
                    placeholder={channel === "telegram" ? "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11" : "Your Discord bot token"}
                    className="w-full rounded-2xl border border-white/10 bg-void/50 px-5 py-4 text-holo placeholder:text-muted/50 focus:border-pilot focus:outline-none focus:ring-2 focus:ring-pilot/20"
                  />
                  <a
                    href={channel === "telegram" ? "https://youtu.be/_w4VcagV8EA?si=CycjZHunuJ-JexUq" : "https://youtu.be/65SYyMP_klI?si=JorHHBRPnXU10zIx"}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 inline-flex items-center gap-2 text-xs text-pilot transition hover:text-pilot/80"
                  >
                    <Zap size={12} />
                    How to get your token
                  </a>
                </div>

                {/* Starter: BYOK */}
                {plan === "starter" ? (
                  <div>
                    <label className="mb-4 block text-sm font-medium text-holo">
                      {modelProvider === "openai"
                        ? "OpenAI API key (required)"
                        : modelProvider === "moonshot"
                          ? "Moonshot API key (required)"
                          : modelProvider === "nvidia"
                            ? "NVIDIA API key (required)"
                            : "OpenRouter API key (required)"}
                    </label>
                    <input
                      value={byokKey}
                      onChange={(e) => setByokKey(e.target.value)}
                      placeholder={
                        modelProvider === "openai"
                          ? "sk-..."
                          : modelProvider === "moonshot"
                            ? "sk-..."
                            : modelProvider === "nvidia"
                              ? "nvapi-..."
                              : "sk-or-..."
                      }
                      className="w-full rounded-2xl border border-white/10 bg-void/50 px-5 py-4 text-holo placeholder:text-muted/50 focus:border-pilot focus:outline-none focus:ring-2 focus:ring-pilot/20"
                    />
                    <p className="mt-3 text-xs text-muted">
                      Starter uses your{" "}
                      {modelProvider === "openai"
                        ? "OpenAI"
                        : modelProvider === "moonshot"
                          ? "Moonshot"
                          : modelProvider === "nvidia"
                            ? "NVIDIA"
                            : "OpenRouter"}{" "}
                      key. We store it encrypted at rest.
                    </p>
                    {modelProvider === "openrouter" ? (
                      <a
                        href="https://openrouter.ai/keys"
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-flex items-center gap-2 text-xs text-pilot transition hover:text-pilot/80"
                      >
                        <Zap size={12} />
                        Get an OpenRouter key
                      </a>
                    ) : modelProvider === "openai" ? (
                      <a
                        href="https://platform.openai.com/api-keys"
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-flex items-center gap-2 text-xs text-pilot transition hover:text-pilot/80"
                      >
                        <Zap size={12} />
                        Get an OpenAI key
                      </a>
                    ) : modelProvider === "nvidia" ? (
                      <a
                        href="https://build.nvidia.com/"
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-flex items-center gap-2 text-xs text-pilot transition hover:text-pilot/80"
                      >
                        <Zap size={12} />
                        Get an NVIDIA key
                      </a>
                    ) : null}
                  </div>
                ) : null}
              </div>

              {/* Right: Summary & CTA */}
              <div className="flex flex-col">
                <div className="rounded-2xl border border-white/10 bg-void/30 p-6">
                  <h3 className="font-heading text-lg text-holo">Your deployment</h3>
                  <div className="mt-6 space-y-4">
                    <div className="flex items-center justify-between border-b border-white/5 pb-3">
                      <span className="text-sm text-muted">Plan</span>
                      <span className="font-medium text-holo">{plan ? (plan === "starter" ? "Starter" : "Pro") : "—"}</span>
                    </div>
                    <div className="flex items-center justify-between border-b border-white/5 pb-3">
                      <span className="text-sm text-muted">Billing</span>
                      <span className="font-medium text-holo">{billingInterval === "monthly" ? "Monthly" : "Yearly"}</span>
                    </div>
                    <div className="flex items-center justify-between border-b border-white/5 pb-3">
                      <span className="text-sm text-muted">Channel</span>
                      <span className="font-medium text-holo">{channel === "telegram" ? "Telegram" : "Discord"}</span>
                    </div>
                    <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-void/40 px-4 py-3">
                      <Globe size={16} className="text-terminal" />
                      <span className="text-sm text-holo">Headless browser enabled</span>
                    </div>
                {plan === "starter" && (
                  <div className="rounded-xl border border-white/10 bg-void/40 px-4 py-3 text-xs text-muted">
                    Starter is BYOK: bring your{" "}
                    {modelProvider === "openai"
                      ? "OpenAI"
                      : modelProvider === "moonshot"
                        ? "Moonshot"
                        : modelProvider === "nvidia"
                          ? "NVIDIA"
                          : "OpenRouter"}{" "}
                    key.
                  </div>
                )}
                <div className="flex items-center justify-between border-b border-white/5 pb-3">
                  <span className="text-sm text-muted">AI provider</span>
                  <span className="font-medium text-holo">
                    {getModelProviderLabel(selectedModel)}
                  </span>
                </div>
              </div>

                  <div className="mt-8 space-y-3">
                    <Button
                      className={cn(
                        "w-full py-5 text-base",
                        deployReady && "shadow-[0_0_30px_rgba(230,57,70,0.4)]"
                      )}
                      onClick={handleDeploy}
                      disabled={!deployReady || isSubmitting}
                    >
                      {isSubmitting ? "Processing..." : "Deploy Now"}
                    </Button>
                    <p className="text-center text-xs text-muted">
                      Secure payment • Cancel anytime
                    </p>
                  </div>
                </div>

                {/* What's included */}
                <div className="mt-6 rounded-2xl border border-white/5 bg-void/20 p-5">
                  <p className="text-xs uppercase tracking-wider text-muted">What's included</p>
                  <ul className="mt-4 space-y-3 text-sm text-holo">
                    <li className="flex items-center gap-3">
                      <CheckCircle2 size={16} className="text-terminal flex-shrink-0" />
                      <span>Instant deployment</span>
                    </li>
                    <li className="flex items-center gap-3">
                      <CheckCircle2 size={16} className="text-terminal flex-shrink-0" />
                      <span>Hosted runtime</span>
                    </li>
                    <li className="flex items-center gap-3">
                      <CheckCircle2 size={16} className="text-terminal flex-shrink-0" />
                      <span>Web chat dashboard</span>
                    </li>
                    {plan === "pro" && (
                      <li className="flex items-center gap-3">
                        <Globe size={16} className="text-pilot flex-shrink-0" />
                        <span>Agent Browser skill</span>
                      </li>
                    )}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* Footer */}
        <footer className="mt-16 text-center text-sm text-muted">
          <p>QuickClaw runs OpenClaw for you. Tokens encrypted at rest.</p>
        </footer>
      </div>
    </main>
  );
}
