import Stripe from "stripe";
import { env } from "@/lib/env";

let stripeClient: Stripe | null = null;

export function getStripe() {
  if (!env.STRIPE_SECRET_KEY) {
    return null;
  }
  if (!stripeClient) {
    stripeClient = new Stripe(env.STRIPE_SECRET_KEY, {
      apiVersion: "2025-08-27.basil"
    });
  }
  return stripeClient;
}

export function hasStripe() {
  return Boolean(env.STRIPE_SECRET_KEY);
}
