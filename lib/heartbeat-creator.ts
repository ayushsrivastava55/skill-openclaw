import { env } from "@/lib/env";
import type { BrandConfig, GeneratedHeartbeat } from "./brand-types";

const OPENROUTER_BASE = "https://openrouter.ai/api/v1";

const HEARTBEAT_SYSTEM_PROMPT = `You are an expert social media manager. Your job is to create a HEARTBEAT.md file that defines the periodic tasks an AI agent should perform for a brand.

The HEARTBEAT.md is a checklist that gets executed every 30 minutes by OpenClaw. It should define:
1. Content creation tasks
2. Engagement activities
3. Monitoring tasks
4. What to check and report on

Keep tasks specific, actionable, and focused on marketing activities.`;

const HEARTBEAT_USER_PROMPT = `Create a HEARTBEAT.md for a brand with the following information:

Brand Name: {brandName}
Industry: {industry}
Target Audience: {targetAudience}
Tone: {tone}
Products: {products}
Social Links: {socialLinks}

The heartbeat runs every 30 minutes. Create a checklist of tasks the AI should perform:

1. Content Creation - What new content should be created?
2. Engagement - How should the bot engage with the audience?
3. Monitoring - What should be monitored?
4. Reporting - What updates should be reported?

IMPORTANT: Keep the HEARTBEAT.md file SMALL and FOCUSED. Each task should be a single line actionable item. Do NOT create lengthy descriptions. The heartbeat runs every 30 minutes, so tasks should be quick and practical.

Format as a markdown checklist with short, actionable items. Maximum 8-10 tasks total.

Include concrete tasks for:
- Reading mentions from: GET {PLATFORM_INTERNAL_API_BASE_URL}/api/internal/x/mentions?deploymentId={PLATFORM_DEPLOYMENT_ID}
- Posting from: POST {PLATFORM_INTERNAL_API_BASE_URL}/api/internal/x/post
- Replying from: POST {PLATFORM_INTERNAL_API_BASE_URL}/api/internal/x/reply
- Using auth header: Authorization: Bearer {PLATFORM_INTERNAL_API_TOKEN}
- Reply safety: only relevant mentions, avoid duplicate replies, and keep respectful tone.`;

async function callAI(prompt: string): Promise<string> {
  const apiKey = env.PLATFORM_OPENROUTER_API_KEY;
  
  if (!apiKey) {
    throw new Error("PLATFORM_OPENROUTER_API_KEY is not configured");
  }

  const response = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "openrouter/aurora-alpha",
      messages: [
        { role: "system", content: HEARTBEAT_SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
      max_tokens: 1500,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`AI call failed: ${error}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content ?? "";
}

export async function createBrandHeartbeat(brand: BrandConfig): Promise<GeneratedHeartbeat> {
  const userPrompt = HEARTBEAT_USER_PROMPT
    .replace("{brandName}", brand.name)
    .replace("{industry}", brand.industry || "General")
    .replace("{targetAudience}", brand.targetAudience || "General audience")
    .replace("{tone}", brand.tone || "Professional")
    .replace(
      "{products}",
      brand.products?.join(", ") || "Products/Services"
    )
    .replace(
      "{socialLinks}",
      brand.socialLinks
        ? Object.entries(brand.socialLinks)
            .map(([platform, url]) => `${platform}: ${url}`)
            .join(", ")
        : "Not specified"
    );

  let heartbeatContent = await callAI(userPrompt);

  heartbeatContent = heartbeatContent
    .replace(/^```markdown\n?/, "")
    .replace(/^```\n?$/, "")
    .trim();

  const tasks = heartbeatContent
    .split("\n")
    .filter((line) => line.match(/^[-*]\s/))
    .map((line) => line.replace(/^[-*]\s+/, "").trim());

  return {
    heartbeatMd: heartbeatContent,
    tasks,
  };
}

export function getDefaultHeartbeat(): string {
  return `# Heartbeat Checklist

- Quick scan: check for any urgent messages or mentions
- Fetch mentions via GET \${PLATFORM_INTERNAL_API_BASE_URL}/api/internal/x/mentions?deploymentId=\${PLATFORM_DEPLOYMENT_ID}
- If daytime, post one engaging update via POST \${PLATFORM_INTERNAL_API_BASE_URL}/api/internal/x/post
- Reply only to relevant mentions via POST \${PLATFORM_INTERNAL_API_BASE_URL}/api/internal/x/reply
- Check if scheduled content needs to be posted
- Report HEARTBEAT_OK if no urgent tasks`;
}
