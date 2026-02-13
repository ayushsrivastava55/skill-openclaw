"use client";

import { useEffect, useMemo, useState } from "react";

export default function CheckoutSuccessPage() {
  const [note, setNote] = useState("Finalizing payment and provisioning your bot...");
  const [deploymentId, setDeploymentId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [paidAtMs, setPaidAtMs] = useState<number | null>(null);

  useEffect(() => {
    const search = new URLSearchParams(window.location.search);
    const token = search.get("token");
    const type = search.get("type") === "credits" ? "credits" : "deploy";
    const captured = search.get("captured") === "1";
    const deploymentFromQuery = search.get("deploymentId");
    const paidAt = search.get("paidAt");
    const paidAtParsed = paidAt ? Number(paidAt) : NaN;
    if (Number.isFinite(paidAtParsed)) {
      setPaidAtMs(paidAtParsed);
    }

    if (type === "credits") {
      setNote("Payment captured. Redirecting to dashboard...");
      window.setTimeout(() => window.location.replace("/dashboard"), 900);
      return;
    }

    const finalize = async () => {
      if (deploymentFromQuery) {
        setDeploymentId(deploymentFromQuery);
      }

      if (!token || captured) {
        setNote("Payment captured. Waiting for your bot to come online...");
        return;
      }

      try {
        const response = await fetch("/api/paypal/capture-order", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId: token })
        });
        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as { error?: string };
          setNote(payload.error ?? "Payment captured. Waiting for your bot to come online...");
        } else {
          const payload = (await response.json().catch(() => ({}))) as { deploymentId?: string };
          if (payload.deploymentId) {
            setDeploymentId(payload.deploymentId);
          }
          setNote("Payment captured. Waiting for your bot to come online...");
        }
      } catch {
        setNote("Payment complete. Waiting for your bot to come online...");
      }
    };

    void finalize();
  }, []);

  useEffect(() => {
    if (!deploymentId) {
      return;
    }

    const source = new EventSource(`/api/user-status/stream?rowId=${deploymentId}`);

    const markReady = () => {
      setReady(true);
      setNote("Your bot is live. Redirecting to dashboard...");
      const target = deploymentId ? `/dashboard?deploymentId=${encodeURIComponent(deploymentId)}` : "/dashboard";
      window.setTimeout(() => window.location.replace(target), 800);
    };

    source.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as { deployment_status?: string; message?: string; createdAt?: string };
        if (data.message) {
          setNote(data.message);
        }
        if (data.deployment_status === "setup_error" || data.deployment_status === "pairing_error") {
          source.close();
          setNote("Setup failed. Please go back to the dashboard and retry.");
          return;
        }

        // If we see the final status, we are definitely ready. We do not require receiving intermediate events,
        // because after server restarts the in-memory event stream may not include historical steps.
        if (data.deployment_status === "telegram_pairing_complete") {
          // Guard against stale "complete" signals from a previous run when deploymentId is reused.
          // If we have a paidAt timestamp, only accept completion events that happened after the payment.
          if (paidAtMs && data.createdAt) {
            const eventMs = Date.parse(data.createdAt);
            if (Number.isFinite(eventMs) && eventMs < paidAtMs - 10_000) {
              return;
            }
          }
          source.close();
          markReady();
        }
      } catch {
        // ignore parse errors
      }
    };

    source.onerror = () => {
      // keep waiting, but update message
      setNote("Still connecting to your bot. Hang tight...");
    };

    return () => source.close();
  }, [deploymentId, paidAtMs]);

  const spinner = useMemo(() => (
    <div className="relative h-12 w-12 animate-spin rounded-full border-2 border-white/10 border-t-pilot" />
  ), []);

  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-3xl items-center justify-center px-6 py-16">
      <section className="panel w-full max-w-xl p-8 text-center">
        <p className="text-xs uppercase tracking-[0.18em] text-cyan-200/80">ClawPilot Checkout</p>
        <h1 className="mt-3 font-display text-4xl text-white">Preparing your bot</h1>
        <p className="mt-3 text-sm text-soft">
          We are provisioning your instance. You’ll be redirected automatically once it’s live.
        </p>
        <div className="mt-6 flex flex-col items-center gap-4">
          {!ready && spinner}
          <p className="text-xs text-cyan-100/90">{note}</p>
        </div>
      </section>
    </main>
  );
}
