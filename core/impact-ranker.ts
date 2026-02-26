/**
 * Static Impact Ranker
 * Replaces the LLM-based Impact Ranker agent with a deterministic weighted formula.
 * Computes compositeScore = (blastRadius * 0.3) + (knowledgeGate * 0.25) + (refactorRisk * 0.25) + (combinedTeachability * 0.2)
 */

import type { AgentResult } from '../agents/runner.js';

interface RankedSection {
  file: string;
  startLine: number;
  endLine: number;
  compositeScore: number;
  criteria: {
    blastRadius: number;
    knowledgeGate: number;
    refactorRisk: number;
    combinedTeachability: number;
  };
  summary: string;
}

/**
 * Derives blast radius from fan-in using the calibration table from the impact-ranker agent spec.
 */
function fanInToBlastRadius(fanIn: number): number {
  if (fanIn === 0) return 0;
  if (fanIn <= 2) return Math.round(1 + fanIn);
  if (fanIn <= 5) return Math.round(2 + fanIn * 0.6);
  if (fanIn <= 7) return Math.round(fanIn * 0.85);
  if (fanIn <= 10) return Math.min(9, Math.round(fanIn * 0.9));
  return 10;
}

/**
 * Derives refactor risk from fan-in, coupling depth, and structural significance.
 */
function computeRefactorRisk(fanIn: number, couplingDepth: number, significance: number): number {
  const fromFanIn = fanInToBlastRadius(fanIn) * 0.4;
  const fromCoupling = Math.min(10, couplingDepth) * 0.3;
  const fromSignificance = significance * 0.3;
  return Math.round((fromFanIn + fromCoupling + fromSignificance) * 10) / 10;
}

/**
 * Derives knowledge gate score from fan-in, centrality, and whether the file
 * appears in other sections' prerequisites.
 */
function computeKnowledgeGate(fanIn: number, centrality: number): number {
  // High fan-in means many modules depend on understanding this one
  const fromFanIn = Math.min(10, fanIn) * 0.5;
  const fromCentrality = centrality * 0.5;
  return Math.round((fromFanIn + fromCentrality) * 10) / 10;
}

/**
 * Computes impact ranking from Stage 1 agent outputs without an LLM call.
 * Returns a synthetic AgentResult matching the Impact Ranker output schema.
 */
export function computeImpactRanking(stage1Results: AgentResult[]): AgentResult {
  // Extract data from Stage 1 agents
  const mapperResult = stage1Results.find((r) => r.agentName === 'Dependency Mapper');
  const teachResult = stage1Results.find((r) => r.agentName === 'Teachability Scorer');
  const structResult = stage1Results.find((r) => r.agentName === 'Structure Analyzer');

  // Build lookup maps from mapper nodes
  const nodeMap = new Map<
    string,
    { fanIn: number; fanOut: number; couplingDepth: number; centrality: number }
  >();
  const mapperNodes = Array.isArray(mapperResult?.output?.nodes)
    ? (mapperResult!.output.nodes as Record<string, unknown>[])
    : [];
  for (const node of mapperNodes) {
    const id = typeof node.id === 'string' ? node.id : '';
    if (!id) continue;
    nodeMap.set(id, {
      fanIn: typeof node.fanIn === 'number' ? node.fanIn : 0,
      fanOut: typeof node.fanOut === 'number' ? node.fanOut : 0,
      couplingDepth: typeof node.couplingDepth === 'number' ? node.couplingDepth : 0,
      centrality: typeof node.centrality === 'number' ? node.centrality : 0,
    });
  }

  // Build teachability score lookup from sections
  const teachScoreMap = new Map<string, number>();
  const teachSections = Array.isArray(teachResult?.output?.sections)
    ? (teachResult!.output.sections as Record<string, unknown>[])
    : [];
  for (const section of teachSections) {
    const file = typeof section.file === 'string' ? section.file : '';
    const score = typeof section.score === 'number' ? section.score : 0;
    if (file) {
      // Keep the highest score per file
      const existing = teachScoreMap.get(file) ?? 0;
      if (score > existing) teachScoreMap.set(file, score);
    }
  }

  // Build significance lookup from structure decisions
  const significanceMap = new Map<string, number>();
  const structDecisions = Array.isArray(structResult?.output?.decisions)
    ? (structResult!.output.decisions as Record<string, unknown>[])
    : [];
  for (const decision of structDecisions) {
    const file = typeof decision.file === 'string' ? decision.file : '';
    const sig = typeof decision.significance === 'number' ? decision.significance : 0;
    if (file) {
      const existing = significanceMap.get(file) ?? 0;
      if (sig > existing) significanceMap.set(file, sig);
    }
  }

  // Collect all unique files mentioned across all Stage 1 outputs
  const allFiles = new Set<string>();
  for (const id of nodeMap.keys()) allFiles.add(id);
  for (const file of teachScoreMap.keys()) allFiles.add(file);
  for (const file of significanceMap.keys()) allFiles.add(file);

  // Helper to resolve file lookups with suffix matching
  function lookup<T>(map: Map<string, T>, file: string): T | undefined {
    const direct = map.get(file);
    if (direct !== undefined) return direct;
    for (const [key, val] of map) {
      if (key.endsWith('/' + file) || file.endsWith('/' + key)) return val;
    }
    return undefined;
  }

  // Compute composite score for each file
  const ranked: RankedSection[] = [];
  for (const file of allFiles) {
    const node = lookup(nodeMap, file);
    const fanIn = node?.fanIn ?? 0;
    const couplingDepth = node?.couplingDepth ?? 0;
    const centrality = node?.centrality ?? 0;
    const teachScore = lookup(teachScoreMap, file) ?? 3; // Default 3 for unscored files
    const significance = lookup(significanceMap, file) ?? 0;

    const blastRadius = fanInToBlastRadius(fanIn);
    const knowledgeGate = computeKnowledgeGate(fanIn, centrality);
    const refactorRisk = computeRefactorRisk(fanIn, couplingDepth, significance);
    const combinedTeachability = teachScore;

    const compositeScore =
      Math.round(
        (blastRadius * 0.3 +
          knowledgeGate * 0.25 +
          refactorRisk * 0.25 +
          combinedTeachability * 0.2) *
          10,
      ) / 10;

    // Build a summary describing the section's importance
    const parts: string[] = [];
    if (fanIn > 3) parts.push(`${fanIn} dependents`);
    if (centrality > 5) parts.push(`high centrality (${centrality})`);
    if (significance > 5) parts.push(`significant structural decisions`);
    if (teachScore > 6) parts.push(`high educational value`);
    const summary =
      parts.length > 0
        ? `${file}: ${parts.join(', ')}.`
        : `${file}: standard module with moderate importance.`;

    ranked.push({
      file,
      startLine: 1,
      endLine: 0, // Full file reference
      compositeScore,
      criteria: {
        blastRadius,
        knowledgeGate,
        refactorRisk,
        combinedTeachability,
      },
      summary,
    });
  }

  // Sort by compositeScore descending, take top 20
  ranked.sort((a, b) => b.compositeScore - a.compositeScore);
  const topSections = ranked.slice(0, 20);

  // Generate narrative
  const topFile = topSections[0]?.file ?? 'unknown';
  const topScore = topSections[0]?.compositeScore ?? 0;
  const highImpactCount = topSections.filter((s) => s.compositeScore >= 6).length;
  const narrative = `The project's importance is concentrated around ${topFile} (score: ${topScore}). ${highImpactCount} section(s) scored 6.0 or above, indicating significant structural importance. The top-ranked sections combine high dependency fan-in with educational value and structural significance.`;

  return {
    agentName: 'Impact Ranker',
    output: {
      rankedSections: topSections,
      narrative,
    },
    rawContent: JSON.stringify({ rankedSections: topSections, narrative }),
    tokenUsage: { inputTokens: 0, outputTokens: 0 },
  };
}
