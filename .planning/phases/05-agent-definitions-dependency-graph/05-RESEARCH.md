---
phase: 05-agent-definitions-dependency-graph
type: research
status: complete
date: "2026-02-25"
requirements: [REQ-06, REQ-07, REQ-08, REQ-09, REQ-10, REQ-16]
---

# Phase 5 Research: Agent Definitions & Dependency Graph

## Research Questions Answered

---

## 1. What do the current stub agent .md files look like? What needs to be replaced?

All four stub files (`agents/definitions/*.md`) exist and have the correct section headers, but the System Prompt, Scoring Rubric, and Output Schema sections are thin placeholders — they describe intent in 1-2 sentences and contain a minimal JSON schema example. They are functionally inert because `buildSystemPrompt()` concatenates these sections verbatim and sends them to the LLM; a thin stub yields vague, inconsistent agent output.

### Stubs as-found

**dependency-mapper.md**
- System Prompt: 2 sentences ("You are a code analysis agent... Produce a dependency graph as a JSON adjacency list...")
- Output Schema: Only a `dependencies` adjacency list (file → [file]) + `summary` string. No fan-in, fan-out, coupling depth, centrality scores, or edge typing.
- Missing: the spec's richer output with per-node scores (fanIn, fanOut, couplingDepth, centrality) and typed edges.

**teachability-scorer.md**
- System Prompt: 2 sentences — names the 5 criteria but gives no guidance on what each means or how to apply them.
- Output Schema: Has the right shape (sections array, criteria object) — the schema is already close to spec.
- Missing: detailed criterion definitions, how to handle files with no teachable patterns, prerequisite inference instructions.

**structure-analyzer.md**
- System Prompt: 2 sentences — names the 3 criteria but gives no concrete examples of what to look for.
- Output Schema: Has the right shape (decisions array).
- Missing: detailed guidance on inferring alternatives even when not documented, handling schema/ORM decisions, concurrency patterns.

**impact-ranker.md**
- System Prompt: 2 sentences — names the 4 criteria, mentions Stage 1 inputs in general terms.
- Output Schema: Has the right shape (rankedSections array, narrative string).
- Missing: explicit instructions on how to consume the Stage 1 JSON inputs (dependency map key names, teachability `sections` array, structure `decisions` array), how to cross-reference sections, how to assign blastRadius from fan-in data.

### What replacement means

Each file needs the System Prompt section expanded from ~2 sentences to a multi-paragraph instruction that:
1. States the agent's role precisely.
2. Lists exactly what patterns to look for (with language-agnostic examples).
3. Defines each scoring criterion with worked examples of low/medium/high scores.
4. Instructs the LLM on output completeness (e.g., "return at least 5 sections," "if no decisions found, return empty array").
5. For impact-ranker: includes explicit instructions for parsing the Stage 1 JSON structures.

The Output Schema sections should be kept close to their current JSON example shapes but may need to add missing fields (e.g., `fanIn`, `fanOut`, `couplingDepth`, `centrality` per node in dependency-mapper).

---

## 2. What's the exact interface of runAgent and how does it pass context to agents?

```typescript
// agents/runner.ts

export interface AgentRunOptions {
  agentPath: string;          // Absolute path to .md agent definition
  files: FileInfo[];          // All discovered files
  chunks: Map<string, Chunk[]>; // filePath → chunks
  projectPath: string;        // Project root
  provider: LLMProvider;      // Already instantiated provider
  model: string;              // For token limit lookup in buildContext
  importMap?: Record<string, string[]>; // Optional: dependency map from a prior agent
}

export interface AgentResult {
  agentName: string;
  output: Record<string, unknown>; // Parsed JSON from LLM
  rawContent: string;              // Raw LLM text (for --verbose)
  tokenUsage: { inputTokens: number; outputTokens: number };
}
```

**Flow inside `runAgent()`:**
1. Reads and parses the `.md` file via `parseAgentMarkdown()`.
2. Calls `buildSystemPrompt(agent)` — concatenates `systemPrompt + scoringRubric + outputSchema`.
3. Estimates system prompt token cost (`Math.ceil(systemPrompt.length / 4)`) and passes it to `buildContext()`.
4. `buildContext()` assembles: PROJECT STRUCTURE tree + optional DEPENDENCY MAP + file contents (priority-truncated).
5. User prompt = `${contextString}\n\n---\n\nTASK:\n${firstSentenceOfInputSection}`.
6. First LLM call at `temperature: 0.2`, `responseFormat: 'json'`.
7. On parse failure: retries once with `systemPrompt + STRICT_JSON_SUFFIX` at `temperature: 0.1`.
8. On second failure: returns `output: {}` with `console.warn`.

**How Stage 1 → Stage 2 context flows:**
The `importMap` field on `AgentRunOptions` is the mechanism. When set, `buildContext()` serializes it as JSON and inserts it between the project tree and file contents under a `DEPENDENCY MAP:` header. For Stage 2 (impact ranker), this field will be repurposed to carry all Stage 1 outputs — but since `importMap` is typed as `Record<string, string[]>` (too narrow for arbitrary agent output), Phase 5 will need to decide: either extend `AgentRunOptions` with a `stage1Outputs` field typed as `AgentResult[]`, or serialize Stage 1 results into the user prompt before calling `runAgent`. The latter avoids changing the interface.

**Task instruction extraction:**
`buildTaskInstruction(agent)` takes the first sentence of `agent.input` (splits on `.!?`, takes index 0). This means the first sentence of each agent's `## Input` section is the imperative task instruction injected at the end of the user prompt.

---

## 3. How does analyze.ts currently orchestrate Stage 1? What needs to change for Stage 2?

### Current state

```typescript
// Stage 1: first 3 agent paths run in parallel
const stage1Paths = allAgentPaths.slice(0, 3); // [dependency-mapper, teachability-scorer, structure-analyzer]
const stage1Results = await Promise.all(
  stage1Paths.map((agentPath) =>
    runAgent({ agentPath, files, chunks, projectPath, provider, model })
  )
);
// Stage 2 comment: "handled in Phase 5 when agent definitions are complete"
```

`getBuiltInAgentPaths()` returns paths in this fixed order:
1. `agents/definitions/dependency-mapper.md`
2. `agents/definitions/teachability-scorer.md`
3. `agents/definitions/structure-analyzer.md`
4. `agents/definitions/impact-ranker.md`

The `slice(0, 3)` hardcodes Stage 1 as the first three paths. Impact ranker is index 3.

### What needs to change for Stage 2

1. **Separate Stage 1 and Stage 2 paths explicitly** (not via slice) — use named constants or split `getBuiltInAgentPaths()` returns into named groups.
2. **Pass Stage 1 outputs into Stage 2 call.** The impact ranker needs the outputs of the three Stage 1 agents. Two design options:

   **Option A — `stage1Outputs` field on AgentRunOptions:**
   Add `stage1Outputs?: AgentResult[]` to `AgentRunOptions`. In `runAgent`, when `stage1Outputs` is present, serialize them into a `STAGE 1 AGENT OUTPUTS:` block in the user prompt (before the TASK instruction). This is the cleanest approach and keeps the runner self-contained.

   **Option B — serialize into userPrompt in analyze.ts:**
   Build the Stage 1 summary JSON string in `analyze.ts` and pass it to the impact ranker's call directly. This avoids modifying `AgentRunOptions` but couples analyze.ts to the ranker's input format.

   **Recommendation:** Option A — add `stage1Outputs?: AgentResult[]` to `AgentRunOptions`. The runner builds the Stage 1 block in the user prompt, keeping analyze.ts clean and the mechanism reusable for future agents.

3. **Sequential execution of Stage 2:**
   ```typescript
   const stage2Result = await runAgent({
     agentPath: allAgentPaths[3], // impact-ranker.md
     files, chunks, projectPath, provider, model,
     stage1Outputs: stage1Results,
   });
   ```

4. **Result collection:** `analyzeCommand` currently prints raw results. Phase 5 extends this to collect all 4 results for Phase 6 rendering. The final `AgentResult[]` array order should be `[dependencyMapper, teachabilityScorer, structureAnalyzer, impactRanker]`.

---

## 4. What graph algorithms are needed for dependency-graph.ts?

The stub file at `core/dependency-graph.ts` has the correct interface (DependencyGraph, GraphNode, Edge) and the five function signatures — all returning stub values. These need real implementations.

### getEntryPoints(graph)

Entry points = nodes with zero in-degree (no incoming edges). Algorithm:
```
1. Build in-degree map: for each edge, increment in-degree[edge.target]
2. Return all node IDs where in-degree[id] == 0
```
Complexity: O(E). Pure iteration, no library needed.

### getImpactScore(graph, nodeId)

"How many nodes are reachable downstream from this node." Algorithm:
```
1. Build adjacency list from edges (source → [targets])
2. BFS/DFS from nodeId following directed edges
3. Return count of visited nodes (excluding nodeId itself)
4. Normalize to 0-10 scale: score = (reachableCount / (totalNodes - 1)) * 10
```
Complexity: O(V + E). Simple BFS with visited set.

### getCentrality(graph, nodeId)

The spec says "betweenness centrality approximation." True betweenness centrality is O(V*E) (Brandes: O(VE)). For a CLI tool, an approximation is acceptable:

**Approximation strategy: in-degree + out-degree weighted score.**
```
centrality(node) = (fanIn * w_in + fanOut * w_out) / (maxFanIn * w_in + maxFanOut * w_out) * 10
```
Where `w_in = 0.6` (being depended on is more central) and `w_out = 0.4`.

Alternatively: **simplified betweenness** — for a random sample of (source, target) pairs, count how many shortest paths pass through nodeId. This is more accurate but adds implementation complexity.

**Recommendation:** Use weighted in-degree + out-degree approximation. It is fast, deterministic, and accurate enough for the tool's use case (ranking, not formal graph theory). The spec says "approximation" explicitly, which permits this approach.

### getCluster(graph, nodeId)

"Returns the tightly-coupled cluster this node belongs to." Algorithm:
```
1. Build undirected adjacency (ignore edge direction)
2. BFS/DFS from nodeId in undirected graph
3. Return all reachable node IDs (connected component)
```
For a tighter definition: use strongly-connected components (Tarjan's or Kosaraju's SCC). Nodes in the same SCC are in each other's reachable set and form the tightest cluster.

**Recommendation:** Start with undirected connected components (simpler). If the spec's "tightly-coupled" language implies SCC, add Tarjan's algorithm. Tarjan's is O(V+E) and has a clean recursive implementation in TypeScript.

**Tarjan's SCC outline (if used):**
```
- Maintain: index counter, stack, index[], lowLink[], onStack[]
- DFS: when lowLink[v] == index[v], pop the stack to form an SCC
- Return the SCC containing nodeId
```

### getBottlenecks(graph)

"Nodes where removing them disconnects significant subgraphs." This is the definition of **articulation points** (cut vertices) in graph theory. Algorithm:

**Tarjan's articulation point algorithm (undirected graph, O(V+E)):**
```
- DFS from root
- Track discovery time and lowest reachable time (low[])
- A node u is an articulation point if:
  - u is root AND has 2+ children in DFS tree, OR
  - u is not root AND has a child v where low[v] >= disc[u]
```

Since the dependency graph is directed, convert to undirected for bottleneck detection (treat each directed edge as undirected). A node that is an articulation point in the undirected graph is a bottleneck.

**Alternative simpler approach:** Nodes with both high in-degree AND high out-degree (fan-in > threshold AND fan-out > threshold). Less precise but trivially implementable.

**Recommendation:** Implement articulation point detection properly — it is the correct algorithm for "removing them disconnects significant subgraphs." The O(V+E) DFS is straightforward and pure TypeScript with no dependencies.

### Building the graph from agent output

`createGraph()` currently returns an empty graph. Phase 5 needs a `buildGraph(mapperOutput)` function that:
1. Parses the dependency mapper's JSON output.
2. Creates GraphNode entries from file paths.
3. Creates Edge entries from the adjacency list.
4. Infers node metadata where possible (language from extension, lineCount from FileInfo, exportedSymbols from mapper output).

The mapper output format (after Phase 5 prompt work) should include enough data for this conversion.

---

## 5. How should the dependency mapper's output map to the DependencyGraph interface?

### Current stub output schema

```json
{
  "dependencies": {
    "src/index.ts": ["src/core/engine.ts", "src/utils/helpers.ts"]
  },
  "summary": "..."
}
```

### What the DependencyGraph interface needs

```typescript
interface GraphNode {
  id: string;                     // file path (relative) or "file:function"
  type: "file" | "function" | "class" | "module";
  metadata: {
    language: string;
    lineCount: number;
    exportedSymbols: string[];
  };
}

interface Edge {
  source: string;
  target: string;
  type: "imports" | "calls" | "extends" | "implements" | "uses";
  weight: number; // 1-10 coupling strength
}
```

### The mapping gap

The stub mapper output only provides a flat file→files adjacency list. The DependencyGraph interface requires typed edges and node metadata. Two approaches to bridge this:

**Approach A — Enrich the mapper output schema** (preferred):
Expand the mapper's Output Schema to produce nodes and edges directly:
```json
{
  "nodes": [
    {
      "id": "src/core/engine.ts",
      "type": "file",
      "exportedSymbols": ["Engine", "run", "stop"],
      "fanIn": 8,
      "fanOut": 3,
      "couplingDepth": 2,
      "centrality": 9
    }
  ],
  "edges": [
    {
      "source": "src/index.ts",
      "target": "src/core/engine.ts",
      "type": "imports",
      "weight": 8
    }
  ],
  "summary": "..."
}
```
Then `buildGraph(mapperOutput)` directly constructs GraphNode and Edge objects from the mapper's already-structured output. The `language` and `lineCount` fields can be filled in `buildGraph` from `FileInfo` data rather than asking the LLM to produce them.

**Approach B — Keep simple mapper output, compute in buildGraph**:
Keep the mapper returning the simple adjacency list, and have `buildGraph` infer edge types (default to "imports"), node types (default to "file"), and compute metadata from the FileInfo list. This puts less burden on the LLM prompt but loses edge type richness.

**Recommendation:** Approach A — richer mapper output. The mapper's LLM prompt can be instructed to identify edge types (imports vs. calls vs. extends) and assign coupling weights. This is the most useful output for the subsequent algorithms and for Phase 6 rendering. The `language` and `lineCount` fields in GraphNode metadata should be populated in `buildGraph()` from the FileInfo list (not asked of the LLM — it cannot know lineCount reliably).

**`buildGraph()` signature to add:**
```typescript
export function buildGraph(
  mapperOutput: Record<string, unknown>,
  files: FileInfo[]
): DependencyGraph
```

This function will be called in `analyze.ts` after Stage 1 completes, and the resulting graph will be passed to Stage 2 (impact ranker) as part of its context, and stored for Phase 6 rendering and Phase 7 caching.

---

## 6. How does the context builder work — what context window do agents receive?

### Token budget

```
contextLimit = MODEL_CONTEXT_LIMITS[model] ?? 128_000
contentBudget = floor(contextLimit * 0.8)   // 80% cap
remainingBudget = contentBudget - systemPromptTokens
```

Model limits in `context.ts`:
- `claude-sonnet-4-6`: 200,000 tokens → content budget ~160,000
- `gpt-4o`: 128,000 tokens → content budget ~102,400
- `gemini-2.0-flash`: 1,048,576 tokens → content budget ~838,860

### Context assembly order

1. **PROJECT STRUCTURE tree** — always first. ASCII tree of all discovered files. Always fits.
2. **DEPENDENCY MAP** (optional) — inserted if `importMap` is passed to `buildContext()`. Currently used to pass `Record<string, string[]>`, but Phase 5 can extend this to pass richer Stage 1 outputs.
3. **File contents** — greedy, priority-truncated per file:
   - Level 1: Full content (all chunks joined)
   - Level 2: First 20 lines + "... (N lines omitted)"
   - Level 3: Header only with "(content omitted — token budget exhausted)"
   - Level 4: File skipped entirely

### Implications for agent prompt design

- **Dependency Mapper:** Receives full file contents. Its prompt should instruct it to trace imports/exports from the code, not ask it to hallucinate relationships. Since it runs in Stage 1 without any import map pre-loaded, it has no prior context.
- **Teachability Scorer:** Also receives full file contents. Prompt should anchor scores to specific line ranges visible in the content.
- **Structure Analyzer:** Same as above.
- **Impact Ranker (Stage 2):** Receives full file contents PLUS the Stage 1 outputs (via extended AgentRunOptions). The Stage 1 JSON payloads can be large — for a large project, the combined Stage 1 outputs may consume a significant fraction of the context budget. The impact ranker's prompt should work primarily from the Stage 1 JSON rather than re-reading all file content.

### Phase 5 concern: Stage 2 context size

For a medium-sized project (50 files), the combined Stage 1 JSON outputs could be 10,000-30,000 tokens. The impact ranker also receives file contents (potentially unused if it works from Stage 1 data). Consider: in the impact ranker's `runAgent` call, file contents could be omitted entirely and the `stage1Outputs` block substituted. This requires either a flag on `buildContext()` or building the user prompt directly in `runAgent` for Stage 2. The simplest approach is: pass `stage1Outputs` as the `importMap`-equivalent content, and design the impact ranker's prompt to work from that data rather than from raw file content.

---

## 7. What's the current project structure (all src files)?

```
code-teacher/
├── agents/
│   ├── context.ts              (complete — buildContext, buildProjectTree, estimateTokens, getContextLimit)
│   ├── runner.ts               (complete — parseAgentMarkdown, buildSystemPrompt, runAgent, getBuiltInAgentPaths)
│   └── definitions/
│       ├── dependency-mapper.md    (stub — needs real prompts)
│       ├── teachability-scorer.md  (stub — needs real prompts)
│       ├── structure-analyzer.md   (stub — needs real prompts)
│       └── impact-ranker.md        (stub — needs real prompts + Stage 1 input instructions)
├── cli/
│   ├── index.ts                (complete — commander setup, all flags)
│   └── commands/
│       └── analyze.ts          (complete Stage 1; Stage 2 deferred — needs Phase 5 wiring)
├── config/
│   ├── defaults.ts             (complete)
│   └── schema.ts               (complete — loadConfig, zod-like validation)
├── core/
│   ├── file-discovery.ts       (complete — discoverFiles, isBinary, .gitignore)
│   ├── chunker.ts              (complete — chunkFile, Chunk, boundary detection)
│   ├── dependency-graph.ts     (STUB — interfaces defined, all 5 functions return stubs)
│   └── cache.ts                (stub — Phase 6)
├── providers/
│   ├── index.ts                (complete — LLMProvider, detectProvider, createProvider)
│   ├── anthropic.ts            (complete)
│   ├── openai.ts               (complete)
│   └── google.ts               (complete)
├── dist/                       (compiled output — not source)
├── package.json
└── tsconfig.json
```

**Files that Phase 5 must create or replace:**
- `agents/definitions/dependency-mapper.md` — replace stub with full prompts
- `agents/definitions/teachability-scorer.md` — replace stub with full prompts
- `agents/definitions/structure-analyzer.md` — replace stub with full prompts
- `agents/definitions/impact-ranker.md` — replace stub with full prompts + Stage 1 input instructions
- `core/dependency-graph.ts` — replace all 5 stub functions; add `buildGraph()` function
- `cli/commands/analyze.ts` — wire Stage 2 sequential call; collect `stage1Outputs`
- `agents/runner.ts` — add `stage1Outputs?: AgentResult[]` to `AgentRunOptions`; serialize into user prompt when present

---

## Key Planning Insights for Phase 5

### Prompt quality is the primary risk

The stubs are structurally correct (right sections, right JSON schema shape). The gap is entirely in prompt depth. Agent prompts need to be specific enough that a general-purpose LLM (Claude/GPT-4o/Gemini) reliably produces:
1. Consistent line number ranges tied to actual code in the provided context.
2. Scores calibrated to the rubric (e.g., "9 means exemplary, 5 means average, 1 means barely present").
3. A minimum number of results even for small/simple files ("return at least 3 sections; if fewer exist, score them anyway").

### Output schema precision

The mapper's output schema needs the richer node format (with fanIn, fanOut, couplingDepth, centrality scores) rather than just the adjacency list. The `buildGraph()` function consumes the mapper output directly — its shape determines implementation complexity.

### Stage 2 input design

The impact ranker prompt needs explicit JSON path instructions like: "The `dependencyMapper.output.nodes` array contains per-file fan-in and fan-out scores. The `teachabilityScorer.output.sections` array contains per-section teachability scores. Cross-reference by file path to compute combined scores." Without this guidance, the LLM may hallucinate data or ignore the structured inputs.

### dependency-graph.ts algorithms — no external libraries needed

All five graph algorithms (entry points, BFS impact score, centrality approximation, SCC/connected-component clustering, articulation point bottlenecks) are implementable in pure TypeScript. No graph library dependency. The algorithms are well-known, O(V+E), and straightforward to write against the existing DependencyGraph interface.

### Plan breakdown (3 plans as spec'd)

- **05-01:** `dependency-mapper.md` and `teachability-scorer.md` — two Stage 1 agents with full, production-quality prompts
- **05-02:** `structure-analyzer.md` and `impact-ranker.md` agent definitions + two-stage pipeline wiring in `analyze.ts` + `stage1Outputs` extension to `AgentRunOptions`
- **05-03:** `dependency-graph.ts` — `buildGraph()` + all 5 query functions (getImpactScore, getCentrality, getBottlenecks, getCluster, getEntryPoints) with real graph algorithms
