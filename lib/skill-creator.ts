import { env } from "@/lib/env";
import type { BrandConfig, GeneratedSkill, ResearchContext } from "./brand-types";

const OPENROUTER_BASE = "https://openrouter.ai/api/v1";

const SKILL_SYSTEM_PROMPT = `You are an expert brand strategist and content creator. Your job is to analyze a brand and create a detailed SKILL.md file that teaches an AI agent how to create content for that specific brand.

Generate a comprehensive SKILL.md file following the OpenClaw AgentSkills format with YAML frontmatter. The skill should define:
1. Brand persona and voice
2. Content guidelines and rules
3. Posting style and frequency
4. Topics to cover
5. Hashtags and keywords
6. What to do and what to avoid
7. Example content
8. X automation playbook using internal APIs for posting and replies

Make it highly specific to the brand - include actual brand details, products, values, and target audience.`;

const SKILL_USER_PROMPT = `Create a detailed SKILL.md for a brand with the following information:

Brand Name: {brandName}
Website: {website}
Description: {description}
Industry: {industry}
Target Audience: {targetAudience}
Tone: {tone}
Products/Services: {products}
Social Links: {socialLinks}
Additional Context: {additionalContext}
Research Context: {researchContext}

Generate a complete SKILL.md file with:
- Proper YAML frontmatter with name and description
- Detailed brand persona section
- Content guidelines (do's and don'ts)
- Posting rules and frequency
- Topics to create content about
- Hashtags and keywords to use
- Example posts (2-3 examples)
- Any special considerations
- A section named "X Automation APIs" with exact request examples for:
  - POST {PLATFORM_INTERNAL_API_BASE_URL}/api/internal/x/post
  - GET {PLATFORM_INTERNAL_API_BASE_URL}/api/internal/x/discover?deploymentId={PLATFORM_DEPLOYMENT_ID}&query=<urlencoded_query>
  - GET {PLATFORM_INTERNAL_API_BASE_URL}/api/internal/x/mentions?deploymentId={PLATFORM_DEPLOYMENT_ID}
  - POST {PLATFORM_INTERNAL_API_BASE_URL}/api/internal/x/reply
  - GET {PLATFORM_INTERNAL_API_BASE_URL}/api/internal/x/metrics?deploymentId={PLATFORM_DEPLOYMENT_ID}
- Mention required auth header: Authorization: Bearer {PLATFORM_INTERNAL_API_TOKEN}
- Mention required deployment id variable: {PLATFORM_DEPLOYMENT_ID}
- Use exact request payload keys:
  - /api/internal/x/post body: {"deploymentId":"{PLATFORM_DEPLOYMENT_ID}","text":"<post text>"}
  - /api/internal/x/reply body: {"deploymentId":"{PLATFORM_DEPLOYMENT_ID}","inReplyToTweetId":"<tweet_id>","text":"<reply text>","targetAuthorId":"<author_id>","conversationId":"<conversation_id>"}
- Do not use unsupported keys like content, mediaUrls, or scheduleAt.
- Recommend this loop: read mentions + discover candidates -> draft -> check metrics/API responses -> post or reply.
- Non-negotiable execution behavior:
  - Use OpenClaw \`exec\` tool to call internal APIs with \`curl\`.
  - Use runtime env vars directly: \`$PLATFORM_INTERNAL_API_BASE_URL\`, \`$PLATFORM_INTERNAL_API_TOKEN\`, \`$PLATFORM_DEPLOYMENT_ID\`.
  - Do NOT claim lack of access before attempting the API calls.
  - If a call fails, report exact HTTP status + response body and continue with other steps.

The skill name should be in kebab-case (e.g., "acme-corp-marketing").

When Research Context is present:
- Treat "verified" facts as hard constraints.
- Treat "inferred" facts as suggestions, not hard rules.
- Ignore "low_confidence" facts in strict instructions.
- If data is missing, include a "Known Unknowns" section instead of guessing.
- Brand identity source-of-truth order:
  1) Brand Name/Description/Website provided in this request
  2) Verified Research Context facts
  3) Inferred Research Context facts
- Do NOT infer or overwrite brand identity from connected X handle/profile alone.
- Treat connected X account as publishing/distribution channel unless independently verified in research.`;

function formatResearchContext(research?: ResearchContext): string {
  if (!research) return "Not provided";

  const facts = research.facts
    .slice(0, 30)
    .map(
      (fact) =>
        `- [${fact.confidenceLabel}] (${fact.factType}, ${Math.round(fact.confidence * 100)}%) ${fact.key}: ${fact.value}`
    )
    .join("\n");

  const sources = research.sources
    .slice(0, 20)
    .map((source) => `- ${source.url} (${source.sourceType}, score=${source.reliabilityScore ?? 0})`)
    .join("\n");

  const unknowns =
    research.knownUnknowns.length > 0
      ? research.knownUnknowns.map((item) => `- ${item}`).join("\n")
      : "- none";

  return `Summary:
${research.summary}

Overall confidence: ${Math.round(research.overallConfidence * 100)}%

Facts:
${facts || "- none"}

Sources:
${sources || "- none"}

Known Unknowns:
${unknowns}`;
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
        { role: "system", content: SKILL_SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
      max_tokens: 4000,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`AI call failed for model ${model}: ${error}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content ?? "";
}

function sanitizeBrandName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function createBrandSkill(brand: BrandConfig, research?: ResearchContext): Promise<GeneratedSkill> {
  const skillName = sanitizeBrandName(brand.name);
  
  const userPrompt = SKILL_USER_PROMPT
    .replace("{brandName}", brand.name)
    .replace("{website}", brand.website || "Not provided")
    .replace("{description}", brand.description || "Not provided")
    .replace("{industry}", brand.industry || "Not specified")
    .replace("{targetAudience}", brand.targetAudience || "Not specified")
    .replace("{tone}", brand.tone || "Professional yet approachable")
    .replace("{products}", brand.products?.join(", ") || "Not specified")
    .replace(
      "{socialLinks}",
      brand.socialLinks
        ? Object.entries(brand.socialLinks)
            .map(([platform, url]) => `${platform}: ${url}`)
            .join("\n")
        : "Not provided"
    )
    .replace("{additionalContext}", brand.additionalContext || "None")
    .replace("{researchContext}", formatResearchContext(research));

  const skillContent = await callAI(userPrompt);

  const skillMd = skillContent
    .replace(/^```markdown\n?/, "")
    .replace(/^```\n?$/, "")
    .trim();

  if (!skillMd.includes("---")) {
    throw new Error("Generated skill.md is missing frontmatter");
  }

  return {
    skillMd,
    skillName: `${skillName}-marketing`,
  };
}

export function getDefaultSkill(): string {
  return `---
name: default-marketing
description: Generic marketing skill for content creation
---

# Default Marketing Skill

## Persona
- Brand voice: Professional, friendly, and helpful
- Tone: Conversational yet authoritative
- Audience: General audience

## Content Guidelines

### Do's
- Be helpful and informative
- Use clear, concise language
- Include relevant examples
- Engage with the audience
- Stay on-brand

### Don'ts
- Be overly promotional
- Use jargon unnecessarily
- Ignore audience questions
- Post off-topic content

## Posting Rules
- Post during peak engagement hours
- Maintain consistency in posting schedule
- Respond to comments and messages promptly

## Topics
- Industry news and trends
- Helpful tips and tutorials
- Product updates and features
- Customer success stories

## Hashtags
- Use relevant industry hashtags
- Include brand-specific hashtags
- Limit to 3-5 hashtags per post

## Examples

### Example Post 1
"Want to boost your productivity? Here are 5 simple tips that actually work..."

### Example Post 2
"Big news! We're excited to announce our latest feature that will transform how you work..."

### Example Post 3
"Meet Sarah, one of our amazing customers! Here's how she's using our product to achieve her goals..."

## X Automation APIs
- Env vars expected inside runtime:
  - PLATFORM_INTERNAL_API_BASE_URL
  - PLATFORM_INTERNAL_API_TOKEN
  - PLATFORM_DEPLOYMENT_ID
- Auth header for every request:
  - Authorization: Bearer \${PLATFORM_INTERNAL_API_TOKEN}
- Execution behavior:
  - Use OpenClaw \`exec\` tool to run \`curl\` calls against these endpoints.
  - Use shell vars exactly: \`$PLATFORM_INTERNAL_API_BASE_URL\`, \`$PLATFORM_INTERNAL_API_TOKEN\`, \`$PLATFORM_DEPLOYMENT_ID\`.
  - Never say "I don't have access" before attempting the call.
  - If a call fails, report HTTP status + raw response body.

### Publish post
- Endpoint: POST \${PLATFORM_INTERNAL_API_BASE_URL}/api/internal/x/post
- Body:
  {"deploymentId":"\${PLATFORM_DEPLOYMENT_ID}","text":"<final post text>"}

### Discover candidate tweets
- Endpoint: GET \${PLATFORM_INTERNAL_API_BASE_URL}/api/internal/x/discover?deploymentId=\${PLATFORM_DEPLOYMENT_ID}&query=<urlencoded_query>
- Query guidance:
  - Use narrow intent queries, then refine.
  - Keep \`-is:retweet\` in the query.
  - Skip ragebait/political traps unless brand-relevant.

### Read mentions
- Endpoint: GET \${PLATFORM_INTERNAL_API_BASE_URL}/api/internal/x/mentions?deploymentId=\${PLATFORM_DEPLOYMENT_ID}

### Reply to mention
- Endpoint: POST \${PLATFORM_INTERNAL_API_BASE_URL}/api/internal/x/reply
- Body:
  {"deploymentId":"\${PLATFORM_DEPLOYMENT_ID}","inReplyToTweetId":"<tweet_id>","text":"<reply text>","targetAuthorId":"<author_id>","conversationId":"<conversation_id>"}

### Action metrics
- Endpoint: GET \${PLATFORM_INTERNAL_API_BASE_URL}/api/internal/x/metrics?deploymentId=\${PLATFORM_DEPLOYMENT_ID}
- Use before posting heavily to avoid spam bursts.

## Reply-guy constraints
- Only reply when mention is relevant to brand/product.
- Avoid repetitive replies and avoid posting duplicate content.
- Keep replies concise, useful, and non-spammy.
- Max 1 reply per user per thread unless the user asks a follow-up question explicitly.
- If endpoint returns \`409\`, do not retry immediately; pick another candidate or adjust content/query.
- If endpoint returns \`5xx\`, report status/body and continue with remaining tasks.`;
}
