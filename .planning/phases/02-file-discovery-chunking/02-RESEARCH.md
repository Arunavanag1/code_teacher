# Phase 2 Research: File Discovery & Chunking

**Date:** 2026-02-25
**Phase:** 2 of 7
**Plans in this phase:** 2 (02-01: file-discovery.ts, 02-02: chunker.ts)

---

## What This Phase Delivers

Given a project path, produce:
1. A list of `FileInfo` objects representing every analyzable file (filtered, metadata-attached)
2. A function that splits any file's content into `Chunk` objects ready for LLM consumption

Both functions are already stubbed in Phase 1 with the exact interfaces they must satisfy.

---

## Existing Stubs (What We're Implementing)

**`core/file-discovery.ts`** — stub is:
```typescript
export interface FileInfo {
  path: string;       // absolute path
  extension: string;  // lowercase, e.g. ".ts", ".py"
  size: number;       // bytes
  lineCount: number;
}

export async function discoverFiles(
  _projectPath: string,
  _ignorePatterns: string[],
  _maxFileSize: number,
): Promise<FileInfo[]>
```

**`core/chunker.ts`** — stub is:
```typescript
export interface Chunk {
  filePath: string;
  startLine: number;   // 1-indexed, inclusive
  endLine: number;     // 1-indexed, inclusive
  chunkIndex: number;
  content: string;
}

export function chunkFile(_content: string, _filePath: string): Chunk[]
```

These exact signatures must be preserved — downstream phases (agent runner, context builder) will import them directly.

---

## Key Technical Findings

### 1. The `ignore` Package Must Be Added as a Production Dependency

**Status:** `ignore@7.0.5` is currently installed in `node_modules/` but only as a transitive dependency of `eslint` (a devDependency). It is NOT in `package.json` dependencies.

**Why this matters:** When the tool is installed via `npm install -g github:USERNAME/code-teacher`, only production dependencies are installed. The `ignore` package will not be present at runtime unless added to `dependencies`.

**Action required in 02-01:** `npm install ignore` before writing any code.

**Import pattern (verified working with `esModuleInterop: true` and `module: Node16`):**
```typescript
import ignore from 'ignore';
```
This compiles cleanly. The package ships its own `types: "index.d.ts"` so no `@types/ignore` is needed.

**Note:** The `ignore` package has no `exports` field in its `package.json`, so TypeScript with `moduleResolution: Node16` resolves it via the `types` field in package.json (works correctly with `esModuleInterop: true`).

### 2. Directory Walking: Use Node.js `fs/promises` Directly (No Extra Package)

No additional package is needed for directory traversal. The built-in `fs/promises` APIs are sufficient:
- `readdir(dir, { withFileTypes: true })` — returns `Dirent[]` with `.isDirectory()` and `.isFile()` methods
- `stat(path)` — for file size
- `readFile(path)` — for content and binary detection

A recursive walk function using these APIs is idiomatic, fast, and avoids adding dependencies.

### 3. The `ignore` Package: Critical Usage Rules

**Paths must be relative to the project root.** The `ignore` package operates on relative paths only. When walking, maintain `relPath` (relative from `projectPath`) and pass that to `ig.ignores()`.

**Key behavior verified:**
- `ig.ignores('node_modules')` → `true` (matches directory itself)
- `ig.ignores('node_modules/lodash/index.js')` → `true` (matches contents)
- `ig.ignores('src/app.min.js')` → `true` (glob `*.min.js` matches anywhere in tree)
- Patterns WITHOUT trailing slash (`node_modules`) match both the directory and its contents
- Patterns WITH trailing slash (`node_modules/`) match contents but NOT the bare directory entry — use patterns WITHOUT trailing slash for early directory pruning

**Loading `.gitignore`:** Read `<projectPath>/.gitignore` and pass content directly to `ig.add()`. The `ignore` package accepts the full file content (including comments and blank lines) as a string.

**Combining sources:** Call `ig.add()` multiple times — once for `.gitignore` content, once for the config ignore patterns array. They merge correctly.

```typescript
const ig = ignore();
ig.add(gitignoreContent);   // raw .gitignore file content
ig.add(ignorePatterns);     // string[] from config/defaults
```

### 4. Binary File Detection

**Strategy:** Null-byte scanning of the first 512 bytes of file content.

This is the industry-standard approach used by git itself. Any file containing a null byte (`\0`) in its first 512 bytes is treated as binary and silently skipped (no warning — the spec says "Skip silently (binary files)").

```typescript
function isBinary(buffer: Buffer): boolean {
  const sample = buffer.slice(0, Math.min(512, buffer.length));
  for (let i = 0; i < sample.length; i++) {
    if (sample[i] === 0) return true;
  }
  return false;
}
```

**Why not extension-only detection?** Extensions for known binary types (images, fonts) are already handled by the default ignore patterns in `config/defaults.ts`. The null-byte check catches everything else (compiled binaries, PDFs, database files, etc.) without requiring an exhaustive extension list.

**Order of operations:** Check ignore patterns first (cheap, avoids reading the file), then check size, then read file and check binary. This minimizes disk I/O.

### 5. Files-Too-Large Behavior: `console.warn` to stderr

The `discoverFiles` signature returns `Promise<FileInfo[]>` — there is no out-parameter for warnings. The spec says "skipped with a warning." Use `console.warn()` which writes to stderr, keeping stdout clean for actual results.

```typescript
console.warn(`Warning: Skipping ${relPath} (${fileStat.size} bytes exceeds maxFileSize of ${maxFileSize} bytes)`);
```

### 6. Line Count Calculation

Standard convention: count newlines but subtract 1 if the file ends with a newline (which most well-formed text files do). This gives the human-intuitive line count:

```typescript
const rawLines = content.split('\n');
const lineCount = rawLines[rawLines.length - 1] === ''
  ? rawLines.length - 1
  : rawLines.length;
```

A 22-line file ending with `\n` has 23 elements when split — the last is `''`. After adjustment: 22. Correct.

### 7. `path` field in `FileInfo`: Absolute Path

Set `path` to the absolute path (`join(projectPath, relPath)`). This is what downstream consumers (agent runner, context builder) need to read the file. The `relPath` used for ignore checking is internal to the walk function.

### 8. ESM Import Requirements

All imports must use `.js` extensions (compiled output convention for `module: Node16`). Example:
```typescript
import { discoverFiles } from './file-discovery.js';
import { chunkFile } from './chunker.js';
```

Node.js built-ins do not need extensions:
```typescript
import { readdir, stat, readFile } from 'fs/promises';
import { join, extname } from 'path';
```

---

## Chunker Design

### Target Parameters (from spec)
- **Chunk size:** ~200 lines (target, not hard limit)
- **Overlap:** 20 lines between consecutive chunks
- **Boundary snapping:** snap chunk end to nearest function/class declaration before the target line

### Logical Boundary Detection

The chunker is language-agnostic — no AST parsing. Regex-based heuristics work across all languages:

```typescript
const BOUNDARY_PATTERNS: RegExp[] = [
  // TypeScript/JavaScript
  /^(export\s+)?(default\s+)?(async\s+)?function[\s*]/,
  /^(export\s+)?(default\s+)?(abstract\s+)?class\s+/,
  /^(export\s+)?const\s+\w+\s*=\s*(async\s+)?\(/,
  /^(export\s+)?const\s+\w+\s*=\s*(async\s+)?function/,
  // Python
  /^(async\s+)?def\s+\w+/,
  /^class\s+\w+/,
  // Go
  /^func\s+/,
  /^type\s+\w+\s+struct\s*\{/,
  // Rust
  /^(pub\s+)?(async\s+)?fn\s+\w+/,
  /^(pub\s+)?struct\s+\w+/,
  /^(pub\s+)?impl\s+/,
  /^(pub\s+)?trait\s+\w+/,
  // Java/C#
  /^(public|private|protected|internal|static|final|abstract|override|virtual)\s+/,
  // Ruby
  /^def\s+\w+/,
];
```

Test patterns against `line.trimStart()` (not `line`) to handle indented method definitions.

**Fallback:** If no boundary declaration is found within the search window, look for a blank line. If neither, snap to the raw target index.

### Chunking Algorithm

```
while (start < totalLines):
  end = min(start + CHUNK_SIZE, totalLines)

  if end < totalLines:
    snapped = findBoundaryBefore(lines, end)
    if snapped > start + CHUNK_SIZE/4:  # only use if meaningful progress
      end = snapped

  emit chunk(startLine=start+1, endLine=end, content=lines[start:end])

  nextStart = end - OVERLAP
  start = nextStart if nextStart > start else end  # guarantee forward progress
```

**Key invariant:** `start` must strictly increase every iteration to prevent infinite loops. When overlap would push `nextStart` back to or before `start`, skip overlap and continue from `end`.

### Line Numbering Convention

- `startLine` and `endLine` are **1-indexed** and **both inclusive**
- `startLine: 1` means the first line of the file
- A file with 500 lines: first chunk might be `startLine: 1, endLine: 200`; second chunk `startLine: 181, endLine: 380` (with 20-line overlap)
- `content` is `lines.slice(start, end).join('\n')` where `start`/`end` are 0-indexed in the array

### Single-Chunk Case

If `lines.length <= CHUNK_SIZE` (200), return a single chunk with `startLine: 1, endLine: lines.length, chunkIndex: 0`. No overlap logic needed.

### Empty File Edge Case

If the file has no content or only a trailing newline, return `[]` (empty array).

---

## What `discoverFiles` Calls vs. `chunkFile` Calls

**`discoverFiles`** is called once per analysis run with the project path. It returns a flat list of all `FileInfo` objects. It does NOT chunk — that's the chunker's job.

**`chunkFile`** is called per-file by the agent framework (Phase 4), once `discoverFiles` has produced the list. The workflow is:
```
discoverFiles(path, patterns, maxSize) → FileInfo[]
  → for each FileInfo: readFile(info.path) → chunkFile(content, info.path) → Chunk[]
```

This means `discoverFiles` reads file content only for binary detection and line counting — it does NOT need to return file content itself. Content reading for chunking happens separately.

---

## Default Ignore Patterns Verification

The patterns in `config/defaults.ts` were tested against the `ignore` package. All work correctly:

| Pattern | What it ignores |
|---------|----------------|
| `node_modules` | Directory and all contents |
| `dist`, `build`, `.git` | Same |
| `__pycache__` | Python cache directory |
| `*.min.js`, `*.min.css` | Minified files anywhere in tree |
| `*.lock`, `package-lock.json`, `yarn.lock` | Lockfiles |
| `*.png`, `*.jpg`, `*.gif`, `*.svg`, `*.ico` | Images |
| `*.woff`, `*.woff2`, `*.ttf`, `*.eot` | Web fonts |

The `.gitignore` at the project root already includes `node_modules/`, `dist/`, `.code-teacher-cache/`, `.env`, `.DS_Store`, etc. The `ignore` package merges `.gitignore` and the config patterns correctly.

---

## Plan Split Decision

Phase 2 splits into 2 plans:
- **02-01:** `core/file-discovery.ts` — directory walker with gitignore, config ignores, binary filtering, size limits (+ `npm install ignore`)
- **02-02:** `core/chunker.ts` — logical boundary splitting, 20-line overlap, chunk metadata

These can be done in sequence without blockers. The chunker has no dependencies on the file discovery module — it only takes a string (content) and a path. Both can be built and verified independently.

---

## TypeScript Strict Mode Considerations

Verified: both implementations compile clean under `strict: true`, `module: Node16`, `moduleResolution: Node16`, `target: ES2022`.

Key considerations:
- `buffer[i]` on a `Buffer` returns `number`, not `number | undefined`, even in strict mode
- `readdir` with `{ withFileTypes: true }` returns `Dirent[]` — use `.isDirectory()` and `.isFile()` methods, not type assertions
- The `ignore` package's `Ignore` type is fully typed via `index.d.ts` — `ig.ignores(path: string): boolean` is properly typed
- Error handling for `readFile` (`.gitignore` may not exist) needs `try/catch` with empty catch body; TypeScript strict mode does not require the catch variable to be used

---

## No Additional NPM Packages Needed

Beyond adding `ignore` to production dependencies:
- Directory walking: `fs/promises` (built-in)
- Path manipulation: `path` (built-in)
- Ignore patterns: `ignore` (to be added)
- Chunking: Pure logic, no dependencies

The `minimatch` and `picomatch` packages are in `node_modules/` as transitive deps of eslint, but should NOT be used for gitignore pattern handling — `ignore` is purpose-built for this and handles the full gitignore spec (including negation patterns, directory markers, etc.) that glob libraries do not correctly implement.

---

## Risk Flags

1. **`ignore` not in production deps** — must be fixed first in 02-01 before any imports are written
2. **Boundary snapping infinite loop** — the algorithm must guarantee forward progress; the `nextStart > start` guard is critical
3. **Ignore package path contract** — paths must be relative and use forward slashes. On Windows, `path.join` uses backslashes. The `ignore` package handles this on Windows internally, but be aware when testing cross-platform
4. **`.gitignore` in subdirectories** — the spec only mentions respecting the project root `.gitignore`. Do NOT walk subdirectory `.gitignore` files (git does this, but implementing it adds complexity not required by REQ-02)
5. **Large binary files** — reading large files just to check for null bytes is wasteful. Read only the first 512 bytes: `await readFile(fullPath)` reads everything; use `{ encoding: null }` which returns a Buffer, then check only `buf.slice(0, 512)`. For size-limit exceeded files, skip before reading at all.

---

## Concrete Implementation Plan per Plan

### 02-01: file-discovery.ts

1. `npm install ignore`
2. Replace stub with full implementation:
   - `buildIgnoreFilter(projectPath, patterns)`: reads `.gitignore`, adds patterns, returns `Ignore`
   - `isBinary(buffer)`: checks first 512 bytes for null byte
   - `walk(baseDir, relDir, ig, maxFileSize)`: recursive, returns `FileInfo[]`
   - `discoverFiles(projectPath, ignorePatterns, maxFileSize)`: orchestrates the above
3. Build and verify: `npm run build` passes, `npx eslint .` passes
4. Manual smoke test: run against the project itself, verify expected files returned

### 02-02: chunker.ts

1. Replace stub with full implementation:
   - `BOUNDARY_PATTERNS`: array of RegExp for all supported languages
   - `isLogicalBoundary(line)`: tests trimmed line against all patterns
   - `findBoundaryBefore(lines, targetIdx)`: searches back from target for boundary, falls back to blank line
   - `chunkFile(content, filePath)`: splits into chunks with overlap
2. Build and verify: `npm run build` passes, `npx eslint .` passes
3. Manual smoke test: chunk a large TypeScript file (e.g., `cli/commands/analyze.ts` is 179 lines — just under 200; create a synthetic 500-line file to test multi-chunk behavior)
