import type { BrandConfig, ResearchContext } from "@/lib/brand-types";
import {
  fetchResearchCandidates,
  listDeepPassCandidates,
  listFastPassCandidates,
  type FetchedResearchPage
} from "@/lib/research-fetch";
import { dedupeResearchFacts } from "@/lib/research-ranker";
import { buildResearchContext } from "@/lib/research-synthesizer";
import {
  createBrandResearchRun,
  saveBrandResearchFact,
  saveBrandResearchSource,
  saveDeploymentArtifact,
  updateBrandResearchRun
} from "@/lib/store";
import type { BrandResearchRunRecord } from "@/lib/types";

const FAST_FETCH_LIMIT = 12;
const DEEP_FETCH_LIMIT = 20;

export interface BrandResearchPhaseResult {
  run: BrandResearchRunRecord;
  context: ResearchContext;
  fetchedPages: FetchedResearchPage[];
}

function toSummaryMarkdown(context: ResearchContext, phase: BrandResearchRunRecord["phase"]): string {
  const lines: string[] = [];
  lines.push(`# Research Summary (${phase})`);
  lines.push("");
  lines.push(`- Generated: ${context.generatedAt}`);
  lines.push(`- Source policy: ${context.sourcePolicy}`);
  lines.push(`- Confidence: ${Math.round(context.overallConfidence * 100)}%`);
  lines.push(`- Sources: ${context.sources.length}`);
  lines.push(`- Facts: ${context.facts.length}`);
  lines.push("");
  lines.push("## Executive Summary");
  lines.push(context.summary);
  lines.push("");
  lines.push("## Top Facts");

  const topFacts = context.facts.slice(0, 20);
  if (topFacts.length === 0) {
    lines.push("- none");
  } else {
    for (const fact of topFacts) {
      lines.push(
        `- [${fact.confidenceLabel}] (${fact.factType}, ${Math.round(fact.confidence * 100)}%) ${fact.key}: ${fact.value}`
      );
    }
  }

  lines.push("");
  lines.push("## Known Unknowns");
  if (context.knownUnknowns.length === 0) {
    lines.push("- none");
  } else {
    for (const item of context.knownUnknowns) {
      lines.push(`- ${item}`);
    }
  }

  lines.push("");
  lines.push("## Sources");
  for (const source of context.sources.slice(0, 40)) {
    lines.push(
      `- ${source.url} (${source.sourceType}, score=${(source.reliabilityScore ?? 0).toFixed(2)})`
    );
  }

  return lines.join("\n");
}

function toFactsJson(context: ResearchContext): string {
  return JSON.stringify(
    {
      generatedAt: context.generatedAt,
      overallConfidence: context.overallConfidence,
      knownUnknowns: context.knownUnknowns,
      facts: context.facts
    },
    null,
    2
  );
}

function toSourceMapJson(context: ResearchContext): string {
  return JSON.stringify(
    {
      generatedAt: context.generatedAt,
      sourcePolicy: context.sourcePolicy,
      sources: context.sources.map((source) => ({
        id: source.id ?? null,
        url: source.url,
        domain: source.domain ?? null,
        sourceType: source.sourceType,
        title: source.title ?? null,
        fetchedAt: source.fetchedAt ?? null,
        reliabilityScore: source.reliabilityScore ?? null,
        excerpt: source.excerpt ?? null
      }))
    },
    null,
    2
  );
}

function remapFactEvidenceToSourceIds(context: ResearchContext): ResearchContext {
  const sourceByUrl = new Map<string, string>();
  for (const source of context.sources) {
    if (!source.id) continue;
    sourceByUrl.set(source.url, source.id);
  }

  const facts = context.facts.map((fact) => ({
    ...fact,
    evidenceSourceIds: fact.evidenceSourceIds
      .map((item) => sourceByUrl.get(item) ?? item)
      .filter((item, index, all) => item && all.indexOf(item) === index)
  }));

  return {
    ...context,
    facts
  };
}

async function persistRunData(runId: string, context: ResearchContext): Promise<ResearchContext> {
  const persistedSources = [];

  for (const source of context.sources) {
    const saved = await saveBrandResearchSource({
      runId,
      url: source.url,
      domain: source.domain ?? null,
      sourceType: source.sourceType,
      fetchedAt: source.fetchedAt ?? null,
      title: source.title ?? null,
      excerpt: source.excerpt ?? null,
      reliabilityScore: source.reliabilityScore ?? null
    });
    persistedSources.push({ ...source, id: saved.id });
  }

  const withIds: ResearchContext = {
    ...context,
    sources: persistedSources
  };

  const remapped = remapFactEvidenceToSourceIds(withIds);

  for (const fact of remapped.facts) {
    await saveBrandResearchFact({
      runId,
      key: fact.key,
      value: fact.value,
      confidence: fact.confidence,
      confidenceLabel: fact.confidenceLabel,
      evidenceSourceIds: fact.evidenceSourceIds,
      factType: fact.factType
    });
  }

  return remapped;
}

export async function saveResearchArtifacts(input: {
  deploymentId: string;
  phase: BrandResearchRunRecord["phase"];
  context: ResearchContext;
}) {
  const summary = toSummaryMarkdown(input.context, input.phase);
  const facts = toFactsJson(input.context);
  const sourceMap = toSourceMapJson(input.context);

  await saveDeploymentArtifact({
    deploymentId: input.deploymentId,
    kind: "research_summary",
    fileName: "RESEARCH_SUMMARY.md",
    content: summary
  });

  await saveDeploymentArtifact({
    deploymentId: input.deploymentId,
    kind: "brand_facts",
    fileName: "BRAND_FACTS.json",
    content: facts
  });

  await saveDeploymentArtifact({
    deploymentId: input.deploymentId,
    kind: "source_map",
    fileName: "SOURCE_MAP.json",
    content: sourceMap
  });
}

function mergeContexts(base: ResearchContext | undefined, incoming: ResearchContext): ResearchContext {
  if (!base) return incoming;

  const sourceMap = new Map<string, ResearchContext["sources"][number]>();
  for (const source of [...base.sources, ...incoming.sources]) {
    sourceMap.set(source.url, source);
  }

  const mergedFacts = dedupeResearchFacts([...base.facts, ...incoming.facts]).slice(0, 80);
  const weightedConfidence = Math.min(
    0.99,
    base.overallConfidence * 0.45 + incoming.overallConfidence * 0.55
  );

  return {
    ...incoming,
    generatedAt: new Date().toISOString(),
    overallConfidence: weightedConfidence,
    summary: `${incoming.summary} Enriched with prior fast-pass context.`,
    sources: Array.from(sourceMap.values()),
    facts: mergedFacts,
    knownUnknowns: Array.from(new Set([...base.knownUnknowns, ...incoming.knownUnknowns]))
  };
}

async function runPhase(input: {
  deploymentId: string;
  brand: BrandConfig;
  phase: BrandResearchRunRecord["phase"];
  sourcePolicy?: ResearchContext["sourcePolicy"];
  seedPages?: FetchedResearchPage[];
  baseContext?: ResearchContext;
}): Promise<BrandResearchPhaseResult> {
  const sourcePolicy = input.sourcePolicy ?? "public_web_and_socials";
  const run = await createBrandResearchRun({
    deploymentId: input.deploymentId,
    phase: input.phase,
    status: "running"
  });

  try {
    let candidates =
      input.phase === "fast"
        ? listFastPassCandidates(input.brand)
        : listDeepPassCandidates(input.brand, input.seedPages ?? []);

    if (candidates.length === 0 && input.phase === "deep") {
      const fastCandidates = listFastPassCandidates(input.brand);
      const fastPages = await fetchResearchCandidates(fastCandidates, 6);
      candidates = listDeepPassCandidates(input.brand, fastPages);
    }

    const fetchLimit = input.phase === "fast" ? FAST_FETCH_LIMIT : DEEP_FETCH_LIMIT;
    const pages = await fetchResearchCandidates(candidates, fetchLimit);

    let context = buildResearchContext({
      brand: input.brand,
      pages,
      sourcePolicy
    });

    context = mergeContexts(input.baseContext, context);
    context = await persistRunData(run.id, context);

    const completed = await updateBrandResearchRun(run.id, {
      status: "complete",
      confidenceOverall: context.overallConfidence,
      completedAt: new Date().toISOString(),
      error: null
    });

    return {
      run: completed,
      context,
      fetchedPages: pages
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Research execution failed";
    const failed = await updateBrandResearchRun(run.id, {
      status: "failed",
      confidenceOverall: null,
      completedAt: new Date().toISOString(),
      error: message
    });
    throw new Error(`Research ${failed.phase} phase failed: ${message}`);
  }
}

export async function runFastBrandResearch(input: {
  deploymentId: string;
  brand: BrandConfig;
  sourcePolicy?: ResearchContext["sourcePolicy"];
}): Promise<BrandResearchPhaseResult> {
  return runPhase({
    deploymentId: input.deploymentId,
    brand: input.brand,
    phase: "fast",
    sourcePolicy: input.sourcePolicy
  });
}

export async function runDeepBrandResearch(input: {
  deploymentId: string;
  brand: BrandConfig;
  sourcePolicy?: ResearchContext["sourcePolicy"];
  seedPages?: FetchedResearchPage[];
  baseContext?: ResearchContext;
}): Promise<BrandResearchPhaseResult> {
  return runPhase({
    deploymentId: input.deploymentId,
    brand: input.brand,
    phase: "deep",
    sourcePolicy: input.sourcePolicy,
    seedPages: input.seedPages,
    baseContext: input.baseContext
  });
}
