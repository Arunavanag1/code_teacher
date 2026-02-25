---
phase: 05-agent-definitions-dependency-graph
plan: 02
subsystem: agents
tags: [llm-prompts, structure-analysis, impact-ranking, two-stage-pipeline, agent-definitions, scoring-rubric]

# Dependency graph
requires:
  - phase: 04-agent-framework
    provides: "parseAgentMarkdown, buildSystemPrompt, runAgent that load and execute .md agent definitions"
  - phase: 05-agent-definitions-dependency-graph
    plan: 01
    provides: "Production-quality dependency-mapper.md and teachability-scorer.md agent definitions"
provides:
  - "Production-quality structure-analyzer.md with trade-off analysis, alternative inference, and performance implications"
  - "Production-quality impact-ranker.md with explicit Stage 1 JSON path consumption and 4-criterion composite scoring"
  - "stage1Outputs support in runner.ts for Stage 2 pipeline"
  - "Two-stage pipeline in analyze.ts: Stage 1 parallel (3 agents) then Stage 2 sequential (impact ranker)"
affects: [06-terminal-output-caching]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Stage 2 agent receives serialized Stage 1 JSON outputs via 'STAGE 1 AGENT OUTPUTS:' block in user prompt"
    - "Composite scoring formula: blast(0.3) + knowledge(0.25) + refactor(0.25) + teachability(0.2)"
    - "Alternative inference: agent instructed to infer alternatives even when code does not document them"

key-files:
  created: []
  modified:
    - "agents/definitions/structure-analyzer.md"
    - "agents/definitions/impact-ranker.md"
    - "agents/runner.ts"
    - "cli/commands/analyze.ts"

key-decisions:
  - "structure-analyzer.md: 3-criterion rubric (decisionSignificance, alternativeAwareness, performanceImplication) with 2-10 decisions ranked by significance"
  - "impact-ranker.md: explicit JSON path instructions for output.nodes, output.sections, output.decisions from Stage 1 agents"
  - "impact-ranker.md: composite score formula weights blast radius (0.3) highest, knowledge gate and refactor risk (0.25 each), teachability (0.2)"
  - "runner.ts: stage1Outputs serializes only agentName and output (not rawContent or tokenUsage) to minimize token usage"
  - "analyze.ts: Stage 2 uses allAgentPaths[3] for impact ranker; allResults collects all 4 AgentResult objects"

patterns-established:
  - "Stage 2 pipeline: Stage 1 outputs serialized as JSON between file context and TASK instruction"
  - "Cross-agent referencing: impact ranker matches sections by file path across dependency mapper nodes, teachability scorer sections, and structure analyzer decisions"

requirements-completed: [REQ-08, REQ-09, REQ-16]

# Metrics
duration: 5min
completed: 2026-02-25
---

# Phase 5 Plan 2: Agent Definitions (Structure Analyzer & Impact Ranker) + Two-Stage Pipeline Summary

**Production-quality structure-analyzer.md and impact-ranker.md agent definitions with two-stage pipeline wiring: Stage 1 parallel execution feeds Stage 2 sequential impact ranking via serialized JSON outputs**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-25T21:17:48Z
- **Completed:** 2026-02-25T21:22:48Z
- **Tasks:** 4
- **Files modified:** 4

## Accomplishments

- Replaced structure-analyzer.md stub with production-quality agent definition covering 8 categories of data structure decisions (collections, custom structures, schema, API shapes, state management, immutability, concurrency, serialization), alternative inference even when not documented, and Big-O performance implications
- Replaced impact-ranker.md stub with production-quality agent definition containing explicit JSON path instructions for consuming all three Stage 1 agent outputs (output.nodes, output.sections, output.decisions), cross-referencing by file path, and composite scoring with calibrated weights
- Added stage1Outputs field to AgentRunOptions in runner.ts and serialization logic that inserts Stage 1 results as a labeled JSON block between file context and TASK instruction
- Wired Stage 2 execution in analyze.ts: impact ranker runs sequentially after all Stage 1 agents complete, receives stage1Results via stage1Outputs, and all 4 results are collected into allResults array

## Task Commits

Each task was committed atomically:

1. **Task 1: Replace structure-analyzer.md with production-quality agent definition** - `86f43bf` (feat)
2. **Task 2: Replace impact-ranker.md with production-quality agent definition** - `e940356` (feat)
3. **Task 3: Add stage1Outputs to AgentRunOptions and serialize into user prompt** - `3c5ec9d` (feat)
4. **Task 4: Wire Stage 2 sequential execution in analyze.ts** - `5d23353` (feat)

## Files Created/Modified

- `agents/definitions/structure-analyzer.md` - Production-quality structure analyzer with trade-off analysis, 8 decision categories, alternative inference, 3-criterion scoring rubric
- `agents/definitions/impact-ranker.md` - Production-quality impact ranker with Stage 1 JSON path consumption, cross-referencing, 4-criterion scoring, composite score formula
- `agents/runner.ts` - Added stage1Outputs?: AgentResult[] to AgentRunOptions; serializes Stage 1 outputs into user prompt for Stage 2 agents
- `cli/commands/analyze.ts` - Two-stage pipeline: Stage 1 parallel (3 agents) then Stage 2 sequential (impact ranker with stage1Outputs)

## Decisions Made

- structure-analyzer.md uses 3-criterion rubric (decisionSignificance, alternativeAwareness, performanceImplication) returning 2-10 decisions ranked by significance descending
- impact-ranker.md includes explicit JSON path instructions for each Stage 1 agent output: dependency mapper (output.nodes with fanIn), teachability scorer (output.sections with score), structure analyzer (output.decisions with significance)
- Composite score formula: compositeScore = (blastRadius * 0.3) + (knowledgeGate * 0.25) + (refactorRisk * 0.25) + (combinedTeachability * 0.2) -- blast radius weighted highest
- stage1Outputs serialization includes only agentName and output per result (rawContent and tokenUsage excluded to minimize token waste)
- Stage 2 uses allAgentPaths[3] for impact ranker path; allResults = [...stage1Results, stage2Result] collects all 4 results for Phase 6 rendering

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Prettier formatting in runner.ts**
- **Found during:** Task 4 (Stage 2 wiring verification)
- **Issue:** runner.ts had formatting inconsistency detected by prettier --check
- **Fix:** Ran prettier --write on runner.ts
- **Files modified:** agents/runner.ts
- **Verification:** npx prettier --check . passes
- **Committed in:** 5d23353 (included in Task 4 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Minor formatting fix, no scope creep.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All four agent definitions are now production-quality and complete
- Two-stage pipeline is fully wired: Stage 1 parallel (dependency mapper, teachability scorer, structure analyzer) feeds Stage 2 sequential (impact ranker)
- Ready for Plan 05-03 (dependency-graph.ts implementation) which is running in parallel
- After Phase 5 completes, Phase 6 (Terminal Output & Caching) can consume the allResults array from analyze.ts

---
*Phase: 05-agent-definitions-dependency-graph*
*Completed: 2026-02-25*
