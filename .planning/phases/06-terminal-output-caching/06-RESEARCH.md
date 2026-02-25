# Phase 6 Research: Terminal Output & Caching

**Phase:** 6 of 7 — Terminal Output & Caching
**Requirements:** REQ-12, REQ-13
**Research date:** 2026-02-25
**Researcher:** gsd-phase-researcher

---

## 1. Exact Terminal Output Format from the Spec

### Header Box (Unicode box-drawing, double-line style)

```
╔══════════════════════════════════════════════════════════════╗
║  code-teacher Analysis: my-project                              ║
║  Files analyzed: 47 | Languages: TypeScript, Python         ║
║  Analysis time: 12.3s                                       ║
╚══════════════════════════════════════════════════════════════╝
```

Unicode characters used:
- `\u2554` = `╔` (top-left corner)
- `\u2557` = `╗` (top-right corner)
- `\u255a` = `╚` (bottom-left corner)
- `\u255d` = `╝` (bottom-right corner)
- `\u2550` = `═` (horizontal double)
- `\u2551` = `║` (vertical double)
- `\u2500` = `─` (horizontal single, used for section dividers)
- `\u2022` = `•` (bullet, used for data structure decisions)

### Section Separators

```
🎯 TOP HIGH-IMPACT SECTIONS
─────────────────────────────────────────
```

The spec uses emoji headers (🎯, 📚, 🏗️) for section labels and single-line horizontal box-drawing (`─`) for dividers beneath them. Width appears to be ~41 characters for dividers.

### High-Impact Section Entry Format

```
 #1  src/core/engine.ts:23-89              Score: 9.2/10
     "Central orchestration engine — 34 downstream dependents.
      Modifying this function affects auth, payments, and notifications."
     Fan-in: 34 | Blast radius: HIGH | Refactor risk: HIGH
```

Pattern breakdown:
- Rank prefix: ` #N  ` (space + hash + number + two spaces)
- File:line range, padded to align Score
- Score: `Score: X.X/10`
- Indented summary in quotes (the `summary` field from impact-ranker output)
- Metrics line: `Fan-in: N | Blast radius: HIGH/MEDIUM/LOW | Refactor risk: HIGH/MEDIUM/LOW`

Blast radius and refactor risk labels are derived from numeric scores:
- 8-10 -> HIGH
- 4-7 -> MEDIUM
- 0-3 -> LOW

### Teachable Section Entry Format

```
 #1  src/algo/rate-limiter.ts:10-67        Score: 9.4/10
     "Sliding window rate limiter using a sorted set..."
     Concepts: sliding window, sorted sets, time complexity
     Prerequisites: basic hash maps, Big-O notation
```

- Uses the `reasoning` field from teachability-scorer output (shown in quotes)
- Lists `concepts` array joined by `, `
- Lists `prerequisites` array joined by `, `

### Data Structure Decision Entry Format

```
 •  src/cache/lru.ts:5-80
    Chose: Doubly-linked list + HashMap (LRU Cache)
    Over: Simple object with timestamp eviction
    Why it matters: O(1) get/put vs O(n) eviction scans.
    Performance impact: Critical for request caching at scale.
```

- Uses bullet `•` not rank numbers
- Uses fields directly from structure-analyzer output: `chosenStructure`, `alternatives[0]`, `reasoning`, `performanceImplication`

### ANSI Color Scheme (implied by spec, standard terminal conventions)

The spec says "ANSI colors" without specifying exact color assignments. Standard convention for tools like this:
- Header box: bold cyan or bold white
- Section headers (🎯/📚/🏗️ lines): bold yellow or bold white
- Score values: green (high scores) / yellow (mid) / red (low)
- File paths: cyan
- Rank numbers: bold white
- Labels (Fan-in:, Blast radius:, etc.): dim/gray
- HIGH: bold red, MEDIUM: yellow, LOW: green

No `chalk` or `picocolors` package is installed. ANSI must be implemented using raw escape codes or a zero-dependency wrapper.

---

## 2. What Currently Exists in analyze.ts (What Must Change)

### Current output (Phase 5 state)

```typescript
// Per each stage1 agent result:
console.log(`Agent: ${result.agentName}`);
console.log(`Tokens: ${result.tokenUsage.inputTokens} in / ${result.tokenUsage.outputTokens} out`);
if (resolved.verbose) { console.log('Raw output:\n' + result.rawContent); }
if (resolved.json) { console.log(JSON.stringify(result.output, null, 2)); }
else { console.log(`Output keys: ${Object.keys(result.output).join(', ')}`); }

// After all agents:
console.log(`Analysis complete. ${allResults.length} agents produced results. Full rendering coming in Phase 6.`);
```

### What Phase 6 must replace

The current `console.log` block at the bottom of `analyzeCommand` must be replaced with a call to `renderResults()` from `cli/output/renderer.ts`. The `allResults` array and `resolved` config are already in scope.

**Key integration point in analyze.ts:**
```typescript
// Collect all results for Phase 6 rendering
const allResults = [...stage1Results, stage2Result];
// Phase 6: replace the console.log with:
// renderResults(allResults, files, resolved);
```

The `allResults` has 4 `AgentResult` objects in order: `[dependency-mapper, teachability-scorer, structure-analyzer, impact-ranker]`.

---

## 3. AgentResult.output JSON Shapes by Agent

### Agent 0: Dependency Mapper

```typescript
output: {
  nodes: Array<{
    id: string;               // file path (relative to project root)
    type: "file" | "module" | "class" | "function";
    exportedSymbols: string[];
    fanIn: number;            // 0-10
    fanOut: number;           // 0-10
    couplingDepth: number;    // 0-10
    centrality: number;       // 0-10
  }>;
  edges: Array<{
    source: string;
    target: string;
    type: "imports" | "calls" | "extends" | "implements" | "uses";
    weight: number;           // 1-10
  }>;
  summary: string;            // overview of dependency structure
}
```

### Agent 1: Teachability Scorer

```typescript
output: {
  sections: Array<{
    file: string;
    startLine: number;
    endLine: number;
    score: number;            // arithmetic mean of 5 criteria, 0-10
    criteria: {
      conceptualDensity: number;
      clarity: number;
      transferability: number;
      novelty: number;
      selfContainment: number;
    };
    reasoning: string;        // plain-English explanation
    concepts: string[];       // learnable concepts
    prerequisites: string[];  // what learner needs first
  }>;
}
```

### Agent 2: Structure Analyzer

```typescript
output: {
  decisions: Array<{
    file: string;
    startLine: number;
    endLine: number;
    chosenStructure: string;
    alternatives: string[];   // at least 1
    reasoning: string;
    performanceImplication: string;
    criteria: {
      decisionSignificance: number;
      alternativeAwareness: number;
      performanceImplication: number;
    };
    significance: number;     // 0-10
  }>;
}
```

### Agent 3: Impact Ranker (Stage 2)

```typescript
output: {
  rankedSections: Array<{
    file: string;
    startLine: number;
    endLine: number;
    compositeScore: number;   // 0-10, one decimal place
    criteria: {
      blastRadius: number;
      knowledgeGate: number;
      refactorRisk: number;
      combinedTeachability: number;
    };
    summary: string;          // plain-English importance explanation
  }>;
  narrative: string;          // 2-4 sentences on overall importance distribution
}
```

### Key renderer logic: agent name to output field mapping

```
"Dependency Mapper"   -> allResults[0].output.nodes, .edges, .summary
"Teachability Scorer" -> allResults[1].output.sections
"Structure Analyzer"  -> allResults[2].output.decisions
"Impact Ranker"       -> allResults[3].output.rankedSections, .narrative
```

The renderer should not rely on array index (fragile if custom agents change order). Match by `agentName` string instead.

---

## 4. Cache Strategy from the Spec

### Cache key formula (from spec and ROADMAP success criteria)

```
cacheKey = SHA256(commitHash + fileContentHash + agentVersion)
```

Where:
- `commitHash`: `git rev-parse HEAD` on the project being analyzed (NOT on the code-teacher repo). Falls back to empty string if project is not a git repo.
- `fileContentHash`: SHA256 of the file's content (NOT just mtime — content-addressable)
- `agentVersion`: the agent markdown file's content hash (or the filename + file content hash) — ensures cache invalidates when an agent definition is edited

### Storage format

- Directory: `.code-teacher-cache/` in the project root (already in .gitignore)
- File per cache entry: `.code-teacher-cache/<cacheKey>.json`
- File content: the full `AgentResult` JSON-serialized (or an array of them)

### Partial re-analysis logic

The spec says: "If only some files changed, only re-analyze those files and merge with cached results."

Practical implementation for Phase 6:
1. For each file being analyzed, compute `fileContentHash`
2. Look up whether a cached result exists for `(commitHash, fileContentHash, agentVersion)`
3. If cache hit: skip LLM call for that file, use cached result
4. If cache miss: run agent, cache the result
5. Merge cached + fresh results before rendering

**Critical constraint:** The current pipeline runs agents per-project (all files at once), not per-file. The cache strategy needs to decide granularity:
- Option A: Cache the entire analysis run result (keyed by project snapshot hash). Simpler, but any file change invalidates everything.
- Option B: Cache per-file per-agent results. Requires restructuring the runner to support per-file agent calls and merge logic.

**The spec implies per-file granularity** ("only re-analyze those files"), so Option B is the spec-correct approach. However, this requires that the runner can be called per-file and results merged. The current runner builds a full-project context window -- this may need a way to identify which portions of the result came from which file.

For Plan 06-03, a pragmatic implementation might:
1. Cache at the project-level result (keyed by SHA of all file content hashes concatenated). This satisfies the "content hash" requirement.
2. When cache is valid, skip the entire analysis run. When any file changes, re-run (but note the spec says "partial").
3. Add a note in implementation plan that true per-file partial re-analysis is a Phase 7 refinement.

### Cache TTL

No expiration by TTL — invalidation is purely content-hash driven.

---

## 5. Package Availability

### What IS installed

| Package | Version | Available for |
|---------|---------|---------------|
| `commander` | ^14.0.3 | CLI already using |
| `ignore` | ^7.0.5 | File discovery |
| `@anthropic-ai/sdk` | ^0.78.0 | LLM provider |
| `openai` | ^6.25.0 | LLM provider |
| `@google/genai` | ^1.42.0 | LLM provider |
| `ansi-regex` | (transitive) | Pattern matching only |
| `ansi-styles` | (transitive) | May be usable |
| `strip-ansi` | (transitive) | Strip ANSI from strings |
| `string-width` | (transitive) | Get visible width of string (important for alignment!) |
| `wrap-ansi` | (transitive) | Word-wrap strings with ANSI |

### What is NOT installed

- `chalk` - NOT installed (not in dependencies or node_modules top-level)
- `picocolors` - NOT installed
- `ora` - NOT installed (no spinner package)

### What can be used without new packages

- **ANSI colors**: Raw escape codes (e.g., `\x1b[36m` for cyan, `\x1b[0m` for reset). The spec says `chalk` OR `picocolors`, so raw ANSI is acceptable.
- **Terminal width**: `process.stdout.columns` when running in a TTY. Falls back to a default of 80 when not a TTY (non-interactive output). Note: in non-TTY shells (piped), `process.stdout.columns` is `undefined`.
- **SHA hashing**: Node.js built-in `crypto` module (`createHash('sha256')`)
- **File I/O for cache**: Node.js built-in `fs/promises` (`mkdir`, `readFile`, `writeFile`)
- **Git commit hash**: `execSync('git rev-parse HEAD')` from `child_process` (built-in), with try/catch for non-git projects
- **String width alignment**: `string-width` is a transitive dependency that is available. Can import it for proper alignment of ANSI strings.

### Decision for Phase 6

Use raw ANSI escape codes for a zero-dependency formatter. Create a thin `ANSI` constant object in `formatter.ts` with named escapes. This avoids adding new dependencies and is fully portable. The spec says "chalk or picocolors" but these are suggestions, not hard requirements.

If spinner-like behavior is wanted during analysis, use `process.stdout.write('\rAnalyzing...')` with carriage return — no `ora` needed for basic progress indication.

---

## 6. Project Structure — Where Files Go

### Existing stubs (already created in Phase 1 scaffold)

Both files exist but are stubs:
- `/Users/arunavanag/Documents/code-teacher/cli/output/formatter.ts` — has `formatHeader` and `formatScore` stubs
- `/Users/arunavanag/Documents/code-teacher/cli/output/renderer.ts` — has `renderResults` stub

### Full project structure (spec-defined, phases 1-5 already built)

```
code-teacher/
├── cli/
│   ├── index.ts                      # Done (Phase 1)
│   ├── commands/
│   │   └── analyze.ts                # Done (Phase 5) — needs Phase 6 wiring
│   └── output/
│       ├── formatter.ts              # STUB — Phase 6 Plan 06-01
│       └── renderer.ts               # STUB — Phase 6 Plan 06-02
├── agents/
│   ├── definitions/
│   │   ├── dependency-mapper.md      # Done (Phase 5)
│   │   ├── teachability-scorer.md    # Done (Phase 5)
│   │   ├── structure-analyzer.md     # Done (Phase 5)
│   │   └── impact-ranker.md          # Done (Phase 5)
│   ├── runner.ts                     # Done (Phase 4)
│   └── context.ts                    # Done (Phase 4)
├── core/
│   ├── file-discovery.ts             # Done (Phase 2)
│   ├── chunker.ts                    # Done (Phase 2)
│   ├── dependency-graph.ts           # Done (Phase 5)
│   └── cache.ts                      # STUB — Phase 6 Plan 06-03
├── config/
│   ├── defaults.ts                   # Done (Phase 1)
│   └── schema.ts                     # Done (Phase 1)
├── providers/
│   └── index.ts                      # Done (Phase 3)
```

### tsconfig.json includes

The tsconfig `include` covers `cli/**/*.ts` and `core/**/*.ts`, so both `cli/output/formatter.ts` and `core/cache.ts` are already in scope. No tsconfig changes needed.

---

## 7. How DependencyGraph Data Feeds into JSON Output Mode

### JSON output schema (from spec)

```json
{
  "project": "my-project",
  "timestamp": "2025-02-25T10:30:00Z",
  "filesAnalyzed": 47,
  "languages": ["TypeScript", "Python"],
  "highImpactSections": [...],
  "teachableSections": [...],
  "dataStructureDecisions": [...],
  "dependencyGraph": {...}
}
```

### What `dependencyGraph` contains

The `dependencyGraph` field in JSON output should be the raw dependency mapper output (`allResults[0].output`), which already contains `nodes`, `edges`, and `summary`. This is the spec-natural shape since it's already serializable JSON.

Alternatively (richer option): serialize the `DependencyGraph` object from `dependency-graph.ts` after calling `buildGraph()` on the mapper output. But `DependencyGraph` uses `Map` objects which don't serialize cleanly to JSON. The raw agent output is simpler and already a plain object.

### How to derive `languages` list for JSON output

From the `FileInfo` list (which has `path` fields), extract extensions and map them using the same `inferLanguage` logic in `dependency-graph.ts`. Or: collect from the `metadata.language` fields of the nodes in the mapper output.

### How to derive `project` name

Use `path.basename(resolved.targetPath)` — the last path component of the analyzed directory.

### How to count `filesAnalyzed`

`files.length` (the FileInfo array from `discoverFiles`) — already available in `analyze.ts`.

---

## 8. Verbose Mode — What It Shows

From the spec: "Includes agent reasoning traces, showing how each agent arrived at its scores. Useful for debugging or understanding the analysis."

The `AgentResult.rawContent` field stores the raw LLM response text. This is what verbose mode should show per agent. The spec does not define a precise verbose format, so the implementation should:

1. Show everything in summary mode PLUS
2. For each agent, print a section header and the full `rawContent` (the raw JSON string the LLM returned)
3. Optionally: pretty-print the full parsed `output` JSON per agent

Practical verbose additions after each agent's summary entry:
```
--- Dependency Mapper (raw reasoning) ---
[full rawContent text here]
```

Or, more useful: since `rawContent` IS the JSON (agents return JSON), verbose mode could show the full parsed output with all fields (not just top-N). This would let users see the complete agent results rather than the truncated `topN` summary.

---

## 9. Key Implementation Decisions for Planning

### Plan 06-01: formatter.ts

Must implement:
1. **ANSI color constants** — thin named wrapper around escape codes (`\x1b[Nm`)
2. **`formatHeader(title, filesCount, languages, durationMs)`** — generates the full double-box-drawing header
3. **`formatSectionHeader(label)`** — emoji label + `─` divider line
4. **`formatScore(score, max)`** — formats `9.2/10` with color (green/yellow/red based on threshold)
5. **`formatRiskLabel(score)`** — converts numeric score to `HIGH`/`MEDIUM`/`LOW` string
6. **`formatScoreBar(score, max, width)`** — optional visual bar (spec shows numeric score, not bar, but bars add polish)
7. **`getTerminalWidth()`** — `process.stdout.columns ?? 80`
8. **`padRight(str, width)`** — pads string to width, handles ANSI escape codes (invisible) using `string-width` transitive dep if needed

### Plan 06-02: renderer.ts

Must implement:
1. **`renderResults(allResults, files, resolved)`** — main entry point
2. **Summary mode** — extract top-N from each category, format and print
3. **Verbose mode** — summary mode + raw agent content per agent
4. **JSON mode** — serialize to the spec's JSON schema and `console.log(JSON.stringify(...))`
5. **Agent result extraction helpers:**
   - `findResult(allResults, agentName)` — find by name
   - `getHighImpactSections(impactResult, topN)` — from `rankedSections`
   - `getTeachableSections(teachabilityResult, topN)` — from `sections`
   - `getDataStructureDecisions(structureResult, topN)` — from `decisions`

### Plan 06-03: cache.ts

Must implement:
1. **`computeFileHash(filePath)`** — SHA256 of file content using `crypto.createHash`
2. **`computeCommitHash(projectPath)`** — `git rev-parse HEAD` via `execSync`, empty string on failure
3. **`computeAgentVersion(agentPath)`** — SHA256 of agent .md file content
4. **`computeCacheKey(commitHash, contentHash, agentVersion)`** — SHA256 of concatenated inputs
5. **`getCached(key, cacheDir)`** — read `.code-teacher-cache/<key>.json`, parse JSON, return or null
6. **`setCached(key, value, cacheDir)`** — mkdir -p `.code-teacher-cache/`, write JSON
7. **`getProjectCacheDir(projectPath)`** — returns `path.join(projectPath, '.code-teacher-cache')`

Cache integration in `analyze.ts`: wrap the `runAgent` calls with cache check/set logic, passing the cache key derived from the project's commit hash + all file content hashes + agent version.

---

## 10. Gotchas and Non-Obvious Facts

1. **No chalk/picocolors installed.** Must use raw ANSI escape codes or install a dependency. The spec says "chalk OR picocolors" — raw ANSI is the simplest zero-dep approach. Adding chalk would require `npm install chalk` and updating `package.json`.

2. **`string-width` IS a transitive dependency** (via prettier or eslint). Can be imported for measuring visible string width when aligning content with ANSI escapes. However, transitive deps are unreliable — the formatter should work without it by treating ANSI sequences as zero-width using a simple regex strip for width calculation.

3. **`process.stdout.columns` is `undefined` in non-TTY** (e.g., when output is piped). Must default to 80. The terminal width detection in `formatHeader` must guard: `const width = process.stdout.columns ?? 80`.

4. **The spec box header is 64 chars wide** (counting `╔`+62×`═`+`╗`). The implementation should use `getTerminalWidth()` and cap at terminal width, with a minimum of 60.

5. **Impact Ranker `summary` field maps to the quoted description** in the spec output, not the `narrative` field. The `narrative` field could be printed once at the end of the HIGH-IMPACT section.

6. **Fan-in in the spec output** (`Fan-in: 34`) comes from the Dependency Mapper output (`nodes[i].fanIn`), not from the Impact Ranker. The renderer needs to cross-reference the impact-ranker's ranked sections with the dependency-mapper's nodes by file path to get the raw fan-in number.

7. **Cache directory is already in `.gitignore`** (`/.code-teacher-cache/` is listed). No need to add it.

8. **Git is available** (`git version 2.50.1`). The project IS a git repo (has `HEAD` commit). The cache key `git rev-parse HEAD` will work for the analyzed project, but must be called on `projectPath` (the target project), not on the code-teacher installation directory.

9. **`allResults` array order is guaranteed** in `analyze.ts` as `[...stage1Results, stage2Result]` where `stage1Results` is `[dependency-mapper, teachability-scorer, structure-analyzer]` and `stage2Result` is `impact-ranker`. However, renderer should match by `agentName` for robustness.

10. **JSON mode should suppress all other output** — when `resolved.json === true`, only the JSON object should be printed, nothing else (no provider detection line, no progress messages). The spec shows JSON mode as clean pipeable output. This means Phase 6 must also change the startup `console.log` calls in `analyze.ts` to be conditional on `!resolved.json`.

11. **The spec's "score bars"** are mentioned in Phase 6 Plan 06-01 description but not shown in the spec's output examples. The actual spec terminal output uses `Score: 9.2/10` numeric format. Score bars are an optional enhancement — implement numeric first, add bars as enhancement.

12. **`cli/output/` directory already exists** and contains `formatter.ts` and `renderer.ts` stubs. No directory creation needed.

---

## Summary: What Phase 6 Must Build

| Artifact | Location | Status | What it does |
|----------|----------|--------|-------------|
| `formatter.ts` | `cli/output/formatter.ts` | Stub exists | ANSI colors, box-drawing, score formatting, terminal width |
| `renderer.ts` | `cli/output/renderer.ts` | Stub exists | Summary/verbose/JSON output from `allResults` |
| `cache.ts` | `core/cache.ts` | Stub exists | Content-hash keys, read/write `.code-teacher-cache/`, partial re-analysis |
| `analyze.ts` integration | `cli/commands/analyze.ts` | Done (Phase 5) | Wire `renderResults()` call, suppress non-JSON output in JSON mode |

**No new packages need to be installed** if raw ANSI codes are used. If chalk is desired for cleaner code, `npm install chalk` adds it (chalk v5+ is pure ESM, compatible with this project's `"type": "module"`).
