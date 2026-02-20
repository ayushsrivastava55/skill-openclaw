import { promises as fs } from "node:fs";
import { join } from "node:path";
import { createBrandSkill, getDefaultSkill } from "./skill-creator";
import { createBrandHeartbeat, getDefaultHeartbeat } from "./heartbeat-creator";
import type {
  BrandConfig,
  BrandDeploymentConfig,
  GeneratedHeartbeat,
  GeneratedSkill,
  ResearchContext
} from "./brand-types";

export async function createBrandDeploymentConfig(
  brand: BrandConfig,
  useAI: boolean = true,
  research?: ResearchContext
): Promise<BrandDeploymentConfig> {
  let skill: GeneratedSkill;
  let heartbeat: GeneratedHeartbeat;

  if (useAI) {
    try {
      skill = await createBrandSkill(brand, research);
      heartbeat = await createBrandHeartbeat(brand, research);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown AI generation error";
      throw new Error(`BRAND_FILE_GENERATION_FAILED: ${message}`);
    }
  } else {
    const fallbackSkill = getDefaultSkill();
    const fallbackHeartbeat = getDefaultHeartbeat();
    skill = {
      skillMd: fallbackSkill,
      skillName: "default-marketing"
    };
    heartbeat = {
      heartbeatMd: fallbackHeartbeat,
      tasks: []
    };
  }

  return {
    brand,
    skill,
    heartbeat,
    research
  };
}

export function formatSkillForDeployment(skill: GeneratedSkill): string {
  // AI output occasionally includes fenced markdown or duplicate metadata blocks.
  // Normalize aggressively so runtime always gets a clean SKILL.md contract.
  const cleaned = stripCodeFence(skill.skillMd);
  const body = normalizeSkillBody(cleaned);
  const withRuntimeContract = ensureRuntimeXAutomationContract(body);

  return `---
name: ${skill.skillName}
description: Brand marketing skill
---
${withRuntimeContract}`;
}

export interface DeploymentWithBrandConfig {
  deploymentId: string;
  skillContent: string;
  skillFileName: string;
  heartbeatContent: string;
  heartbeatFileName: string;
}

function sanitizePathSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_.-]/g, "").slice(0, 80);
}

export function prepareBrandFilesForDeployment(
  deploymentId: string,
  config: BrandDeploymentConfig
): DeploymentWithBrandConfig {
  const skillContent = formatSkillForDeployment(config.skill);
  const heartbeatContent = config.heartbeat.heartbeatMd;

  return {
    deploymentId,
    skillContent,
    skillFileName: "SKILL.md",
    heartbeatContent,
    heartbeatFileName: "HEARTBEAT.md",
  };
}

export async function refreshRuntimeBrandFiles(files: DeploymentWithBrandConfig): Promise<boolean> {
  const safeDeploymentDir = sanitizePathSegment(files.deploymentId);
  if (!safeDeploymentDir) {
    return false;
  }

  const baseDir = join("/tmp", "brand-deploy", safeDeploymentDir);
  try {
    await fs.mkdir(join(baseDir, "skills"), { recursive: true });
    await fs.writeFile(join(baseDir, "SKILL.md"), files.skillContent, "utf8");
    await fs.writeFile(join(baseDir, "HEARTBEAT.md"), files.heartbeatContent, "utf8");
    await fs.writeFile(join(baseDir, "skills", files.skillFileName || "SKILL.md"), files.skillContent, "utf8");
    // Keep canonical name present for skill discovery flows that look specifically for SKILL.md.
    if ((files.skillFileName || "SKILL.md") !== "SKILL.md") {
      await fs.writeFile(join(baseDir, "skills", "SKILL.md"), files.skillContent, "utf8");
    }
    return true;
  } catch {
    return false;
  }
}

function stripCodeFence(raw: string): string {
  let output = raw.trim();
  output = output.replace(/^```(?:markdown|md|yaml)?\s*/i, "");
  output = output.replace(/\s*```$/i, "");
  return output.trim();
}

function removeTopFrontmatter(raw: string): string {
  const lines = raw.split("\n");
  if (lines[0]?.trim() !== "---") {
    return raw.trim();
  }
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i].trim() === "---") {
      return lines.slice(i + 1).join("\n").trim();
    }
  }
  return raw.trim();
}

function normalizeSkillBody(raw: string): string {
  let output = removeTopFrontmatter(raw);

  // Some generations prepend an extra YAML-like header block without opening "---".
  const lines = output.split("\n");
  const possibleHeaderEnd = lines.findIndex((line, idx) => idx < 30 && line.trim() === "---");
  if (possibleHeaderEnd > 0) {
    const firstMeaningful = lines.find((line) => line.trim().length > 0)?.trim() ?? "";
    if (/^(name|description|version|author):/i.test(firstMeaningful)) {
      output = lines.slice(possibleHeaderEnd + 1).join("\n").trim();
    }
  }

  output = stripCodeFence(output);
  return output.trim();
}

function ensureRuntimeXAutomationContract(content: string): string {
  const marker = "## Runtime X API Contract (Required)";
  if (content.includes(marker)) {
    return content;
  }
  return `${content}

${marker}
- These environment variables are already provided inside runtime:
  - \`PLATFORM_INTERNAL_API_BASE_URL\`
  - \`PLATFORM_INTERNAL_API_TOKEN\`
  - \`PLATFORM_DEPLOYMENT_ID\`
- Never ask the user for these values in chat.
- Execution behavior:
  - Use OpenClaw \`exec\` tool with \`curl\` to call these APIs.
  - Use shell vars directly: \`$PLATFORM_INTERNAL_API_BASE_URL\`, \`$PLATFORM_INTERNAL_API_TOKEN\`, \`$PLATFORM_DEPLOYMENT_ID\`.
  - Never claim missing API access before attempting requests.
  - On failure, include HTTP status + raw response body.
- Always call endpoints with:
  - \`Authorization: Bearer \${PLATFORM_INTERNAL_API_TOKEN}\`
  - \`Content-Type: application/json\`
- Exact payload schemas:
  - Post tweet:
    - \`POST \${PLATFORM_INTERNAL_API_BASE_URL}/api/internal/x/post\`
    - body: \`{"deploymentId":"\${PLATFORM_DEPLOYMENT_ID}","text":"<tweet text>"}\`
  - Discover candidate tweets:
    - \`GET \${PLATFORM_INTERNAL_API_BASE_URL}/api/internal/x/discover?deploymentId=\${PLATFORM_DEPLOYMENT_ID}&query=<urlencoded_query>\`
  - Read mentions:
    - \`GET \${PLATFORM_INTERNAL_API_BASE_URL}/api/internal/x/mentions?deploymentId=\${PLATFORM_DEPLOYMENT_ID}\`
  - Read activity metrics:
    - \`GET \${PLATFORM_INTERNAL_API_BASE_URL}/api/internal/x/metrics?deploymentId=\${PLATFORM_DEPLOYMENT_ID}\`
  - Reply:
    - \`POST \${PLATFORM_INTERNAL_API_BASE_URL}/api/internal/x/reply\`
    - body: \`{"deploymentId":"\${PLATFORM_DEPLOYMENT_ID}","inReplyToTweetId":"<tweet_id>","text":"<reply text>","targetAuthorId":"<author_id>","conversationId":"<conversation_id>"}\`
- Guardrail behavior:
  - If API returns \`409\`, do not retry immediately.
  - Choose another candidate tweet or adjust content/query.
- Do not use unsupported request keys (e.g., \`content\`, \`mediaUrls\`, \`scheduleAt\`).`;
}
