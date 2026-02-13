import { env } from "@/lib/env";
import type { BrandConfig, GeneratedSkill } from "./brand-types";

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

Generate a complete SKILL.md file with:
- Proper YAML frontmatter with name and description
- Detailed brand persona section
- Content guidelines (do's and don'ts)
- Posting rules and frequency
- Topics to create content about
- Hashtags and keywords to use
- Example posts (2-3 examples)
- Any special considerations

The skill name should be in kebab-case (e.g., "acme-corp-marketing").`;

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
      model: "anthropic/claude-sonnet-4-20250514",
      messages: [
        { role: "system", content: SKILL_SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
      max_tokens: 4000,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`AI call failed: ${error}`);
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

export async function createBrandSkill(brand: BrandConfig): Promise<GeneratedSkill> {
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
    .replace("{additionalContext}", brand.additionalContext || "None");

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
"Meet Sarah, one of our amazing customers! Here's how she's using our product to achieve her goals..."`;
}
