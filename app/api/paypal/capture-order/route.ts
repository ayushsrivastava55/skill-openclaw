import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-server";
import { finalizePayPalOrder } from "@/lib/paypal-finalize";
import { isPayPalConfigured } from "@/lib/paypal";

export async function POST(request: Request) {
  if (!isPayPalConfigured()) {
    return NextResponse.json({ error: "PayPal is not configured" }, { status: 500 });
  }

  const authUser = await getAuthenticatedUser(request);
  const body = (await request.json().catch(() => ({}))) as { orderId?: string };
  if (!body.orderId) {
    return NextResponse.json({ error: "Missing orderId" }, { status: 400 });
  }

  try {
    const result = await finalizePayPalOrder({
      orderId: body.orderId,
      authEmail: authUser?.email ?? null
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to capture PayPal order";
    const status = error instanceof Error && "statusCode" in error ? Number((error as { statusCode: number }).statusCode) : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
