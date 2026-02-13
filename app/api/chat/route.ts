import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-server";
import { env } from "@/lib/env";
import { chatSchema } from "@/lib/schemas";
import { makeId } from "@/lib/security";
import { appendChatMessage, getDeploymentById, getUserById } from "@/lib/store";
import { syncOpenRouterUsageForDeployment } from "@/lib/openrouter-usage";

export async function POST(request: Request) {
  const authUser = await getAuthenticatedUser(request);
  if (!authUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = chatSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const body = parsed.data;
  const deployment = await getDeploymentById(body.deploymentId);
  if (!deployment) {
    return NextResponse.json({ error: "Deployment not found" }, { status: 404 });
  }

  const owner = await getUserById(deployment.userId);
  if (!owner || owner.email.toLowerCase().trim() !== authUser.email) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (env.EXECUTION_MODE !== "remote-http" || !env.RUNTIME_CONTROLLER_URL || !env.RUNTIME_CONTROLLER_TOKEN) {
    return NextResponse.json({
      ok: true,
      sessionId: body.sessionId ?? `web_${deployment.id}`,
      reply: "Web chat preview is unavailable in mock mode. Deploy runtime in remote-http mode to use live chat."
    });
  }

  const sessionId = body.sessionId?.trim() || makeId("web");
  const userText = body.message.trim();

  try {
    // Persist user message for a consistent "SaaS" feel (history survives refresh).
    void appendChatMessage({ deploymentId: deployment.id, sessionId, role: "user", text: userText });

    const response = await fetch(`${env.RUNTIME_CONTROLLER_URL}/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.RUNTIME_CONTROLLER_TOKEN}`
      },
      body: JSON.stringify({
        deploymentId: deployment.id,
        channel: deployment.channel,
        sessionId,
        message: userText
      })
    });

    const payload = (await response.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      reply?: string;
      sessionId?: string;
    };

    if (!response.ok || !payload.ok || !payload.reply) {
      return NextResponse.json(
        { error: payload.error ?? "Runtime chat request failed" },
        { status: 502 }
      );
    }

    // Persist assistant reply for history.
    void appendChatMessage({ deploymentId: deployment.id, sessionId, role: "assistant", text: payload.reply });

    return NextResponse.json({
      ok: true,
      reply: payload.reply,
      sessionId: payload.sessionId ?? sessionId
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Runtime chat request failed";
    return NextResponse.json({ error: message }, { status: 502 });
  } finally {
    // Best-effort: keep our stored credit snapshot aligned with OpenRouter.
    // This is throttled in the helper to avoid spamming OpenRouter.
    void syncOpenRouterUsageForDeployment(deployment.id).catch(() => {});
  }
}
