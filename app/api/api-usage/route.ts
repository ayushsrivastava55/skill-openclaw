import { NextResponse } from "next/server";
import { getUsage, upsertUsage } from "@/lib/store";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rowId = searchParams.get("rowId");
  if (!rowId) {
    return NextResponse.json({ error: "rowId is required" }, { status: 400 });
  }

  const usage = getUsage(rowId) ?? upsertUsage(rowId);
  return NextResponse.json({
    data: {
      limit_total: usage.limitTotal,
      limit_remaining: usage.limitRemaining,
      period_start: usage.periodStart,
      period_end: usage.periodEnd,
      updated_at: usage.updatedAt
    }
  });
}
