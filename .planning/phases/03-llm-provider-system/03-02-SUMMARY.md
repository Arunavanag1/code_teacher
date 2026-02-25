---
phase: 03-llm-provider-system
plan: 02
status: complete
subsystem: providers
started: 2026-02-25
completed: 2026-02-25
commits: [94f1c18, 51f901d, 301e747, 4af7629]
tags: [llm, providers, anthropic, openai, google, sdk, factory]
requires: [03-01]
provides: [providers/anthropic.ts, providers/openai.ts, providers/google.ts, createProvider real instances]
affects: [providers/index.ts]
tech-stack: [TypeScript, @anthropic-ai/sdk, openai, @google/genai]
key-files:
  - providers/anthropic.ts
  - providers/openai.ts
  - providers/google.ts
  - providers/index.ts
key-decisions:
  - Anthropic JSON mode uses prompt engineering (no native response_format on standard messages)
  - OpenAI JSON mode sets response_format: { type: 'json_object' } AND appends "Respond with valid JSON only." to system prompt
  - Google JSON mode uses config.responseMimeType = 'application/json' (native)
  - GoogleProvider tracks model from constructor since response object does not include model name
  - All providers default temperature to 0.2 per spec
  - createProvider() _model param renamed to model (unused param prefix no longer needed with real implementation)
patterns-established:
  - Each provider file imports LLMProvider/CallOptions/LLMResponse as import type to avoid runtime import
  - Each provider file imports from ./index.js (.js extension for Node16 ESM)
  - Errors propagate naturally (no catch) — retry logic is Phase 7
requirements-completed: [REQ-05]
duration: ~20 min
---

# Plan 03-02 Summary: SDK Provider Implementations

## What Was Built

Implemented all three concrete LLM provider classes (AnthropicProvider, OpenAIProvider, GoogleProvider), each implementing the LLMProvider interface, and wired them into the createProvider() factory. Each provider wraps its respective SDK, normalizes responses to the spec-exact LLMResponse shape, handles JSON mode per its SDK capabilities, and defaults temperature to 0.2. The factory now returns real, usable provider instances — Phase 4 (Agent Framework) can invoke LLM calls immediately.

## Performance

| Timestamp | Milestone |
|-----------|-----------|
| Start | Task 1: AnthropicProvider created and passing tsc |
| +5 min | Task 1 committed (94f1c18) |
| +10 min | Task 2: OpenAIProvider committed (51f901d) |
| +15 min | Task 3: GoogleProvider committed (301e747) |
| +20 min | Task 4: Factory wired, Prettier applied, all checks pass, committed (4af7629) |

## Accomplishments

- Created `providers/anthropic.ts` (47 lines): AnthropicProvider using @anthropic-ai/sdk, system as top-level param, prompt-based JSON mode, ContentBlock[] text extraction, input_tokens/output_tokens → camelCase
- Created `providers/openai.ts` (46 lines): OpenAIProvider using openai SDK, system+user as separate messages, native JSON mode via response_format + prompt reminder, prompt_tokens/completion_tokens → camelCase with nullish coalescing
- Created `providers/google.ts` (40 lines): GoogleProvider using @google/genai SDK, system via config.systemInstruction, native JSON mode via responseMimeType, promptTokenCount/candidatesTokenCount → camelCase, model from constructor
- Updated `providers/index.ts`: added imports for all three providers, replaced stub switch cases with real instantiation, removed _model prefix (now used)
- All checks pass: npm run build, npx tsc --noEmit, npx eslint ., npx prettier --check ., node dist/cli/index.js analyze .

## Task Commits

| Task | Commit | Message |
|------|--------|---------|
| Task 1: Implement AnthropicProvider | `94f1c18` | feat(03-02): implement AnthropicProvider |
| Task 2: Implement OpenAIProvider | `51f901d` | feat(03-02): implement OpenAIProvider |
| Task 3: Implement GoogleProvider | `301e747` | feat(03-02): implement GoogleProvider |
| Task 4: Wire concrete providers into factory | `4af7629` | feat(03-02): wire concrete providers into factory |

## Files Created

| File | Lines | Purpose |
|------|-------|---------|
| `providers/anthropic.ts` | 47 | AnthropicProvider: @anthropic-ai/sdk wrapper, prompt-based JSON mode |
| `providers/openai.ts` | 46 | OpenAIProvider: openai SDK wrapper, native JSON mode via response_format |
| `providers/google.ts` | 40 | GoogleProvider: @google/genai SDK wrapper, native JSON mode via responseMimeType |

## Files Modified

| File | Change |
|------|--------|
| `providers/index.ts` | Added imports for AnthropicProvider, OpenAIProvider, GoogleProvider; replaced stub switch cases with real instantiation; removed _model prefix from createProvider parameter |

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| Anthropic JSON mode via prompt engineering | No native response_format on standard messages.create(); structured outputs beta is too narrow (only specific models) and fragile for Phase 3 |
| OpenAI JSON mode requires "json" in messages | OpenAI API requirement when response_format: json_object is set — appending "\n\nRespond with valid JSON only." to system prompt satisfies this |
| Google model from constructor, not response | response object from @google/genai does not include a model field; constructor value is the authoritative source |
| import type for interfaces | Avoids runtime import of interface (erased by TypeScript) — cleaner ESM tree shaking |
| Errors propagate naturally (no catch) | Retry logic with backoff is Phase 7 (REQ-14); catching here would obscure errors and complicate later retry wrapping |

## Deviations from Plan

None. All tasks executed exactly as specified in 03-02-PLAN.md. Prettier formatting was applied as part of Task 4 (three provider files required formatting fixes), consistent with the plan's verification step.

## Final Verification Results

```
npm run build        → PASS (zero TypeScript errors)
npx tsc --noEmit     → PASS
npx eslint .         → PASS (zero warnings or errors)
npx prettier --check → PASS (all files formatted)
node dist/cli/index.js analyze .  → "No LLM provider detected..." (correct — no API keys in environment)
```

All three provider files exist and export their classes implementing LLMProvider.
providers/index.ts imports and instantiates all three concrete providers.

## Next Phase Readiness

Phase 4 (Agent Framework) can proceed immediately:
- LLMProvider interface is stable: call(systemPrompt, userPrompt, options?) → Promise<LLMResponse>
- createProvider(providerName, model) returns real, working provider instances
- All three SDK packages are installed and wired
- JSON mode (options.responseFormat = "json") works across all three providers
- Temperature defaults to 0.2 per spec for all providers
- Phase 3 is fully complete (both plans 03-01 and 03-02 done)
