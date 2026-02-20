import { NextResponse } from "next/server";
import {
  getDeploymentArtifact,
  getLatestBrandResearchRun,
  listBrandResearchFactsByRunId,
  listBrandResearchSourcesByRunId
} from "@/lib/store";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const deploymentId = (searchParams.get("deploymentId") ?? "").trim();
  if (!deploymentId) {
    return NextResponse.json({ error: "deploymentId is required" }, { status: 400 });
  }

  const run = await getLatestBrandResearchRun(deploymentId);
  if (!run) {
    return NextResponse.json({
      ok: true,
      research: {
        deploymentId,
        status: "pending",
        phase: null,
        confidenceOverall: null,
        startedAt: null,
        completedAt: null,
        error: null,
        factsCount: 0,
        sourcesCount: 0,
        summary: null
      }
    });
  }

  const [facts, sources, summaryArtifact] = await Promise.all([
    listBrandResearchFactsByRunId(run.id),
    listBrandResearchSourcesByRunId(run.id),
    getDeploymentArtifact(deploymentId, "research_summary")
  ]);

  return NextResponse.json({
    ok: true,
    research: {
      deploymentId,
      runId: run.id,
      phase: run.phase,
      status: run.status,
      confidenceOverall: run.confidenceOverall,
      startedAt: run.startedAt,
      completedAt: run.completedAt,
      error: run.error,
      factsCount: facts.length,
      sourcesCount: sources.length,
      topFacts: facts.slice(0, 10).map((fact) => ({
        id: fact.id,
        key: fact.key,
        value: fact.value,
        confidence: fact.confidence,
        confidenceLabel: fact.confidenceLabel,
        factType: fact.factType,
        evidenceSourceIds: fact.evidenceSourceIds
      })),
      topSources: sources.slice(0, 10).map((source) => ({
        id: source.id,
        url: source.url,
        domain: source.domain,
        sourceType: source.sourceType,
        title: source.title,
        reliabilityScore: source.reliabilityScore,
        fetchedAt: source.fetchedAt
      })),
      summary: summaryArtifact
        ? {
            fileName: summaryArtifact.fileName,
            content: summaryArtifact.content,
            updatedAt: summaryArtifact.updatedAt
          }
        : null
    }
  });
}
