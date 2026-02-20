import type { BrandConfig, ResearchContext, ResearchFact, ResearchSource } from "@/lib/brand-types";
import type { FetchedResearchPage } from "@/lib/research-fetch";
import { computeOverallConfidence, dedupeResearchFacts, scoreResearchSource, toConfidenceLabel } from "@/lib/research-ranker";

type SourcePolicy = ResearchContext["sourcePolicy"];

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function truncate(value: string, max = 280): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1).trim()}...`;
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((item) => normalizeText(item))
    .filter((item) => item.length > 35 && item.length <= 280);
}

function extractKeywords(text: string, limit = 8): string[] {
  const stopWords = new Set([
    "the",
    "and",
    "for",
    "with",
    "that",
    "this",
    "from",
    "your",
    "you",
    "are",
    "our",
    "their",
    "into",
    "about",
    "have",
    "will",
    "they",
    "more",
    "than",
    "what",
    "when",
    "where",
    "which",
    "while",
    "been",
    "were",
    "them",
    "using",
    "used",
    "also",
    "only",
    "over",
    "under",
    "after",
    "before",
    "through",
    "there",
    "here",
    "into",
    "across"
  ]);

  const counts = new Map<string, number>();
  for (const raw of text.toLowerCase().split(/[^a-z0-9]+/)) {
    if (raw.length < 4 || raw.length > 24 || stopWords.has(raw)) continue;
    counts.set(raw, (counts.get(raw) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([word]) => word);
}

function knownUnknowns(brand: BrandConfig, hasWebData: boolean): string[] {
  const missing: string[] = [];
  if (!brand.targetAudience) missing.push("Target audience not explicitly identified.");
  if (!brand.tone) missing.push("Brand tone/voice is not clearly specified.");
  if (!brand.products || brand.products.length === 0) missing.push("Product list is incomplete.");
  if (!hasWebData) missing.push("Public web source coverage is limited or unavailable.");
  return missing;
}

function buildFormFacts(brand: BrandConfig): ResearchFact[] {
  const facts: ResearchFact[] = [];

  facts.push({
    key: "brand_name",
    value: brand.name,
    confidence: 0.99,
    confidenceLabel: "verified",
    factType: "positioning",
    evidenceSourceIds: []
  });

  if (brand.description) {
    facts.push({
      key: "brand_description",
      value: truncate(normalizeText(brand.description), 320),
      confidence: 0.95,
      confidenceLabel: "verified",
      factType: "positioning",
      evidenceSourceIds: []
    });
  }

  if (brand.industry) {
    facts.push({
      key: "industry",
      value: brand.industry,
      confidence: 0.9,
      confidenceLabel: "verified",
      factType: "positioning",
      evidenceSourceIds: []
    });
  }

  if (brand.targetAudience) {
    facts.push({
      key: "target_audience",
      value: brand.targetAudience,
      confidence: 0.9,
      confidenceLabel: "verified",
      factType: "audience",
      evidenceSourceIds: []
    });
  }

  if (brand.tone) {
    facts.push({
      key: "tone",
      value: brand.tone,
      confidence: 0.86,
      confidenceLabel: "verified",
      factType: "tone",
      evidenceSourceIds: []
    });
  }

  for (const product of brand.products ?? []) {
    facts.push({
      key: "product",
      value: product,
      confidence: 0.87,
      confidenceLabel: "verified",
      factType: "product",
      evidenceSourceIds: []
    });
  }

  return facts;
}

function buildWebFacts(pages: FetchedResearchPage[]): ResearchFact[] {
  const facts: ResearchFact[] = [];

  for (const page of pages) {
    const sourceRef = [page.url];

    if (page.title) {
      facts.push({
        key: "page_title_signal",
        value: truncate(page.title, 180),
        confidence: page.sourceType === "website" ? 0.82 : 0.7,
        confidenceLabel: page.sourceType === "website" ? "verified" : "inferred",
        factType: "topic",
        evidenceSourceIds: sourceRef
      });
    }

    if (page.description) {
      facts.push({
        key: "value_prop",
        value: truncate(page.description, 260),
        confidence: page.sourceType === "website" ? 0.8 : 0.66,
        confidenceLabel: page.sourceType === "website" ? "verified" : "inferred",
        factType: "positioning",
        evidenceSourceIds: sourceRef
      });
    }

    const sentences = splitSentences(page.text).slice(0, 8);
    for (const sentence of sentences) {
      if (/\b(customer|audience|community|teams|developers|founders|marketers|creators)\b/i.test(sentence)) {
        facts.push({
          key: "audience_signal",
          value: truncate(sentence, 280),
          confidence: 0.67,
          confidenceLabel: "inferred",
          factType: "audience",
          evidenceSourceIds: sourceRef
        });
      }

      if (/\b(launch|release|update|new|introducing|announce)\b/i.test(sentence)) {
        facts.push({
          key: "proof_signal",
          value: truncate(sentence, 280),
          confidence: 0.63,
          confidenceLabel: "inferred",
          factType: "proof",
          evidenceSourceIds: sourceRef
        });
      }

      if (/\b(compliance|policy|privacy|security|regulated|legal|terms)\b/i.test(sentence)) {
        facts.push({
          key: "risk_signal",
          value: truncate(sentence, 280),
          confidence: 0.61,
          confidenceLabel: "inferred",
          factType: "risk",
          evidenceSourceIds: sourceRef
        });
      }
    }
  }

  const topicCorpus = pages.map((page) => `${page.title} ${page.description} ${page.excerpt}`).join(" ");
  for (const keyword of extractKeywords(topicCorpus)) {
    facts.push({
      key: "topic_keyword",
      value: keyword,
      confidence: 0.56,
      confidenceLabel: "inferred",
      factType: "topic",
      evidenceSourceIds: pages.slice(0, 3).map((page) => page.url)
    });
  }

  return facts;
}

export function buildResearchContext(input: {
  brand: BrandConfig;
  pages: FetchedResearchPage[];
  sourcePolicy: SourcePolicy;
}): ResearchContext {
  const { brand, pages, sourcePolicy } = input;

  const sources: ResearchSource[] = pages.map((page) => {
    const source: ResearchSource = {
      url: page.url,
      domain: page.domain,
      sourceType: page.sourceType,
      title: page.title,
      excerpt: page.excerpt,
      fetchedAt: page.fetchedAt,
      reliabilityScore: null,
      content: page.text
    };
    source.reliabilityScore = scoreResearchSource(brand, source);
    return source;
  });

  const formFacts = buildFormFacts(brand);
  const webFacts = buildWebFacts(pages).map((fact) => {
    const confidence = Math.min(0.99, Math.max(0.1, fact.confidence));
    return {
      ...fact,
      confidence,
      confidenceLabel: toConfidenceLabel(confidence)
    };
  });

  const deduped = dedupeResearchFacts([...formFacts, ...webFacts]).slice(0, 60);
  const overallConfidence = computeOverallConfidence(deduped);

  const keyThemes = deduped
    .filter((fact) => fact.factType === "topic" || fact.factType === "positioning")
    .slice(0, 6)
    .map((fact) => fact.value)
    .join(", ");

  const summaryParts = [
    `${brand.name} brand profile synthesized from form inputs and ${pages.length} public sources.`,
    keyThemes ? `Key messaging themes: ${keyThemes}.` : "",
    `Confidence: ${Math.round(overallConfidence * 100)}%.`
  ].filter(Boolean);

  return {
    sourcePolicy,
    generatedAt: new Date().toISOString(),
    overallConfidence,
    summary: summaryParts.join(" "),
    facts: deduped,
    sources,
    knownUnknowns: knownUnknowns(brand, pages.length > 0)
  };
}
