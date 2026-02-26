# code-teacher

Analyze any codebase to find what's worth learning, what's risky to change, and why.

- **`teach`** — surfaces the most educational code: patterns, algorithms, and clean implementations
- **`impact`** — ranks files by blast radius, fan-in, and refactor risk (fully static, instant, no API key)
- **`structures`** — explains key data structure choices and their trade-offs

Language-agnostic. Works on any codebase. Supports Anthropic, OpenAI, Google, and local Ollama models.

## Requirements

- **Node.js** >= 22.0.0
- An API key for at least one supported provider ([Anthropic](https://console.anthropic.com/), [OpenAI](https://platform.openai.com/), or [Google](https://aistudio.google.com/)) — or [Ollama](https://ollama.ai) for free local inference

## Installation

```bash
# Install globally from GitHub
npm install -g github:Arunavanag1/code_teacher

# Or run without installing
npx github:Arunavanag1/code_teacher teach my-project
```

## Quick Start

```bash
# 1. Install
npm install -g github:Arunavanag1/code_teacher

# 2. Save your API key (one time - works everywhere including Claude Code and Codex)
code-teacher set-key anthropic sk-ant-...

# 3. Run your first analysis
code-teacher teach my-project
```

`set-key` saves your key to `~/.code-teacher/credentials.json` so it works in every environment - regular terminal, Claude Code, Codex, CI. You only need to do this once.

Alternatively, set an environment variable: `export ANTHROPIC_API_KEY="sk-ant-..."`

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
| `--full-analysis` | boolean | `false` | Use original 4-agent pipeline (separate LLM calls) |

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

### `set-key`

Save an API key so code-teacher works in any environment. Keys are stored in `~/.code-teacher/credentials.json`.

```bash
code-teacher set-key anthropic sk-ant-...
code-teacher set-key openai sk-...
code-teacher set-key google AIza...
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
| `maxAnalyzedFiles` | `number` | `50` | Maximum files sent to LLM agents (0 = unlimited) |
| `ollamaUrl` | `string` | `http://localhost:11434/v1` | Ollama base URL for local LLM inference |

CLI flags take highest priority, then environment variables (`CODE_TEACHER_PROVIDER`, `CODE_TEACHER_MODEL`), then config file, then built-in defaults.

## LLM Providers

| Provider | Env Variable | Default Model | Detection Order |
|----------|-------------|---------------|-----------------|
| Anthropic (Claude) | `ANTHROPIC_API_KEY` | `claude-sonnet-4-6` | 1st |
| OpenAI (GPT) | `OPENAI_API_KEY` | `gpt-4o` | 2nd |
| Google (Gemini) | `GOOGLE_API_KEY` | `gemini-2.0-flash` | 3rd |
| Ollama (local) | *(none needed)* | `llama3.1` | manual only |

Auto-detection scans environment variables in the order above and uses the first match. If you already have an API key set for any LLM tool (Claude Code, OpenAI Codex, etc.), code-teacher just works. Override with `--provider` and `--model` flags or `CODE_TEACHER_PROVIDER` / `CODE_TEACHER_MODEL` environment variables.

```bash
code-teacher analyze my-project --provider openai --model gpt-4o
```

### Ollama (Local LLM)

Run analysis with zero cost using a local Ollama instance. No API key required.

```bash
# Install Ollama: https://ollama.ai
# Pull a model
ollama pull llama3.1

# Run code-teacher with Ollama
code-teacher teach my-project --provider ollama
code-teacher teach my-project --provider ollama --model mistral
```

Set a custom Ollama URL in `code-teacher.config.json`:

```json
{
  "ollamaUrl": "http://localhost:11434/v1"
}
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

The analysis pipeline is optimized for efficiency. Dependency mapping and impact ranking are computed statically (no LLM calls). By default, teachability scoring and structure analysis are combined into a single LLM call. This reduces the pipeline from 4 API calls (~155K tokens) to 1 API call (~15K tokens) — a 90% reduction. Use `--full-analysis` to restore the original separate-agent pipeline. Smart file sampling prioritizes the most important files (by dependency graph metrics) and caps at 50 files sent to the LLM.

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
