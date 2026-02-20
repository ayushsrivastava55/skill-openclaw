import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { decrypt } from "@/lib/security";
import { getDeploymentArtifact, getDeploymentById } from "@/lib/store";

const schema = z.object({
  deploymentId: z.string().min(1, "deploymentId is required"),
  telegram_bot_token: z.string().min(1, "telegram_bot_token is required")
});

function safeTokenMatch(expected: string, actual: string) {
  const expectedBuffer = Buffer.from(expected, "utf8");
  const actualBuffer = Buffer.from(actual, "utf8");
  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }
  return timingSafeEqual(expectedBuffer, actualBuffer);
}

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const deploymentId = parsed.data.deploymentId.trim();
  const telegramToken = parsed.data.telegram_bot_token.trim();

  if (!telegramToken.includes(":")) {
    return NextResponse.json({ error: "Telegram bot token must include ':'" }, { status: 400 });
  }

  const deployment = await getDeploymentById(deploymentId);
  if (!deployment) {
    return NextResponse.json({ error: "Deployment not found" }, { status: 404 });
  }

  let expectedToken = "";
  try {
    expectedToken = decrypt(deployment.encryptedChannelPrimaryToken);
  } catch {
    return NextResponse.json({ error: "Stored deployment token is invalid." }, { status: 500 });
  }

  if (!safeTokenMatch(expectedToken, telegramToken)) {
    return NextResponse.json({ error: "Telegram token does not match this deployment." }, { status: 403 });
  }

  const [skill, heartbeat, researchSummary, brandFacts, sourceMap] = await Promise.all([
    getDeploymentArtifact(deploymentId, "skill"),
    getDeploymentArtifact(deploymentId, "heartbeat"),
    getDeploymentArtifact(deploymentId, "research_summary"),
    getDeploymentArtifact(deploymentId, "brand_facts"),
    getDeploymentArtifact(deploymentId, "source_map")
  ]);

  return NextResponse.json({
    ok: true,
    artifacts: {
      skill: skill
        ? {
            fileName: skill.fileName,
            content: skill.content,
            updatedAt: skill.updatedAt
          }
        : null,
      heartbeat: heartbeat
        ? {
            fileName: heartbeat.fileName,
            content: heartbeat.content,
            updatedAt: heartbeat.updatedAt
          }
        : null,
      researchSummary: researchSummary
        ? {
            fileName: researchSummary.fileName,
            content: researchSummary.content,
            updatedAt: researchSummary.updatedAt
          }
        : null,
      brandFacts: brandFacts
        ? {
            fileName: brandFacts.fileName,
            content: brandFacts.content,
            updatedAt: brandFacts.updatedAt
          }
        : null,
      sourceMap: sourceMap
        ? {
            fileName: sourceMap.fileName,
            content: sourceMap.content,
            updatedAt: sourceMap.updatedAt
          }
        : null
    }
  });
}
