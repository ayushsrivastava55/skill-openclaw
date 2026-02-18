"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

type ModelProviderId = "openrouter" | "openai" | "moonshot" | "nvidia";

type ModelOption = {
  id: string;
  label: string;
  group: string;
};

type StatusEvent = {
  deployment_status?: string;
  message?: string;
  createdAt?: string;
};

const OPENROUTER_MODEL_OPTIONS: ModelOption[] = [
  { id: "openrouter/openai/gpt-5.2", label: "OpenAI (GPT-5.2)", group: "OpenAI" },
  { id: "openrouter/anthropic/claude-opus-4.5", label: "Anthropic (Claude Opus 4.5)", group: "Anthropic" },
  { id: "openrouter/anthropic/claude-opus-4.6", label: "Anthropic (Claude Opus 4.6)", group: "Anthropic" },
  { id: "openrouter/google/gemini-3-flash-preview", label: "Google (Gemini 3 Flash)", group: "Google" },
  { id: "openrouter/moonshotai/kimi-k2.5", label: "Moonshot (Kimi K2.5)", group: "China" },
  { id: "openrouter/minimax/minimax-m2.1", label: "MiniMax (M2.1)", group: "China" }
];

const OPENAI_MODEL_OPTIONS: ModelOption[] = [
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

const MOONSHOT_MODEL_OPTIONS: ModelOption[] = [
  { id: "moonshot/kimi-k2.5", label: "Kimi (K2.5)", group: "Moonshot" }
];

const NVIDIA_MODEL_OPTIONS: ModelOption[] = [
  { id: "nvidia/moonshotai/kimi-k2.5", label: "Kimi (K2.5) via NVIDIA", group: "NVIDIA" }
];

const MODEL_OPTIONS: Record<ModelProviderId, ModelOption[]> = {
  openrouter: OPENROUTER_MODEL_OPTIONS,
  openai: OPENAI_MODEL_OPTIONS,
  moonshot: MOONSHOT_MODEL_OPTIONS,
  nvidia: NVIDIA_MODEL_OPTIONS
};

function parseCsv(raw: string): string[] {
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function readStoredDeploymentId() {
  if (typeof window === "undefined") return "";
  return (window.localStorage.getItem("brand_deployment_id") ?? "").trim();
}

export default function HomePage() {
  const [brandName, setBrandName] = useState("");
  const [website, setWebsite] = useState("");
  const [description, setDescription] = useState("");
  const [industry, setIndustry] = useState("");
  const [targetAudience, setTargetAudience] = useState("");
  const [tone, setTone] = useState("");
  const [products, setProducts] = useState("");
  const [additionalContext, setAdditionalContext] = useState("");
  const [twitter, setTwitter] = useState("");
  const [instagram, setInstagram] = useState("");
  const [linkedin, setLinkedin] = useState("");

  const [modelProvider, setModelProvider] = useState<ModelProviderId>("openrouter");
  const [selectedModel, setSelectedModel] = useState<string>("openrouter/openai/gpt-5.2");
  const [modelApiKey, setModelApiKey] = useState("");
  const [telegramToken, setTelegramToken] = useState("");
  const [redeployId, setRedeployId] = useState("");

  const [deploymentId, setDeploymentId] = useState("");
  const [jobId, setJobId] = useState("");
  const [skillName, setSkillName] = useState("");
  const [heartbeatFileName, setHeartbeatFileName] = useState("");
  const [mode, setMode] = useState<"mock" | "remote-http" | "">("");

  const [latestStatus, setLatestStatus] = useState("");
  const [latestMessage, setLatestMessage] = useState("");
  const [statusEvents, setStatusEvents] = useState<StatusEvent[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const stored = readStoredDeploymentId();
    if (stored) {
      setDeploymentId(stored);
    }
  }, []);

  useEffect(() {
    if (!deploymentId || typeof window === "undefined") return;
    window.localStorage.setItem("brand_deployment_id", deploymentId);
  }, [deploymentId]);

  useEffect(() => {
    const options = MODEL_OPTIONS[modelProvider];
    if (!options.some((option) => option.id === selectedModel)) {
      setSelectedModel(options[0]?.id ?? "");
    }
  }, [modelProvider, selectedModel]);

  useEffect(() => {
    if (!deploymentId) return;

    const source = new EventSource(`/api/user-status/stream?rowId=${encodeURIComponent(deploymentId)}`);

    source.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as StatusEvent;
        if (!payload?.deployment_status) return;

        setLatestStatus(payload.deployment_status);
        setLatestMessage(payload.message ?? "");
        setStatusEvents((previous) => {
          const key = `${payload.createdAt ?? ""}:${payload.deployment_status}:${payload.message ?? ""}`;
          const next = previous.filter((item) => {
            const itemKey = `${item.createdAt ?? ""}:${item.deployment_status ?? ""}:${item.message ?? ""}`;
            return itemKey !== key;
          });
          return [payload, ...next].slice(0, 20);
        });
      } catch {
        // ignore malformed SSE payloads
      }
    };

    return () => {
      source.close();
    };
  }, [deploymentId]);

  const groupedModelOptions = useMemo(() => {
    const options = MODEL_OPTIONS[modelProvider];
    const groups = Array.from(new Set(options.map((item) => item.group)));
    return groups.map((group) => ({
      group,
      options: options.filter((item) => item.group === group)
    }));
  }, [modelProvider]);

  const canSubmit =
    Boolean(brandName.trim()) &&
    Boolean(description.trim()) &&
    Boolean(telegramToken.trim()) &&
    Boolean(selectedModel.trim()) &&
    !isSubmitting;

  const handleDeploy = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit) {
      toast.error("Fill brand name, description, Telegram token, and model.");
      return;
    }

    if (!telegramToken.includes(":")) {
      toast.error("Telegram bot token must include ':'");
      return;
    }

    setIsSubmitting(true);
    setLatestStatus("setup_started");
    setLatestMessage("Submitting brand deployment request...");

    try {
      const socialLinks = {
        twitter: twitter.trim() || undefined,
        instagram: instagram.trim() || undefined,
        linkedin: linkedin.trim() || undefined
      };

      const response = await fetch("/api/brand-deploy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deploymentId: redeployId.trim() || undefined,
          model_provider: modelProvider,
          model: selectedModel,
          telegram_bot_token: telegramToken.trim(),
          model_api_key: modelApiKey.trim() || undefined,
          brand: {
            name: brandName.trim(),
            website: website.trim(),
            description: description.trim(),
            industry: industry.trim() || undefined,
            targetAudience: targetAudience.trim() || undefined,
            tone: tone.trim() || undefined,
            products: parseCsv(products),
            socialLinks,
            additionalContext: additionalContext.trim() || undefined
          }
        })
      });

      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        deploymentId?: string;
        jobId?: string;
        mode?: "mock" | "remote-http";
        skillName?: string;
        heartbeatFileName?: string;
      };

      if (payload.deploymentId) {
        setDeploymentId(payload.deploymentId);
        setRedeployId(payload.deploymentId);
      }

      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to deploy brand bot");
      }

      setJobId(payload.jobId ?? "");
      setMode(payload.mode ?? "");
      setSkillName(payload.skillName ?? "");
      setHeartbeatFileName(payload.heartbeatFileName ?? "");

      toast.success("Brand deployment started.");
    } catch (error) {
      setLatestStatus("setup_error");
      setLatestMessage(error instanceof Error ? error.message : "Deployment failed");
      toast.error(error instanceof Error ? error.message : "Deployment failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-8">
      <section className="panel p-6 sm:p-8">
        <p className="text-xs uppercase tracking-[0.18em] text-cyan-200/80">Brand Deploy Console</p>
        <h1 className="mt-2 text-3xl font-semibold text-white">Generate SKILL.md + HEARTBEAT.md and launch bot</h1>
        <p className="mt-2 text-sm text-soft">
          This page is focused on brand deployments only. Enter brand details, Telegram token, provider/model, and deploy.
        </p>
      </section>

      <form className="panel mt-6 grid gap-5 p-6 sm:p-8" onSubmit={handleDeploy}>
        <h2 className="text-xl font-semibold text-white">Brand Details</h2>

        <label className="text-sm text-soft">
          Brand Name
          <input
            className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-white"
            value={brandName}
            onChange={(e) => setBrandName(e.target.value)}
            placeholder="Acme AI"
          />
        </label>

        <label className="text-sm text-soft">
          Website
          <input
            className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-white"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            placeholder="https://acme.ai"
          />
        </label>

        <label className="text-sm text-soft">
          Description
          <textarea
            className="mt-1 min-h-24 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-white"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What your brand does and why it matters"
          />
        </label>

        <div className="grid gap-4 md:grid-cols-3">
          <label className="text-sm text-soft">
            Industry
            <input
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-white"
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              placeholder="SaaS"
            />
          </label>

          <label className="text-sm text-soft">
            Target Audience
            <input
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-white"
              value={targetAudience}
              onChange={(e) => setTargetAudience(e.target.value)}
              placeholder="Founders and operators"
            />
          </label>

          <label className="text-sm text-soft">
            Tone
            <input
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-white"
              value={tone}
              onChange={(e) => setTone(e.target.value)}
              placeholder="Direct, practical, expert"
            />
          </label>
        </div>

        <label className="text-sm text-soft">
          Products (comma-separated)
          <input
            className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-white"
            value={products}
            onChange={(e) => setProducts(e.target.value)}
            placeholder="Product A, Product B"
          />
        </label>

        <div className="grid gap-4 md:grid-cols-3">
          <label className="text-sm text-soft">
            X / Twitter
            <input
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-white"
              value={twitter}
              onChange={(e) => setTwitter(e.target.value)}
              placeholder="https://x.com/brand"
            />
          </label>

          <label className="text-sm text-soft">
            Instagram
            <input
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-white"
              value={instagram}
              onChange={(e) => setInstagram(e.target.value)}
              placeholder="https://instagram.com/brand"
            />
          </label>

          <label className="text-sm text-soft">
            LinkedIn
            <input
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-white"
              value={linkedin}
              onChange={(e) => setLinkedin(e.target.value)}
              placeholder="https://linkedin.com/company/brand"
            />
          </label>
        </div>

        <label className="text-sm text-soft">
          Additional Context
          <textarea
            className="mt-1 min-h-24 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-white"
            value={additionalContext}
            onChange={(e) => setAdditionalContext(e.target.value)}
            placeholder="Campaign goals, exclusions, style constraints"
          />
        </label>

        <h2 className="mt-2 text-xl font-semibold text-white">Bot Runtime Inputs</h2>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="text-sm text-soft">
            Provider
            <select
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-white"
              value={modelProvider}
              onChange={(e) => setModelProvider(e.target.value as ModelProviderId)}
            >
              <option value="openrouter">OpenRouter</option>
              <option value="openai">OpenAI</option>
              <option value="moonshot">Moonshot</option>
              <option value="nvidia">NVIDIA</option>
            </select>
          </label>

          <label className="text-sm text-soft">
            Model
            <select
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-white"
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
            >
              {groupedModelOptions.map((entry) => (
                <optgroup key={entry.group} label={entry.group}>
                  {entry.options.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="text-sm text-soft">
            Telegram Bot Token
            <input
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-white"
              value={telegramToken}
              onChange={(e) => setTelegramToken(e.target.value)}
              placeholder="123456:ABC-DEF..."
            />
          </label>

          <label className="text-sm text-soft">
            Model API Key
            <input
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-white"
              value={modelApiKey}
              onChange={(e) => setModelApiKey(e.target.value)}
              placeholder={
                modelProvider === "openai"
                  ? "sk-..."
                  : modelProvider === "openrouter"
                    ? "sk-or-v1-... (optional if PLATFORM_OPENROUTER_API_KEY is set)"
                    : "Provider API key"
              }
            />
          </label>
        </div>

        <label className="text-sm text-soft">
          Redeploy Existing Deployment ID (optional)
          <input
            className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-white"
            value={redeployId}
            onChange={(e) => setRedeployId(e.target.value)}
            placeholder="dep_xxxxxxxx"
          />
        </label>

        <button
          type="submit"
          disabled={!canSubmit}
          className="button-glow mt-2 rounded-lg px-4 py-3 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? "Deploying..." : "Generate files and deploy bot"}
        </button>
      </form>

      <section className="panel mt-6 p-6 sm:p-8">
        <h2 className="text-xl font-semibold text-white">Deployment Status</h2>

        <div className="mt-3 grid gap-2 text-sm text-soft md:grid-cols-2">
          <p>
            Deployment ID: <span className="text-white">{deploymentId || "-"}</span>
          </p>
          <p>
            Job ID: <span className="text-white">{jobId || "-"}</span>
          </p>
          <p>
            Runtime mode: <span className="text-white">{mode || "-"}</span>
          </p>
          <p>
            Latest status: <span className="text-white">{latestStatus || "-"}</span>
          </p>
          <p>
            Skill file: <span className="text-white">{skillName || "-"}</span>
          </p>
          <p>
            Heartbeat file: <span className="text-white">{heartbeatFileName || "-"}</span>
          </p>
        </div>

        {latestMessage ? <p className="mt-3 text-sm text-cyan-100">{latestMessage}</p> : null}

        <div className="mt-4 max-h-72 overflow-y-auto rounded-lg border border-white/10 bg-black/30 p-3">
          {statusEvents.length === 0 ? (
            <p className="text-sm text-soft">No status events yet.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {statusEvents.map((eventItem, index) => (
                <li key={`${eventItem.createdAt ?? "time"}-${eventItem.deployment_status ?? "status"}-${index}`}>
                  <span className="text-white">{eventItem.deployment_status ?? "unknown"}</span>
                  <span className="text-soft">{"  "}{eventItem.message ?? ""}</span>
                  {eventItem.createdAt ? <span className="text-soft">{"  "}({eventItem.createdAt})</span> : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </main>
  );
}
