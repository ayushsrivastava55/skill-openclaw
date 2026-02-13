"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { getFirebaseAuth, getFirebaseIdToken, googleProvider } from "@/lib/firebase-client";
import { onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";

type SessionUser = {
  email: string;
  name: string;
  photoURL?: string | null;
};

type ChatMessage = {
  role: "user" | "assistant";
  text: string;
};

function readUser() {
  if (typeof window === "undefined") {
    return null;
  }
  const raw =
    window.localStorage.getItem("clawpilot_user") ?? window.localStorage.getItem("simpleclaw_user");
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as SessionUser;
  } catch {
    return null;
  }
}

function readCachedDeploymentId() {
  if (typeof window === "undefined") {
    return "";
  }
  return (
    (window.localStorage.getItem("clawpilot_active_deployment_id") ??
      window.localStorage.getItem("clawpilot_deployment_id") ??
      "")
  ).trim();
}

export default function ChatPage() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [deploymentId, setDeploymentId] = useState<string>("");
  const [sessionId, setSessionId] = useState<string>("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isLoadingDeployment, setIsLoadingDeployment] = useState(false);
  const [deploymentMissing, setDeploymentMissing] = useState(false);

  const getAuthHeaders = async () => {
    const token = await getFirebaseIdToken();
    if (!token) {
      throw new Error("Sign in with Google first.");
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
    const auth = getFirebaseAuth();
    if (auth) {
      const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
        if (!nextUser) {
          setUser(null);
          return;
        }
        const email = nextUser.email ?? "";
        if (!email) {
          setUser(null);
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
    const params = new URLSearchParams(window.location.search);
    const rowId = params.get("rowId")?.trim();
    if (rowId) {
      setDeploymentId(rowId);
      try {
        window.localStorage.setItem("clawpilot_active_deployment_id", rowId);
      } catch {
        // ignore
      }
      return;
    }
    const cached = readCachedDeploymentId();
    if (cached) {
      setDeploymentId(cached);
    }
  }, []);

  useEffect(() => {
    if (!user?.email || deploymentId) return;

    const loadDeployment = async () => {
      setIsLoadingDeployment(true);
      setDeploymentMissing(false);
      try {
        const headers = await getAuthHeaders();
        const response = await fetch(`/api/check-user?email=${encodeURIComponent(user.email)}`, { headers });
        const payload = (await response.json()) as { exists?: boolean; id?: string };
        if (response.ok && payload.exists && payload.id) {
          setDeploymentId(payload.id);
          try {
            window.localStorage.setItem("clawpilot_deployment_id", payload.id);
            window.localStorage.setItem("clawpilot_active_deployment_id", payload.id);
          } catch {
            // ignore
          }
        } else if (response.ok && payload.exists === false) {
          setDeploymentMissing(true);
        }
      } catch {
        // ignore while user signs in
      } finally {
        setIsLoadingDeployment(false);
      }
    };

    void loadDeployment();
  }, [deploymentId, user?.email]);

  useEffect(() => {
    if (!deploymentId) return;
    let cancelled = false;

    const loadHistory = async () => {
      try {
        const headers = await getAuthHeaders();
        const res = await fetch(`/api/chat/history?deploymentId=${encodeURIComponent(deploymentId)}&limit=80`, {
          headers
        });
        const payload = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          messages?: { role?: "user" | "assistant"; text?: string }[];
        };
        if (!res.ok || !payload.ok || !Array.isArray(payload.messages)) {
          return;
        }
        if (cancelled) return;
        const next: ChatMessage[] = payload.messages
          .map((m) => ({
            role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
            text: String(m.text ?? "")
          }))
          .filter((m) => m.text.trim().length > 0);
        setMessages(next);
      } catch {
        // ignore
      }
    };

    void loadHistory();
    return () => {
      cancelled = true;
    };
  }, [deploymentId]);

  const canSend = useMemo(() => Boolean(deploymentId && draft.trim() && !isSending), [deploymentId, draft, isSending]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSend) {
      return;
    }

    const outgoing = draft.trim();
    setDraft("");
    setMessages((prev) => [...prev, { role: "user", text: outgoing }]);
    setIsSending(true);

    try {
      const headers = await getAuthHeaders();
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...headers
        },
        body: JSON.stringify({
          deploymentId,
          message: outgoing,
          sessionId: sessionId || undefined
        })
      });

      const payload = (await response.json()) as { error?: string; reply?: string; sessionId?: string };
      if (!response.ok || !payload.reply) {
        throw new Error(payload.error ?? "Chat request failed");
      }

      if (payload.sessionId) {
        setSessionId(payload.sessionId);
      }

      setMessages((prev) => [...prev, { role: "assistant", text: payload.reply ?? "" }]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Chat request failed");
      setMessages((prev) => prev.slice(0, Math.max(0, prev.length - 1)));
      setDraft(outgoing);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-[80vh] w-full max-w-4xl flex-col px-4 py-8 sm:px-8">
      <section className="panel flex flex-col gap-4 p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-cyan-200/80">ClawPilot Web Chat</p>
            <h1 className="font-display text-3xl text-white">Chat with your bot</h1>
          </div>
          <div className="flex items-center gap-3">
            <a className="text-sm text-cyan-100 underline" href="/dashboard">
              Back to dashboard
            </a>
            {user ? (
              <button type="button" className="text-sm text-cyan-100 underline" onClick={handleSignOut}>
                Sign out
              </button>
            ) : (
              <button type="button" className="text-sm text-cyan-100 underline" onClick={handleGoogleSignIn}>
                Sign in
              </button>
            )}
          </div>
        </div>

        <p className="text-sm text-soft">
          Send test messages directly from the UI. This talks to your live deployment runtime.
        </p>

        <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-soft">
          Deployment:{" "}
          <span className="text-cyan-100">
            {deploymentId
              ? deploymentId
              : !user
                ? "Sign in required"
              : isLoadingDeployment
                ? "Detecting..."
                : deploymentMissing
                  ? "Not found for this account"
                  : "Not detected yet"}
          </span>
        </div>

        <div className="h-[52vh] overflow-y-auto rounded-xl border border-white/10 bg-[#050d1a] p-3">
          {messages.length === 0 ? (
            <p className="text-sm text-soft">No messages yet. Send your first prompt.</p>
          ) : (
            <div className="space-y-3">
              {messages.map((message, index) => (
                <div
                  key={`${message.role}-${index}`}
                  className={`max-w-[92%] rounded-xl px-3 py-2 text-sm ${
                    message.role === "user"
                      ? "ml-auto border border-cyan-300/30 bg-cyan-300/10 text-cyan-50"
                      : "border border-white/10 bg-white/5 text-zinc-100"
                  }`}>
                  {message.text}
                </div>
              ))}
            </div>
          )}
        </div>

        <form onSubmit={onSubmit} className="flex gap-2">
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={user ? "Ask your bot anything..." : "Sign in on dashboard first"}
            disabled={!user || !deploymentId || isSending}
            className="w-full rounded-lg border border-[#2b4361] bg-[#071224] px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={!canSend}
            className="button-glow rounded-lg px-4 py-2 text-sm disabled:opacity-60">
            {isSending ? "Sending..." : "Send"}
          </button>
        </form>
      </section>
    </main>
  );
}
