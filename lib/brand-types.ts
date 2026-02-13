export interface BrandConfig {
  name: string;
  website: string;
  description: string;
  industry?: string;
  targetAudience?: string;
  socialLinks?: {
    twitter?: string;
    instagram?: string;
    linkedin?: string;
    facebook?: string;
    tiktok?: string;
  };
  tone?: string;
  colors?: string[];
  competitors?: string[];
  products?: string[];
  additionalContext?: string;
}

export interface GeneratedSkill {
  skillMd: string;
  skillName: string;
}

export interface GeneratedHeartbeat {
  heartbeatMd: string;
  tasks: string[];
}

export interface BrandDeploymentConfig {
  brand: BrandConfig;
  skill: GeneratedSkill;
  heartbeat: GeneratedHeartbeat;
}
