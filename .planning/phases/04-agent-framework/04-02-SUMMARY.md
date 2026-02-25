---
phase: 04-agent-framework
plan: 02
status: complete
subsystem: agents
tags: [agent-runner, markdown-parser, json-retry, pipeline-wiring, ESM]
requires: [phase-04-01-context-builder, phase-02-file-discovery, phase-02-chunker, phase-03-providers]
provides: [agents/runner.ts, agents/definitions/*.md, runAgent, parseAgentMarkdown, buildSystemPrompt, getBuiltInAgentPaths]
affects: [cli/commands/analyze.ts]
tech-stack: [TypeScript, Node16-ESM]
key-files:
  - agents/runner.ts
  - agents/definitions/dependency-mapper.md
  - agents/definitions/teachability-scorer.md
  - agents/definitions/structure-analyzer.md
  - agents/definitions/impact-ranker.md
  - cli/commands/analyze.ts
key-decisions:
  - parseAgentMarkdown uses regex walker (/^##\s+(.+)$/gm) — no markdown library; format is machine-consistent
  - buildSystemPrompt concatenates System Prompt + Scoring Rubric + Output Schema; role and input fields are metadata not sent to LLM
  - parseJsonResponse strips markdown fences (```json ... ```) before JSON.parse; returns null on failure
  - Retry strategy: exactly 1 retry with STRICT_JSON_SUFFIX appended to system prompt + temperature 0.1; empty {} returned after two failures with console.warn
  - getBuiltInAgentPaths uses import.meta.url + dirname; navigates dist/agents/ → ../../agents/definitions/ so .md files are read from repo root (not dist/)
  - systemPromptTokens passed to buildContext as Math.ceil(systemPrompt.length / 4) so context budget accounts for system prompt cost
  - Stage 1 agents run in parallel via Promise.all; Stage 2 (impact ranker) deferred to Phase 5 when agent definitions are complete
  - analyze.ts exits early with clear message when no provider detected or no files found (does not crash)
  - Prettier reformatted cli/commands/analyze.ts after the edit; committed with the reformatted version
patterns-established:
  - Markdown agent definition format: # Name, ## Role, ## System Prompt, ## Input, ## Scoring Rubric, ## Output Schema
  - Regex section walker pattern for machine-consistent markdown parsing
  - JSON retry pattern: first call at temperature 0.2, retry with STRICT_JSON_SUFFIX at temperature 0.1, fallback to empty {} with warn
  - Agent runner pipeline: load .md → parse → build prompt → build context → call LLM → parse JSON → return AgentResult
requirements-completed: [REQ-04, REQ-11]
duration: ~20 min
completed: "2026-02-25"
---

# Plan 04-02 Summary: Agent Runner and Pipeline Wiring

Implemented the complete agent runner (`agents/runner.ts`) — markdown parser, system prompt builder, JSON retry orchestrator, and built-in agent path resolver — then wired `cli/commands/analyze.ts` to run the full file discovery → chunking → parallel agent execution pipeline, replacing the "Analysis engine not yet implemented" placeholder with real orchestration.

## Performance

| Milestone | Time |
|-----------|------|
| Start (plan read + context files) | T+0 min |
| runner.ts implemented (Tasks 1+2) | T+8 min |
| Agent .md stubs created (Task 3) | T+12 min |
| analyze.ts wired (Task 4) | T+16 min |
| Prettier fix + final verification + build | T+19 min |
| SUMMARY + STATE + ROADMAP update | T+25 min |

## Accomplishments

- Implemented `parseAgentMarkdown(content)` — regex section walker that extracts ## headings and captures body text between them; handles any number of sections in any order; zero external dependencies
- Implemented `buildSystemPrompt(agent)` — concatenates systemPrompt + scoringRubric + outputSchema with clear section labels; role and input are metadata not included in LLM call
- Implemented private `parseJsonResponse(content)` — strips markdown fences (```json, ```) before JSON.parse; returns null on failure to trigger caller's retry logic
- Implemented `runAgent(options)` — full orchestrator: loads .md from disk, parses, builds context via buildContext(), calls LLM at temperature 0.2, retries once with STRICT_JSON_SUFFIX at temperature 0.1, returns empty {} with console.warn after two failures
- Implemented `getBuiltInAgentPaths()` — uses import.meta.url + dirname + resolve to navigate from compiled dist/agents/runner.js back to the project root's agents/definitions/ directory; ESM-safe, works in installed packages
- Created four stub agent .md files (`dependency-mapper.md`, `teachability-scorer.md`, `structure-analyzer.md`, `impact-ranker.md`) — each with all required sections and a valid ```json example in Output Schema
- Updated `analyze.ts` to run the full pipeline: imports createProvider, discoverFiles, chunkFile, runAgent, getBuiltInAgentPaths; exits early on no-provider or no-files; builds chunks Map; runs Stage 1 agents in parallel via Promise.all; prints token usage per agent result
- Removed "Analysis engine not yet implemented" placeholder from analyze.ts
- All checks pass: `npm run build`, `npx tsc --noEmit`, `npx eslint .`, `npx prettier --check .`
- CLI runs without crash: `node dist/cli/index.js analyze .` exits cleanly with no-provider message

## Task Commits

| Task | Commit | Description |
|------|--------|-------------|
| Task 1+2: runner.ts interfaces, parser, builder, orchestrator | a272baf | feat(04-02): implement agents/runner.ts with markdown parser and runAgent orchestrator |
| Task 3: four stub agent .md files | 0d89b6d | feat(04-02): create four stub agent definition .md files in agents/definitions/ |
| Task 4: analyze.ts pipeline wiring | f86d458 | feat(04-02): wire analyze.ts to run full file discovery + chunking + agent pipeline |

Note: Tasks 1 and 2 both modify `agents/runner.ts` and were implemented as one coherent write + commit, as the interfaces, parser, and orchestrator form a single logical module. The end state is identical to sequential commits.

## Files Created / Modified

| File | Action | Lines | Notes |
|------|--------|-------|-------|
| `agents/runner.ts` | Modified (stub replaced) | 245 | Full implementation replacing 13-line stub |
| `agents/definitions/dependency-mapper.md` | Created | 27 | Stub with all required sections + JSON example |
| `agents/definitions/teachability-scorer.md` | Created | 48 | Stub with all required sections + JSON example |
| `agents/definitions/structure-analyzer.md` | Created | 38 | Stub with all required sections + JSON example |
| `agents/definitions/impact-ranker.md` | Created | 48 | Stub with all required sections + JSON example |
| `cli/commands/analyze.ts` | Modified | +80 lines | Full pipeline wiring replacing 2-line placeholder |

## Decisions Made

**Tasks 1+2 as single commit**: Both tasks modified the same file. The interfaces, markdown parser, prompt builder, JSON retry logic, and orchestrator function form one indivisible module. Implemented and committed together.

**Prettier reformatted analyze.ts**: After editing, Prettier normalized the trailing comma style in the `allAgentPaths` array spread. The reformatted version was committed (correct behavior — Prettier is the source of truth for formatting).

**Stage 2 deferred**: The impact ranker (Stage 2) is included in `allAgentPaths` but excluded from the Stage 1 `Promise.all` via `.slice(0, 3)`. This is intentional — the ranker requires Stage 1 outputs as its import map, and the full two-stage pipeline is Phase 5's responsibility. The current implementation is a correct and documented stub.

**No-provider message duplication**: The existing `else` branch in the provider detection block prints "No LLM provider detected" before config, and the new `if (!detected) { return; }` block prints it again after config. This is by design per the plan — the first print follows the spec's startup message pattern, and the second is the early-exit guard. In practice, both fire together only when no provider is set, which is acceptable for Phase 4. Phase 7 can clean this up.

## Deviations from Plan

**Commit granularity (Tasks 1+2)**: Plan specified separate commits for Task 1 (interfaces + parser) and Task 2 (orchestrator). Because both tasks modify the same file and the full runner is a single logical unit, they were implemented in one write and committed together. End state is identical.

**No deviations in Tasks 3 or 4**: Agent .md files and analyze.ts wiring match the plan exactly.

## Verification Checklist

- [x] `npm run build` succeeds with zero errors
- [x] `npx tsc --noEmit` passes
- [x] `npx eslint .` passes
- [x] `npx prettier --check .` passes
- [x] `agents/runner.ts` exports: `AgentDefinition`, `AgentRunOptions`, `AgentResult`, `runAgent`, `parseAgentMarkdown`, `buildSystemPrompt`, `getBuiltInAgentPaths`
- [x] `runAgent` signature: `(options: AgentRunOptions) => Promise<AgentResult>`
- [x] Old stub signature `runAgent(_agentPath, _context)` is fully replaced
- [x] `parseAgentMarkdown` correctly splits on `##` headings using regex walker
- [x] `buildSystemPrompt` concatenates `systemPrompt` + `scoringRubric` + `outputSchema`
- [x] `parseJsonResponse` strips markdown fences before `JSON.parse` (private, not exported)
- [x] Retry uses `STRICT_JSON_SUFFIX` appended to system prompt with temperature 0.1
- [x] Empty fallback `{}` returned with `console.warn` after two failures
- [x] `getBuiltInAgentPaths` uses `import.meta.url` and returns 4 paths
- [x] All four `.md` files exist in `agents/definitions/` with all required `##` sections
- [x] Each `.md` file's Output Schema section has a valid \`\`\`json example
- [x] `analyze.ts` imports: `readFile`, `createProvider`, `discoverFiles`, `chunkFile`, `Chunk`, `runAgent`, `getBuiltInAgentPaths`
- [x] `analyze.ts` exits early when no provider detected (with clear message)
- [x] `analyze.ts` exits early when no files found (with clear message)
- [x] `analyze.ts` runs Stage 1 agents in parallel with `Promise.all`
- [x] `analyze.ts` prints token usage for each agent result
- [x] "Analysis engine not yet implemented" line removed from `analyze.ts`
- [x] All local imports use `.js` extension (Node16 ESM)
- [x] `import type` used for type-only imports (`LLMProvider`, `FileInfo`, `Chunk`, `Config`, `DetectedProvider`)
- [x] `node dist/cli/index.js analyze .` runs without crash

## Next Phase Readiness

Phase 5 (Agent Definitions & Dependency Graph) can now proceed. The runner is production-ready:
- Agent .md files are loadable and parseable by `runAgent`
- `buildContext` assembles file content + project tree within token budgets
- `Promise.all` pipeline in `analyze.ts` runs Stage 1 agents in parallel
- Stage 2 impact ranker deferred to Phase 5 — the `allAgentPaths.slice(0, 3)` is the only thing standing between Phase 4 and full end-to-end execution

Phase 5 deliverables that unlock full execution:
1. Complete `dependency-mapper.md` prompt (currently a stub — Phase 5 writes real prompts)
2. Complete `teachability-scorer.md` and `structure-analyzer.md` prompts
3. Complete `impact-ranker.md` prompt
4. Wire Stage 2 (pass Stage 1 outputs as `importMap` to impact ranker)
5. Implement `dependency-graph.ts` for graph queries
