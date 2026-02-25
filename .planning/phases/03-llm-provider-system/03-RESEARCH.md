---
phase: 03-llm-provider-system
type: research
date: 2026-02-25
---

# Phase 3 Research: LLM Provider System

## What Phase 3 Must Deliver

Phase 3 implements the provider abstraction layer: a unified `LLMProvider` interface that wraps all three SDKs (Anthropic, OpenAI, Google), detection logic that finds the right provider from environment variables, and a factory that wires it all together. Phase 3 has two plans:

- **03-01**: `LLMProvider` interface, `ProviderFactory` with detection logic, env var scanning, error handling
- **03-02**: Concrete provider implementations — `AnthropicProvider`, `OpenAIProvider`, `GoogleProvider`

Success criteria from the roadmap:
1. Auto-detection scans env vars: `ANTHROPIC_API_KEY` → `OPENAI_API_KEY` → `GOOGLE_API_KEY`
2. `--provider` and `--model` flags override auto-detection
3. `CODE_TEACHER_PROVIDER` and `CODE_TEACHER_MODEL` env vars override auto-detection
4. Startup prints: `Using Anthropic (claude-sonnet-4-6) — detected from ANTHROPIC_API_KEY`
5. Clear error when no API key found

---

## 1. Current Codebase State (Post-Phase 1)

### What Already Exists

The Phase 1 CLI already implements detection logic inline in `cli/commands/analyze.ts`. Phase 3 needs to extract this into a proper, reusable module that the agent runner (Phase 4) and future code can call.

**Key files from Phase 1:**

`cli/commands/analyze.ts` — Contains:
- `autoDetectProvider()` function — scans env vars in spec order, returns `{ provider, model, source }`
- `detectProviderSource()` function — returns human-readable source string for startup message
- `providerDefaults` map — `{ anthropic: 'claude-sonnet-4-20250514', openai: 'gpt-4o', google: 'gemini-pro' }`
- `mergeConfig()` — resolution order: CLI flag > config file > env auto-detection > hardcoded defaults

**What Phase 3 must do differently:**
- The existing detection logic in `analyze.ts` only determines *which* provider to use; it does not actually instantiate any SDK
- Phase 3 creates the actual provider objects that can make LLM calls
- The startup message is already printed in `analyze.ts`; Phase 3 should leave that logic in place and simply return a provider instance ready to call
- Provider defaults in `analyze.ts` need to be updated (see Section 4 — model names have changed)

### File Layout After Phase 1

```
cli/
  index.ts                  # Commander entry point
  commands/
    analyze.ts              # Detection logic + config merge (already done)
    teachings.ts            # Delegates to analyze
    sections.ts             # Delegates to analyze
  output/
    formatter.ts            # Stub
    renderer.ts             # Stub
config/
  defaults.ts               # Config interface + defaults
  schema.ts                 # loadConfig, validateConfig
core/
  file-discovery.ts         # Stub
  chunker.ts                # Stub
  dependency-graph.ts       # Stub
  cache.ts                  # Stub
agents/
  definitions/              # (empty — agent .md files go here)
  runner.ts                 # Stub
  context.ts                # Stub
```

### tsconfig.json Notes

- `"module": "Node16"` and `"moduleResolution": "Node16"` — requires `.js` extensions on imports
- `"type": "module"` in `package.json` — all files are ES modules
- `"strict": true` — no implicit `any`, strict null checks

All import paths use `.js` extensions at the import site even though source files are `.ts`. This is Node16 ESM convention. Example from existing code: `import { loadConfig } from '../../config/schema.js'`

---

## 2. Spec-Exact Interface Requirements

From `code-teacher_spec.md`, these interfaces must be implemented exactly:

```typescript
interface LLMProvider {
  name: string;
  call(systemPrompt: string, userPrompt: string, options?: CallOptions): Promise<LLMResponse>;
}

interface CallOptions {
  maxTokens?: number;
  temperature?: number;       // Default: 0.2 for analytical consistency
  responseFormat?: "json";    // Force JSON output where supported
}

interface LLMResponse {
  content: string;
  usage: { inputTokens: number; outputTokens: number };
  model: string;
}
```

Key points:
- `LLMProvider.name` — lowercase provider name: `"anthropic"`, `"openai"`, `"google"`
- `call()` separates system prompt and user prompt as distinct arguments — all three SDKs support this natively
- `temperature` defaults to `0.2` — spec says "analytical consistency"
- `responseFormat?: "json"` — optional; implementations should enable each SDK's JSON mode when this is set
- `LLMResponse.usage` uses camelCase `inputTokens`/`outputTokens`, not the SDK field names (which vary per provider)
- `LLMResponse.model` — the actual model string used in the call

Detection flow from spec (verbatim):
1. `--provider` flag set? → Use that provider
2. `CODE_TEACHER_PROVIDER` env set? → Use that provider
3. Scan environment: `ANTHROPIC_API_KEY` → `OPENAI_API_KEY` → `GOOGLE_API_KEY`
4. Error if none found

---

## 3. Where Provider Files Should Live

The spec's architecture diagram shows no explicit `providers/` directory. The spec file layout is:

```
code-teacher/
├── cli/
├── agents/
├── core/
├── config/
```

There is no `providers/` folder in the spec layout. The closest home is either alongside `core/` or alongside `agents/`. Based on the existing scaffold and that providers are a cross-cutting concern (used by agents/runner, not a core file operation), the recommended location is a new top-level `providers/` directory that sits parallel to `cli/`, `core/`, `config/`, and `agents/`.

**Proposed file structure for Phase 3:**

```
providers/
  index.ts          # LLMProvider interface, CallOptions, LLMResponse, ProviderFactory
  anthropic.ts      # AnthropicProvider implementing LLMProvider
  openai.ts         # OpenAIProvider implementing LLMProvider
  google.ts         # GoogleProvider implementing LLMProvider
```

The `tsconfig.json` `include` field currently covers `cli/**/*.ts`, `agents/**/*.ts`, `core/**/*.ts`, `config/**/*.ts`. A new `providers/**/*.ts` glob must be added.

---

## 4. SDK Research: Anthropic

### Package

```
npm install @anthropic-ai/sdk
```

Current version: **0.78.0** (as of Feb 2026)

### Default Model

The spec currently has `claude-sonnet-4-20250514` as the Anthropic default (written in `analyze.ts`). However, the correct latest Anthropic models as of February 2026 are:

| Model | API ID | Notes |
|-------|--------|-------|
| Claude Sonnet 4.6 | `claude-sonnet-4-6` | Latest sonnet, recommended for speed + intelligence |
| Claude Opus 4.6 | `claude-opus-4-6` | Most capable, higher cost |
| Claude Haiku 4.5 | `claude-haiku-4-5-20251001` | Fastest, cheapest |
| Claude Sonnet 4 (legacy) | `claude-sonnet-4-20250514` | Still available |

**Recommendation for default**: `claude-sonnet-4-6` — the current latest Sonnet model, balances speed and intelligence at same price as the older snapshot. The plan must update the `providerDefaults` in `analyze.ts` from `claude-sonnet-4-20250514` to `claude-sonnet-4-6`.

### TypeScript API

```typescript
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const message = await client.messages.create({
  model: 'claude-sonnet-4-6',
  max_tokens: 8096,
  temperature: 0.2,
  system: 'You are a code analysis assistant.',
  messages: [
    { role: 'user', content: 'Analyze this code...' }
  ],
});

// Extract content
const content = message.content[0].type === 'text' ? message.content[0].text : '';
// Token usage
const inputTokens = message.usage.input_tokens;
const outputTokens = message.usage.output_tokens;
// Model used
const model = message.model;
```

### JSON Mode

Anthropic does not have a simple `response_format: { type: "json_object" }` parameter like OpenAI. Options:

1. **Prompt engineering** (simplest, works with all models): Include `"Respond only with valid JSON"` in the system prompt. This is what Phase 3 should use for `responseFormat: "json"`.

2. **Structured Outputs beta** (as of Nov 2025): Available via `client.beta.messages.create()` with header `anthropic-beta: structured-outputs-2025-11-13`. Currently works with Claude Sonnet 4.5 and Opus 4.1 only, not Sonnet 4.6 yet. **Do not use this for Phase 3** — too brittle, not universally available.

**Phase 3 approach for Anthropic JSON mode**: When `responseFormat === "json"`, append to the system prompt: `"\n\nIMPORTANT: Respond ONLY with valid JSON. No explanation, no markdown fences, no text before or after the JSON."` This matches the error handling strategy in the spec (retry with stricter JSON prompt) and works with all Claude models.

### Response Type Mapping to LLMResponse

```typescript
// message.content is ContentBlock[] — filter for text blocks
const text = message.content
  .filter(b => b.type === 'text')
  .map(b => b.text)
  .join('');

const llmResponse: LLMResponse = {
  content: text,
  usage: {
    inputTokens: message.usage.input_tokens,
    outputTokens: message.usage.output_tokens,
  },
  model: message.model,
};
```

---

## 5. SDK Research: OpenAI

### Package

```
npm install openai
```

Current version: **6.25.0** (as of Feb 2026)

### Default Model

| Model | API ID | Status |
|-------|--------|--------|
| gpt-4o | `gpt-4o` | Still available in API (retired from ChatGPT UI Feb 13 2026, API unchanged) |
| gpt-4o-mini | `gpt-4o-mini` | Still available |
| GPT-5.2 variants | `gpt-5.2` family | New, ChatGPT default |

**Recommendation for default**: Keep `gpt-4o` — it remains available in the API and is the well-known standard. GPT-5 model IDs are not yet clearly documented for the API. The plan should keep `gpt-4o` as the OpenAI default since it's the established, reliably-available model.

### TypeScript API

```typescript
import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const completion = await client.chat.completions.create({
  model: 'gpt-4o',
  messages: [
    { role: 'system', content: 'You are a code analysis assistant.' },
    { role: 'user', content: 'Analyze this code...' }
  ],
  temperature: 0.2,
  max_tokens: 8096,
  // For JSON mode:
  response_format: { type: 'json_object' },
});

// Extract content
const content = completion.choices[0].message.content ?? '';
// Token usage
const inputTokens = completion.usage?.prompt_tokens ?? 0;
const outputTokens = completion.usage?.completion_tokens ?? 0;
// Model used
const model = completion.model;
```

### JSON Mode

OpenAI has native JSON mode via `response_format: { type: 'json_object' }`. This guarantees the response is valid JSON but does not enforce a schema. When `responseFormat === "json"`, set this parameter. Note: JSON mode requires that the word "json" appears somewhere in the messages (system or user prompt) — add a reminder to the system prompt when enabling.

**Phase 3 approach for OpenAI JSON mode**: When `responseFormat === "json"`:
1. Set `response_format: { type: 'json_object' }` in the API call
2. Append to system prompt: `"\n\nRespond with valid JSON only."`

### Response Type Mapping to LLMResponse

```typescript
const llmResponse: LLMResponse = {
  content: completion.choices[0].message.content ?? '',
  usage: {
    inputTokens: completion.usage?.prompt_tokens ?? 0,
    outputTokens: completion.usage?.completion_tokens ?? 0,
  },
  model: completion.model,
};
```

---

## 6. SDK Research: Google

### Package

```
npm install @google/genai
```

Current version: **1.42.0** (as of Feb 2026)

**Important**: The old `@google/generative-ai` package is deprecated and sunset November 30, 2025. The new package is `@google/genai`. Do not use the old package.

### Default Model

| Model | API ID | Status |
|-------|--------|--------|
| Gemini 2.5 Flash | `gemini-2.5-flash` | Current recommended, GA |
| Gemini 2.0 Flash | `gemini-2.0-flash` | Available, GA |
| Gemini 3 Flash Preview | `gemini-3-flash-preview` | Preview only |

**Recommendation for default**: `gemini-2.0-flash` — stable GA model, not a preview. `gemini-2.5-flash` is also GA and preferable for quality; either works. Update `analyze.ts` from `gemini-pro` (old deprecated model) to `gemini-2.0-flash`.

### TypeScript API

```typescript
import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });

const response = await ai.models.generateContent({
  model: 'gemini-2.0-flash',
  contents: 'Analyze this code...',   // user prompt
  config: {
    systemInstruction: 'You are a code analysis assistant.',
    temperature: 0.2,
    maxOutputTokens: 8096,
    responseMimeType: 'application/json',  // for JSON mode
  },
});

// Extract content
const content = response.text ?? '';
// Token usage
const inputTokens = response.usageMetadata?.promptTokenCount ?? 0;
const outputTokens = response.usageMetadata?.candidatesTokenCount ?? 0;
// Model used — response does not include model, must track from request
const model = 'gemini-2.0-flash';
```

### Key Differences from Other SDKs

1. **No `system` top-level parameter** — system instructions go inside `config.systemInstruction`
2. **User prompt as `contents`** — a string (or array of Parts for multimodal), not a messages array
3. **Config is flat** — `temperature`, `maxOutputTokens`, `responseMimeType`, `systemInstruction` all go directly in `config: { ... }`, not inside a nested `generationConfig`
4. **JSON mode via `responseMimeType`** — set `config.responseMimeType = 'application/json'` for JSON output
5. **Response model not returned** — the response object does not include the model name used; must track it from the request parameters
6. **Token field names differ** — `usageMetadata.promptTokenCount` (input) and `usageMetadata.candidatesTokenCount` (output)

### Response Type Mapping to LLMResponse

```typescript
const llmResponse: LLMResponse = {
  content: response.text ?? '',
  usage: {
    inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
    outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
  },
  model: modelName,  // must pass through from constructor/call params
};
```

---

## 7. Detection Logic Design

The detection logic already exists in `analyze.ts` as `autoDetectProvider()`. Phase 3 needs to:

1. Move the detection logic into `providers/index.ts` as a standalone exported function
2. Create a `createProvider(resolvedConfig: ResolvedConfig): LLMProvider` factory function
3. The factory validates that an API key exists for the selected provider and throws a clear error if not

**Detection order** (from spec, already implemented correctly in analyze.ts):

```
1. options.provider (CLI --provider flag)
   ↓ if not set
2. CODE_TEACHER_PROVIDER env var
   ↓ if not set
3. ANTHROPIC_API_KEY → "anthropic"
   ↓ if not set
4. OPENAI_API_KEY → "openai"
   ↓ if not set
5. GOOGLE_API_KEY → "google"
   ↓ if none found
6. Throw error: "No LLM API key detected. Set ANTHROPIC_API_KEY, OPENAI_API_KEY, GOOGLE_API_KEY, or use --provider to configure."
```

**Key validation in factory**: After detecting `provider = "anthropic"`, the factory must verify `ANTHROPIC_API_KEY` is actually set. If the user passes `--provider anthropic` but has no key, the factory should fail with a clear message: `"Provider 'anthropic' selected but ANTHROPIC_API_KEY is not set."`.

**Model handling**: When `CODE_TEACHER_MODEL` is set alongside `CODE_TEACHER_PROVIDER`, use that model. When only `CODE_TEACHER_PROVIDER` is set with no model, use the provider's default model.

---

## 8. Error Handling Requirements

From the spec's error handling table:

| Error | Handling |
|-------|---------|
| Missing API key | `"No LLM API key detected. Set ANTHROPIC_API_KEY, OPENAI_API_KEY, or use --provider to configure."` |
| Provider specified but no key | `"Provider 'X' selected but X_API_KEY is not set."` |

Phase 3 implements only the constructor-time / factory-time errors (no key found). Runtime API errors (rate limits, timeouts, malformed responses) are specified for Phase 7 (REQ-14). Phase 3 provider implementations should throw raw errors — the retry/backoff layer comes later.

However, Phase 3 implementations should be structured so retries can be added cleanly in Phase 7. This means the `call()` method on each provider should not swallow errors — it should let them propagate so the caller (agent runner in Phase 4) can handle them.

---

## 9. Model Default Updates Needed

The existing `analyze.ts` has outdated model defaults that must be updated in Phase 3 (or in a dedicated sub-task):

```typescript
// CURRENT (outdated):
const providerDefaults: Record<string, string> = {
  anthropic: 'claude-sonnet-4-20250514',
  openai: 'gpt-4o',
  google: 'gemini-pro',
};

// CORRECT (as of Feb 2026):
const providerDefaults: Record<string, string> = {
  anthropic: 'claude-sonnet-4-6',
  openai: 'gpt-4o',
  google: 'gemini-2.0-flash',
};
```

The `providers/index.ts` file should define the canonical `providerDefaults` map. The `analyze.ts` file should import from `providers/index.ts` rather than maintaining its own copy. This is the right time to consolidate.

---

## 10. Integration Points with Other Phases

**Phase 3 → Phase 4 (Agent Framework)**:
- Phase 4's `agents/runner.ts` will import and call `createProvider()` to get an `LLMProvider` instance
- The `LLMProvider.call(systemPrompt, userPrompt, options)` signature must be stable
- `options.responseFormat = "json"` will be used by the agent runner for all agent calls
- `options.maxTokens` will be set based on model context limits (Phase 4 concern)

**Phase 3 → Phase 1 (Back-compat)**:
- `analyze.ts` currently calls `autoDetectProvider()` inline — after Phase 3, it should use the shared function from `providers/index.ts`
- The startup message (`Using Anthropic (model) — detected from source`) is printed in `analyze.ts` and should remain there; Phase 3 only provides the building blocks

**Phase 3 → tsconfig.json**:
- Must add `"providers/**/*.ts"` to the `include` array in `tsconfig.json`

---

## 11. Startup Message Format

The spec defines the exact startup message format:

```
Using Anthropic (claude-sonnet-4-6) — detected from ANTHROPIC_API_KEY
```

This is already implemented in `analyze.ts`. Phase 3 does not need to change it. The provider name should be capitalized in the display (Anthropic, OpenAI, Google) but lowercase as the `LLMProvider.name` field.

---

## 12. Package Installation Order

Both plans in Phase 3 require SDK packages to be installed:

```bash
npm install @anthropic-ai/sdk openai @google/genai
```

All three should be installed at the start of Phase 3 (03-01), even if 03-02 implements the concrete providers. This avoids a partial-install state between plans.

---

## 13. Key Risks and Open Questions

### Risk 1: Google API field name stability
The `@google/genai` SDK (v1.42.0) uses `config.systemInstruction` and `config.responseMimeType` at the top level of `config`. The older `@google/generative-ai` SDK used nested `generationConfig`. The new SDK's API stabilized at GA (May 2025). This should be stable, but the field names should be verified against the installed package's TypeScript types at implementation time.

### Risk 2: Anthropic JSON mode reliability
Without native JSON mode (no `response_format` parameter on standard messages), Anthropic JSON mode relies on prompt engineering. This is acceptable for Phase 3 but the plan should note that JSON parsing errors will need retry logic (Phase 7). Phase 3 should document clearly in code comments that the JSON enforcement is prompt-based.

### Risk 3: Google model name
`gemini-pro` (the current `analyze.ts` default) is a deprecated model name. `gemini-2.0-flash` is the correct GA model. The plan must update this.

### Risk 4: OpenAI usage field optionality
`completion.usage` is typed as optional (`CompletionUsage | undefined`) in the OpenAI SDK. Always use nullish coalescing: `completion.usage?.prompt_tokens ?? 0`. Same for `completion.choices[0]?.message.content ?? ''`.

### Open Question: Provider name capitalization in `LLMProvider.name`
The spec interface shows `name: string` but doesn't specify case. The startup message uses `"Anthropic"` (capitalized). The `LLMProvider.name` field should store the canonical lowercase name (`"anthropic"`, `"openai"`, `"google"`) to match the config/CLI values. The startup message formatting (capitalization) stays in `analyze.ts`.

---

## 14. Summary: What the Planner Needs to Know

### For Plan 03-01 (Interface + Detection + Factory)

1. Create `providers/index.ts` with:
   - `LLMProvider` interface (exact spec fields)
   - `CallOptions` interface (spec fields)
   - `LLMResponse` interface (spec fields, camelCase `inputTokens`/`outputTokens`)
   - `providerDefaults` map (updated model names)
   - `detectProvider(resolvedConfig)` function (extracted from `analyze.ts`)
   - `createProvider(resolvedConfig)` factory (instantiates correct concrete class)
   - `ProviderDetectionError` class (for missing key errors)

2. Update `tsconfig.json` to include `providers/**/*.ts`

3. Update `analyze.ts` to import `providerDefaults` from `providers/index.ts` instead of defining locally

4. Install all three SDK packages: `npm install @anthropic-ai/sdk openai @google/genai`

### For Plan 03-02 (Concrete Provider Implementations)

1. Create `providers/anthropic.ts` — wraps `@anthropic-ai/sdk`, handles content array, maps usage field names
2. Create `providers/openai.ts` — wraps `openai`, sets `response_format` for JSON mode, maps `prompt_tokens`/`completion_tokens`
3. Create `providers/google.ts` — wraps `@google/genai`, uses `config.systemInstruction`, maps `promptTokenCount`/`candidatesTokenCount`, tracks model name from constructor

### Sequencing note
03-01 can define stub/throw implementations for each provider and a working factory, then 03-02 fills in the real SDK calls. This means 03-01 is completable without any SDK installed (the factory can throw "not yet implemented"), but installing all SDKs at 03-01 time is cleaner.

---

## Sources

- [Anthropic TypeScript SDK (GitHub)](https://github.com/anthropics/anthropic-sdk-typescript)
- [Anthropic Models Overview (Feb 2026)](https://platform.claude.com/docs/en/about-claude/models/overview)
- [OpenAI Node SDK (GitHub)](https://github.com/openai/openai-node)
- [OpenAI Chat Completions Reference](https://platform.openai.com/docs/api-reference/chat)
- [Google GenAI SDK (GitHub)](https://github.com/googleapis/js-genai)
- [@google/genai npm](https://www.npmjs.com/package/@google/genai)
- [Gemini Text Generation Docs](https://ai.google.dev/gemini-api/docs/text-generation)
- [Gemini API Libraries](https://ai.google.dev/gemini-api/docs/libraries)
- [OpenAI Structured Outputs](https://platform.openai.com/docs/guides/structured-outputs)
