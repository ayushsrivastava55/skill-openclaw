"use client";

import { useEffect, useMemo, useState } from "react";

export default function CheckoutCancelledPage() {
  const [title, setTitle] = useState("Checkout cancelled");
  const [detail, setDetail] = useState("No worries. Nothing was activated. You can return and launch again anytime.");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const provider = (params.get("provider") || "").toLowerCase();
    const status = (params.get("status") || "").toLowerCase();

    if (status === "failed") {
      setTitle("Payment failed");
      setDetail("Your payment did not complete. Please retry checkout to provision your bot.");
      return;
    }
    if (provider === "dodo" && status) {
      setTitle("Checkout not completed");
      setDetail(`Payment status: ${status}. You can retry checkout anytime.`);
    }
  }, []);

  const backHref = useMemo(() => "/dashboard?checkout=cancelled", []);

  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-3xl items-center justify-center px-6 py-16">
      <section className="panel w-full max-w-xl p-8 text-center">
        <p className="text-xs uppercase tracking-[0.18em] text-cyan-200/80">ClawPilot Checkout</p>
        <h1 className="mt-3 font-display text-4xl text-white">{title}</h1>
        <p className="mt-3 text-sm text-soft">{detail}</p>
        <a className="button-glow mt-6 inline-block rounded-lg px-5 py-2 text-sm" href={backHref}>
          Back to dashboard
        </a>
      </section>
    </main>
  );
}
