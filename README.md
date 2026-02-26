# code-teacher

A CLI tool that analyzes codebases to surface three categories of insight:

- **Teachable Sections** -- Code that best demonstrates patterns, data structures, and techniques valuable for learning
- **High-Impact Sections** -- Code with the most dependencies, downstream influence, and architectural significance
- **Data Structure Decisions** -- Key structural choices (why a hashmap over a tree, why a queue over a stack) and their implications

code-teacher is **language-agnostic**. It uses LLM-powered agents defined in markdown files, so it can reason about any programming language without hardcoded parsers.

---

## Table of Contents

- [Requirements](#requirements)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [CLI Commands](#cli-commands)
  - [analyze](#analyze)
  - [init](#init)
- [Configuration](#configuration)
- [LLM Provider Setup](#llm-provider-setup)
- [Output Modes](#output-modes)
- [Watch Mode](#watch-mode)
- [Custom Agents](#custom-agents)
- [Architecture](#architecture)
- [Error Handling](#error-handling)
- [License](#license)

---

## Requirements

- **Node.js** >= 22.0.0
- An API key for at least one supported LLM provider:
  - [Anthropic](https://console.anthropic.com/) (Claude)
  - [OpenAI](https://platform.openai.com/) (GPT)
  - [Google](https://aistudio.google.com/) (Gemini)

---

## Installation

### Install globally from GitHub

```bash
npm install -g github:USERNAME/code-teacher
```

### Run without installing (via npx)

```bash
npx github:USERNAME/code-teacher analyze ./my-project
```

After installation, the `code-teacher` command is available globally in your terminal.

---

## Quick Start

Get from zero to your first analysis in under 2 minutes:

```bash
# 1. Set your API key (use whichever provider you have)
export ANTHROPIC_API_KEY="sk-ant-..."
# or: export OPENAI_API_KEY="sk-..."
# or: export GOOGLE_API_KEY="AI..."

# 2. Install code-teacher
npm install -g github:USERNAME/code-teacher

# 3. Navigate to any project and run analysis
cd ~/my-project
code-teacher analyze .

# 4. (Optional) Create a config file for the project
code-teacher init .
```

That is it. code-teacher auto-detects your LLM provider from environment variables and runs a full analysis.

---

## CLI Commands

### `analyze`

Analyze a codebase for teachable sections, high-impact sections, and data structure decisions.

```bash
code-teacher analyze [path]
```

The `path` argument defaults to `.` (current directory) if omitted.

#### Flags

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--mode <mode>` | string | `all` | Analysis mode: `teachings`, `sections`, or `all` |
| `--file <path>` | string | -- | Analyze a specific file instead of the full project |
| `--verbose` | boolean | `false` | Show agent reasoning traces in output |
| `--top <n>` | number | `5` | Number of top results to show per category |
| `--json` | boolean | `false` | Output raw JSON instead of formatted terminal output |
| `--provider <name>` | string | auto | LLM provider: `anthropic`, `openai`, or `google` |
| `--model <name>` | string | auto | Specific model to use (e.g., `gpt-4o`) |
| `--watch` | boolean | `false` | Watch for file changes and re-analyze automatically |

#### Usage Examples

```bash
# Full analysis on the current directory
code-teacher analyze

# Full analysis on a specific project
code-teacher analyze ~/projects/my-app

# Only teachable sections
code-teacher analyze . --mode teachings

# Only high-impact / dependency-heavy sections
code-teacher analyze . --mode sections

# Analyze a single file
code-teacher analyze . --file src/utils/parser.ts

# Show top 10 results instead of default 5
code-teacher analyze . --top 10

# Show agent reasoning traces
code-teacher analyze . --verbose

# Output as JSON for piping into other tools
code-teacher analyze . --json
code-teacher analyze . --json | jq '.teachableSections[0]'

# Force a specific LLM provider and model
code-teacher analyze . --provider openai --model gpt-4o

# Watch mode: re-analyze when files change
code-teacher analyze . --watch

# Combine flags
code-teacher analyze ~/my-app --mode teachings --top 10 --verbose --provider anthropic
```

### `init`

Create a starter `code-teacher.config.json` in the specified directory.

```bash
code-teacher init [path]
```

The `path` argument defaults to `.` (current directory) if omitted.

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--force` | boolean | `false` | Overwrite an existing config file |

#### Usage Examples

```bash
# Create config in current directory
code-teacher init

# Create config in a specific project
code-teacher init ~/projects/my-app

# Overwrite an existing config
code-teacher init . --force
```

### Other Commands

```bash
# Show version
code-teacher --version

# Show help
code-teacher --help

# Show help for a specific command
code-teacher analyze --help
code-teacher init --help
```

---

## Configuration

Place a `code-teacher.config.json` file in your project root to customize behavior. All fields are optional. Run `code-teacher init` to generate a starter config.

### Example Configuration

```json
{
  "ignore": [
    "node_modules",
    "dist",
    "build",
    ".git",
    "__pycache__",
    "*.min.js",
    "*.min.css",
    "*.lock",
    "package-lock.json",
    "yarn.lock",
    "*.png", "*.jpg", "*.gif", "*.svg", "*.ico",
    "*.woff", "*.woff2", "*.ttf", "*.eot"
  ],
  "maxFileSize": 50000,
  "topN": 5,
  "provider": "anthropic",
  "model": "claude-sonnet-4-6",
  "customAgents": ["./my-agents/security-checker.md"]
}
```

### Configuration Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `ignore` | `string[]` | See above | Glob patterns for files and directories to skip during analysis |
| `maxFileSize` | `number` | `50000` | Maximum file size in bytes. Files larger than this are skipped with a warning |
| `topN` | `number` | `5` | Number of top results to display per category |
| `provider` | `string` | auto-detect | LLM provider override: `"anthropic"`, `"openai"`, or `"google"` |
| `model` | `string` | provider default | Specific model name to use |
| `customAgents` | `string[]` | `[]` | Paths to custom agent `.md` files, relative to the project root |

### Resolution Order

When the same setting is specified in multiple places, this priority order applies (highest wins):

1. CLI flag (e.g., `--top 10`)
2. Environment variable (e.g., `CODE_TEACHER_PROVIDER`)
3. Config file (`code-teacher.config.json`)
4. Built-in defaults

---

## LLM Provider Setup

code-teacher is **bring-your-own-key (BYOK)**. It does not bundle, proxy, or subsidize any LLM access. You must have at least one API key set in your environment.

### Supported Providers

| Provider | Env Variable | Default Model | Detection Order |
|----------|-------------|---------------|-----------------|
| Anthropic (Claude) | `ANTHROPIC_API_KEY` | `claude-sonnet-4-6` | 1st |
| OpenAI (GPT) | `OPENAI_API_KEY` | `gpt-4o` | 2nd |
| Google (Gemini) | `GOOGLE_API_KEY` | `gemini-2.0-flash` | 3rd |

### Auto-Detection

code-teacher automatically detects which LLM you already have configured by scanning environment variables. It uses the **first match** in this order:

1. `ANTHROPIC_API_KEY`
2. `OPENAI_API_KEY`
3. `GOOGLE_API_KEY`

If you are already running Claude Code, OpenAI Codex, or any other LLM-powered terminal tool, code-teacher just works with whatever API key you have set.

### Explicit Override

You can override auto-detection using CLI flags or environment variables:

```bash
# CLI flags (highest priority)
code-teacher analyze . --provider anthropic --model claude-sonnet-4-6
code-teacher analyze . --provider openai --model gpt-4o
code-teacher analyze . --provider google --model gemini-2.0-flash

# Environment variables
export CODE_TEACHER_PROVIDER=openai
export CODE_TEACHER_MODEL=gpt-4o
code-teacher analyze .
```

### Detection Priority Flow

```
code-teacher analyze .
         |
         v
  --provider flag set? ---yes---> Use that provider
         | no
         v
  CODE_TEACHER_PROVIDER env set? ---yes---> Use that provider
         | no
         v
  Config file provider set? ---yes---> Use that provider
         | no
         v
  Scan environment variables:
    ANTHROPIC_API_KEY found? ---yes---> Use Anthropic
         | no
    OPENAI_API_KEY found? ---yes---> Use OpenAI
         | no
    GOOGLE_API_KEY found? ---yes---> Use Google
         | no
         v
  Error: "No LLM provider detected. Set ANTHROPIC_API_KEY,
          OPENAI_API_KEY, or use --provider to configure."
```

### Startup Confirmation

When a provider is detected, code-teacher prints a one-line confirmation:

```
Using anthropic (claude-sonnet-4-6) -- detected from ANTHROPIC_API_KEY
```

---

## Output Modes

code-teacher supports three output modes. The default is summary mode.

### Summary Mode (default)

Displays the top N results per category with color-coded scores and formatted sections.

```
+--------------------------------------------------------------+
|  code-teacher Analysis: my-project                           |
|  Files analyzed: 47 | Languages: TypeScript, Python          |
|  Analysis time: 12.3s                                        |
+--------------------------------------------------------------+

--- TOP HIGH-IMPACT SECTIONS ---

 #1  src/core/engine.ts:23-89              Score: 9.2/10
     "Central orchestration engine - 34 downstream dependents.
      Modifying this function affects auth, payments, and notifications."
     Fan-in: 34 | Blast radius: HIGH | Refactor risk: HIGH

 #2  src/db/models/user.ts:1-156           Score: 8.7/10
     "User model defines the core schema used by 28 modules.
      Key decision: denormalized address fields for query performance."
     Fan-in: 28 | Blast radius: HIGH | Refactor risk: MEDIUM

--- TOP TEACHABLE SECTIONS ---

 #1  src/algo/rate-limiter.ts:10-67        Score: 9.4/10
     "Sliding window rate limiter using a sorted set. Excellent example
      of choosing a data structure for time-based expiration."
     Concepts: sliding window, sorted sets, time complexity
     Prerequisites: basic hash maps, Big-O notation

 #2  src/middleware/auth.ts:30-95          Score: 8.8/10
     "JWT validation middleware demonstrating the decorator pattern,
      clean error propagation, and middleware chaining."
     Concepts: middleware pattern, JWT, error boundaries

--- KEY DATA STRUCTURE DECISIONS ---

 *  src/cache/lru.ts:5-80
    Chose: Doubly-linked list + HashMap (LRU Cache)
    Over: Simple object with timestamp eviction
    Why: O(1) get/put vs O(n) eviction scans
    Impact: Critical for request caching at scale

 *  src/db/models/user.ts:12-34
    Chose: Denormalized address fields on User
    Over: Separate Address table with foreign key
    Why: Eliminates JOIN on every user query
    Trade-off: Update anomalies if address format changes
```

### Verbose Mode (`--verbose`)

Includes everything from summary mode plus agent reasoning traces. This shows how each agent arrived at its scores and rankings.

```bash
code-teacher analyze . --verbose
```

Verbose output adds sections like:

```
  [Agent: teachability-scorer]
  Reasoning: Scored 9.4 because this section demonstrates a sliding
  window algorithm with optimal time complexity, uses a sorted set
  (transferable concept), and is self-contained enough to study
  without deep project context...
```

### JSON Mode (`--json`)

Outputs structured JSON for piping into other tools. No ANSI colors, no headers -- just clean JSON.

```bash
code-teacher analyze . --json
```

```json
{
  "project": "my-project",
  "timestamp": "2026-02-25T10:30:00Z",
  "filesAnalyzed": 47,
  "languages": ["TypeScript", "Python"],
  "highImpactSections": [...],
  "teachableSections": [...],
  "dataStructureDecisions": [...],
  "dependencyGraph": {...}
}
```

Pipe JSON output into `jq` for filtering:

```bash
code-teacher analyze . --json | jq '.teachableSections[:3]'
code-teacher analyze . --json | jq '.highImpactSections[] | select(.score > 8)'
```

---

## Watch Mode

Watch mode monitors your project for file changes and automatically re-runs analysis.

```bash
code-teacher analyze . --watch
```

### How It Works

- Uses Node.js `fs.watch` with recursive directory monitoring
- Debounces rapid file changes (500ms delay) to handle editor auto-save
- Filters out changes in the `.code-teacher-cache/` directory to prevent infinite loops
- Respects the same ignore patterns from your config
- Prevents concurrent analyses (waits for current analysis to finish before starting another)

### Example

```bash
$ code-teacher analyze . --watch
Using anthropic (claude-sonnet-4-6) -- detected from ANTHROPIC_API_KEY
# ... initial analysis output ...

Watching for file changes... (press Ctrl+C to stop)

File changed: src/utils/parser.ts. Re-analyzing...
# ... re-analysis output ...

Watching for file changes... (press Ctrl+C to stop)
^C
Stopped watching.
```

Press `Ctrl+C` to stop watching.

---

## Custom Agents

code-teacher supports user-defined analysis agents. Custom agents run alongside the built-in agents in Stage 1 of the pipeline.

### Creating a Custom Agent

Create a markdown file following this template with all 5 required sections:

```markdown
# Security Checker

## Role
Identify potential security vulnerabilities and unsafe patterns in the codebase.

## System Prompt
You are a security analysis agent. Analyze the provided code for common
security vulnerabilities including but not limited to:
- SQL injection
- Cross-site scripting (XSS)
- Insecure direct object references
- Hardcoded secrets and credentials
- Unsafe deserialization
- Missing input validation

For each vulnerability found, assess its severity and provide a concrete
remediation suggestion.

## Input
You will receive:
- File contents (full or chunked)
- Project structure tree showing file organization
- Import/export maps showing dependencies between modules

## Scoring Rubric
Score each finding on these criteria:
- **Severity** (0-10): How exploitable and damaging is this vulnerability?
- **Likelihood** (0-10): How likely is this to be exploited in production?
- **Fix complexity** (0-10): How difficult is the remediation?

## Output Schema
Return your analysis as JSON matching this structure:
```json
{
  "findings": [
    {
      "file": "src/api/auth.ts",
      "startLine": 23,
      "endLine": 45,
      "severity": 8.5,
      "type": "hardcoded-secret",
      "description": "API key hardcoded in source file",
      "remediation": "Move to environment variable"
    }
  ]
}
```
```

### Registering Custom Agents

Add paths to your custom agents in `code-teacher.config.json`. Paths are relative to the project root.

```json
{
  "customAgents": [
    "./my-agents/security-checker.md",
    "./my-agents/performance-analyzer.md"
  ]
}
```

### How Custom Agents Work

- Custom agent paths are resolved relative to the project root directory (not where you invoke the CLI)
- Custom agents execute in Stage 1, in parallel with the three built-in Stage 1 agents
- The Impact Ranker (Stage 2) synthesizes outputs from all agents, including custom ones
- If a custom agent file is not found, code-teacher exits with a clear error message

---

## Architecture

code-teacher uses a two-stage agent pipeline to analyze codebases.

### Project Structure

```
code-teacher/
  cli/
    index.ts                     Entry point and argument parsing
    commands/
      analyze.ts                 Main analysis orchestrator
      init.ts                    Config file generator
    output/
      formatter.ts               ANSI colors, Unicode box-drawing, score bars
      renderer.ts                Summary, verbose, and JSON rendering
  agents/
    definitions/
      dependency-mapper.md       Agent: maps imports, exports, call graphs
      teachability-scorer.md     Agent: scores code for educational value
      structure-analyzer.md      Agent: identifies data structure decisions
      impact-ranker.md           Agent: ranks sections by downstream influence
    runner.ts                    Loads agent .md files, constructs prompts, calls LLM
    context.ts                   Builds file/project context windows for agents
  core/
    file-discovery.ts            Walks project tree, respects .gitignore
    chunker.ts                   Splits large files into analyzable chunks
    dependency-graph.ts          Builds and queries the dependency graph
    cache.ts                     Caches analysis results per content hash
    retry.ts                     Exponential backoff retry for API calls
  config/
    defaults.ts                  Default configuration values
    schema.ts                    Config file validation
  providers/
    index.ts                     Provider abstraction, detection, factory
    anthropic.ts                 Anthropic (Claude) SDK integration
    openai.ts                    OpenAI SDK integration
    google.ts                    Google (Gemini) SDK integration
```

### Two-Stage Analysis Pipeline

```
 Input
   |
   v
+---------------------+
|  File Discovery     |  Scan project, build file list,
|                     |  respect .gitignore + config ignores
+----------+----------+
           |
           v
+---------------------+
|  Chunking           |  Split large files into ~200-line
|                     |  overlapping chunks
+----------+----------+
           |
           v
+--------------------------------------------------+
|  Stage 1: Parallel Execution                     |
|                                                  |
|  +-----------------+  +----------------------+   |
|  | Dependency      |  | Teachability         |   |
|  | Mapper          |  | Scorer               |   |
|  +-----------------+  +----------------------+   |
|  +-----------------+  +----------------------+   |
|  | Structure       |  | Custom Agents        |   |
|  | Analyzer        |  | (if configured)      |   |
|  +-----------------+  +----------------------+   |
+-------------------------+------------------------+
                          |
                          v
+--------------------------------------------------+
|  Stage 2: Synthesis                              |
|                                                  |
|  +--------------------------------------------+  |
|  | Impact Ranker                               |  |
|  | (receives all Stage 1 outputs)              |  |
|  +--------------------------------------------+  |
+-------------------------+------------------------+
                          |
                          v
+--------------------------------------------------+
|  Output Rendering                                |
|  Format results -> Terminal / JSON               |
+--------------------------------------------------+
```

### Built-In Agents

| Agent | Stage | Purpose |
|-------|-------|---------|
| **Dependency Mapper** | 1 | Builds a graph of how files and functions relate to each other. Scores fan-in, fan-out, coupling depth, and centrality. |
| **Teachability Scorer** | 1 | Identifies code sections valuable for learning. Scores conceptual density, clarity, transferability, novelty, and self-containment. |
| **Structure Analyzer** | 1 | Identifies key data structure decisions with trade-off analysis. Scores decision significance, alternative awareness, and performance implication. |
| **Impact Ranker** | 2 | Synthesizes all Stage 1 outputs into a final ranked list. Uses composite scoring: blast radius (0.3), knowledge gate (0.25), refactor risk (0.25), combined teachability (0.2). |

### Agent Definition Format

Agents are defined as markdown files with 5 sections: Role, System Prompt, Input, Scoring Rubric, and Output Schema. The agent runner parses these sections and uses them to construct LLM prompts. See [Custom Agents](#custom-agents) for the full template.

### Caching

code-teacher caches analysis results to avoid redundant LLM calls:

- Cache key is a SHA-256 hash of: commit hash + project content hash + agent version hash
- Results are stored in `.code-teacher-cache/` in the project root
- No TTL -- cache invalidates automatically when file contents or agent definitions change
- Add `.code-teacher-cache/` to your `.gitignore`

### Dependency Graph

The dependency graph module (`dependency-graph.ts`) provides these query methods:

- `getImpactScore(nodeId)` -- BFS downstream reach, normalized to 0-10
- `getCentrality(nodeId)` -- Weighted degree approximation (fan-in * 0.6 + fan-out * 0.4)
- `getBottlenecks()` -- Articulation points via iterative Tarjan's algorithm
- `getCluster(nodeId)` -- Undirected BFS connected components
- `getEntryPoints()` -- Nodes with zero incoming edges

All algorithms are O(V+E), implemented in pure TypeScript with no external graph library.

---

## Error Handling

code-teacher handles errors gracefully with clear, actionable messages.

| Error | Handling |
|-------|----------|
| Missing API key | `"No LLM provider detected. Set ANTHROPIC_API_KEY, OPENAI_API_KEY, or use --provider to configure."` |
| LLM rate limit (429) | Exponential backoff: 1s, 2s, 4s delays, max 3 retries |
| LLM timeout | Retry with exponential backoff, same as rate limits |
| Network errors | Retries on ECONNRESET, ECONNREFUSED, ETIMEDOUT |
| Non-retryable errors (401, 400) | Thrown immediately with clear message, no retries |
| Malformed LLM response | Retry with stricter JSON prompt, fall back to empty result with warning |
| File too large | Skipped with warning. Adjust `maxFileSize` in config to include it |
| No files found | `"No analyzable files found. Check your ignore patterns."` |
| Invalid config | Validates on startup, reports specific field errors (e.g., `"maxFileSize" must be a positive number`) |
| Unreadable file | Skipped with warning, does not abort the analysis |
| Unknown provider | `"Unknown provider 'xyz'. Supported providers: anthropic, openai, google."` |

Error messages are written to stderr. No stack traces are shown in normal operation. Use `--verbose` for additional diagnostic detail.

---

## License

ISC
