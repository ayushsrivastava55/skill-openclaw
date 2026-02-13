"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { getFirebaseAuth, getFirebaseIdToken, googleProvider } from "@/lib/firebase-client";
import { onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";

type SessionUser = {
  email: string;
  name: string;
  photoURL?: string | null;
};

type UsagePayload = {
  data?: {
    limit_total: number;
    limit_remaining: number;
    period_start: string;
    period_end: string;
    updated_at: string;
  };
  error?: string;
};

type DeploymentStatus = "setup_started" | "setup_complete" | "telegram_pairing_started" | "telegram_pairing_complete" | "setup_error" | "pairing_error";

const STATUS_LABELS: Record<DeploymentStatus, string> = {
  setup_started: "Provisioning",
  setup_complete: "Online",
  telegram_pairing_started: "Waiting for bot response",
  telegram_pairing_complete: "Linked",
  setup_error: "Error",
  pairing_error: "Error"
};

function readUser() {
  if (typeof window === "undefined") {
    return null;
  }
  const raw =
    window.localStorage.getItem("clawpilot_user") ?? window.localStorage.getItem("simpleclaw_user");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SessionUser;
  } catch {
    return null;
  }
}

export default function DashboardPage() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [deploymentId, setDeploymentId] = useState<string>("");
  const [deployments, setDeployments] = useState<
    {
      id: string;
      plan: string;
      channel: string;
      status: DeploymentStatus;
      createdAt: string;
      updatedAt: string;
      subscriptionStatus?: string | null;
    }[]
  >([]);
  const [deploymentStatus, setDeploymentStatus] = useState<DeploymentStatus | null>(null);
  const [deploymentPlan, setDeploymentPlan] = useState<string>("");
  const [deploymentChannel, setDeploymentChannel] = useState<string>("");
  const [deploymentCreatedAt, setDeploymentCreatedAt] = useState<string>("");
  const [subscriptionStatus, setSubscriptionStatus] = useState<string>("");
  const [usage, setUsage] = useState<UsagePayload["data"] | null>(null);
  const [isLoadingUsage, setIsLoadingUsage] = useState(false);
  const [usageError, setUsageError] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [redeployChannel, setRedeployChannel] = useState<"telegram" | "discord">("telegram");
  const [redeployTelegramToken, setRedeployTelegramToken] = useState("");
  const [redeployDiscordToken, setRedeployDiscordToken] = useState("");
  const [isRedeploying, setIsRedeploying] = useState(false);
  const [isStopping, setIsStopping] = useState(false);

  const getAuthHeaders = async () => {
    const token = await getFirebaseIdToken();
    if (!token) {
      throw new Error("Sign in with Google to continue.");
    }
    return { Authorization: `Bearer ${token}` };
  };

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
      try {
        window.localStorage.setItem("clawpilot_user", JSON.stringify(nextUser));
      } catch {
        // ignore
      }
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
    setUser(null);
    try {
      window.localStorage.removeItem("clawpilot_user");
      window.localStorage.removeItem("simpleclaw_user");
    } catch {
      // ignore
    }
    toast.success("Signed out");
  };

  useEffect(() => {
    const cached = readUser();
    if (cached) {
      setUser(cached);
    }
    const params = new URLSearchParams(window.location.search);
    const dep = params.get("deploymentId")?.trim();
    if (dep) {
      setDeploymentId(dep);
      try {
        window.localStorage.setItem("clawpilot_deployment_id", dep);
        window.localStorage.setItem("clawpilot_active_deployment_id", dep);
      } catch {
        // ignore
      }
    } else {
      try {
        const active = (window.localStorage.getItem("clawpilot_active_deployment_id") ?? "").trim();
        if (active) {
          setDeploymentId(active);
        }
      } catch {
        // ignore
      }
    }
    const auth = getFirebaseAuth();
    if (auth) {
      const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
        if (!nextUser) {
          setUser(null);
          setDeployments([]);
          return;
        }
        const email = nextUser.email ?? "";
        if (!email) {
          setUser(null);
          setDeployments([]);
          return;
        }
        setUser((prev) =>
          prev?.email === email
            ? prev
            : { email, name: nextUser.displayName ?? "User", photoURL: nextUser.photoURL }
        );
      });
      return () => unsubscribe();
    }
  }, []);

  useEffect(() => {
    if (!user?.email) return;

    const loadList = async () => {
      try {
        const headers = await getAuthHeaders();
        // Do not pass email from client state/localStorage. Always rely on the verified Firebase token server-side.
        const listRes = await fetch("/api/deployments/list", { headers });
        const listPayload = (await listRes.json().catch(() => ({}))) as {
          ok?: boolean;
          deployments?: {
            id: string;
            plan: string;
            channel: string;
            status: DeploymentStatus;
            createdAt: string;
            updatedAt: string;
            subscriptionStatus?: string | null;
          }[];
        };
        if (listRes.status === 401) {
          // Signed out / token expired.
          setDeployments([]);
          return;
        }
        if (listRes.ok && listPayload.ok && Array.isArray(listPayload.deployments)) {
          setDeployments(listPayload.deployments);
          if (!deploymentId && listPayload.deployments[0]?.id) {
            setDeploymentId(listPayload.deployments[0].id);
            try {
              window.localStorage.setItem("clawpilot_active_deployment_id", listPayload.deployments[0].id);
            } catch {
              // ignore
            }
          }
        }
      } catch {
        // ignore transient errors; /api/check-user will still drive primary state
      } finally {
        setIsLoading(false);
      }
    };

    void loadList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.email]);

  useEffect(() => {
    if (!user?.email || !deploymentId) return;

    const loadDeployment = async () => {
      try {
        const headers = await getAuthHeaders();
        const response = await fetch(`/api/deployments/get?deploymentId=${encodeURIComponent(deploymentId)}`, {
          headers
        });
        const payload = (await response.json().catch(() => ({}))) as {
          ok?: boolean;
          deployment?: {
            id: string;
            plan: string;
            channel: string;
            status: DeploymentStatus;
            createdAt: string;
            subscriptionStatus?: string | null;
          };
          error?: string;
        };

        if (response.status === 401) {
          throw new Error("Sign in with Google to continue.");
        }
        if (response.status === 403) {
          // Most common cause: localStorage kept an old deploymentId from another account/session.
          try {
            window.localStorage.removeItem("clawpilot_active_deployment_id");
            window.localStorage.removeItem("clawpilot_deployment_id");
          } catch {
            // ignore
          }
          setDeploymentId("");
          setDeploymentStatus(null);
          setDeploymentPlan("");
          setDeploymentChannel("");
          setDeploymentCreatedAt("");
          setSubscriptionStatus("");
          setUsage(null);
          setUsageError("");
          throw new Error("This deployment isn’t available for your signed-in account. Pick another deployment.");
        }

        if (!response.ok || !payload.ok || !payload.deployment) {
          throw new Error(payload.error ?? "Deployment not found");
        }

        setDeploymentStatus(payload.deployment.status ?? null);
        setDeploymentPlan(payload.deployment.plan ?? "");
        setDeploymentChannel(payload.deployment.channel ?? "");
        setDeploymentCreatedAt(payload.deployment.createdAt ?? "");
        setSubscriptionStatus(payload.deployment.subscriptionStatus ?? "");

        try {
          window.localStorage.setItem("clawpilot_active_deployment_id", payload.deployment.id);
        } catch {
          // ignore
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Unable to load deployment");
      }
    };

    void loadDeployment();
  }, [deploymentId, user?.email]);

  useEffect(() => {
    if (!deploymentId) return;

    const controller = new AbortController();
    const stream = async () => {
      try {
        const response = await fetch(`/api/user-status/stream?rowId=${deploymentId}`, {
          signal: controller.signal
        });
        if (!response.body) return;
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const chunks = buffer.split("\n\n");
          buffer = chunks.pop() ?? "";
          for (const chunk of chunks) {
            if (!chunk.startsWith("data:")) continue;
            const json = chunk.replace("data:", "").trim();
            try {
              const event = JSON.parse(json) as { deployment_status?: DeploymentStatus };
              if (event.deployment_status) {
                setDeploymentStatus(event.deployment_status);
              }
            } catch {
              // ignore parse errors
            }
          }
        }
      } catch {
        // ignore stream errors
      }
    };

    void stream();
    return () => controller.abort();
  }, [deploymentId]);

  const handleRedeploy = async () => {
    if (!deploymentId) {
      toast.error("No deployment found yet.");
      return;
    }
    if (deploymentPlan === "pro" && subscriptionStatus && subscriptionStatus !== "active") {
      toast.error("Subscription not active. Please re-subscribe.");
      return;
    }
    const token = redeployChannel === "telegram" ? redeployTelegramToken.trim() : redeployDiscordToken.trim();
    if (!token) {
      toast.error("Paste your bot token.");
      return;
    }

    setIsRedeploying(true);
    try {
      const headers = await getAuthHeaders();
      // Validate token before redeploy so we don't strand users on the loader.
      const validateRes = await fetch("/api/tokens/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ channel: redeployChannel, token })
      });
      if (!validateRes.ok) {
        const v = (await validateRes.json().catch(() => ({}))) as { error?: string };
        throw new Error(v.error ?? "Token validation failed");
      }

      const redeployRes = await fetch("/api/deployments/redeploy", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({
          deploymentId,
          channel: redeployChannel,
          telegram_bot_token: redeployChannel === "telegram" ? token : undefined,
          discord_bot_token: redeployChannel === "discord" ? token : undefined
        })
      });
      const payload = (await redeployRes.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!redeployRes.ok || !payload.ok) {
        throw new Error(payload.error ?? "Redeploy failed");
      }

      toast.success("Redeploy started. Watch the status updates.");
      setRedeployTelegramToken("");
      setRedeployDiscordToken("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Redeploy failed");
    } finally {
      setIsRedeploying(false);
    }
  };

  const handleStop = async () => {
    if (!deploymentId) return;
    setIsStopping(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/deployments/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ deploymentId })
      });
      const payload = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !payload.ok) {
        throw new Error(payload.error ?? "Stop failed");
      }
      toast.success("Bot stopped.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Stop failed");
    } finally {
      setIsStopping(false);
    }
  };

  useEffect(() => {
    if (!deploymentId) return;
    if (!user?.email) return;
    if (!deploymentPlan) return;
    setUsageError("");

    let cancelled = false;
    const loadUsage = async () => {
      setIsLoadingUsage(true);
      try {
        const headers = await getAuthHeaders();
        const response = await fetch(`/api/openrouter/usage?rowId=${deploymentId}`, { headers });
        const payload = (await response.json().catch(() => ({}))) as UsagePayload;
        if (!response.ok || payload.error) {
          if (!cancelled) {
            setUsage(null);
            setUsageError(payload.error ?? "Credit balance not available yet.");
          }
          return;
        }
        if (!payload.data) {
          if (!cancelled) {
            setUsage(null);
            setUsageError("Credit balance not available yet.");
          }
          return;
        }
        if (cancelled) return;
        setUsage(payload.data);
        setUsageError("");
      } catch {
        // ignore
      } finally {
        if (!cancelled) setIsLoadingUsage(false);
      }
    };

    void loadUsage();
    return () => {
      cancelled = true;
    };
  }, [deploymentId, deploymentPlan, user?.email]);

  const refreshUsage = async () => {
    if (!deploymentId || !user?.email) return;
    setIsLoadingUsage(true);
    try {
      const headers = await getAuthHeaders();
      const response = await fetch(`/api/openrouter/usage?rowId=${deploymentId}`, { headers });
      const payload = (await response.json().catch(() => ({}))) as UsagePayload;
      if (!response.ok || payload.error || !payload.data) {
        setUsage(null);
        setUsageError(payload.error ?? "Credit balance not available yet.");
        return;
      }
      setUsage(payload.data);
      setUsageError("");
    } catch {
      // ignore
    } finally {
      setIsLoadingUsage(false);
    }
  };

  const statusLabel = deploymentStatus ? STATUS_LABELS[deploymentStatus] : "Not linked";
  const statusColor =
    deploymentStatus === "setup_complete" || deploymentStatus === "telegram_pairing_complete"
      ? "text-terminal"
      : deploymentStatus?.includes("error")
        ? "text-pilot"
        : "text-holo";

  const actionsDisabled = !deploymentId;
  const chatLink = deploymentId ? `/chat?rowId=${deploymentId}` : "/chat";

  const selectDeployment = (id: string) => {
    const next = id.trim();
    if (!next) return;
    setDeploymentId(next);
    try {
      window.localStorage.setItem("clawpilot_active_deployment_id", next);
    } catch {
      // ignore
    }
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("deploymentId", next);
      window.history.replaceState({}, "", url.toString());
    } catch {
      // ignore
    }
  };

  const creditsRemaining = usage?.limit_remaining ?? 0;
  const creditsTotal = usage?.limit_total ?? 0;
  const creditsPercent = creditsTotal ? Math.max(2, Math.round((creditsRemaining / creditsTotal) * 100)) : 0;

  return (
    <main className="relative min-h-screen overflow-hidden px-6 py-24">
      <div className="hero-grid absolute inset-0 opacity-20" />
      <section className="relative mx-auto flex w-full max-w-6xl flex-col gap-10">
        <header className="flex flex-wrap items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="relative h-14 w-14 rounded-3xl border border-pilot/40 bg-white/5 shadow-[0_0_18px_rgba(241,250,238,0.22)]">
              <Image src="/quickclaw-logo.png" alt="QuickClaw logo" fill className="object-contain p-1" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-muted">QuickClaw Dashboard</p>
              <h1 className="font-heading text-3xl text-holo">Welcome back{user?.name ? `, ${user.name}` : ""}</h1>
              <p className="text-sm text-muted">Manage your bot, view logs, and chat instantly.</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button asChild className="px-5 py-3 text-xs">
              <a href={chatLink}>Open Web Chat</a>
            </Button>
            {user ? (
              <Button className="bg-white/5 text-muted shadow-none hover:bg-white/10" onClick={handleSignOut}>
                Sign out
              </Button>
            ) : (
              <Button className="bg-white/10 text-holo shadow-none hover:bg-white/20" onClick={handleGoogleSignIn}>
                Sign in with Google
              </Button>
            )}
          </div>
        </header>

        <Card className="relative overflow-hidden p-6">
          <div className="absolute inset-0 bg-radial-grid opacity-60" />
          <div className="relative space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-muted">Your bots</p>
                <h2 className="font-heading text-2xl text-holo">Deployments</h2>
              </div>
              <span className="rounded-full border border-white/10 px-3 py-1 text-[10px] uppercase tracking-[0.3em] text-muted">
                {deployments.length} total
              </span>
            </div>

            {deployments.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-void/80 p-4 text-xs text-muted">
                {!user
                  ? "Sign in to see your deployments."
                  : isLoading
                    ? "Loading deployments..."
                    : "No deployments yet. Deploy your first bot from the home page."}
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {deployments.map((dep) => {
                  const active = dep.id === deploymentId;
                  const label = STATUS_LABELS[dep.status] ?? dep.status;
                  return (
                    <button
                      key={dep.id}
                      type="button"
                      onClick={() => selectDeployment(dep.id)}
                      className={cn(
                        "rounded-2xl border px-4 py-3 text-left transition",
                        active ? "border-pilot/70 bg-pilot/10" : "border-white/10 bg-void/70 hover:border-pilot/40"
                      )}
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <p className="text-[10px] uppercase tracking-[0.3em] text-muted">
                            {dep.plan} • {dep.channel}
                          </p>
                          <p className="mt-1 font-heading text-sm text-holo">{dep.id}</p>
                        </div>
                        <span
                          className={cn(
                            "rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.3em]",
                            dep.status.includes("error")
                              ? "border-pilot/40 bg-pilot/10 text-pilot"
                              : dep.status === "telegram_pairing_complete"
                                ? "border-terminal/30 bg-terminal/10 text-terminal"
                                : "border-white/10 bg-white/5 text-muted"
                          )}
                        >
                          {active ? `Active: ${label}` : label}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </Card>

        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <Card className="relative overflow-hidden p-6">
            <div className="absolute inset-0 bg-radial-grid opacity-60" />
            <div className="relative space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-muted">Deployment</p>
                  <h2 className="font-heading text-2xl text-holo">Status</h2>
                </div>
                <div className={cn("text-xs uppercase tracking-[0.3em]", statusColor)}>{statusLabel}</div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-void/80 p-4 text-xs text-muted">
                <p className="uppercase tracking-[0.3em] text-muted">Deployment ID</p>
                <p className="mt-2 text-holo">{deploymentId || (isLoading ? "Loading..." : "Not found yet")}</p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-void/80 p-4 text-xs text-muted">
                <p className="uppercase tracking-[0.3em] text-muted">Details</p>
                <div className="mt-3 grid gap-2 text-xs text-muted">
                  <p>
                    <span className="text-holo">Plan:</span> {deploymentPlan || "—"}
                  </p>
                  <p>
                    <span className="text-holo">Channel:</span> {deploymentChannel || "—"}
                  </p>
                  <p>
                    <span className="text-holo">Created:</span>{" "}
                    {deploymentCreatedAt ? new Date(deploymentCreatedAt).toLocaleString() : "—"}
                  </p>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-void/80 p-4 text-xs text-muted">
                <div className="flex items-center justify-between gap-3">
                  <p className="uppercase tracking-[0.3em] text-muted">
                    {deploymentPlan === "starter" ? "OpenRouter Balance" : "AI Credits"}
                  </p>
                  <button
                    type="button"
                    onClick={refreshUsage}
                    disabled={actionsDisabled || isLoadingUsage}
                    className={cn(
                      "rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.3em] transition",
                      actionsDisabled || isLoadingUsage
                        ? "border-white/10 text-muted"
                        : "border-pilot/40 text-holo hover:border-pilot/70"
                    )}
                  >
                    {isLoadingUsage ? "Refreshing..." : "Refresh"}
                  </button>
                </div>

                {usage ? (
                  <>
                    <div className="mt-3 flex items-center justify-between text-sm">
                      <span className="text-holo">Remaining</span>
                      <span className="text-terminal">${creditsRemaining}</span>
                    </div>
                    <div className="mt-3 h-2 w-full rounded-full bg-white/10">
                      <div className="h-2 rounded-full bg-terminal" style={{ width: `${creditsPercent}%` }} />
                    </div>
                    <p className="mt-2 text-xs text-muted">
                      {creditsTotal > 0 ? `Total: $${creditsTotal}` : "No spending limit detected on this key."}
                    </p>
                    <p className="mt-1 text-[10px] uppercase tracking-[0.3em] text-muted">
                      Updated {usage.updated_at ? new Date(usage.updated_at).toLocaleString() : "—"}
                    </p>
                  </>
                ) : (
                  <p className="mt-3 text-xs text-muted">
                    {isLoadingUsage
                      ? "Loading credit balance..."
                      : usageError
                        ? usageError
                        : "Credit balance not available yet."}
                  </p>
                )}
              </div>

              <div className="rounded-2xl border border-white/10 bg-void/80 p-4 text-xs text-muted">
                <p className="uppercase tracking-[0.3em] text-muted">Next Steps</p>
                <ul className="mt-3 space-y-2 text-xs text-muted">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 size={12} className="text-terminal" />
                    Send a test message in Telegram or Discord.
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 size={12} className="text-terminal" />
                    Use Web Chat for quick QA.
                  </li>
                </ul>
              </div>
            </div>
          </Card>

          <Card className="relative overflow-hidden p-6">
            <div className="absolute inset-0 bg-radial-grid opacity-60" />
            <div className="relative space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-muted">Getting Started</p>
                  <h2 className="font-heading text-2xl text-holo">Quick actions</h2>
                </div>
                <span className="rounded-full border border-white/10 px-3 py-1 text-[10px] uppercase tracking-[0.3em] text-muted">
                  Live
                </span>
              </div>
              <div className="rounded-2xl border border-white/10 bg-void/80 p-4 text-xs text-muted">
                <p className="uppercase tracking-[0.3em] text-muted">Helpful links</p>
                <div className="mt-3 grid gap-2 text-xs">
                  <a
                    className="rounded-xl border border-white/10 bg-void/70 px-3 py-2 text-left text-xs uppercase tracking-[0.3em] text-holo"
                    href="https://youtu.be/_w4VcagV8EA?si=CycjZHunuJ-JexUq"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Telegram bot token guide
                  </a>
                  <a
                    className="rounded-xl border border-white/10 bg-void/70 px-3 py-2 text-left text-xs uppercase tracking-[0.3em] text-holo"
                    href="https://youtu.be/65SYyMP_klI?si=JorHHBRPnXU10zIx"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Discord bot token guide
                  </a>
                  <a
                    className={cn(
                      "rounded-xl border border-white/10 bg-void/70 px-3 py-2 text-left text-xs uppercase tracking-[0.3em]",
                      actionsDisabled ? "text-muted" : "text-holo"
                    )}
                    href={chatLink}
                  >
                    Open web chat
                  </a>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-void/80 p-4">
                <p className="text-xs uppercase tracking-[0.3em] text-muted">Redeploy bot</p>
                <p className="mt-2 text-xs text-muted">
                  Paste a new token and we will reprovision your runtime. Use this if you rotated credentials or want to switch bots.
                </p>
                <div className="mt-4 grid gap-3">
                  <div className="flex flex-wrap gap-2">
                    {(["telegram", "discord"] as const).map((id) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setRedeployChannel(id)}
                        className={cn(
                          "rounded-full border px-4 py-2 text-[10px] uppercase tracking-[0.3em] transition",
                          redeployChannel === id
                            ? "border-terminal/40 bg-terminal/10 text-terminal"
                            : "border-white/10 bg-white/5 text-holo hover:border-pilot/40"
                        )}
                      >
                        {id}
                      </button>
                    ))}
                  </div>

                  {redeployChannel === "telegram" ? (
                    <input
                      value={redeployTelegramToken}
                      onChange={(event) => setRedeployTelegramToken(event.target.value)}
                      placeholder="Telegram bot token (123456:ABC...)"
                      className="w-full rounded-2xl border border-white/10 bg-void/70 px-4 py-3 text-sm text-holo"
                    />
                  ) : (
                    <input
                      value={redeployDiscordToken}
                      onChange={(event) => setRedeployDiscordToken(event.target.value)}
                      placeholder="Discord bot token"
                      className="w-full rounded-2xl border border-white/10 bg-void/70 px-4 py-3 text-sm text-holo"
                    />
                  )}

                  <Button
                    className="w-full bg-white/10 text-holo shadow-none hover:bg-white/20"
                    disabled={actionsDisabled || isRedeploying}
                    onClick={handleRedeploy}
                  >
                    {isRedeploying ? "Redeploying..." : "Start redeploy"}
                  </Button>

                  <Button
                    className="w-full bg-white/5 text-muted shadow-none hover:bg-white/10"
                    disabled={actionsDisabled || isStopping}
                    onClick={handleStop}
                  >
                    {isStopping ? "Stopping..." : "Stop bot"}
                  </Button>
                </div>
              </div>

              <p className="text-xs text-muted">Everything here is connected to your live deployment.</p>
            </div>
          </Card>
        </div>

      </section>
    </main>
  );
}
