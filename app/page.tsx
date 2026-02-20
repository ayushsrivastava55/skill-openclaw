"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

type ModelProviderId = "openrouter" | "openai" | "minimax" | "moonshot" | "nvidia";

type ModelOption = {
  id: string;
  label: string;
  group: string;
};

type StatusEvent = {
  id: string;
  deployment_status?: string;
  message?: string;
  createdAt?: string;
};

type ResearchStatus = {
  status: "pending" | "running" | "complete" | "failed" | string;
  phase: "fast" | "deep" | null;
  confidenceOverall: number | null;
  factsCount: number;
  sourcesCount: number;
  completedAt: string | null;
  error: string | null;
};

type ResearchFactItem = {
  id: string;
  key: string;
  value: string;
  confidence: number;
  confidenceLabel: string;
  factType: string;
};

type ResearchSourceItem = {
  id: string;
  url: string;
  domain?: string | null;
  sourceType: string;
  title?: string | null;
  reliabilityScore?: number | null;
  fetchedAt?: string | null;
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

const MINIMAX_MODEL_OPTIONS: ModelOption[] = [
  { id: "minimax/MiniMax-M2.1", label: "MiniMax M2.1", group: "MiniMax" },
  { id: "minimax/MiniMax-M2.1-80k", label: "MiniMax M2.1 80k", group: "MiniMax" },
  { id: "minimax/MiniMax-M2.1-thinking", label: "MiniMax M2.1 Thinking", group: "MiniMax" },
  { id: "minimax/MiniMax-M2.1-thinking-80k", label: "MiniMax M2.1 Thinking 80k", group: "MiniMax" }
];

const NVIDIA_MODEL_OPTIONS: ModelOption[] = [
  { id: "nvidia/moonshotai/kimi-k2.5", label: "Kimi (K2.5) via NVIDIA", group: "NVIDIA" }
];

const MODEL_OPTIONS: Record<ModelProviderId, ModelOption[]> = {
  openrouter: OPENROUTER_MODEL_OPTIONS,
  openai: OPENAI_MODEL_OPTIONS,
  minimax: MINIMAX_MODEL_OPTIONS,
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

function readStoredXUserKey() {
  if (typeof window === "undefined") return "";
  return (window.localStorage.getItem("x_user_key") ?? "").trim();
}

function toStatusLabel(status: string) {
  return status
    .split("_")
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(" ");
}

function toStatusTone(status?: string) {
  if (!status) return "pill-live";
  if (status.includes("error")) return "pill-error";
  if (status.includes("complete")) return "pill-ok";
  if (status.includes("started")) return "pill-warn";
  return "pill-live";
}

function toDisplayTime(value?: string) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

function toResearchTone(status?: string) {
  if (!status) return "pill-live";
  if (status.includes("failed")) return "pill-error";
  if (status.includes("complete")) return "pill-ok";
  if (status.includes("running")) return "pill-warn";
  return "pill-live";
}

function toResearchLabel(status?: string) {
  if (!status) return "Pending";
  return status
    .split("_")
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(" ");
}

function buildStatusEventId(event: {
  id?: string;
  deployment_status?: string;
  message?: string;
  createdAt?: string;
}) {
  return `${event.id ?? ""}:${event.createdAt ?? ""}:${event.deployment_status ?? ""}:${event.message ?? ""}`;
}

function mergeStatusEvents(current: StatusEvent[], incoming: StatusEvent[], max: number = 120) {
  const byId = new Map<string, StatusEvent>();
  for (const event of [...incoming, ...current]) {
    const key = buildStatusEventId(event);
    if (!key) continue;
    byId.set(key, { ...event, id: key });
  }
  return Array.from(byId.values())
    .sort((a, b) => {
      const left = Date.parse(a.createdAt ?? "");
      const right = Date.parse(b.createdAt ?? "");
      if (Number.isFinite(left) && Number.isFinite(right)) {
        return right - left;
      }
      return 0;
    })
    .slice(0, max);
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
  const [isRecoveringDeployment, setIsRecoveringDeployment] = useState(false);
  const [isConnectingX, setIsConnectingX] = useState(false);
  const [isLoadingXProfile, setIsLoadingXProfile] = useState(false);
  const [xUserKey, setXUserKey] = useState("");
  const [xConnectionLabel, setXConnectionLabel] = useState("");
  const [isLoadingArtifacts, setIsLoadingArtifacts] = useState(false);
  const [skillPreview, setSkillPreview] = useState("");
  const [skillPreviewName, setSkillPreviewName] = useState("SKILL.md");
  const [heartbeatPreview, setHeartbeatPreview] = useState("");
  const [heartbeatPreviewName, setHeartbeatPreviewName] = useState("HEARTBEAT.md");
  const [researchSummaryPreview, setResearchSummaryPreview] = useState("");
  const [researchSummaryName, setResearchSummaryName] = useState("RESEARCH_SUMMARY.md");
  const [brandFactsPreview, setBrandFactsPreview] = useState("");
  const [brandFactsName, setBrandFactsName] = useState("BRAND_FACTS.json");
  const [sourceMapPreview, setSourceMapPreview] = useState("");
  const [sourceMapName, setSourceMapName] = useState("SOURCE_MAP.json");
  const [researchTopFacts, setResearchTopFacts] = useState<ResearchFactItem[]>([]);
  const [researchTopSources, setResearchTopSources] = useState<ResearchSourceItem[]>([]);
  const [researchStatus, setResearchStatus] = useState<ResearchStatus>({
    status: "pending",
    phase: null,
    confidenceOverall: null,
    factsCount: 0,
    sourcesCount: 0,
    completedAt: null,
    error: null
  });

  useEffect(() => {
    const stored = readStoredDeploymentId();
    if (stored) {
      setDeploymentId(stored);
      setRedeployId(stored);
    }
    const storedX = readStoredXUserKey();
    if (storedX) {
      setXUserKey(storedX);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const xConnectStatus = url.searchParams.get("x_connect")?.trim();
    if (!xConnectStatus) {
      return;
    }

    const xMessage = url.searchParams.get("message")?.trim() ?? "";
    const xUsername = url.searchParams.get("x_username")?.trim() ?? "";
    const callbackDeploymentId = url.searchParams.get("deploymentId")?.trim() ?? "";
    const callbackXUserKey = url.searchParams.get("x_user_key")?.trim() ?? "";

    if (callbackDeploymentId) {
      setDeploymentId(callbackDeploymentId);
      setRedeployId(callbackDeploymentId);
    }
    if (callbackXUserKey) {
      setXUserKey(callbackXUserKey);
    }

    if (xConnectStatus === "success") {
      const successMessage = xMessage || "X account connected.";
      toast.success(successMessage);
      setXConnectionLabel(xUsername ? `Connected X: @${xUsername}` : "Connected X account.");
    } else {
      toast.error(xMessage || "Failed to connect X account.");
      setXConnectionLabel("");
    }

    url.searchParams.delete("x_connect");
    url.searchParams.delete("message");
    url.searchParams.delete("deploymentId");
    url.searchParams.delete("x_username");
    url.searchParams.delete("x_user_key");
    const nextUrl = `${url.pathname}${url.search}${url.hash}`;
    window.history.replaceState({}, "", nextUrl);
  }, []);

  useEffect(() => {
    if (!deploymentId || typeof window === "undefined") return;
    window.localStorage.setItem("brand_deployment_id", deploymentId);
  }, [deploymentId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!xUserKey.trim()) {
      window.localStorage.removeItem("x_user_key");
      return;
    }
    window.localStorage.setItem("x_user_key", xUserKey.trim());
  }, [xUserKey]);

  useEffect(() => {
    const options = MODEL_OPTIONS[modelProvider];
    if (!options.some((option) => option.id === selectedModel)) {
      setSelectedModel(options[0]?.id ?? "");
    }
  }, [modelProvider, selectedModel]);

  useEffect(() => {
    if (!deploymentId) return;

    let cancelled = false;
    const loadHistory = async () => {
      try {
        const response = await fetch(
          `/api/deployments/events/list?deploymentId=${encodeURIComponent(deploymentId)}&limit=120`
        );
        const payload = (await response.json().catch(() => ({}))) as {
          events?: Array<{ id?: string; deployment_status?: string; message?: string; createdAt?: string }>;
        };
        if (!response.ok || cancelled) return;
        const events = Array.isArray(payload.events)
          ? payload.events
              .filter((item) => Boolean(item.deployment_status))
              .map((item) => ({
                id: buildStatusEventId(item),
                deployment_status: item.deployment_status,
                message: item.message ?? "",
                createdAt: item.createdAt
              }))
          : [];
        if (events.length === 0) return;
        setStatusEvents((previous) => mergeStatusEvents(previous, events));
      } catch {
        // ignore history load failures
      }
    };

    void loadHistory();
    return () => {
      cancelled = true;
    };
  }, [deploymentId]);

  useEffect(() => {
    if (!deploymentId) return;

    const source = new EventSource(`/api/user-status/stream?rowId=${encodeURIComponent(deploymentId)}`);

    source.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as StatusEvent;
        if (!payload?.deployment_status) return;

        setLatestStatus(payload.deployment_status);
        setLatestMessage(payload.message ?? "");
        setStatusEvents((previous) =>
          mergeStatusEvents(previous, [
            {
              id: buildStatusEventId(payload),
              deployment_status: payload.deployment_status,
              message: payload.message ?? "",
              createdAt: payload.createdAt
            }
          ])
        );
      } catch {
        // ignore malformed SSE payloads
      }
    };

    return () => {
      source.close();
    };
  }, [deploymentId]);

  useEffect(() => {
    const key = xUserKey.trim();
    if (!key) return;

    let cancelled = false;
    const loadXProfile = async () => {
      setIsLoadingXProfile(true);
      try {
        const response = await fetch("/api/x/profile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ x_user_key: key })
        });

        const payload = (await response.json().catch(() => ({}))) as {
          connected?: boolean;
          error?: string;
          x?: { username?: string; name?: string | null };
          brandHints?: {
            name?: string;
            description?: string;
            website?: string;
            socialLinks?: { twitter?: string };
          };
        };

        if (cancelled) return;
        if (!response.ok || !payload.connected) {
          throw new Error(payload.error ?? "Failed to load X profile");
        }

        const username = payload.x?.username?.trim() ?? "";
        setXConnectionLabel(
          username
            ? `Connected X: @${username} (used for posting/replies; brand identity stays from your form + research)`
            : "Connected X account."
        );

        const hintTwitter = payload.brandHints?.socialLinks?.twitter?.trim() ?? (username ? `https://x.com/${username}` : "");

        // Do not infer brand identity from connected X profile.
        // Brand name/description/website must come from explicit user input + research pipeline.
        if (hintTwitter) setTwitter((prev) => (prev.trim() ? prev : hintTwitter));
      } catch (error) {
        if (!cancelled) {
          setXConnectionLabel("");
          toast.error(error instanceof Error ? error.message : "Failed to load X profile");
        }
      } finally {
        if (!cancelled) {
          setIsLoadingXProfile(false);
        }
      }
    };

    void loadXProfile();
    return () => {
      cancelled = true;
    };
  }, [xUserKey]);

  useEffect(() => {
    if (!deploymentId) return;

    let cancelled = false;
    const fetchResearch = async () => {
      try {
        const response = await fetch(`/api/deployments/research?deploymentId=${encodeURIComponent(deploymentId)}`);
        const payload = (await response.json().catch(() => ({}))) as {
          research?: Partial<ResearchStatus> & {
            topFacts?: ResearchFactItem[];
            topSources?: ResearchSourceItem[];
            summary?: { fileName?: string; content?: string; updatedAt?: string } | null;
          };
        };
        const research = payload.research;
        if (!response.ok || !research || cancelled) return;
        setResearchStatus((previous) => ({
          ...previous,
          ...research,
          status: research.status ?? previous.status,
          phase: research.phase ?? previous.phase,
          confidenceOverall:
            research.confidenceOverall === undefined
              ? previous.confidenceOverall
              : research.confidenceOverall,
          factsCount: research.factsCount ?? previous.factsCount,
          sourcesCount: research.sourcesCount ?? previous.sourcesCount,
          completedAt: research.completedAt ?? previous.completedAt,
          error: research.error ?? previous.error
        }));
        if (Array.isArray(research.topFacts)) {
          setResearchTopFacts(research.topFacts.slice(0, 8));
        }
        if (Array.isArray(research.topSources)) {
          setResearchTopSources(research.topSources.slice(0, 8));
        }
        if (research.summary?.content) {
          setResearchSummaryPreview(research.summary.content);
          setResearchSummaryName(research.summary.fileName?.trim() || "RESEARCH_SUMMARY.md");
        }
      } catch {
        // ignore background polling failures
      }
    };

    void fetchResearch();
    const timer = window.setInterval(() => {
      void fetchResearch();
    }, 15000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
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

  const effectiveDeploymentId = (deploymentId || redeployId).trim();
  const isTelegramValid = telegramToken.trim().includes(":");
  const isXConnected = Boolean(xUserKey.trim());
  const hasBrandCore = Boolean(brandName.trim() && description.trim());
  const hasRuntimeCore = Boolean(isTelegramValid && selectedModel.trim());

  const readiness = useMemo(() => {
    const checks = [
      { label: "X account", ok: isXConnected },
      { label: "Brand name", ok: Boolean(brandName.trim()) },
      { label: "Description", ok: Boolean(description.trim()) },
      { label: "Telegram token", ok: isTelegramValid },
      { label: "Model", ok: Boolean(selectedModel.trim()) }
    ];

    const done = checks.filter((item) => item.ok).length;
    return {
      checks,
      done,
      total: checks.length,
      percent: Math.round((done / checks.length) * 100)
    };
  }, [isXConnected, brandName, description, isTelegramValid, selectedModel]);

  const canSubmit = readiness.done === readiness.total && !isSubmitting;
  const canConnectX = !isConnectingX;
  const connectXButtonLabel = isXConnected ? "Reconnect X Account" : "Connect X First (Required)";
  const nextStepLabel = !isXConnected
    ? "Step 0: Connect X account"
    : !hasBrandCore
      ? "Step 1: Fill brand profile"
      : !hasRuntimeCore
        ? "Step 2: Add runtime credentials"
        : "Step 3: Deploy";

  const handleRecoverDeployment = async () => {
    const trimmedTelegramToken = telegramToken.trim();
    if (!trimmedTelegramToken || !trimmedTelegramToken.includes(":")) {
      toast.error("Enter your Telegram bot token to recover deployment.");
      return;
    }

    setIsRecoveringDeployment(true);
    try {
      const response = await fetch("/api/deployments/recover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telegram_bot_token: trimmedTelegramToken })
      });

      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        deployment?: {
          id: string;
          status?: string;
        };
      };

      if (!response.ok || !payload.deployment?.id) {
        throw new Error(payload.error ?? "Could not find deployment for this token.");
      }

      setDeploymentId(payload.deployment.id);
      setRedeployId(payload.deployment.id);
      if (payload.deployment.status) {
        setLatestStatus(payload.deployment.status);
      }
      setLatestMessage("Recovered deployment. You can now connect X.");
      toast.success(`Recovered deployment ${payload.deployment.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to recover deployment");
    } finally {
      setIsRecoveringDeployment(false);
    }
  };

  const handleDeploy = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit) {
      toast.error("Connect X first, then fill brand name, description, Telegram token, and model.");
      return;
    }

    setIsSubmitting(true);
    setLatestStatus("setup_started");
    setLatestMessage("Submitting brand deployment request...");
    setStatusEvents([]);
    setResearchTopFacts([]);
    setResearchTopSources([]);
    setResearchSummaryPreview("");

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
          x_user_key: xUserKey.trim() || undefined,
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
        researchRunIdFast?: string | null;
        researchStatus?: string;
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
      setResearchStatus((previous) => ({
        ...previous,
        status: payload.researchStatus ?? "running",
        phase: "fast"
      }));

      toast.success("Brand deployment started.");
    } catch (error) {
      setLatestStatus("setup_error");
      setLatestMessage(error instanceof Error ? error.message : "Deployment failed");
      toast.error(error instanceof Error ? error.message : "Deployment failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConnectX = async () => {
    const currentXUserKey = xUserKey.trim();

    setIsConnectingX(true);
    try {
      const response = await fetch("/api/x/connect", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          preconnect: true,
          x_user_key: currentXUserKey || undefined
        })
      });

      const payload = (await response.json().catch(() => ({}))) as {
        authorizeUrl?: string;
        error?: string;
        xUserKey?: string;
      };

      if (!response.ok || !payload.authorizeUrl) {
        throw new Error(payload.error ?? "Failed to initialize X OAuth");
      }
      if (payload.xUserKey?.trim()) {
        setXUserKey(payload.xUserKey.trim());
      }

      window.location.href = payload.authorizeUrl;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to connect X account");
    } finally {
      setIsConnectingX(false);
    }
  };

  const handleLoadArtifacts = async () => {
    const targetDeploymentId = effectiveDeploymentId;
    const trimmedTelegramToken = telegramToken.trim();

    if (!targetDeploymentId) {
      toast.error("No deployment id found. Deploy first or set redeploy id.");
      return;
    }
    if (!trimmedTelegramToken || !trimmedTelegramToken.includes(":")) {
      toast.error("Enter the deployment Telegram token to view generated files.");
      return;
    }

    setIsLoadingArtifacts(true);
    try {
      const response = await fetch("/api/deployments/artifacts/get", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deploymentId: targetDeploymentId,
          telegram_bot_token: trimmedTelegramToken
        })
      });

      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        artifacts?: {
          skill?: { fileName?: string; content?: string } | null;
          heartbeat?: { fileName?: string; content?: string } | null;
          researchSummary?: { fileName?: string; content?: string } | null;
          brandFacts?: { fileName?: string; content?: string } | null;
          sourceMap?: { fileName?: string; content?: string } | null;
        };
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to fetch generated files");
      }

      const skill = payload.artifacts?.skill;
      const heartbeat = payload.artifacts?.heartbeat;
      const researchSummary = payload.artifacts?.researchSummary;
      const brandFacts = payload.artifacts?.brandFacts;
      const sourceMap = payload.artifacts?.sourceMap;

      if (!skill?.content && !heartbeat?.content && !researchSummary?.content && !brandFacts?.content && !sourceMap?.content) {
        toast.error("Generated files are not available for this deployment yet.");
        return;
      }

      if (skill?.content) {
        setSkillPreview(skill.content);
        setSkillPreviewName(skill.fileName?.trim() || "SKILL.md");
      }
      if (heartbeat?.content) {
        setHeartbeatPreview(heartbeat.content);
        setHeartbeatPreviewName(heartbeat.fileName?.trim() || "HEARTBEAT.md");
      }
      if (researchSummary?.content) {
        setResearchSummaryPreview(researchSummary.content);
        setResearchSummaryName(researchSummary.fileName?.trim() || "RESEARCH_SUMMARY.md");
      }
      if (brandFacts?.content) {
        setBrandFactsPreview(brandFacts.content);
        setBrandFactsName(brandFacts.fileName?.trim() || "BRAND_FACTS.json");
      }
      if (sourceMap?.content) {
        setSourceMapPreview(sourceMap.content);
        setSourceMapName(sourceMap.fileName?.trim() || "SOURCE_MAP.json");
      }

      toast.success("Loaded generated files.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to fetch generated files");
    } finally {
      setIsLoadingArtifacts(false);
    }
  };

  const copyDeploymentId = async () => {
    if (!effectiveDeploymentId) {
      toast.error("No deployment id yet.");
      return;
    }

    try {
      await navigator.clipboard.writeText(effectiveDeploymentId);
      toast.success("Deployment ID copied");
    } catch {
      toast.error("Failed to copy deployment ID");
    }
  };

  return (
    <main className="bg-shell min-h-screen px-4 py-6 sm:px-8 sm:py-10">
      <div className="mx-auto w-full max-w-7xl space-y-6">
        <section className="hero-band fade-up p-6 sm:p-8">
          <p className="section-kicker">Brand Deploy Console</p>
          <h1 className="section-title mt-2 text-3xl font-semibold text-white sm:text-4xl">
            Build, deploy, and monitor your brand bot in one flow
          </h1>
          <p className="mt-3 max-w-3xl text-sm text-slate-300 sm:text-base">
            Connect X first so we can ingest brand context from your handle, then finalize runtime settings and deploy.
            Status and research updates stream live as setup progresses.
          </p>
          <div className="mt-5 flex flex-wrap gap-2 text-xs">
            <span className="pill pill-live">0. Connect X</span>
            <span className="pill pill-live">1. Brand profile</span>
            <span className="pill pill-live">2. Runtime config</span>
            <span className="pill pill-live">3. Deploy bot</span>
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-12">
          <form className="space-y-4 lg:col-span-7" onSubmit={handleDeploy}>
            <section className="card fade-up p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="section-kicker">Quick Start</p>
                  <h2 className="section-title mt-1 text-xl font-semibold text-white">Next Best Action</h2>
                  <p className="mt-2 text-sm text-slate-300">{nextStepLabel}</p>
                </div>
                <span className={`pill ${isXConnected ? "pill-ok" : "pill-warn"}`}>
                  {isXConnected ? "X Connected" : "X Required"}
                </span>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={handleConnectX}
                  disabled={!canConnectX}
                  className="primary-btn h-11 w-full rounded-xl disabled:cursor-not-allowed disabled:opacity-55"
                >
                  {isConnectingX ? "Redirecting to X OAuth..." : connectXButtonLabel}
                </button>
                <button
                  type="button"
                  onClick={handleRecoverDeployment}
                  disabled={isRecoveringDeployment || !isTelegramValid}
                  className="secondary-btn h-11 w-full rounded-xl disabled:cursor-not-allowed disabled:opacity-55"
                >
                  {isRecoveringDeployment ? "Finding deployment..." : "Recover Deployment"}
                </button>
              </div>
              {xConnectionLabel ? <p className="mt-3 text-sm text-cyan-200">{xConnectionLabel}</p> : null}
              {isLoadingXProfile ? <p className="mt-1 text-xs text-slate-300">Syncing brand hints from X profile...</p> : null}
            </section>

            <section className="card fade-up p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="section-kicker">Readiness</p>
                  <h2 className="section-title mt-1 text-xl font-semibold text-white">Deploy Checklist</h2>
                </div>
                <span className="pill pill-live">
                  {readiness.done}/{readiness.total} complete
                </span>
              </div>

              <div className="card-subtle mt-4 overflow-hidden">
                <div className="h-2 w-full bg-slate-900/70">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-orange-400 via-yellow-300 to-cyan-300 transition-all duration-300"
                    style={{ width: `${readiness.percent}%` }}
                  />
                </div>
                <div className="grid gap-2 p-3 sm:grid-cols-2">
                  {readiness.checks.map((item) => (
                    <div key={item.label} className="flex items-center justify-between rounded-md border border-slate-700/45 px-3 py-2">
                      <span className="text-sm text-slate-300">{item.label}</span>
                      <span className={`pill ${item.ok ? "pill-ok" : "pill-warn"}`}>{item.ok ? "Ready" : "Missing"}</span>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className={`card fade-up space-y-4 p-5 sm:p-6 ${!isXConnected ? "section-disabled" : ""}`}>
              <div>
                <p className="section-kicker">Section 1</p>
                <h2 className="section-title mt-1 text-xl font-semibold text-white">Brand Profile</h2>
                {!isXConnected ? (
                  <p className="mt-1 text-xs text-amber-200">Connect X first to unlock brand profile editing.</p>
                ) : null}
              </div>

              <label className="field-label">
                Brand Name
                <input
                  className="field-input"
                  value={brandName}
                  onChange={(e) => setBrandName(e.target.value)}
                  placeholder="Acme AI"
                />
              </label>

              <label className="field-label">
                Website
                <input
                  className="field-input"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  placeholder="https://acme.ai"
                />
              </label>

              <label className="field-label">
                Description
                <textarea
                  className="field-textarea"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What your brand does, who it serves, and why it matters"
                />
              </label>

              <div className="grid gap-4 sm:grid-cols-3">
                <label className="field-label">
                  Industry
                  <input
                    className="field-input"
                    value={industry}
                    onChange={(e) => setIndustry(e.target.value)}
                    placeholder="SaaS"
                  />
                </label>

                <label className="field-label">
                  Target Audience
                  <input
                    className="field-input"
                    value={targetAudience}
                    onChange={(e) => setTargetAudience(e.target.value)}
                    placeholder="Founders, operators"
                  />
                </label>

                <label className="field-label">
                  Tone
                  <input
                    className="field-input"
                    value={tone}
                    onChange={(e) => setTone(e.target.value)}
                    placeholder="Direct, practical"
                  />
                </label>
              </div>

              <label className="field-label">
                Products (comma-separated)
                <input
                  className="field-input"
                  value={products}
                  onChange={(e) => setProducts(e.target.value)}
                  placeholder="Product A, Product B"
                />
              </label>

              <div className="grid gap-4 sm:grid-cols-3">
                <label className="field-label">
                  X / Twitter URL
                  <input
                    className="field-input"
                    value={twitter}
                    onChange={(e) => setTwitter(e.target.value)}
                    placeholder="https://x.com/brand"
                  />
                </label>

                <label className="field-label">
                  Instagram URL
                  <input
                    className="field-input"
                    value={instagram}
                    onChange={(e) => setInstagram(e.target.value)}
                    placeholder="https://instagram.com/brand"
                  />
                </label>

                <label className="field-label">
                  LinkedIn URL
                  <input
                    className="field-input"
                    value={linkedin}
                    onChange={(e) => setLinkedin(e.target.value)}
                    placeholder="https://linkedin.com/company/brand"
                  />
                </label>
              </div>

              <label className="field-label">
                Additional Context
                <textarea
                  className="field-textarea"
                  value={additionalContext}
                  onChange={(e) => setAdditionalContext(e.target.value)}
                  placeholder="Campaign goals, exclusions, style constraints, compliance notes"
                />
              </label>
            </section>

            <section className={`card fade-up space-y-4 p-5 sm:p-6 ${!isXConnected ? "section-disabled" : ""}`}>
              <div>
                <p className="section-kicker">Section 2</p>
                <h2 className="section-title mt-1 text-xl font-semibold text-white">Bot Runtime Inputs</h2>
                {!isXConnected ? (
                  <p className="mt-1 text-xs text-amber-200">Connect X first to unlock runtime setup.</p>
                ) : null}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="field-label">
                  Provider
                  <select
                    className="field-select"
                    value={modelProvider}
                    onChange={(e) => setModelProvider(e.target.value as ModelProviderId)}
                  >
                    <option value="openrouter">OpenRouter</option>
                    <option value="openai">OpenAI</option>
                    <option value="minimax">MiniMax</option>
                    <option value="moonshot">Moonshot</option>
                    <option value="nvidia">NVIDIA</option>
                  </select>
                </label>

                <label className="field-label">
                  Model
                  <select className="field-select" value={selectedModel} onChange={(e) => setSelectedModel(e.target.value)}>
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

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="field-label">
                  Telegram Bot Token
                  <input
                    className="field-input"
                    value={telegramToken}
                    onChange={(e) => setTelegramToken(e.target.value)}
                    placeholder="123456:ABC-DEF..."
                  />
                  <p className="field-hint">Use the same token later for secure X connection verification.</p>
                </label>

                <label className="field-label">
                  Model API Key
                  <input
                    className="field-input"
                    value={modelApiKey}
                    onChange={(e) => setModelApiKey(e.target.value)}
                    placeholder={
                      modelProvider === "openai"
                        ? "sk-..."
                        : modelProvider === "minimax"
                          ? "your MiniMax API key"
                        : modelProvider === "openrouter"
                          ? "sk-or-v1-... (optional if platform key is configured)"
                          : "Provider API key"
                    }
                  />
                  <p className="field-hint">Leave empty only when your server already provides a provider key.</p>
                </label>
              </div>

              <label className="field-label">
                Redeploy Existing Deployment ID (optional)
                <input
                  className="field-input"
                  value={redeployId}
                  onChange={(e) => setRedeployId(e.target.value)}
                  placeholder="dep_xxxxxxxx"
                />
              </label>
            </section>

            <section className={`card fade-up space-y-3 p-5 sm:p-6 ${!isXConnected ? "section-disabled" : ""}`}>
              <div>
                <p className="section-kicker">Section 3</p>
                <h2 className="section-title mt-1 text-xl font-semibold text-white">Actions</h2>
              </div>

              <button
                type="submit"
                disabled={!canSubmit}
                className="primary-btn h-11 w-full rounded-xl disabled:cursor-not-allowed disabled:opacity-55"
              >
                {isSubmitting ? "Deploying..." : "Generate Files and Deploy Bot"}
              </button>

              <button
                type="button"
                onClick={handleLoadArtifacts}
                disabled={isLoadingArtifacts}
                className="secondary-btn h-11 w-full rounded-xl disabled:cursor-not-allowed disabled:opacity-55"
              >
                {isLoadingArtifacts ? "Loading Files..." : "View Generated Files (Skill + Research)"}
              </button>

            </section>
          </form>

          <aside className="space-y-4 lg:col-span-5">
            <section className="card fade-up p-5 sm:sticky sm:top-6 sm:p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="section-kicker">Live Status</p>
                  <h2 className="section-title mt-1 text-xl font-semibold text-white">Deployment Control Rail</h2>
                </div>
                <span className={`pill ${toStatusTone(latestStatus)}`}>
                  <span className="status-pulse" />
                  {latestStatus ? toStatusLabel(latestStatus) : "Idle"}
                </span>
              </div>

              <div className="mt-4 grid gap-3">
                <div className="card-subtle p-3">
                  <p className="text-xs uppercase tracking-[0.12em] text-slate-400">Deployment ID</p>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <p className="truncate font-mono text-sm text-slate-100">{effectiveDeploymentId || "-"}</p>
                    <button
                      type="button"
                      onClick={copyDeploymentId}
                      className="secondary-btn rounded-lg px-2 py-1 text-xs"
                    >
                      Copy
                    </button>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="card-subtle p-3">
                    <p className="text-xs uppercase tracking-[0.12em] text-slate-400">Job</p>
                    <p className="mt-1 truncate font-mono text-sm text-slate-100">{jobId || "-"}</p>
                  </div>
                  <div className="card-subtle p-3">
                    <p className="text-xs uppercase tracking-[0.12em] text-slate-400">Mode</p>
                    <p className="mt-1 text-sm text-slate-100">{mode || "-"}</p>
                  </div>
                  <div className="card-subtle p-3">
                    <p className="text-xs uppercase tracking-[0.12em] text-slate-400">Skill File</p>
                    <p className="mt-1 truncate font-mono text-xs text-slate-100">{skillName || "-"}</p>
                  </div>
                  <div className="card-subtle p-3">
                    <p className="text-xs uppercase tracking-[0.12em] text-slate-400">Heartbeat File</p>
                    <p className="mt-1 truncate font-mono text-xs text-slate-100">{heartbeatFileName || "-"}</p>
                  </div>
                </div>

                <div className="card-subtle p-3">
                  <p className="text-xs uppercase tracking-[0.12em] text-slate-400">Latest Message</p>
                  <p className="mt-1 text-sm text-slate-200">{latestMessage || "Waiting for deployment events..."}</p>
                </div>

                <div className="card-subtle p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs uppercase tracking-[0.12em] text-slate-400">Research</p>
                    <span className={`pill ${toResearchTone(researchStatus.status)}`}>{toResearchLabel(researchStatus.status)}</span>
                  </div>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.12em] text-slate-500">Phase</p>
                      <p className="text-xs text-slate-200">{researchStatus.phase ?? "-"}</p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.12em] text-slate-500">Confidence</p>
                      <p className="text-xs text-slate-200">
                        {researchStatus.confidenceOverall == null ? "-" : `${Math.round(researchStatus.confidenceOverall * 100)}%`}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.12em] text-slate-500">Facts</p>
                      <p className="text-xs text-slate-200">{researchStatus.factsCount}</p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.12em] text-slate-500">Sources</p>
                      <p className="text-xs text-slate-200">{researchStatus.sourcesCount}</p>
                    </div>
                  </div>
                  {researchStatus.completedAt ? (
                    <p className="mt-2 text-xs text-slate-400">Updated: {toDisplayTime(researchStatus.completedAt)}</p>
                  ) : null}
                  {researchStatus.error ? (
                    <p className="mt-2 text-xs text-rose-300">{researchStatus.error}</p>
                  ) : null}
                </div>

                {skillPreview || heartbeatPreview || researchSummaryPreview || brandFactsPreview || sourceMapPreview ? (
                  <div className="card-subtle space-y-3 p-3">
                    <p className="text-xs uppercase tracking-[0.12em] text-slate-400">Generated Files</p>

                    {skillPreview ? (
                      <details open className="rounded-md border border-slate-700/50 bg-slate-900/40 p-2">
                        <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.12em] text-cyan-200">
                          {skillPreviewName}
                        </summary>
                        <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap rounded bg-black/35 p-2 text-xs text-slate-200">
                          {skillPreview}
                        </pre>
                      </details>
                    ) : null}

                    {heartbeatPreview ? (
                      <details className="rounded-md border border-slate-700/50 bg-slate-900/40 p-2">
                        <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.12em] text-cyan-200">
                          {heartbeatPreviewName}
                        </summary>
                        <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap rounded bg-black/35 p-2 text-xs text-slate-200">
                          {heartbeatPreview}
                        </pre>
                      </details>
                    ) : null}

                    {researchSummaryPreview ? (
                      <details className="rounded-md border border-slate-700/50 bg-slate-900/40 p-2">
                        <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.12em] text-cyan-200">
                          {researchSummaryName}
                        </summary>
                        <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap rounded bg-black/35 p-2 text-xs text-slate-200">
                          {researchSummaryPreview}
                        </pre>
                      </details>
                    ) : null}

                    {brandFactsPreview ? (
                      <details className="rounded-md border border-slate-700/50 bg-slate-900/40 p-2">
                        <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.12em] text-cyan-200">
                          {brandFactsName}
                        </summary>
                        <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap rounded bg-black/35 p-2 text-xs text-slate-200">
                          {brandFactsPreview}
                        </pre>
                      </details>
                    ) : null}

                    {sourceMapPreview ? (
                      <details className="rounded-md border border-slate-700/50 bg-slate-900/40 p-2">
                        <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.12em] text-cyan-200">
                          {sourceMapName}
                        </summary>
                        <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap rounded bg-black/35 p-2 text-xs text-slate-200">
                          {sourceMapPreview}
                        </pre>
                      </details>
                    ) : null}
                  </div>
                ) : null}

                <div className="card-subtle max-h-[420px] overflow-y-auto p-3">
                  <p className="text-xs uppercase tracking-[0.12em] text-slate-400">Status Timeline</p>
                  {statusEvents.length === 0 ? (
                    <p className="mt-3 text-sm text-slate-400">No events yet.</p>
                  ) : (
                    <ul className="mt-3 space-y-3">
                      {statusEvents.map((eventItem) => (
                        <li
                          key={eventItem.id}
                          className="timeline-item"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className={`pill ${toStatusTone(eventItem.deployment_status)}`}>
                              {eventItem.deployment_status ? toStatusLabel(eventItem.deployment_status) : "Unknown"}
                            </span>
                            <span className="text-xs text-slate-500">{toDisplayTime(eventItem.createdAt)}</span>
                          </div>
                          {eventItem.message ? <p className="mt-1 text-sm text-slate-300">{eventItem.message}</p> : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}
