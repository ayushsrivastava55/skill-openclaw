import { env } from "@/lib/env";
import { initFirebaseAdmin } from "@/lib/firebase-admin";
import { getFirestore } from "firebase-admin/firestore";

type RazorpayPlanCreateResponse = {
  id: string;
};

type StoredPlans = {
  currency: string;
  starterMonthly: string;
  starterYearly: string;
  proMonthly: string;
  proYearly: string;
  createdAt: string;
};

const db = getFirestore(initFirebaseAdmin());
const configCol = db.collection("config");

function getAuthHeader() {
  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) {
    throw new Error("Razorpay is not configured");
  }
  const encoded = Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`, "utf8").toString("base64");
  return `Basic ${encoded}`;
}

function nowIso() {
  return new Date().toISOString();
}

// Keep the same USD list prices in marketing, but charge INR for now.
// We round to the nearest 100 INR to avoid awkward amounts.
const USD_TO_INR = 85;
function usdToInrRounded(amountUsd: number) {
  const raw = amountUsd * USD_TO_INR;
  return Math.round(raw / 100) * 100;
}

async function createPlan(input: { name: string; amountInr: number; period: "monthly" | "yearly" }) {
  if ((env.RAZORPAY_CURRENCY || "INR").toUpperCase() !== "INR") {
    throw new Error("Auto plan creation only supports INR pricing for now.");
  }

  const response = await fetch("https://api.razorpay.com/v1/plans", {
    method: "POST",
    headers: {
      Authorization: getAuthHeader(),
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      period: input.period === "yearly" ? "yearly" : "monthly",
      interval: 1,
      item: {
        name: input.name,
        amount: input.amountInr * 100,
        currency: "INR",
        description: "QuickClaw subscription"
      },
      notes: {
        app: "quickclaw",
        currency: "INR"
      }
    })
  });

  const payload = (await response.json().catch(() => ({}))) as Partial<RazorpayPlanCreateResponse> & {
    error?: { description?: string };
  };
  if (!response.ok || !payload.id) {
    const reason = payload.error?.description ?? "unknown_error";
    throw new Error(`Razorpay create plan failed (${response.status}): ${reason}`);
  }
  return payload.id;
}

export async function getRazorpayPlanIds(): Promise<{
  starterMonthly: string;
  starterYearly: string;
  proMonthly: string;
  proYearly: string;
}> {
  // Prefer explicit env overrides if present.
  if (
    env.RAZORPAY_PLAN_STARTER_MONTHLY &&
    env.RAZORPAY_PLAN_STARTER_YEARLY &&
    env.RAZORPAY_PLAN_PRO_MONTHLY &&
    env.RAZORPAY_PLAN_PRO_YEARLY
  ) {
    return {
      starterMonthly: env.RAZORPAY_PLAN_STARTER_MONTHLY,
      starterYearly: env.RAZORPAY_PLAN_STARTER_YEARLY,
      proMonthly: env.RAZORPAY_PLAN_PRO_MONTHLY,
      proYearly: env.RAZORPAY_PLAN_PRO_YEARLY
    };
  }

  // When testing with tiny prices, we must not overwrite the live-ish plans mapping.
  const docId = env.RAZORPAY_TEST_MODE === "1" ? "razorpayPlans_inr_test_v1" : "razorpayPlans_inr_v1";
  const snap = await configCol.doc(docId).get();
  if (snap.exists) {
    const data = snap.data() as StoredPlans;
    if (data?.starterMonthly && data?.starterYearly && data?.proMonthly && data?.proYearly) {
      return {
        starterMonthly: data.starterMonthly,
        starterYearly: data.starterYearly,
        proMonthly: data.proMonthly,
        proYearly: data.proYearly
      };
    }
  }

  // Create plans once and persist.
  const starterMonthlyInr = env.RAZORPAY_TEST_MODE === "1" ? 1 : usdToInrRounded(19);
  const starterYearlyInr = env.RAZORPAY_TEST_MODE === "1" ? 10 : usdToInrRounded(190);
  const proMonthlyInr = env.RAZORPAY_TEST_MODE === "1" ? 5 : usdToInrRounded(39);
  const proYearlyInr = env.RAZORPAY_TEST_MODE === "1" ? 50 : usdToInrRounded(390);

  const starterMonthly = await createPlan({
    name: `Starter Monthly (INR ${starterMonthlyInr})`,
    amountInr: starterMonthlyInr,
    period: "monthly"
  });
  const starterYearly = await createPlan({
    name: `Starter Yearly (INR ${starterYearlyInr})`,
    amountInr: starterYearlyInr,
    period: "yearly"
  });
  const proMonthly = await createPlan({
    name: `Pro Monthly (INR ${proMonthlyInr})`,
    amountInr: proMonthlyInr,
    period: "monthly"
  });
  const proYearly = await createPlan({
    name: `Pro Yearly (INR ${proYearlyInr})`,
    amountInr: proYearlyInr,
    period: "yearly"
  });

  await configCol.doc(docId).set({
    currency: "INR",
    starterMonthly,
    starterYearly,
    proMonthly,
    proYearly,
    createdAt: nowIso()
  } satisfies StoredPlans);

  return { starterMonthly, starterYearly, proMonthly, proYearly };
}
