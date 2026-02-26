# Phase 7 Research: Hardening & Extended Features

**Phase:** 7 of 7 — Hardening & Extended Features
**Requirements:** REQ-14, REQ-17, REQ-18, REQ-19, REQ-20
**Research date:** 2026-02-25
**Researcher:** gsd-phase-researcher

---

## 1. What Error Handling Already Exists — and What Gaps Remain

### Existing error handling (audit of current code)

**`providers/index.ts`** — `createProvider()`
- Throws `ProviderDetectionError` if provider name is unknown (e.g., `--provider foobar`)
- Throws `ProviderDetectionError` if selected provider's API key env var is missing
- These are clear, specific errors. They are currently uncaught in `analyze.ts` — they will propagate and print a raw Node.js stack trace to the user.

**`cli/commands/analyze.ts`** — `analyzeCommand()`
- Checks `!detected` (no provider found) and returns early with a message — this is good UX
- Checks `files.length === 0` and returns early with a message — this is good UX
- Has NO try/catch around any async operations:
  - `loadConfig(path)` can throw `ConfigValidationError`
  - `discoverFiles(...)` can throw on unreadable directory / permission error
  - `readFile(file.path, 'utf-8')` for chunking can throw on unreadable file
  - `runAgent(...)` can throw if the LLM SDK throws (rate limit, timeout, network error)
  - All of these currently produce raw stack traces

**`agents/runner.ts`** — `runAgent()`
- Has NO error handling on `provider.call(...)` — any SDK error (rate limit, timeout, network) propagates uncaught
- Has retry logic only for malformed JSON (`STRICT_JSON_SUFFIX` on first retry), not for API errors
- Comment on line 261: "Phase 7 will add harder error recovery (exponential backoff, partial results)"
- `readFile(agentPath, ...)` can throw if agent .md file is missing/unreadable — no guard

**`providers/anthropic.ts`**, **`providers/openai.ts`**, **`providers/google.ts`**
- No error handling whatsoever on the SDK `.create()` / `.generateContent()` calls
- Rate limit errors from Anthropic SDK: `Anthropic.RateLimitError` (HTTP 429)
- Timeout errors from Anthropic SDK: `Anthropic.APITimeoutError`
- API errors from Anthropic SDK: `Anthropic.APIError` (base class)
- OpenAI SDK: `OpenAI.RateLimitError`, `OpenAI.APITimeoutError`, `OpenAI.APIError`
- Google SDK: throws generic Error or SDK-specific errors

**`config/schema.ts`** — `loadConfig()`
- Throws `ConfigValidationError` with specific field-level errors — this is well done
- These errors ARE specific and useful, but currently uncaught at the top level

**`core/file-discovery.ts`**
- `readdir()` / `stat()` / `readFile()` calls have no individual try/catch
- A single unreadable file will abort the entire walk
- `console.warn` for oversized files is good; unreadable files should get the same treatment

**`core/cache.ts`**
- `getCached()` returns null on ANY error (best-effort) — correct behavior
- `setCached()` silently ignores write failures — correct behavior
- Cache is already hardened well

### Gap summary table

| Location | Error type | Current behavior | Required behavior |
|---|---|---|---|
| `analyze.ts` | `ConfigValidationError` | Raw stack trace | User-friendly message listing each invalid field |
| `analyze.ts` | `ProviderDetectionError` | Raw stack trace | User-friendly message (same text, no stack) |
| `analyze.ts` | `discoverFiles()` throws | Raw stack trace | "Cannot read directory: [path]" |
| `analyze.ts` | `readFile()` during chunking | Raw stack trace | Skip file with warning |
| `runAgent()` | API rate limit (429) | Raw stack trace | Exponential backoff: 1s, 2s, 4s, 8s, max 3 retries |
| `runAgent()` | API timeout | Raw stack trace | Retry once after 60s |
| `runAgent()` | API error (5xx) | Raw stack trace | Backoff + retry |
| `runAgent()` | Missing agent .md file | Raw stack trace | "Cannot load agent: [path]" |
| `providers/*.ts` | SDK errors | Propagate raw | Wrap and rethrow as typed errors |

---

## 2. How to Implement Exponential Backoff

### Spec requirement
> "API errors handled gracefully with exponential backoff (1s, 2s, 4s, 8s, max 3 retries)"

The spec sequence: delays of 1s, 2s, 4s = 3 retries after the initial attempt (4 total attempts).
The "8s" in the success criteria appears to be the max delay cap, not a 4th delay — because "max 3 retries" is stated explicitly.

### Where to put it — decision

**Option A: In each provider's `call()` method**
- Pros: encapsulated, provider-specific (e.g., Anthropic rate limit error class differs from OpenAI's)
- Cons: code duplication across 3 providers; harder to test centrally

**Option B: In `runner.ts` `runAgent()` function**
- Pros: single location, already where retry logic lives (JSON retry)
- Cons: runner must know about provider-specific error types OR catch a generic error type

**Option C: In a shared utility `core/retry.ts`**
- Pros: DRY, testable, usable by both runner and providers
- Cons: one more file

**Recommendation: Option C** — a shared `withRetry()` utility used by `runAgent()`. This keeps the retry logic pure and reusable.

The runner wraps `provider.call()` with `withRetry()`. The utility catches:
- Any error with HTTP status 429 (rate limit)
- Any error with HTTP status 5xx (server error)
- Network errors (ECONNRESET, ETIMEDOUT)
- Timeout errors from SDK

### Implementation of `withRetry()`

```typescript
// core/retry.ts
export interface RetryOptions {
  maxRetries: number;       // default: 3
  baseDelayMs: number;      // default: 1000 (1s)
  maxDelayMs: number;       // default: 8000 (8s)
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: Partial<RetryOptions>,
): Promise<T> {
  const maxRetries = options?.maxRetries ?? 3;
  const baseDelayMs = options?.baseDelayMs ?? 1000;
  const maxDelayMs = options?.maxDelayMs ?? 8000;

  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (!isRetryableError(err) || attempt === maxRetries) throw err;
      const delayMs = Math.min(baseDelayMs * Math.pow(2, attempt), maxDelayMs);
      await sleep(delayMs);
    }
  }
  throw lastError;
}
```

`isRetryableError(err)` should detect:
- `err` has `.status` of 429 or >= 500 (covers Anthropic, OpenAI SDK error shapes)
- `err` message contains "timeout" or "ETIMEDOUT" (network)
- `err` has `.code === 'ECONNRESET'`

The `sleep()` is a simple `new Promise(resolve => setTimeout(resolve, ms))`.

### Where backoff is invoked in the runner

In `runAgent()`, the existing `provider.call(...)` calls become:

```typescript
const response = await withRetry(() => provider.call(systemPrompt, userPrompt, {
  responseFormat: 'json',
  temperature: 0.2,
}));
```

The existing JSON-parse retry (STRICT_JSON_SUFFIX) runs AFTER `withRetry` succeeds — they handle different failure modes (API vs. malformed response).

---

## 3. What `code-teacher init` Needs to Generate

### Spec requirement (REQ-18)
> "`code-teacher init` creates starter config"

The `init` command must write a `code-teacher.config.json` to the current directory (or a specified path).

### Starter config template

Based on the config schema in `config/schema.ts` and defaults in `config/defaults.ts`:

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
    "*.png",
    "*.jpg",
    "*.gif",
    "*.svg",
    "*.ico",
    "*.woff",
    "*.woff2",
    "*.ttf",
    "*.eot"
  ],
  "maxFileSize": 50000,
  "topN": 5,
  "customAgents": []
}
```

Note: `provider` and `model` are intentionally omitted from the starter config because they default to auto-detection. Including them would confuse users who don't need to override auto-detection.

### `init` command behavior

1. Check if `code-teacher.config.json` already exists in `process.cwd()` (or the provided path argument)
2. If it exists: print "code-teacher.config.json already exists. Use --force to overwrite." and exit
3. If not: write the starter config, print "Created code-teacher.config.json" with a brief explanation of key fields
4. The command should include inline comments in the output message about what each field does (since JSON doesn't support comments, these go in the printed message, not the file)

### Where to add the command

In `cli/index.ts`. Currently it only has the `analyze` command. The `init` command is a new top-level commander command:

```typescript
program
  .command('init')
  .description('Create a starter code-teacher.config.json in the current directory')
  .argument('[path]', 'path to write config to (default: current directory)', '.')
  .option('--force', 'overwrite existing config')
  .action(async (path: string, options: { force?: boolean }) => {
    await initCommand(path, options);
  });
```

The `initCommand` handler goes in a new file `cli/commands/init.ts`.

---

## 4. How Custom Agent Loading Works — Current State vs. What's Needed

### Current state (Phase 6)

In `cli/commands/analyze.ts` lines 186-188:

```typescript
const agentPaths = getBuiltInAgentPaths();
// Add any custom agents from config
const allAgentPaths = [...agentPaths, ...resolved.customAgents.map((p) => resolve(p))];
```

The `resolve(p)` call uses Node.js `path.resolve()`, which resolves relative paths against `process.cwd()`. This is a problem: if the user sets `customAgents: ["./my-agents/security-checker.md"]` in their project's `code-teacher.config.json`, the path should resolve relative to the config file's location (the project root), not `process.cwd()`.

`resolved.targetPath` is the project root (already an absolute path). The fix is:
```typescript
resolved.customAgents.map((p) => resolve(resolved.targetPath, p))
```

### What already works

- `customAgents` field is in `Config` interface and `defaults.ts`
- `ConfigSchema` validates it as `string[]`
- `loadConfig()` merges it from the config file
- `mergeConfig()` passes it into `ResolvedConfig`
- `analyze.ts` appends custom agent paths to `allAgentPaths`

The custom agents are passed to `runAgent()` just like built-in agents. The `runAgent()` function is fully generic — it loads any `.md` file, parses it, and runs it. Custom agents work with no changes to the runner.

### What's missing

1. **Path resolution bug**: paths resolve against `process.cwd()` instead of `resolved.targetPath`
2. **Error handling**: if a custom agent path doesn't exist, `readFile()` in `runAgent()` throws with a raw error. Need a clear message: `"Custom agent not found: [path]. Check customAgents in your config."`
3. **Stage assignment**: custom agents are appended to the end of `allAgentPaths`, which means they run in Stage 1 (since `stage1Paths = allAgentPaths.slice(0, 3)` takes only the first 3). If `allAgentPaths` has more than 4 elements, the 4th index used for the impact ranker (`allAgentPaths[3]`) is still position 3 — this is actually correct because custom agents are added after the 4 built-ins. But the Stage 1 / Stage 2 split uses hardcoded slice indices:

```typescript
const stage1Paths = allAgentPaths.slice(0, 3); // hardcoded to first 3
const stage2Path = allAgentPaths[3];             // hardcoded to 4th
```

With custom agents, `allAgentPaths` becomes `[dm, ts, sa, ir, custom1, custom2, ...]`. The slices still correctly grab the 3 Stage 1 built-ins and the impact ranker. Custom agents at indices 4+ are silently ignored in the pipeline.

**Decision needed**: should custom agents run alongside Stage 1 (in parallel), or as an additional Stage 3? The spec says "custom agents loaded from `customAgents` config field" without specifying pipeline position. The most natural interpretation is that they run in Stage 1 (alongside the three built-in Stage 1 agents).

**Fix**: Change `stage1Paths` to include custom agents:
```typescript
const stage1Paths = allAgentPaths.slice(0, allAgentPaths.length - 1); // all except last (impact ranker)
const stage2Path = allAgentPaths[allAgentPaths.length - 1];            // impact ranker is always last built-in
```

But this assumes impact ranker is always the LAST built-in agent. A more robust approach:
- Keep the 4 built-in paths as `getBuiltInAgentPaths()` (impact ranker is always index 3)
- Custom agents run separately after Stage 1 but before Stage 2, or in parallel with Stage 1
- Pass custom agent results along with `stage1Outputs` to the impact ranker

For Phase 7, the simplest correct approach: run custom agents in parallel with Stage 1, include their results in `stage1Outputs` for the impact ranker.

---

## 5. How `--watch` Mode Should Detect File Changes

### Spec requirement (REQ-19)
> "`--watch` mode re-analyzes on file changes"

### Options

**`fs.watch` (Node.js built-in)**
- Available with zero new dependencies
- Limitations: does not reliably detect file additions/deletions on all platforms; macOS uses `kqueue` under the hood (works but with edge cases); recursive watching requires `{ recursive: true }` flag (added in Node.js 19.1)
- Since `package.json` `@types/node` is `^25.3.0`, this is Node.js v22+ territory where `fs.watch` is reliable

**`fs.watchFile` (Node.js built-in)**
- Uses polling — reliable but CPU-intensive for large file trees
- Not appropriate for watching entire directories

**`chokidar` (npm package)**
- The industry standard for file watching in Node.js CLIs
- Handles all edge cases (atomic writes, symlinks, platform differences)
- Currently NOT installed in `package.json`
- Adding it requires `npm install chokidar`; chokidar v4+ is pure ESM

**Recommendation: `fs.watch` with `{ recursive: true }`**

Given Node.js v22+ (implied by `@types/node: ^25.3.0`), `fs.watch` with `recursive: true` is reliable enough for watch mode. This avoids adding a dependency.

```typescript
import { watch } from 'node:fs';

const watcher = watch(resolved.targetPath, { recursive: true }, (eventType, filename) => {
  if (filename && !isIgnored(filename, resolved.ignore)) {
    // Debounce: wait 500ms after last event before re-analyzing
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      console.log(`\nFile changed: ${filename}. Re-analyzing...`);
      void analyzeCommand(path, options);
    }, 500);
  }
});
```

**Debouncing is essential**: editors write files in rapid succession (save, linting auto-fix, etc.). Without debounce, watch mode would fire 5-10 analyses per save. A 500ms debounce is the standard.

**Ignore pattern integration**: the file change handler must filter changes using the same `resolved.ignore` patterns. Otherwise, cache file writes in `.code-teacher-cache/` would trigger an infinite re-analysis loop.

### Where to add `--watch`

The `--watch` flag needs to be added to the `analyze` command in `cli/index.ts`:

```typescript
.option('--watch', 'watch for file changes and re-analyze automatically')
```

And in `AnalyzeOptions` in `analyze.ts`:
```typescript
watch?: true;
```

The watch loop logic can live in a helper in `analyze.ts` or in a dedicated `cli/commands/watch.ts`. Since it wraps `analyzeCommand`, it makes sense to keep it in `analyze.ts` or call it from there.

---

## 6. User-Friendly Error Messages — Complete Inventory

### From the spec's error handling table

| Error condition | Required message |
|---|---|
| Missing API key | `"No LLM API key detected. Set ANTHROPIC_API_KEY, OPENAI_API_KEY, or use --provider to configure."` |
| Rate limit hit | (handled by backoff) + `"Rate limit hit. Retrying in Xs..."` per retry |
| LLM timeout | `"Request timed out. Retrying..."` |
| Malformed LLM response | (existing): `"Warning: Agent '...' returned malformed JSON after 1 retry. Returning empty result."` |
| File too large | (existing): `"Warning: Skipping [path] ([size] bytes exceeds maxFileSize of [limit] bytes)"` |
| No files found | `"No analyzable files found. Check your ignore patterns."` |
| Invalid config | `"Invalid config: [N] error(s) found\n  - [error 1]\n  - [error 2]"` |
| Config file unreadable | `"Failed to read config file: [path]\n  [OS error message]"` |
| Config JSON invalid | `"Invalid JSON in config file: [path]\n  Config file must contain valid JSON"` |
| Unsupported file type | Skip silently (binary) or warn (known but unanalyzable) |
| Unknown provider | `"Unknown provider '[name]'. Supported providers: anthropic, openai, google."` |
| Provider key missing | `"Provider '[name]' selected but [ENV_VAR] is not set."` |
| Unreadable target directory | `"Cannot read directory: [path]. Check that the path exists and is accessible."` |
| Custom agent not found | `"Custom agent not found: [path]. Check customAgents in your config."` |

### How to surface these without stack traces

Wrap the top-level `analyzeCommand` in `cli/index.ts` with a global error handler:

```typescript
.action(async (path: string, options: AnalyzeOptions) => {
  try {
    await analyzeCommand(path, options);
  } catch (err) {
    if (err instanceof ConfigValidationError) {
      console.error('Config error: ' + err.message);
      for (const e of err.errors) console.error('  - ' + e);
    } else if (err instanceof ProviderDetectionError) {
      console.error(err.message);
    } else if (err instanceof Error) {
      console.error('Error: ' + err.message);
    } else {
      console.error('An unexpected error occurred.');
    }
    process.exitCode = 1;
  }
});
```

This is the key architectural change: the action handler catches typed errors and formats them; untyped errors get a simple message without the stack trace.

Additionally, `analyzeCommand` itself should wrap its I/O operations with `try/catch` and throw typed errors (or handle inline):
- `discoverFiles()` failure → catch and rethrow with message
- File read failure during chunking → skip file with `console.warn` (not abort)
- `runAgent()` failure → handled by backoff + fallback to `{}`

---

## 7. Real-World Testing Requirements

### Spec requirement (REQ-20)
> "Successfully tested against 10+ open-source repos of varying sizes and languages"

### What this means in practice (Plan 07-03)

The spec says "validated against real repos" — this is a manual/semi-automated QA step, not unit tests. The testing strategy:

1. **Fixture projects** (for automated tests): small, self-contained projects in `test/fixtures/` for at least 3 languages (TypeScript, Python, Go) — these are checked in to the repo
2. **Real-world repos** (for manual QA): 10+ GitHub repos run through the CLI and output verified

### 10+ real-world repos to test against

Suggested selection covering size and language diversity:

| Repo | Language | Size | Focus |
|---|---|---|---|
| `expressjs/express` | JavaScript | ~200 files | Node.js HTTP framework |
| `flask` | Python | ~100 files | Python web framework |
| `gin-gonic/gin` | Go | ~150 files | Go web framework |
| `facebook/react` | JavaScript | ~2000 files | Large JS project |
| `fastapi/fastapi` | Python | ~100 files | Modern Python web |
| `tokio-rs/tokio` | Rust | ~500 files | Async Rust runtime |
| `lodash/lodash` | JavaScript | ~700 files | Utility library |
| `pallets/click` | Python | ~50 files | Python CLI framework |
| `alexflint/go-arg` | Go | ~20 files | Small Go CLI library |
| `tj/commander.js` | JavaScript | ~15 files | Very small JS CLI library |
| `chalk/chalk` | TypeScript | ~10 files | Tiny TS project |

This mix covers: small (~10-50 files), medium (~100-200 files), large (~500+ files); TypeScript, JavaScript, Python, Go, Rust.

### What "successfully tested" means

The spec does not define a quantitative pass/fail for real-world testing. The implied acceptance criteria:
1. Analysis completes without crashing (no unhandled exceptions)
2. Output renders correctly in all 3 modes (`default`, `--verbose`, `--json`)
3. Cache works: second run is fast (cache hit)
4. Results look qualitatively reasonable (sections scored high are actually important)

### Performance considerations for large repos

For repos with 500+ files:
- Stage 1 agents run in parallel, but each agent processes ALL files in a single context window. The context builder (`context.ts`) already handles truncation (full → summarized → name-only), so large repos are handled by the context priority system.
- The `--file` flag lets users scope analysis to a single file — this is already implemented and works for targeted use on large repos.
- Watch mode on large repos should only re-analyze changed files (scope the re-analysis to the changed file's path, pass it as `--file` equivalent)

---

## 8. Requirements Mapping

| Requirement | What it requires | How to implement |
|---|---|---|
| REQ-14 | Error handling: rate limits, timeouts, malformed responses | `core/retry.ts` `withRetry()`, wrap `provider.call()` in `runAgent()` |
| REQ-17 | Clear error messages for missing keys, invalid configs, unreadable files | Top-level try/catch in CLI action handler; typed error classes |
| REQ-18 | `code-teacher init` creates starter config | New `cli/commands/init.ts` + `init` command in `cli/index.ts` |
| REQ-19 | Custom agents loaded from `customAgents` config field | Fix path resolution bug in `analyze.ts`; add error for missing custom agent |
| REQ-20 (implied) | `--watch` mode re-analyzes on file changes | `fs.watch()` with debounce in `analyze.ts`; `--watch` flag in `cli/index.ts` |

Note: REQ-20 label is used in the ROADMAP for "Successfully tested against 10+ repos" — watch mode aligns with the spec's Phase 4 "Add `--watch` mode" description. The ROADMAP success criteria lists both. Plan 07-03 handles the real-world testing.

---

## 9. Plan Split Decision

The ROADMAP specifies 3 plans for Phase 7:
- `07-01`: Error handling — API error recovery, exponential backoff, timeout handling, user-friendly messages
- `07-02`: Init command, custom agent loading from config, and --watch mode with file change detection
- `07-03`: Real-world testing against 10+ open-source repos, performance optimization, README and package.json for publishing

This split is clean:
- Plan 07-01 is self-contained: `core/retry.ts` (new), updates to `runAgent()` in `agents/runner.ts`, top-level error handler in `cli/index.ts`
- Plan 07-02 is self-contained: `cli/commands/init.ts` (new), `cli/index.ts` updates, `analyze.ts` watch mode + path resolution fix
- Plan 07-03 is QA + docs: README.md, package.json publishing fields, run against real repos

---

## 10. Files to Create and Modify

### New files

| File | Purpose |
|---|---|
| `core/retry.ts` | `withRetry()` utility, `isRetryableError()`, `sleep()` |
| `cli/commands/init.ts` | `initCommand()` handler for `code-teacher init` |
| `README.md` | Installation, usage, config reference, examples |

### Files to modify

| File | What changes |
|---|---|
| `agents/runner.ts` | Wrap `provider.call()` with `withRetry()`; wrap `readFile(agentPath)` in try/catch; add import of `withRetry` |
| `cli/index.ts` | Add top-level try/catch in `analyze` action handler; add `init` command; add `--watch` flag to `analyze` |
| `cli/commands/analyze.ts` | Fix custom agent path resolution to use `resolved.targetPath`; add watch mode loop; wrap I/O in try/catch for better errors |
| `package.json` | Add `--watch` to usage description; update version to 1.0.0; add `prepublishOnly` script; confirm `files` array; add `engines` field for Node.js version |

### Files that need NO changes

| File | Reason |
|---|---|
| `providers/anthropic.ts` | SDK errors surface naturally; `withRetry` handles them at the `runAgent` level |
| `providers/openai.ts` | Same |
| `providers/google.ts` | Same |
| `config/schema.ts` | Already throws well-structured `ConfigValidationError` |
| `config/defaults.ts` | No changes needed |
| `core/cache.ts` | Already handles errors gracefully (best-effort) |
| `cli/output/formatter.ts` | Phase 6 complete |
| `cli/output/renderer.ts` | Phase 6 complete |
| `core/file-discovery.ts` | May need minor: wrap individual file reads in try/catch to skip unreadable files instead of aborting |

---

## 11. Key Gotchas and Non-Obvious Facts

1. **`runAgent()` comment says "Phase 7"**: Line 262 of `runner.ts` has `// Phase 7 will add harder error recovery`. This is the anchor point for the backoff work.

2. **The 4 built-in agents are hardcoded at indices 0-3** in `analyze.ts` (`slice(0, 3)` and `[3]`). Adding custom agents to `allAgentPaths` means custom agents at index 4+ are silently dropped from the pipeline. Fix: use named agent resolution instead of array indices.

3. **`path.resolve(p)` in `analyze.ts` resolves against `process.cwd()`** not the project path. This means if a user runs `code-teacher analyze ./my-project` from `/home/user`, a config `customAgents: ["./my-agents/foo.md"]` resolves to `/home/user/my-agents/foo.md` instead of `/home/user/my-project/my-agents/foo.md`. Fix: `resolve(resolved.targetPath, p)`.

4. **`fs.watch` with `recursive: true` is supported from Node.js 19.1** on all platforms. The project targets Node.js v22+ (implied by `@types/node: ^25.3.0`), so this is safe.

5. **Watch mode infinite loop risk**: `.code-teacher-cache/` directory writes trigger `fs.watch` events. The watch callback must filter these out using the ignore patterns, or the tool will loop endlessly after each analysis.

6. **`init` command should not overwrite by default**: writing to `code-teacher.config.json` without warning would destroy a user's existing configuration. Always check for existence first and require `--force` to overwrite.

7. **`package.json` `"type": "module"`** means the project is ESM. `core/retry.ts` needs the `.js` extension in its import path when importing from TypeScript files (TypeScript ESM convention). The existing files all use `.js` extension in imports already — follow the same pattern.

8. **`process.exitCode = 1`** (not `process.exit(1)`) is the correct way to signal failure in a commander action handler. `process.exit(1)` would kill the process before any pending cleanup; `process.exitCode = 1` lets the event loop drain naturally. The existing `program.on('command:*')` handler already uses `process.exitCode = 1` — follow this convention.

9. **Retry on 429 vs. retry on JSON parse failure** are independent concerns. The spec's "exponential backoff" (1s, 2s, 4s) applies to API errors. The existing JSON parse retry (STRICT_JSON_SUFFIX) applies to malformed responses. These should compose cleanly: `withRetry(() => provider.call())` handles API failures; the outer JSON retry in `runAgent()` handles parse failures.

10. **`--watch` flag type**: like `--verbose` and `--json`, `--watch` should be typed as `watch?: true` in `AnalyzeOptions` (not `boolean`) to follow the existing pattern where commander sets `true` when present and `undefined` when absent.

11. **`README.md` does not exist yet**: the project root has no README. Plan 07-03 must create it. The spec says "Write README.md with installation, usage, configuration, and examples." This is the last deliverable of the entire project.
