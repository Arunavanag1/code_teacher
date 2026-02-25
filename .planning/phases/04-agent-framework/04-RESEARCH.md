---
phase: 04-agent-framework
type: research
date: 2026-02-25
---

# Phase 4 Research: Agent Framework

## What Phase 4 Must Deliver

Phase 4 implements the agent runner and context builder — the core analytical machinery that loads markdown agent definitions, assembles context windows from file chunks, calls the LLM, and parses structured JSON responses.

Success criteria:
1. `agents/runner.ts` loads `.md` files and correctly parses Role, System Prompt, Input, Scoring Rubric, Output Schema sections
2. LLM calls are constructed with file content as context and JSON responses are parsed
3. Malformed JSON responses trigger retries with stricter prompts
4. `agents/context.ts` assembles file content + project structure tree + import maps
5. Token counting stays within model context limits with priority-based context (full → summarized → names only)

Dependencies already implemented:
- **Phase 2**: `FileInfo` interface from `core/file-discovery.ts`, `Chunk` interface from `core/chunker.ts`
- **Phase 3**: `LLMProvider` interface + `createProvider()` factory from `providers/index.ts`

---

## 1. Markdown Agent Parsing

### The Format to Parse

Each agent `.md` file follows this exact structure (from spec):

```markdown
# Agent Name

## Role
One-line description.

## System Prompt
Full system prompt text...

## Input
Description of what context this agent receives...

## Scoring Rubric
Scoring criteria and weights...

## Output Schema
Expected JSON output format:
\`\`\`json
{ ... }
\`\`\`
```

### Recommendation: Simple String Splitting (No Library)

The constraint is explicitly stated: "No external markdown parsing libraries unless truly needed (prefer simple string splitting)." The format is consistent and machine-generated — it does not need a full markdown AST.

**Approach**: Split on `## ` headings using a regex that captures heading names and their body text.

```typescript
function parseAgentMarkdown(content: string): AgentDefinition {
  // Extract the top-level title (# Agent Name)
  const titleMatch = /^#\s+(.+)$/m.exec(content);
  const name = titleMatch?.[1]?.trim() ?? 'Unknown Agent';

  // Split into sections by "## Heading" markers
  // Each section starts at "## " and runs until the next "## " or end of string
  const sectionRegex = /^##\s+(.+)$/gm;
  const sections: Record<string, string> = {};

  let lastHeading: string | null = null;
  let lastIndex = 0;

  // Walk all ## matches
  let match: RegExpExecArray | null;
  while ((match = sectionRegex.exec(content)) !== null) {
    if (lastHeading !== null) {
      // Extract body text between previous heading and this one
      const body = content.slice(lastIndex, match.index).trim();
      sections[lastHeading] = body;
    }
    lastHeading = match[1].trim();
    lastIndex = match.index + match[0].length;
  }

  // Capture last section
  if (lastHeading !== null) {
    sections[lastHeading] = content.slice(lastIndex).trim();
  }

  return {
    name,
    role: sections['Role'] ?? '',
    systemPrompt: sections['System Prompt'] ?? '',
    input: sections['Input'] ?? '',
    scoringRubric: sections['Scoring Rubric'] ?? '',
    outputSchema: sections['Output Schema'] ?? '',
  };
}
```

**Why this works reliably:**
- Agent `.md` files are authored by the tool itself (checked into the repo) — format is consistent
- No edge cases like nested headings, HTML in markdown, or YAML front matter to worry about
- The approach handles any number of `##` sections in any order
- Zero dependencies

### Parsed Type Definition

```typescript
export interface AgentDefinition {
  name: string;           // From "# Agent Name" heading
  role: string;           // Body under "## Role"
  systemPrompt: string;   // Body under "## System Prompt"
  input: string;          // Body under "## Input"
  scoringRubric: string;  // Body under "## Scoring Rubric"
  outputSchema: string;   // Body under "## Output Schema" (includes ```json block)
}
```

### Extracting the JSON Schema from Output Schema Section

The `Output Schema` section contains prose text followed by a fenced `\`\`\`json` block. The runner needs to extract the schema to include in the system prompt but does not need to parse or validate it — it is provided verbatim to the LLM as an example.

```typescript
function extractJsonBlock(text: string): string {
  const match = /```json\n([\s\S]*?)```/.exec(text);
  return match?.[1]?.trim() ?? text;
}
```

### File Loading

Agent definition files live at `agents/definitions/*.md`. The runner must:
1. Resolve the path to an absolute path using `resolve()` from `node:path`
2. Read with `readFile(path, 'utf-8')` from `fs/promises`
3. Parse with `parseAgentMarkdown(content)`

Custom agents from config (`config.customAgents`) may have relative or absolute paths — normalize them by resolving relative paths against `process.cwd()`.

---

## 2. Token Counting

### Recommendation: Character-Based Heuristic (No Library)

**Decision: Use `Math.ceil(text.length / 4)` as the token estimate.**

Rationale:
- The 4 chars ≈ 1 token heuristic is widely cited and accurate enough for context window management (±10-15% error)
- All three provider models (Claude, GPT-4o, Gemini) use similar BPE tokenizers with roughly similar token/character ratios for code
- Libraries like `js-tiktoken` (the accurate OpenAI tokenizer) are ~1.5MB WASM bundles and add significant install weight — unacceptable for a CLI tool distributed via npm/GitHub
- `gpt-tokenizer` is a pure JS alternative but still adds a dependency; accuracy gain over the heuristic does not justify the cost
- Context window management here is advisory (decide whether to include full content, summarized, or name-only) — a 10% token count error has no correctness impact, only efficiency

```typescript
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
```

### Context Window Sizes for Default Models

Based on provider defaults in `providers/index.ts` (`claude-sonnet-4-6`, `gpt-4o`, `gemini-2.0-flash`):

| Provider | Default Model | Context Window | Output Limit | Notes |
|----------|---------------|----------------|--------------|-------|
| Anthropic | `claude-sonnet-4-6` | 200,000 tokens | 8,096 tokens | Very large context — rarely an issue |
| OpenAI | `gpt-4o` | 128,000 tokens | 16,384 tokens | Large context |
| Google | `gemini-2.0-flash` | 1,048,576 tokens | 8,192 tokens | Enormous context |

**Practical implication**: With these context sizes, the priority-based truncation logic (full → summarized → names only) will rarely activate for typical codebases. However, it MUST be implemented because:
1. Users may use smaller models via `--model` flag (e.g., `claude-haiku-4-5-20251001` at 200K but with tighter practical limits)
2. Very large codebases with hundreds of files can still overflow even these limits
3. The spec explicitly requires it as a success criterion

**Conservative budget for context.ts**: Use 80% of the model's context limit for file content (reserve 20% for system prompt + output). This prevents edge cases.

```typescript
export const MODEL_CONTEXT_LIMITS: Record<string, number> = {
  // Anthropic
  'claude-sonnet-4-6': 200_000,
  'claude-opus-4-6': 200_000,
  'claude-haiku-4-5-20251001': 200_000,
  // OpenAI
  'gpt-4o': 128_000,
  'gpt-4o-mini': 128_000,
  // Google
  'gemini-2.0-flash': 1_048_576,
  'gemini-2.5-flash': 1_048_576,
};

const DEFAULT_CONTEXT_LIMIT = 128_000; // Conservative fallback for unknown models

export function getContextLimit(model: string): number {
  return MODEL_CONTEXT_LIMITS[model] ?? DEFAULT_CONTEXT_LIMIT;
}
```

### Provider-Specific Token Counting Note

Anthropic's API returns `usage.input_tokens` in the response (already mapped to `inputTokens` in `LLMResponse`). The runner can use actual token counts from prior calls for better calibration in subsequent calls, but this is an optimization. For Phase 4, the character heuristic is sufficient.

---

## 3. Context Window Building

### What Goes Into a Context Window

From the spec's `## Input` sections across agent definitions:

1. **File contents** — the primary payload, either full content or chunks
2. **Project structure tree** — a directory tree string showing the project layout
3. **Import/export maps** — output from the Dependency Mapper agent (only available for agents running after Stage 1)

Phase 4 implements the context builder for all agents; the import map is an optional addition that becomes populated after the Dependency Mapper runs.

### Context Assembly Format

The user prompt fed to the LLM should be structured as clearly labeled sections:

```
PROJECT STRUCTURE:
<tree string>

FILE: src/utils/parser.ts (lines 1-200)
<file content>

FILE: src/core/engine.ts (lines 1-150)
<file content>

DEPENDENCY MAP (if available):
<json adjacency list>
```

This structured format helps the LLM understand what it's looking at without ambiguity.

### Generating the Project Structure Tree

A tree string is a depth-first directory listing formatted like the `tree` command output:

```
my-project/
├── src/
│   ├── core/
│   │   ├── engine.ts
│   │   └── parser.ts
│   └── utils/
│       └── helpers.ts
├── tests/
│   └── engine.test.ts
└── package.json
```

**Implementation approach**: Build this from the `FileInfo[]` array returned by `discoverFiles()`. Group paths by directory prefix, then render with box-drawing characters.

```typescript
export function buildProjectTree(files: FileInfo[], projectPath: string): string {
  // Derive relative paths from absolute paths
  const relativePaths = files.map(f =>
    f.path.replace(projectPath + '/', '')
  );

  // Build a nested structure from path segments
  const tree = buildTreeNode(relativePaths);

  // Render to string with box-drawing characters
  const projectName = projectPath.split('/').pop() ?? 'project';
  return projectName + '/\n' + renderTree(tree, '');
}
```

**Full tree implementation** (helper functions):

```typescript
type TreeNode = Map<string, TreeNode | null>; // null = file, Map = directory

function buildTreeNode(paths: string[]): TreeNode {
  const root: TreeNode = new Map();
  for (const p of paths) {
    const parts = p.split('/');
    let current = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (i === parts.length - 1) {
        // File
        current.set(part, null);
      } else {
        // Directory
        if (!current.has(part)) {
          current.set(part, new Map());
        }
        current = current.get(part) as TreeNode;
      }
    }
  }
  return root;
}

function renderTree(node: TreeNode, prefix: string): string {
  const entries = [...node.entries()];
  const lines: string[] = [];
  for (let i = 0; i < entries.length; i++) {
    const [name, child] = entries[i];
    const isLast = i === entries.length - 1;
    const connector = isLast ? '└── ' : '├── ';
    const childPrefix = isLast ? '    ' : '│   ';

    if (child === null) {
      // File
      lines.push(prefix + connector + name);
    } else {
      // Directory
      lines.push(prefix + connector + name + '/');
      lines.push(renderTree(child, prefix + childPrefix));
    }
  }
  return lines.join('\n');
}
```

### Priority-Based Context Truncation

The spec requires three levels of content representation:

| Level | Description | Token Cost |
|-------|-------------|------------|
| **Full** | Complete file content or chunk content | High |
| **Summarized** | First 20 lines + "... (N lines omitted)" | Medium |
| **Names only** | Just the file path, no content | Minimal |

**Algorithm**:

```typescript
export interface ContextBuildOptions {
  files: FileInfo[];
  chunks: Map<string, Chunk[]>;        // filePath → chunks
  projectPath: string;
  importMap?: Record<string, string[]>; // filePath → imported paths
  model: string;
  systemPromptTokens?: number;         // estimated tokens used by system prompt
}

export function buildContext(options: ContextBuildOptions): string {
  const { files, chunks, projectPath, importMap, model } = options;

  const contextLimit = getContextLimit(model);
  // Reserve 20% for system prompt + output buffer
  const contentBudget = Math.floor(contextLimit * 0.8);
  const systemTokensUsed = options.systemPromptTokens ?? 0;
  let remainingBudget = contentBudget - systemTokensUsed;

  const parts: string[] = [];

  // 1. Always include project tree (small, always fits)
  const tree = buildProjectTree(files, projectPath);
  const treeTokens = estimateTokens(tree);
  if (treeTokens <= remainingBudget) {
    parts.push('PROJECT STRUCTURE:\n' + tree);
    remainingBudget -= treeTokens;
  }

  // 2. Include import map if available
  if (importMap) {
    const mapStr = JSON.stringify(importMap, null, 2);
    const mapTokens = estimateTokens(mapStr);
    if (mapTokens <= remainingBudget) {
      parts.push('DEPENDENCY MAP:\n' + mapStr);
      remainingBudget -= mapTokens;
    }
  }

  // 3. Add file content at the highest affordable level
  for (const file of files) {
    const fileChunks = chunks.get(file.path) ?? [];
    const fullContent = fileChunks.map(c => c.content).join('\n');
    const header = `FILE: ${file.path.replace(projectPath + '/', '')}`;

    const fullTokens = estimateTokens(header + '\n' + fullContent);
    if (fullTokens <= remainingBudget) {
      // Full content fits
      parts.push(header + '\n' + fullContent);
      remainingBudget -= fullTokens;
      continue;
    }

    // Try summarized (first 20 lines)
    const firstLines = fullContent.split('\n').slice(0, 20).join('\n');
    const totalLines = fullContent.split('\n').length;
    const summary = firstLines + (totalLines > 20
      ? `\n... (${totalLines - 20} lines omitted)`
      : '');
    const summaryTokens = estimateTokens(header + '\n' + summary);
    if (summaryTokens <= remainingBudget) {
      parts.push(header + '\n' + summary);
      remainingBudget -= summaryTokens;
      continue;
    }

    // Names only
    const nameTokens = estimateTokens(header);
    if (nameTokens <= remainingBudget) {
      parts.push(header + ' (content omitted — token budget exhausted)');
      remainingBudget -= nameTokens;
    }
    // If even the header doesn't fit, skip entirely
  }

  return parts.join('\n\n');
}
```

**Key design decisions**:
- Files are iterated in the order returned by `discoverFiles()` — importance ordering is NOT applied here (that's Phase 5's job). Phase 4 simply fills the budget greedily in file system order.
- The project tree is always included first (it's small and always fits)
- Each file degrades independently — some files might be full while others are name-only in the same context window

### Assembling Chunks

The context builder receives a `Map<string, Chunk[]>` (file path → chunks). The runner is responsible for reading files and calling `chunkFile()` to populate this map before calling `buildContext()`.

```typescript
// In runner.ts — before calling buildContext:
const chunks = new Map<string, Chunk[]>();
for (const file of files) {
  const content = await readFile(file.path, 'utf-8');
  chunks.set(file.path, chunkFile(content, file.path));
}
```

---

## 4. LLM Call Orchestration

### System Prompt Construction

The system prompt is built from three sections of the agent definition:
1. **System Prompt** section — the core instruction set
2. **Scoring Rubric** section — appended to the system prompt to guide scoring
3. **Output Schema** section — appended to instruct the exact JSON format

```typescript
function buildSystemPrompt(agent: AgentDefinition): string {
  const parts: string[] = [agent.systemPrompt];

  if (agent.scoringRubric.trim()) {
    parts.push('## Scoring Rubric\n' + agent.scoringRubric);
  }

  if (agent.outputSchema.trim()) {
    parts.push('## Output Format\n' +
      'Respond ONLY with valid JSON matching this exact schema:\n' +
      agent.outputSchema);
  }

  return parts.join('\n\n');
}
```

The `role` field is informational metadata — it describes what the agent does but is not sent to the LLM as part of the prompt (it would be redundant with the System Prompt section).

The `input` field describes what context the agent expects — it can be referenced by `context.ts` to know what to assemble, but is not directly included in the prompt either.

### User Prompt Construction

The user prompt combines the assembled context from `context.ts` with a brief task instruction:

```typescript
function buildUserPrompt(contextString: string, taskInstruction: string): string {
  return `${contextString}\n\n---\n\nTASK:\n${taskInstruction}`;
}
```

The `taskInstruction` is a brief prompt that varies per agent call — for example:
- Dependency Mapper: "Analyze the above code and produce the dependency map as JSON."
- Teachability Scorer: "Analyze the above code sections and score each for teachability."

This can be hardcoded per agent or inferred from the agent's `input` description.

### JSON Response Parsing

The LLM response content must be parsed as JSON. Three failure modes exist:
1. Clean JSON string
2. JSON wrapped in markdown fences (\`\`\`json...\`\`\`)
3. Malformed/truncated JSON (triggers retry)

```typescript
function parseJsonResponse(content: string): Record<string, unknown> | null {
  // Strip markdown fences if present
  const stripped = content
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  try {
    return JSON.parse(stripped) as Record<string, unknown>;
  } catch {
    return null;
  }
}
```

### Retry Strategy for Malformed JSON

From the spec: "Retry with stricter prompt ('respond ONLY with valid JSON'), fall back to partial results."

Phase 4 implements a simple 1-retry strategy (NOT exponential backoff — that's Phase 7):

```typescript
const MAX_JSON_RETRIES = 1;
const STRICT_JSON_SUFFIX =
  '\n\nYour previous response was not valid JSON. ' +
  'Respond ONLY with a single valid JSON object. ' +
  'No explanation, no markdown code fences, no text before or after the JSON.';

export async function runAgentWithRetry(
  agent: AgentDefinition,
  contextString: string,
  provider: LLMProvider,
): Promise<Record<string, unknown>> {
  const systemPrompt = buildSystemPrompt(agent);
  const userPrompt = buildUserPrompt(contextString, buildTaskInstruction(agent));

  // First attempt
  const response = await provider.call(systemPrompt, userPrompt, {
    responseFormat: 'json',
    temperature: 0.2,
  });

  const parsed = parseJsonResponse(response.content);
  if (parsed !== null) {
    return parsed;
  }

  // First attempt failed — retry with stricter prompt
  const retrySystemPrompt = systemPrompt + STRICT_JSON_SUFFIX;
  const retryResponse = await provider.call(retrySystemPrompt, userPrompt, {
    responseFormat: 'json',
    temperature: 0.1, // Lower temperature for more deterministic output
  });

  const retryParsed = parseJsonResponse(retryResponse.content);
  if (retryParsed !== null) {
    return retryParsed;
  }

  // Both attempts failed — return empty result (Phase 7 handles harder errors)
  console.warn(
    `Warning: Agent '${agent.name}' returned malformed JSON after ${MAX_JSON_RETRIES} retry. Returning empty result.`
  );
  return {};
}
```

**Design note**: The `responseFormat: 'json'` is passed to the provider, which already handles this per-provider:
- Anthropic: appends JSON instruction to system prompt
- OpenAI: sets `response_format: { type: 'json_object' }`
- Google: sets `config.responseMimeType = 'application/json'`

The retry adds an explicit stricter instruction in the system prompt on top of the provider's existing JSON enforcement.

---

## 5. Interface Design

### `agents/runner.ts` Public API

The current stub exports `runAgent(agentPath, context)` with opaque types. The full interface should be:

```typescript
import type { LLMProvider } from '../providers/index.js';
import type { FileInfo } from '../core/file-discovery.js';
import type { Chunk } from '../core/chunker.js';

export interface AgentDefinition {
  name: string;
  role: string;
  systemPrompt: string;
  input: string;
  scoringRubric: string;
  outputSchema: string;
}

export interface AgentRunOptions {
  agentPath: string;               // Absolute path to the .md agent definition file
  files: FileInfo[];               // Files to analyze
  chunks: Map<string, Chunk[]>;    // filePath → chunks (pre-computed by caller)
  projectPath: string;             // Absolute path to project root
  provider: LLMProvider;           // Instantiated provider (from createProvider())
  model: string;                   // Model name (for token limit lookup)
  importMap?: Record<string, string[]>; // Optional dependency map from prior agents
}

export interface AgentResult {
  agentName: string;
  output: Record<string, unknown>; // Parsed JSON from LLM
  rawContent: string;              // Raw LLM response (for --verbose mode)
  tokenUsage: { inputTokens: number; outputTokens: number };
}

// Main exported function
export async function runAgent(options: AgentRunOptions): Promise<AgentResult>;

// Exported for testing
export function parseAgentMarkdown(content: string): AgentDefinition;
export function buildSystemPrompt(agent: AgentDefinition): string;
```

**Note on the stub**: The current stub signature `runAgent(_agentPath, _context)` returns `Promise<Record<string, unknown>>`. This must be replaced entirely — the signature is not type-safe enough for Phase 4's needs. The plan must update the export to the richer `AgentRunOptions` interface.

### `agents/context.ts` Public API

The current stub exports `buildContext(_files, _projectPath)` returning opaque `Record<string, unknown>`. The full interface:

```typescript
import type { FileInfo } from '../core/file-discovery.js';
import type { Chunk } from '../core/chunker.js';

export interface ContextBuildOptions {
  files: FileInfo[];
  chunks: Map<string, Chunk[]>;
  projectPath: string;
  model: string;
  importMap?: Record<string, string[]>;
  systemPromptTokens?: number;  // Tokens used by system prompt (deducted from budget)
}

// Returns a formatted string ready for use as the user prompt's context section
export function buildContext(options: ContextBuildOptions): string;

// Exported for testing
export function buildProjectTree(files: FileInfo[], projectPath: string): string;
export function estimateTokens(text: string): number;
export function getContextLimit(model: string): number;
```

**Note on the stub**: The current stub `buildContext(_files, _projectPath)` returns `Record<string, unknown>`. This return type must change to `string` — the context builder produces a formatted string, not a data object.

### How `analyze.ts` Wires Everything Together

The `analyzeCommand` in `cli/commands/analyze.ts` currently prints "Analysis engine not yet implemented." After Phase 4, it should:

```typescript
// Pseudocode for analyze.ts Phase 4 wiring
export async function analyzeCommand(path: string, options: AnalyzeOptions): Promise<void> {
  // 1. Load config + detect provider (already done)
  const config = loadConfig(path);
  const detected = detectProvider(...);
  const resolved = mergeConfig(config, options, path, detected);

  // 2. Create LLM provider (new in Phase 4)
  if (!detected) { /* print error and exit */ }
  const provider = createProvider(detected.provider, detected.model);

  // 3. Discover files (new in Phase 4 — calls Phase 2)
  const files = await discoverFiles(resolved.targetPath, resolved.ignore, resolved.maxFileSize);
  if (files.length === 0) {
    console.log('No analyzable files found. Check your ignore patterns.');
    return;
  }

  // 4. Chunk all files (new in Phase 4 — calls Phase 2)
  const chunks = new Map<string, Chunk[]>();
  for (const file of files) {
    const content = await readFile(file.path, 'utf-8');
    chunks.set(file.path, chunkFile(content, file.path));
  }

  // 5. Resolve agent paths
  const builtInAgents = [
    resolve(fileURLToPath(import.meta.url), '../../agents/definitions/dependency-mapper.md'),
    resolve(fileURLToPath(import.meta.url), '../../agents/definitions/teachability-scorer.md'),
    resolve(fileURLToPath(import.meta.url), '../../agents/definitions/structure-analyzer.md'),
  ];
  const agentPaths = [...builtInAgents, ...resolved.customAgents];

  // 6. Run Stage 1 agents in parallel (new in Phase 4)
  const [depMapResult, teachResult, structResult] = await Promise.all([
    runAgent({ agentPath: agentPaths[0], files, chunks, projectPath: resolved.targetPath, provider, model: detected.model }),
    runAgent({ agentPath: agentPaths[1], files, chunks, projectPath: resolved.targetPath, provider, model: detected.model }),
    runAgent({ agentPath: agentPaths[2], files, chunks, projectPath: resolved.targetPath, provider, model: detected.model }),
  ]);

  // 7. Run Stage 2 (Impact Ranker — needs Stage 1 outputs)
  // ... (full implementation in Phase 5 when agent definitions are written)

  // 8. Render results
  // ... (Phase 6)
}
```

**Key import paths for analyze.ts** (all `.js` extensions per Node16 ESM):
- `import { createProvider } from '../../providers/index.js';`
- `import { discoverFiles } from '../../core/file-discovery.js';`
- `import { chunkFile } from '../../core/chunker.js';`
- `import { runAgent } from '../../agents/runner.js';`
- `import { readFile } from 'node:fs/promises';`
- `import { resolve } from 'node:path';`
- `import { fileURLToPath } from 'node:url';`

The `fileURLToPath` + `import.meta.url` approach is necessary to get the absolute path to the bundled agent definition files in a Node ESM context:
```typescript
const __dirname = fileURLToPath(new URL('.', import.meta.url));
const agentDefinitionsDir = resolve(__dirname, '../agents/definitions');
```

---

## 6. Reading Agent Files at Runtime

The agent `.md` files are in `agents/definitions/` and are included in the npm package via `"files": ["dist/", "agents/definitions/"]` in `package.json` (already set correctly). The runner reads them at runtime from the filesystem — they are NOT bundled into `dist/` by TypeScript compilation.

**Critical path resolution**:
```typescript
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

// Get the directory of the compiled runner.ts (in dist/agents/)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Navigate to agents/definitions/ relative to dist/agents/runner.js
// dist/agents/runner.js → ../../agents/definitions/
const definitionsDir = resolve(__dirname, '../../agents/definitions');
```

The runner should export a helper:
```typescript
export function getBuiltInAgentPaths(): string[] {
  const __filename = fileURLToPath(import.meta.url);
  const definitionsDir = resolve(dirname(__filename), '../../agents/definitions');
  return [
    resolve(definitionsDir, 'dependency-mapper.md'),
    resolve(definitionsDir, 'teachability-scorer.md'),
    resolve(definitionsDir, 'structure-analyzer.md'),
    resolve(definitionsDir, 'impact-ranker.md'),
  ];
}
```

---

## 7. Plan Split Recommendation

Phase 4 should split into 2 plans:

### Plan 04-01: `agents/context.ts` — Context Builder

**Tasks:**
1. Implement `estimateTokens(text: string): number`
2. Implement `getContextLimit(model: string): number` with the model limits table
3. Implement `buildProjectTree(files: FileInfo[], projectPath: string): string`
4. Implement `buildContext(options: ContextBuildOptions): string` with priority-based truncation
5. Export all four functions; update stub signature

**Verification**: Unit-testable with synthetic `FileInfo[]` and `Chunk[]` — no LLM needed. Verify token budget logic, tree rendering, and truncation levels.

### Plan 04-02: `agents/runner.ts` — Agent Runner + analyze.ts Wiring

**Tasks:**
1. Implement `parseAgentMarkdown(content: string): AgentDefinition`
2. Implement `buildSystemPrompt(agent: AgentDefinition): string`
3. Implement `parseJsonResponse(content: string): Record<string, unknown> | null`
4. Implement `runAgent(options: AgentRunOptions): Promise<AgentResult>` with retry logic
5. Implement `getBuiltInAgentPaths(): string[]`
6. Wire `analyze.ts` to call `discoverFiles`, `chunkFile`, and `runAgent` in the correct pipeline
7. Create stub agent `.md` files in `agents/definitions/` (full agent definition content comes in Phase 5)

**Dependencies**: Plan 04-01 must complete first (runner imports `buildContext` from `context.ts`).

---

## 8. No New NPM Packages Required

All dependencies are already installed:
- `fs/promises` — built-in (file reading)
- `node:path` — built-in (path resolution)
- `node:url` — built-in (`fileURLToPath`, `import.meta.url`)
- `@anthropic-ai/sdk`, `openai`, `@google/genai` — already in `dependencies` (Phase 3)
- `ignore` — already in `dependencies` (Phase 2)

**Explicitly NOT installing**:
- `unified`, `remark`, `remark-parse` — not needed; simple string splitting is sufficient
- `js-tiktoken` — too large (WASM bundle); character heuristic is sufficient
- `gpt-tokenizer` — adds dependency; not justified by accuracy gain over heuristic

---

## 9. TypeScript Strict Mode Considerations

Key strict-mode patterns for Phase 4:

**Pattern 1: `RegExp.exec()` return type**
```typescript
// exec() returns RegExpExecArray | null — must null-check
const match = /^##\s+(.+)$/m.exec(content);
const heading = match?.[1]?.trim() ?? '';  // Safe optional chaining
```

**Pattern 2: `Map.get()` return type**
```typescript
// Map.get() returns T | undefined — must handle undefined
const fileChunks = chunks.get(file.path) ?? [];
```

**Pattern 3: `JSON.parse()` return type**
```typescript
// JSON.parse returns `any` — cast explicitly
const parsed = JSON.parse(content) as Record<string, unknown>;
```

**Pattern 4: ESM `__dirname` equivalent**
```typescript
// No __dirname in ESM — use import.meta.url
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
const __dirname = dirname(fileURLToPath(import.meta.url));
```

**Pattern 5: Import paths**
All local imports use `.js` extensions (Node16 ESM):
```typescript
import { FileInfo } from '../core/file-discovery.js';
import { Chunk } from '../core/chunker.js';
import { LLMProvider } from '../providers/index.js';
import { buildContext } from './context.js';
```

---

## 10. Key Risks and Open Questions

### Risk 1: Agent .md files not present at runtime
The `.md` files are in `agents/definitions/` which is listed in `package.json` `"files"`, so they ARE included when the package is installed. However, they must exist before the runner can load them. Phase 4 plan 04-02 must create stub `.md` files for all four agents (even if the prompts are incomplete — full prompts are Phase 5's job). Without the files, the runner will throw at startup.

### Risk 2: Stub signature change breaks TypeScript compilation
Both `runner.ts` and `context.ts` have stubs with weak types (`unknown`, `Record<string, unknown>`). Changing these signatures is safe because nothing else imports them yet — `analyze.ts` does not currently call either module. The plan should verify this with `grep` before changing.

### Risk 3: `import.meta.url` in test environments
If unit tests are added (future Phase), `import.meta.url` behaves differently in some Jest setups. The runner should be designed so the agent path is always passed as a parameter (it is — `agentPath` in `AgentRunOptions`), making `getBuiltInAgentPaths()` a convenience helper that can be mocked.

### Risk 4: Context string exceeds LLM limits
Even with the priority-based truncation, if the heuristic underestimates token count by more than the 20% buffer, the API call will fail with a context length error. Phase 7 handles this with error recovery. Phase 4 should document in code comments that the 4-char heuristic and 80% budget are intentionally conservative.

### Risk 5: Parallel agent calls with shared provider state
The three Stage 1 agents run in parallel via `Promise.all()`. Each agent makes its own `provider.call()` which are independent HTTP requests. The provider implementations (Phase 3) are stateless — no shared mutable state — so parallelism is safe.

### Open Question: Task instruction per agent
The `buildUserPrompt()` function needs a `taskInstruction` string. This could be:
1. **Option A**: Derived from the agent's `Input` section (prose description of what the agent expects)
2. **Option B**: A hardcoded brief instruction per agent name
3. **Option C**: A new `## Task` section added to each agent `.md` file

**Recommendation**: Option A — use the `input` section's first sentence as the task instruction. This keeps all agent customization in the `.md` files without adding another markdown section. Phase 5 (agent definitions) should craft the `Input` section with a clear imperative first sentence.

---

## 11. Summary: What the Planner Needs to Know

### For Plan 04-01 (context.ts)

1. Replace stub signature: `buildContext(options: ContextBuildOptions): string` (not `Record<string, unknown>`)
2. Implement four exported functions: `estimateTokens`, `getContextLimit`, `buildProjectTree`, `buildContext`
3. Import `FileInfo` from `'../core/file-discovery.js'` and `Chunk` from `'../core/chunker.js'`
4. Token budget: 80% of context limit, character heuristic (`length / 4`)
5. Three content levels: full, summarized (20 lines), name-only
6. Project tree: box-drawing characters, depth-first, derived from `FileInfo[]` relative paths
7. No new npm packages

### For Plan 04-02 (runner.ts + wiring)

1. Replace stub signature: `runAgent(options: AgentRunOptions): Promise<AgentResult>`
2. Implement markdown parser (section regex, no library)
3. System prompt = System Prompt section + Scoring Rubric + Output Schema
4. JSON retry: 1 retry with stricter system prompt addition, lower temperature (0.1)
5. Import `buildContext` from `'./context.js'` (not a new dependency)
6. Wire `analyze.ts`: add `discoverFiles`, `chunkFile`, `createProvider`, `runAgent` calls
7. Create stub `.md` files for all 4 agents in `agents/definitions/` so the runner doesn't throw
8. Use `fileURLToPath(import.meta.url)` + `dirname` to resolve agent definition paths
9. No new npm packages

### Sequencing

04-01 (context.ts) must complete before 04-02 (runner.ts) because runner imports `buildContext` from context. Both must complete before analyze.ts wiring.
