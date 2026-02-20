import { NextResponse } from "next/server";
import { listPersistedEvents } from "@/lib/store";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const deploymentId = (searchParams.get("deploymentId") ?? "").trim();
  const limitRaw = Number(searchParams.get("limit") ?? "120");

  if (!deploymentId) {
    return NextResponse.json({ error: "deploymentId is required" }, { status: 400 });
  }

  const events = await listPersistedEvents(deploymentId, Number.isFinite(limitRaw) ? limitRaw : 120);
  return NextResponse.json({
    ok: true,
    events: events.map((event) => ({
      id: event.id,
      deployment_status: event.status,
      message: event.message ?? "",
      createdAt: event.createdAt
    }))
  });
}
