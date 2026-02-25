---
phase: 05-agent-definitions-dependency-graph
plan: 01
subsystem: agents
tags: [llm-prompts, dependency-analysis, teachability, agent-definitions, scoring-rubric]

# Dependency graph
requires:
  - phase: 04-agent-framework
    provides: "parseAgentMarkdown, buildSystemPrompt, runAgent that load and execute .md agent definitions"
provides:
  - "Production-quality dependency-mapper.md with enriched nodes+edges output schema"
  - "Production-quality teachability-scorer.md with 5-criterion rubric and worked examples"
affects: [05-agent-definitions-dependency-graph, 06-terminal-output-caching]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Multi-paragraph agent system prompts with scored output schemas"
    - "Language-agnostic dependency detection covering 7 language families"
    - "5-criterion teachability scoring with prerequisite inference"

key-files:
  created: []
  modified:
    - "agents/definitions/dependency-mapper.md"
    - "agents/definitions/teachability-scorer.md"

key-decisions:
  - "Dependency mapper outputs enriched nodes array (id, type, exportedSymbols, fanIn, fanOut, couplingDepth, centrality) + typed edges array -- maps directly to DependencyGraph interface for buildGraph() in Plan 05-03"
  - "Teachability scorer returns 3-15 sections ranked by score descending with concepts and prerequisites arrays per section"
  - "Edge types classified as imports/calls/extends/implements/uses with coupling weight 1-10"
  - "Centrality computed as weighted combination: fanIn * 0.6 + fanOut * 0.4"

patterns-established:
  - "Agent definition structure: multi-paragraph System Prompt organized by numbered instruction areas (identity, patterns, scoring, edge types, completeness, node types)"
  - "Scoring rubric format: criteria name, 0-10 range, short description, then worked examples at score 2, 5, and 9"

requirements-completed: [REQ-06, REQ-07]

# Metrics
duration: 3min
completed: 2026-02-25
---

# Phase 5 Plan 1: Agent Definitions (Dependency Mapper & Teachability Scorer) Summary

**Production-quality dependency-mapper.md with enriched nodes+edges output schema and teachability-scorer.md with detailed 5-criterion rubric and worked scoring examples**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-25T21:12:03Z
- **Completed:** 2026-02-25T21:14:49Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Replaced thin dependency-mapper.md stub with production-quality agent definition featuring multi-paragraph system prompt covering language-agnostic import detection (ES modules, CommonJS, Python, Go, Java, Rust, C/C++), enriched output schema with nodes array (per-node scoring: fanIn, fanOut, couplingDepth, centrality) and typed edges array (imports, calls, extends, implements, uses with coupling weight)
- Replaced thin teachability-scorer.md stub with production-quality agent definition featuring 5-criterion rubric (conceptualDensity, clarity, transferability, novelty, selfContainment) with worked examples at score 2, 5, and 9 for each criterion, prerequisite inference instructions, and section identification rules (3-15 sections, 5-150 lines each)
- Both agent definitions are detailed enough to produce consistent, structured JSON output from any LLM provider (Anthropic, OpenAI, Google)

## Task Commits

Each task was committed atomically:

1. **Task 1: Replace dependency-mapper.md with production-quality agent definition** - `1188fd6` (feat)
2. **Task 2: Replace teachability-scorer.md with production-quality agent definition** - `1c54e6f` (feat)

## Files Created/Modified

- `agents/definitions/dependency-mapper.md` - Production-quality dependency mapper agent definition with enriched nodes+edges output schema and detailed scoring rubric
- `agents/definitions/teachability-scorer.md` - Production-quality teachability scorer agent definition with 5-criterion rubric, worked examples, and prerequisite inference

## Decisions Made

- Dependency mapper output schema uses enriched nodes array with per-node fanIn, fanOut, couplingDepth, centrality scores plus exportedSymbols -- this maps directly to the DependencyGraph interface that buildGraph() will consume in Plan 05-03
- Edge types classified as 5 categories (imports/calls/extends/implements/uses) with coupling weight 1-10
- Centrality formula: weighted combination of fanIn (0.6 weight) and fanOut (0.4 weight) -- being depended upon is weighted higher than depending on others
- Teachability scorer returns 3-15 sections ranked by overall score descending, with concepts and prerequisites arrays per section

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Ready for Plan 05-02 (structure-analyzer.md and impact-ranker.md agent definitions + two-stage pipeline wiring)
- dependency-mapper.md output schema is ready for consumption by buildGraph() in Plan 05-03
- teachability-scorer.md output schema is ready for consumption by impact-ranker.md in Plan 05-02

---
*Phase: 05-agent-definitions-dependency-graph*
*Completed: 2026-02-25*
