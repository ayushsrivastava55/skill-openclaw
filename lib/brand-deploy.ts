import { createBrandSkill, getDefaultSkill } from "./skill-creator";
import { createBrandHeartbeat, getDefaultHeartbeat } from "./heartbeat-creator";
import type { BrandConfig, BrandDeploymentConfig, GeneratedSkill, GeneratedHeartbeat } from "./brand-types";
import { encrypt } from "./security";

export async function createBrandDeploymentConfig(
  brand: BrandConfig,
  useAI: boolean = true
): Promise<BrandDeploymentConfig> {
  let skill: GeneratedSkill;
  let heartbeat: GeneratedHeartbeat;

  if (useAI) {
    try {
      skill = await createBrandSkill(brand);
    } catch (error) {
      console.warn("Failed to generate skill with AI, using default:", error);
      skill = {
        skillMd: getDefaultSkill(),
        skillName: "default-marketing",
      };
    }

    try {
      heartbeat = await createBrandHeartbeat(brand);
    } catch (error) {
      console.warn("Failed to generate heartbeat with AI, using default:", error);
      heartbeat = {
        heartbeatMd: getDefaultHeartbeat(),
        tasks: [],
      };
    }
  } else {
    skill = {
      skillMd: getDefaultSkill(),
      skillName: "default-marketing",
    };
    heartbeat = {
      heartbeatMd: getDefaultHeartbeat(),
      tasks: [],
    };
  }

  return {
    brand,
    skill,
    heartbeat,
  };
}

export function formatSkillForDeployment(skill: GeneratedSkill): string {
  const lines = skill.skillMd.split("\n");
  let frontmatterEnd = -1;
  
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === "---" && i > 0) {
      frontmatterEnd = i;
      break;
    }
  }

  if (frontmatterEnd === -1) {
    return skill.skillMd;
  }

  const content = lines.slice(frontmatterEnd + 1).join("\n").trim();
  
  return `---
name: ${skill.skillName}
description: Brand marketing skill
---
${content}`;
}

export interface DeploymentWithBrandConfig {
  deploymentId: string;
  skillContent: string;
  skillFileName: string;
  heartbeatContent: string;
  heartbeatFileName: string;
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
    skillFileName: `${config.skill.skillName}.md`,
    heartbeatContent,
    heartbeatFileName: "HEARTBEAT.md",
  };
}
