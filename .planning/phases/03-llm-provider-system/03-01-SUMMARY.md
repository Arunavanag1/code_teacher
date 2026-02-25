---
phase: 03-llm-provider-system
plan: 01
status: complete
subsystem: providers
started: 2026-02-25
completed: 2026-02-25
commits: [e1728f5, 0b8a077, 7d05ff6]
tags: [llm, providers, detection, factory, interfaces]
requires: [01-02]
provides: [providers/index.ts, LLMProvider interface, detectProvider, createProvider]
affects: [cli/commands/analyze.ts, tsconfig.json, package.json]
tech-stack: [TypeScript, @anthropic-ai/sdk, openai, @google/genai]
key-files:
  - providers/index.ts
  - cli/commands/analyze.ts
  - tsconfig.json
  - package.json
key-decisions:
  - detectProvider called once in analyzeCommand and result passed into mergeConfig (avoids double-detection)
  - providerDefaults map canonically lives in providers/index.ts and re-exported from analyze.ts
  - createProvider stubs throw "not yet implemented" errors; real implementations come in Plan 03-02
  - _model prefix on unused factory parameter satisfies ESLint no-unused-vars rule
patterns-established:
  - DetectedProvider.source field drives startup message (no separate detectProviderSource function needed)
  - CLI detection order: cliProvider > CODE_TEACHER_PROVIDER env > configProvider > API key auto-detect
requirements-completed: [REQ-05]
duration: ~20 min
---

# Plan 03-01 Summary: LLM Provider Interface, Detection Logic, and Factory

## What Was Built

Established the LLM provider abstraction layer: spec-exact interfaces (LLMProvider, CallOptions, LLMResponse), a canonical providerDefaults map with updated 2026 model names, detectProvider() extraction from analyze.ts into a reusable module, a createProvider() factory with API-key validation and stub implementations, and all three SDK packages installed. Refactored analyze.ts to import detection logic from the providers module.

## Performance

| Timestamp | Milestone |
|-----------|-----------|
| Start | Task 1: npm install + tsconfig update |
| +5 min | Task 1 committed (e1728f5) |
| +12 min | Task 2: providers/index.ts created and committed (0b8a077) |
| +20 min | Task 3: analyze.ts refactored, all checks pass, committed (7d05ff6) |

## Accomplishments

- Installed @anthropic-ai/sdk (0.78.0), openai (6.25.0), @google/genai (1.42.0)
- Added `providers/**/*.ts` to tsconfig include array
- Created `providers/index.ts` (221 lines) with all spec-exact exports
- Updated providerDefaults: `claude-sonnet-4-6`, `gpt-4o`, `gemini-2.0-flash`
- Implemented detectProvider() with correct spec detection order
- Implemented createProvider() with API-key validation and clear error messages
- Removed local providerDefaults, autoDetectProvider, and detectProviderSource from analyze.ts
- Unified detection into a single detectProvider() call in analyzeCommand, source passed through
- All checks pass: npm run build, npx tsc --noEmit, npx eslint ., npx prettier --check ., node dist/cli/index.js analyze .

## Task Commits

| Task | Commit | Message |
|------|--------|---------|
| Task 1: Install SDKs + tsconfig | `e1728f5` | chore(03-01): install LLM SDK packages and update tsconfig |
| Task 2: Create providers/index.ts | `0b8a077` | feat(03-01): create provider interface, detection logic, and factory |
| Task 3: Refactor analyze.ts | `7d05ff6` | refactor(03-01): extract provider logic from analyze.ts to providers module |

## Files Created

| File | Lines | Purpose |
|------|-------|---------|
| `providers/index.ts` | 221 | LLMProvider interface, CallOptions, LLMResponse, providerDefaults, ProviderDetectionError, DetectedProvider, detectProvider(), createProvider() |

## Files Modified

| File | Change |
|------|--------|
| `tsconfig.json` | Added `providers/**/*.ts` to include array; Prettier formatting applied |
| `package.json` | Added @anthropic-ai/sdk, openai, @google/genai to dependencies |
| `package-lock.json` | Updated with 77 new packages |
| `cli/commands/analyze.ts` | Removed local providerDefaults, autoDetectProvider, detectProviderSource; added imports from providers/index.js; updated mergeConfig signature; detectProvider called once in analyzeCommand |

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| Call detectProvider() once in analyzeCommand, pass result to mergeConfig | Avoids calling detection twice, makes source available for startup message without a separate function |
| providerDefaults re-exported from analyze.ts | Satisfies import requirement and avoids ESLint unused-import warning while keeping backward compatibility |
| _model prefix on unused createProvider parameter | ESLint no-unused-vars convention; model will be used by concrete implementations in 03-02 |
| gemini-2.0-flash as Google default | Stable GA model, replaces deprecated gemini-pro from Phase 1 |
| claude-sonnet-4-6 as Anthropic default | Current recommended Sonnet, replaces claude-sonnet-4-20250514 snapshot |

## Deviations from Plan

None. All tasks executed as specified. The plan's recommended approach of calling detectProvider() once in analyzeCommand and passing the result to mergeConfig was followed exactly.

## Exports from providers/index.ts

- `LLMProvider` (interface)
- `CallOptions` (interface)
- `LLMResponse` (interface)
- `providerDefaults` (Record<string, string>)
- `ProviderDetectionError` (class)
- `DetectedProvider` (interface)
- `detectProvider()` (function)
- `createProvider()` (function)

## Final Verification Results

```
npm run build        → PASS (zero TypeScript errors)
npx tsc --noEmit     → PASS
npx eslint .         → PASS (zero warnings or errors)
npx prettier --check → PASS (all files formatted)
node dist/cli/index.js analyze .                       → "No LLM provider detected..." (correct)
node dist/cli/index.js analyze . --provider anthropic  → "Using anthropic (claude-sonnet-4-6) — detected from CLI flag" (correct)
```

## Next Phase Readiness

Plan 03-02 can proceed immediately:
- providers/index.ts defines all interfaces and the factory skeleton
- createProvider() is ready to receive AnthropicProvider, OpenAIProvider, GoogleProvider implementations
- All three SDK packages are installed and available
- The LLMProvider interface is stable — Phase 4 (Agent Framework) can depend on it
