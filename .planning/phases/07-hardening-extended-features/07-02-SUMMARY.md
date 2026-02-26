---
phase: 07-hardening-extended-features
plan: 02
subsystem: cli-features
tags: [init-command, custom-agents, watch-mode, file-watcher, cli]

# Dependency graph
requires:
  - phase: 06-terminal-output-caching
    provides: analyze.ts with full pipeline wiring
  - phase: 07-hardening-extended-features
    provides: error handling, retry, top-level CLI error handler (07-01)
provides:
  - cli/commands/init.ts init command creating starter code-teacher.config.json
  - Custom agent path resolution relative to project root and Stage 1 pipeline integration
  - --watch mode with fs.watch, 500ms debounce, ignore filtering, and cache directory exclusion
affects: [07-03]

# Tech tracking
tech-stack:
  added: []
  patterns: [fs-watch-recursive-debounce, custom-agent-pipeline-integration, init-command-pattern]

key-files:
  created:
    - cli/commands/init.ts
  modified:
    - cli/index.ts
    - cli/commands/analyze.ts

key-decisions:
  - "initCommand uses existsSync (not async) for quick pre-write check — simpler and sufficient"
  - "STARTER_CONFIG omits provider and model — auto-detection is the default, including them would confuse new users"
  - "Custom agent paths resolve relative to resolved.targetPath (project root), not process.cwd()"
  - "Custom agents run in Stage 1 alongside the 3 built-in agents; impact ranker always Stage 2"
  - "impactRankerPath uses variable reference instead of hardcoded index [3] for robustness"
  - "Watch mode uses fs.watch with { recursive: true } — safe because project targets Node.js 22+"
  - "500ms debounce prevents rapid-fire re-analysis from editor auto-save"
  - ".code-teacher-cache/ explicitly filtered in watch to prevent infinite loops"
  - "Re-analysis passes { ...options, watch: undefined } to prevent recursive watch setup"
  - "isRunning guard prevents concurrent analyses when changes happen faster than analysis completes"

patterns-established:
  - "Init command pattern: existsSync check + --force flag for config file creation"
  - "Watch mode pattern: fs.watch recursive + debounce + ignore filter + isRunning guard"
  - "Custom agent integration: resolve paths relative to project root, validate before execution, include in Stage 1"

requirements-completed: [REQ-18, REQ-19, REQ-20]

# Metrics
duration: 3min
completed: 2026-02-26
---

# Phase 7 Plan 02: Extended Features Summary

**Init command for starter config, custom agent loading with fixed path resolution and pipeline integration, and --watch mode with debounced file change detection**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-26T01:11:11Z
- **Completed:** 2026-02-26T01:14:23Z
- **Tasks:** 4
- **Files modified:** 3

## Accomplishments
- Created cli/commands/init.ts with initCommand that writes starter code-teacher.config.json with existence check, --force support, and field explanations
- Fixed custom agent path resolution to use project root instead of process.cwd(), and integrated custom agents into Stage 1 parallel execution
- Implemented --watch mode with fs.watch recursive, 500ms debounce, ignore pattern filtering, cache directory exclusion, and clean SIGINT shutdown
- Registered init command and --watch flag in cli/index.ts with consistent error handling

## Task Commits

Each task was committed atomically:

1. **Task 1: Create cli/commands/init.ts** - `8928aff` (feat)
2. **Task 2: Register init command and --watch flag** - `3ea7236` (feat)
3. **Task 3: Fix custom agent path resolution** - `b0d9bd8` (feat)
4. **Task 4: Implement --watch mode** - `29ccf52` (feat)

## Files Created/Modified
- `cli/commands/init.ts` - New: init command that creates starter config with existence check and --force (76 lines)
- `cli/index.ts` - Modified: init command registration, --watch flag on analyze, consistent error handling (90 lines)
- `cli/commands/analyze.ts` - Modified: fixed custom agent paths, pipeline integration, watch mode with debounce (377 lines)

## Decisions Made
- STARTER_CONFIG omits provider and model intentionally — auto-detection is the better default for new users
- Custom agent paths resolve relative to resolved.targetPath (not process.cwd()) — ensures paths work regardless of where CLI is invoked
- impactRankerPath uses variable reference instead of hardcoded allAgentPaths[3] — robust when custom agents change array length
- Watch mode uses 500ms debounce to handle editor auto-save patterns
- Re-analysis passes { ...options, watch: undefined } to prevent recursive watch handler setup
- Zero new npm dependencies

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Prettier formatting in init.ts**
- **Found during:** Task 4 (final verification)
- **Issue:** init.ts had Prettier formatting issues from initial creation
- **Fix:** Ran `npx prettier --write` on init.ts
- **Files modified:** cli/commands/init.ts
- **Verification:** `npx prettier --check .` passes
- **Committed in:** `29ccf52` (part of Task 4 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Minor formatting fix, no scope impact.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Ready for 07-03 (real-world testing against open-source repos, performance optimization, README)
- All CLI commands functional: analyze, init
- All extended features complete: custom agents, watch mode
- Error handling foundation from 07-01 composing cleanly with new features

---
*Phase: 07-hardening-extended-features*
*Completed: 2026-02-26*
