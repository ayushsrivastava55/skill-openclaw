import type { BrandConfig, ResearchFact, ResearchSource } from "@/lib/brand-types";

function getHostname(input: string): string {
  try {
    return new URL(input).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function getBrandDomains(brand: BrandConfig): string[] {
  const domains = new Set<string>();
  if (brand.website) {
    const host = getHostname(brand.website);
    if (host) domains.add(host);
  }
  if (brand.socialLinks) {
    for (const link of Object.values(brand.socialLinks)) {
      if (!link) continue;
      const host = getHostname(link);
      if (host) domains.add(host);
    }
  }
  return Array.from(domains);
}

export function scoreResearchSource(brand: BrandConfig, source: ResearchSource): number {
  const sourceHost = getHostname(source.url || "");
  const brandDomains = getBrandDomains(brand);
  const isBrandOwned = brandDomains.some((domain) => sourceHost === domain || sourceHost.endsWith(`.${domain}`));

  let score = 0.5;
  if (source.sourceType === "website") score = 0.86;
  if (source.sourceType === "social") score = 0.78;
  if (source.sourceType === "coverage") score = 0.62;
  if (source.sourceType === "competitor") score = 0.56;
  if (source.sourceType === "other") score = 0.5;

  if (isBrandOwned) score += 0.08;
  if (source.excerpt && source.excerpt.length > 80) score += 0.03;
  if (source.title && source.title.length > 3) score += 0.02;

  return clamp(score, 0.1, 0.99);
}

export function toConfidenceLabel(score: number): ResearchFact["confidenceLabel"] {
  if (score >= 0.8) return "verified";
  if (score >= 0.55) return "inferred";
  return "low_confidence";
}

export function dedupeResearchFacts(facts: ResearchFact[]): ResearchFact[] {
  const map = new Map<string, ResearchFact>();

  for (const fact of facts) {
    const key = `${fact.factType}:${fact.key.toLowerCase().trim()}:${fact.value.toLowerCase().trim()}`;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, fact);
      continue;
    }

    const mergedConfidence = Math.max(existing.confidence, fact.confidence);
    const mergedSources = Array.from(new Set([...existing.evidenceSourceIds, ...fact.evidenceSourceIds]));
    map.set(key, {
      ...existing,
      confidence: mergedConfidence,
      confidenceLabel: toConfidenceLabel(mergedConfidence),
      evidenceSourceIds: mergedSources
    });
  }

  return Array.from(map.values()).sort((a, b) => b.confidence - a.confidence);
}

export function computeOverallConfidence(facts: ResearchFact[]): number {
  if (facts.length === 0) return 0.35;
  const top = facts.slice(0, 25);
  const avg = top.reduce((sum, fact) => sum + fact.confidence, 0) / top.length;
  return clamp(avg, 0.15, 0.99);
}
