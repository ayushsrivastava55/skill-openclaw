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

export interface ResearchSource {
  id?: string;
  url: string;
  domain?: string | null;
  sourceType: "website" | "social" | "coverage" | "competitor" | "other";
  title?: string | null;
  excerpt?: string | null;
  fetchedAt?: string | null;
  reliabilityScore?: number | null;
  content?: string;
}

export interface ResearchFact {
  key: string;
  value: string;
  confidence: number;
  confidenceLabel: "verified" | "inferred" | "low_confidence";
  factType: "positioning" | "audience" | "product" | "tone" | "proof" | "risk" | "competitor" | "topic";
  evidenceSourceIds: string[];
}

export interface ResearchContext {
  sourcePolicy: "public_web_and_socials" | "brand_owned_only" | "open_web_broad";
  generatedAt: string;
  overallConfidence: number;
  summary: string;
  facts: ResearchFact[];
  sources: ResearchSource[];
  knownUnknowns: string[];
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
  research?: ResearchContext;
}
