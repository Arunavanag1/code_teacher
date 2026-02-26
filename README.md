# code-teacher

A CLI tool that analyzes codebases to surface three categories of insight:

- **Teachable Sections** - Code that best demonstrates patterns, techniques, and concepts valuable for learning
- **High-Impact Sections** - Code with the most dependencies, downstream influence, and architectural significance
- **Data Structure Decisions** - Key structural choices (why a hashmap over a tree, why a queue over a stack) and their trade-offs

code-teacher is **language-agnostic**. It uses LLM-powered agents defined in markdown, so it reasons about any programming language without hardcoded parsers.

## Requirements

- **Node.js** >= 22.0.0
- An API key for at least one supported provider: [Anthropic](https://console.anthropic.com/) (Claude), [OpenAI](https://platform.openai.com/) (GPT), or [Google](https://aistudio.google.com/) (Gemini)

## Installation

```bash
# Install globally from GitHub
npm install -g github:Arunavanag1/code_teacher

# Or run without installing
npx github:Arunavanag1/code_teacher teach my-project
```

## Quick Start

```bash
# 1. Set your API key (whichever provider you have)
export ANTHROPIC_API_KEY="sk-ant-..."

# 2. Install
npm install -g github:Arunavanag1/code_teacher

# 3. Run your first analysis
code-teacher teach my-project
```

Auto-detection just works - if you already have an API key set for any supported provider, code-teacher finds it automatically.

## Commands

### Focused Commands

These are the primary entry points. Each runs the full analysis pipeline but filters output to a single category.

**`code-teacher teach [path]`** - Shows the top teachable code sections: patterns, algorithms, and techniques worth studying.

```bash
code-teacher teach my-project
```

**`code-teacher impact [path]`** - Shows the highest-impact, most-depended-on code sections with blast radius and refactor risk.

```bash
code-teacher impact my-project
```

**`code-teacher structures [path]`** - Shows key data structure decisions, what was chosen, what was rejected, and why.

```bash
code-teacher structures my-project
```

All three accept: `--file`, `--verbose`, `--top`, `--json`, `--provider`, `--model`, `--watch`.

### `analyze`

Runs the full pipeline and shows all categories (or filter with `--mode`).

```bash
code-teacher analyze [path]
```

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--mode <mode>` | string | `all` | Analysis mode: `teachings`, `sections`, or `all` |
| `--file <path>` | string | - | Analyze a specific file instead of the full project |
| `--verbose` | boolean | `false` | Show agent reasoning traces in output |
| `--top <n>` | number | `5` | Number of top results to show per category |
| `--json` | boolean | `false` | Output raw JSON instead of formatted terminal output |
| `--provider <name>` | string | auto | LLM provider: `anthropic`, `openai`, or `google` |
| `--model <name>` | string | auto | Specific model to use (e.g., `gpt-4o`) |
| `--watch` | boolean | `false` | Watch for file changes and re-analyze automatically |

```bash
# Full analysis
code-teacher analyze my-project

# Only teachable sections
code-teacher analyze my-project --mode teachings

# Analyze a single file
code-teacher analyze my-project --file src/utils/parser.ts

# Top 10 results with verbose reasoning
code-teacher analyze my-project --top 10 --verbose

# JSON output piped to jq
code-teacher analyze my-project --json | jq '.teachableSections[:3]'

# Force a specific provider
code-teacher analyze my-project --provider openai --model gpt-4o
```

### `init`

Creates a starter `code-teacher.config.json` in the specified directory.

```bash
code-teacher init my-project
code-teacher init my-project --force   # overwrite existing config
```

### Other Commands

```bash
code-teacher --version          # show version
code-teacher --help             # show help
code-teacher analyze --help     # command-specific help
```

## Configuration

Place a `code-teacher.config.json` in your project root to customize behavior. Run `code-teacher init` to generate a starter config.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `ignore` | `string[]` | common patterns | Glob patterns for files/directories to skip |
| `maxFileSize` | `number` | `50000` | Maximum file size in bytes; larger files are skipped |
| `topN` | `number` | `5` | Number of top results per category |
| `provider` | `string` | auto-detect | LLM provider: `"anthropic"`, `"openai"`, or `"google"` |
| `model` | `string` | provider default | Specific model name to use |
| `customAgents` | `string[]` | `[]` | Paths to custom agent `.md` files, relative to project root |

CLI flags take highest priority, then environment variables (`CODE_TEACHER_PROVIDER`, `CODE_TEACHER_MODEL`), then config file, then built-in defaults.

## LLM Providers

| Provider | Env Variable | Default Model | Detection Order |
|----------|-------------|---------------|-----------------|
| Anthropic (Claude) | `ANTHROPIC_API_KEY` | `claude-sonnet-4-6` | 1st |
| OpenAI (GPT) | `OPENAI_API_KEY` | `gpt-4o` | 2nd |
| Google (Gemini) | `GOOGLE_API_KEY` | `gemini-2.0-flash` | 3rd |

Auto-detection scans environment variables in the order above and uses the first match. If you already have an API key set for any LLM tool (Claude Code, OpenAI Codex, etc.), code-teacher just works. Override with `--provider` and `--model` flags or `CODE_TEACHER_PROVIDER` / `CODE_TEACHER_MODEL` environment variables.

```bash
code-teacher analyze my-project --provider openai --model gpt-4o
```

## Output Modes

**Summary mode** (default) displays the top N results per category with color-coded scores, fan-in/blast-radius metrics, and structured sections. This is what you see when running any command without extra flags.

**Verbose mode** (`--verbose`) includes everything from summary mode plus agent reasoning traces, showing how each agent arrived at its scores and rankings.

**JSON mode** (`--json`) outputs structured JSON with no ANSI colors - suitable for piping into other tools.

```bash
code-teacher analyze my-project --json | jq '.highImpactSections[] | select(.score > 8)'
```

## Custom Agents

Add custom analysis agents by listing their paths in `customAgents` in your config:

```json
{
  "customAgents": ["./my-agents/security-checker.md"]
}
```

Each agent markdown file must contain these 5 sections:

- **Role** -What the agent does
- **System Prompt** -Instructions and analysis criteria
- **Input** -What data the agent receives (file contents, project structure, import maps)
- **Scoring Rubric** -How findings are scored
- **Output Schema** -JSON structure for results

Custom agents run in Stage 1 alongside the three built-in agents. The Impact Ranker (Stage 2) synthesizes all Stage 1 outputs, including custom ones, into a final ranked list.

## Architecture

TypeScript project organized into `cli/`, `agents/`, `core/`, `config/`, and `providers/` directories.

The analysis runs as a two-stage pipeline. Stage 1 executes three agents in parallel (Dependency Mapper, Teachability Scorer, Structure Analyzer) plus any custom agents. Stage 2 runs the Impact Ranker, which receives all Stage 1 outputs and produces a final ranked list using composite scoring: blast radius (0.3), knowledge gate (0.25), refactor risk (0.25), combined teachability (0.2).

Results are cached using content-hash keys (SHA-256 of file contents + agent definitions). Cache is stored in `.code-teacher-cache/` -add this to your `.gitignore`. Cache invalidates automatically when file contents or agent definitions change.

<details>
<summary>Error handling details</summary>

| Error | Handling |
|-------|----------|
| Missing API key | Clear message listing supported providers |
| Rate limit (429) | Exponential backoff: 1s, 2s, 4s, max 3 retries |
| Timeout / network errors | Retried with exponential backoff |
| Malformed LLM response | Retry with stricter prompt, fall back to empty result |
| Invalid config | Validates on startup, reports specific field errors |
| File too large / unreadable | Skipped with warning, does not abort analysis |

Error messages are written to stderr. Use `--verbose` for diagnostic detail.

</details>

## License

ISC
