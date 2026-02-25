# code-teacher

## What This Is

A CLI tool that analyzes codebases to surface three categories of insight: teachable sections (`@important-teachings`), high-impact sections (`@important-sections`), and key data structure decisions. It uses LLM-powered agents defined in markdown files, making it language-agnostic and extensible without code changes. Distributed as a GitHub-hosted npm package.

## Core Value

The analysis outputs must be accurate and genuinely useful — `@important-sections` correctly identifies the code that matters most (dependency hubs, blast radius, architectural pillars), and `@important-teachings` surfaces code that's actually valuable for learning (clear patterns, transferable concepts, well-chosen algorithms).

## Requirements

### Validated

<!-- Shipped and confirmed valuable. -->

(None yet — ship to validate)

### Active

<!-- Current scope. Building toward these. -->

- [ ] REQ-01: CLI entry point with `code-teacher analyze [path]` supporting `--mode`, `--file`, `--verbose`, `--top`, `--json`, `--provider`, `--model` flags
- [ ] REQ-02: File discovery that respects `.gitignore`, config ignore patterns, filters binaries, and enforces maxFileSize
- [ ] REQ-03: Chunker that splits large files into ~200-line overlapping chunks on logical boundaries
- [ ] REQ-04: Agent runner that loads markdown agent definitions, constructs LLM prompts, and parses JSON responses with retries
- [ ] REQ-05: Provider abstraction with auto-detection (Anthropic → OpenAI → Google) and explicit `--provider`/`--model` override
- [ ] REQ-06: Dependency Mapper agent — builds cross-file dependency graph with fan-in, fan-out, coupling depth, centrality scoring
- [ ] REQ-07: Teachability Scorer agent — ranks code sections by conceptual density, clarity, transferability, novelty, self-containment
- [ ] REQ-08: Structure Analyzer agent — identifies data structure decisions with trade-off analysis and performance implications
- [ ] REQ-09: Impact Ranker agent — synthesizes all agent outputs into final ranked list with blast radius, knowledge gate, refactor risk scores
- [ ] REQ-10: In-memory dependency graph (`dependency-graph.ts`) with getImpactScore, getCentrality, getBottlenecks, getCluster, getEntryPoints
- [ ] REQ-11: Context builder that assembles file content + project structure + import maps within model token limits
- [ ] REQ-12: Terminal output with ANSI colors, Unicode box-drawing, summary/verbose/JSON modes
- [ ] REQ-13: Content-hash-based caching in `.code-teacher-cache/` with partial re-analysis on file changes
- [ ] REQ-14: Error handling — graceful API errors, exponential backoff retries, clear messages for missing keys/invalid configs
- [ ] REQ-15: Optional `code-teacher.config.json` for ignore patterns, maxFileSize, topN, provider, model, custom agents
- [ ] REQ-16: Stage 1 agents run in parallel; Stage 2 (Impact Ranker) runs after all Stage 1 agents complete
- [ ] REQ-17: Real-world testing against 10+ open-source repos of varying sizes and languages
- [ ] REQ-18: `--watch` mode for re-analysis on file changes
- [ ] REQ-19: `code-teacher init` command to create starter config
- [ ] REQ-20: Custom agent support via `customAgents` config field

### Out of Scope

<!-- Explicit boundaries. Includes reasoning to prevent re-adding. -->

- GitHub integration (Phase 5: PR comments, GitHub App, webhooks) — deferred to future milestone after CLI is proven
- VS Code extension — future consideration, not v1
- Historical analysis (score tracking across commits) — future consideration
- Team calibration (custom scoring weights) — future consideration
- AST-enhanced mode (language-specific parsers) — future consideration, LLM-based approach is the core design decision
- Multi-repo analysis — future consideration
- Interactive terminal UI (ink/blessed) — future consideration

## Context

- **Architecture**: TypeScript project following the exact structure defined in `code-teacher_spec.md`
- **Agent system**: 4 agents defined as markdown files (dependency-mapper, teachability-scorer, structure-analyzer, impact-ranker) with a two-stage execution pipeline (parallel Stage 1, sequential Stage 2)
- **Distribution**: GitHub-hosted npm package (`npm install -g github:USERNAME/code-teacher`)
- **LLM strategy**: BYOK (bring your own key), auto-detect from environment variables, support Anthropic + OpenAI + Google
- **Language-agnostic**: No hardcoded parsers — LLM reasons about any language via prompts
- **Spec document**: Full spec in `code-teacher_spec.md` with detailed interfaces, output formats, pipeline diagrams, and agent scoring rubrics

## Constraints

- **Tech stack**: TypeScript, exact architecture from spec — `commander`/`yargs` for CLI, `chalk`/`picocolors` for colors, `ora` for spinners
- **Spec adherence**: Implementation must match the spec's interfaces, data structures, agent definitions, and output formats exactly
- **LLM providers**: All three providers (Anthropic, OpenAI, Google) required in v1 with auto-detection order: Anthropic → OpenAI → Google
- **Distribution**: Must work via `npm install -g github:USERNAME/code-teacher` and `npx`

## Key Decisions

<!-- Decisions that constrain future work. Add throughout project lifecycle. -->

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Markdown-based agent definitions | Human-readable, versionable, extensible without code changes, provider-agnostic | — Pending |
| Language-agnostic (LLM-only, no AST) | Broader coverage, faster to ship; trade-off is less precision than AST-based | — Pending |
| CLI-first, no web UI | Meets developers in terminal, pipeable output, shared core for future GitHub integration | — Pending |
| BYOK (no bundled API keys) | No infrastructure to maintain, users already have keys from Claude Code/Codex | — Pending |
| Spec-exact implementation | All interfaces, architectures, and formats follow code-teacher_spec.md precisely | — Pending |

---
*Last updated: 2026-02-25 after initialization*
