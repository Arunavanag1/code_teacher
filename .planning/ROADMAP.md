# Roadmap: code-teacher

## Overview

Build a CLI codebase analysis tool from the ground up: scaffold the TypeScript project and CLI framework, implement file discovery and chunking, integrate LLM providers, build the agent system that loads markdown definitions and orchestrates analysis, write all four agent definitions with the dependency graph, create the terminal output renderer and caching layer, then harden with error handling, extended features, and real-world testing.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Project Scaffold & CLI** - TypeScript project setup, CLI framework with all flags, config schema
- [ ] **Phase 2: File Discovery & Chunking** - Directory walker, gitignore handling, logical file chunking
- [ ] **Phase 3: LLM Provider System** - Provider abstraction, three SDK integrations, auto-detection logic
- [ ] **Phase 4: Agent Framework** - Markdown agent parser, runner, context builder with token management
- [ ] **Phase 5: Agent Definitions & Dependency Graph** - Four agent markdown files, dependency graph, two-stage pipeline
- [ ] **Phase 6: Terminal Output & Caching** - ANSI formatter, three output modes, content-hash cache
- [ ] **Phase 7: Hardening & Extended Features** - Error handling, watch mode, init command, custom agents, real-world testing

## Phase Details

### Phase 1: Project Scaffold & CLI
**Goal**: Working CLI that parses all flags and loads config — the skeleton everything hangs on
**Depends on**: Nothing (first phase)
**Requirements**: REQ-01, REQ-15
**Success Criteria** (what must be TRUE):
  1. `code-teacher analyze [path]` accepts all flags: `--mode`, `--file`, `--verbose`, `--top`, `--json`, `--provider`, `--model`
  2. `code-teacher --version` and `code-teacher --help` produce correct output
  3. `code-teacher.config.json` is loaded and validated against schema when present
  4. TypeScript compiles cleanly, ESLint and Prettier configured
**Plans**: 2 plans

Plans:
- [x] 01-01: Initialize TypeScript project with tsconfig, ESLint, Prettier, and package.json for GitHub distribution
- [x] 01-02: Implement CLI framework with commander/yargs, all flags, and config schema validation

### Phase 2: File Discovery & Chunking
**Goal**: Given a path, produce a list of analyzable file chunks ready for LLM consumption
**Depends on**: Phase 1
**Requirements**: REQ-02, REQ-03
**Success Criteria** (what must be TRUE):
  1. File discovery respects `.gitignore` and config ignore patterns
  2. Binary files, images, fonts, lockfiles are filtered out
  3. Files exceeding maxFileSize are skipped with a warning
  4. Large files are split into ~200-line overlapping chunks on logical boundaries (function/class declarations)
  5. Each chunk retains metadata: file path, start line, end line, chunk index
**Plans**: 2 plans

Plans:
- [x] 02-01: Implement file-discovery.ts — directory walker with gitignore, config ignores, binary filtering, size limits
- [ ] 02-02: Implement chunker.ts — logical boundary splitting, 20-line overlap, chunk metadata

### Phase 3: LLM Provider System
**Goal**: Unified interface to call any of three LLM providers with auto-detection
**Depends on**: Phase 1
**Requirements**: REQ-05
**Success Criteria** (what must be TRUE):
  1. Auto-detection scans env vars in order: ANTHROPIC_API_KEY → OPENAI_API_KEY → GOOGLE_API_KEY
  2. `--provider` and `--model` flags override auto-detection
  3. CODE_TEACHER_PROVIDER and CODE_TEACHER_MODEL env vars override auto-detection
  4. Startup prints detected provider: "Using Anthropic (claude-sonnet-4-20250514) — detected from ANTHROPIC_API_KEY"
  5. Clear error when no API key found
**Plans**: 2 plans

Plans:
- [ ] 03-01: Implement LLMProvider interface, detection logic, and environment variable scanning
- [ ] 03-02: Implement Anthropic, OpenAI, and Google SDK integrations conforming to provider interface

### Phase 4: Agent Framework
**Goal**: System that loads markdown agent definitions, builds context windows, and orchestrates LLM calls
**Depends on**: Phase 2, Phase 3
**Requirements**: REQ-04, REQ-11
**Success Criteria** (what must be TRUE):
  1. Agent runner loads .md files and correctly parses Role, System Prompt, Input, Scoring Rubric, Output Schema sections
  2. LLM calls are constructed with file content as context and JSON responses are parsed
  3. Malformed JSON responses trigger retries with stricter prompts
  4. Context builder assembles file content + project structure tree + import maps
  5. Token counting stays within model context limits with priority-based context (full → summarized → names only)
**Plans**: 2 plans

Plans:
- [ ] 04-01: Implement runner.ts — markdown agent parser, prompt construction, LLM call orchestration with retries
- [ ] 04-02: Implement context.ts — context window builder with token counting and priority-based truncation

### Phase 5: Agent Definitions & Dependency Graph
**Goal**: All four agents produce scored, reasoned analysis; dependency graph enables impact queries
**Depends on**: Phase 4
**Requirements**: REQ-06, REQ-07, REQ-08, REQ-09, REQ-10, REQ-16
**Success Criteria** (what must be TRUE):
  1. Dependency Mapper outputs adjacency list with fan-in, fan-out, coupling depth, centrality scores
  2. Teachability Scorer ranks sections with 5-criterion scores and plain-English explanations
  3. Structure Analyzer identifies data structure decisions with trade-off analysis
  4. Impact Ranker synthesizes all Stage 1 outputs into final ranked list
  5. Stage 1 agents (Mapper, Scorer, Analyzer) run in parallel; Stage 2 (Ranker) runs after all complete
  6. Dependency graph supports getImpactScore, getCentrality, getBottlenecks, getCluster, getEntryPoints
**Plans**: 3 plans

Plans:
- [ ] 05-01: Write dependency-mapper.md and teachability-scorer.md agent definitions with scoring rubrics and output schemas
- [ ] 05-02: Write structure-analyzer.md and impact-ranker.md agent definitions; implement two-stage parallel/sequential pipeline
- [ ] 05-03: Implement dependency-graph.ts — graph data structure, centrality, impact score, bottleneck, cluster detection

### Phase 6: Terminal Output & Caching
**Goal**: Beautiful terminal output in three modes and smart caching to avoid redundant LLM calls
**Depends on**: Phase 5
**Requirements**: REQ-12, REQ-13
**Success Criteria** (what must be TRUE):
  1. Summary mode displays top N results per category with ANSI colors and Unicode box-drawing
  2. Verbose mode includes agent reasoning traces
  3. JSON mode outputs structured data matching the spec's schema
  4. Output adapts to terminal width
  5. Cache keys use SHA of (commit hash + file content hash + agent version)
  6. Partial re-analysis only re-runs on changed files, merges with cached results
**Plans**: 3 plans

Plans:
- [ ] 06-01: Implement formatter.ts — ANSI colors, Unicode box-drawing, score bars, terminal width detection
- [ ] 06-02: Implement renderer.ts — summary, verbose, and JSON output modes
- [ ] 06-03: Implement cache.ts — content-hash keys, .code-teacher-cache/ management, partial re-analysis

### Phase 7: Hardening & Extended Features
**Goal**: Production-ready error handling, extended CLI commands, custom agents, and validated against real repos
**Depends on**: Phase 6
**Requirements**: REQ-14, REQ-17, REQ-18, REQ-19, REQ-20
**Success Criteria** (what must be TRUE):
  1. API errors handled gracefully with exponential backoff (1s, 2s, 4s, 8s, max 3 retries)
  2. Clear error messages for missing API keys, invalid configs, unreadable files
  3. `code-teacher init` creates starter config
  4. Custom agents loaded from `customAgents` config field
  5. `--watch` mode re-analyzes on file changes
  6. Successfully tested against 10+ open-source repos of varying sizes and languages
**Plans**: 3 plans

Plans:
- [ ] 07-01: Implement error handling — API error recovery, exponential backoff, timeout handling, user-friendly messages
- [ ] 07-02: Implement init command, custom agent loading from config, and --watch mode with file change detection
- [ ] 07-03: Real-world testing against 10+ open-source repos, performance optimization, README and package.json for publishing

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7

Note: Phases 2 and 3 are independent and can execute in parallel after Phase 1.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Project Scaffold & CLI | 2/2 | Complete | 2026-02-25 |
| 2. File Discovery & Chunking | 1/2 | In Progress | - |
| 3. LLM Provider System | 1/2 | In Progress | - |
| 4. Agent Framework | 0/2 | Not started | - |
| 5. Agent Definitions & Dependency Graph | 0/3 | Not started | - |
| 6. Terminal Output & Caching | 0/3 | Not started | - |
| 7. Hardening & Extended Features | 0/3 | Not started | - |
