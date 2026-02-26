/**
 * Static Impact Ranker
 * Replaces the LLM-based Impact Ranker agent with a deterministic weighted formula.
 * Computes compositeScore = (blastRadius * 0.3) + (knowledgeGate * 0.25) + (refactorRisk * 0.25) + (combinedTeachability * 0.2)
 */
import type { AgentResult } from '../agents/runner.js';
/**
 * Computes impact ranking from Stage 1 agent outputs without an LLM call.
 * Returns a synthetic AgentResult matching the Impact Ranker output schema.
 */
export declare function computeImpactRanking(stage1Results: AgentResult[]): AgentResult;
//# sourceMappingURL=impact-ranker.d.ts.map