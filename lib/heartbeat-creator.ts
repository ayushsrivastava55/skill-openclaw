import { env } from "@/lib/env";
import type { BrandConfig, GeneratedHeartbeat, ResearchContext } from "./brand-types";

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
Research Context: {researchContext}

The heartbeat runs every 30 minutes. Create a checklist of tasks the AI should perform:

1. Content Creation - What new content should be created?
2. Engagement - How should the bot engage with the audience?
3. Monitoring - What should be monitored?
4. Reporting - What updates should be reported?

IMPORTANT: Keep the HEARTBEAT.md file SMALL and FOCUSED. Each task should be a single line actionable item. Do NOT create lengthy descriptions. The heartbeat runs every 30 minutes, so tasks should be quick and practical.

Format as a markdown checklist with short, actionable items. Maximum 8-10 tasks total.

Include concrete tasks for:
- Discovering opportunities from: GET {PLATFORM_INTERNAL_API_BASE_URL}/api/internal/x/discover?deploymentId={PLATFORM_DEPLOYMENT_ID}&query=<urlencoded_query>
- Reading mentions from: GET {PLATFORM_INTERNAL_API_BASE_URL}/api/internal/x/mentions?deploymentId={PLATFORM_DEPLOYMENT_ID}
- Posting from: POST {PLATFORM_INTERNAL_API_BASE_URL}/api/internal/x/post
- Replying from: POST {PLATFORM_INTERNAL_API_BASE_URL}/api/internal/x/reply
- Checking action stats from: GET {PLATFORM_INTERNAL_API_BASE_URL}/api/internal/x/metrics?deploymentId={PLATFORM_DEPLOYMENT_ID}
- Using auth header: Authorization: Bearer {PLATFORM_INTERNAL_API_TOKEN}
- Reply safety: only relevant mentions, avoid duplicate replies, and keep respectful tone.
- Use OpenClaw \`exec\` + \`curl\` for these calls with shell vars (\`$PLATFORM_INTERNAL_API_BASE_URL\`, \`$PLATFORM_INTERNAL_API_TOKEN\`, \`$PLATFORM_DEPLOYMENT_ID\`).
- Do not claim lack of API access before running the calls.
- If any call fails, include exact HTTP status and response body in report.`;

function formatResearchContext(research?: ResearchContext): string {
  if (!research) return "Not provided";
  const facts = research.facts
    .slice(0, 20)
    .map((fact) => `- [${fact.confidenceLabel}] ${fact.key}: ${fact.value}`)
    .join("\n");
  return `Summary: ${research.summary}
Overall confidence: ${Math.round(research.overallConfidence * 100)}%
Facts:
${facts || "- none"}`;
}

async function callAI(prompt: string): Promise<string> {
  const apiKey = env.PLATFORM_OPENROUTER_API_KEY;
  const configuredModel = env.BRAND_CONTENT_MODEL.trim();
  const model = configuredModel.startsWith("openrouter/")
    ? configuredModel.replace(/^openrouter\//, "")
    : configuredModel;
  
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
      model,
      messages: [
        { role: "system", content: HEARTBEAT_SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
      max_tokens: 1500,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`AI call failed for model ${model}: ${error}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content ?? "";
}

export async function createBrandHeartbeat(
  brand: BrandConfig,
  research?: ResearchContext
): Promise<GeneratedHeartbeat> {
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
    )
    .replace("{researchContext}", formatResearchContext(research));

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
- Run API calls via exec/curl with runtime env vars; do not assume missing access
- Discover candidate conversations via GET \${PLATFORM_INTERNAL_API_BASE_URL}/api/internal/x/discover?deploymentId=\${PLATFORM_DEPLOYMENT_ID}&query=<urlencoded_query>
- Fetch mentions via GET \${PLATFORM_INTERNAL_API_BASE_URL}/api/internal/x/mentions?deploymentId=\${PLATFORM_DEPLOYMENT_ID}
- Check pacing via GET \${PLATFORM_INTERNAL_API_BASE_URL}/api/internal/x/metrics?deploymentId=\${PLATFORM_DEPLOYMENT_ID}
- If daytime, post one engaging update via POST \${PLATFORM_INTERNAL_API_BASE_URL}/api/internal/x/post
- Reply only to relevant mentions via POST \${PLATFORM_INTERNAL_API_BASE_URL}/api/internal/x/reply
- Check if scheduled content needs to be posted
- If any call fails, report HTTP status + raw response and continue remaining steps
- Report HEARTBEAT_OK if no urgent tasks`;
}
