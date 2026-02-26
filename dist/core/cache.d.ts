/**
 * Analysis cache
 * Caches analysis results to avoid re-running expensive LLM calls.
 * Uses content-hash-based keys (SHA256 of commit hash + file content hash + agent version).
 * Stores in .code-teacher-cache/ directory (already gitignored).
 */
import type { FileInfo } from './file-discovery.js';
/**
 * Computes SHA256 hex digest of a file's content.
 * Content-addressable: identical content always produces the same hash,
 * regardless of filename, mtime, or other metadata.
 *
 * @param filePath - Absolute path to the file
 * @returns 64-character hex string
 */
export declare function computeFileHash(filePath: string): Promise<string>;
/**
 * Retrieves the current git HEAD commit hash for the project being analyzed.
 * Runs 'git rev-parse HEAD' in the given project directory.
 * Returns empty string if the project is not a git repo or git is unavailable.
 *
 * @param projectPath - Root directory of the project being analyzed (NOT the code-teacher repo)
 * @returns 40-character git SHA or empty string
 */
export declare function computeCommitHash(projectPath: string): string;
/**
 * Computes SHA256 hex digest of an agent markdown file's content.
 * This ensures the cache invalidates when an agent definition is edited.
 *
 * @param agentPath - Absolute path to the agent .md file
 * @returns 64-character hex string
 */
export declare function computeAgentVersion(agentPath: string): Promise<string>;
/**
 * Computes the final cache key by hashing the concatenation of:
 * commit hash + file content hash + agent version.
 *
 * @param commitHash - Git HEAD SHA (or empty string for non-git projects)
 * @param contentHash - SHA256 of all file content hashes concatenated
 * @param agentVersion - SHA256 of all agent definitions concatenated
 * @returns 64-character hex string used as the cache filename
 */
export declare function computeCacheKey(commitHash: string, contentHash: string, agentVersion: string): string;
/**
 * Computes a single hash representing the content state of all project files.
 * Files are sorted by path for deterministic ordering, then each file's content
 * is hashed and the hashes are concatenated and hashed again.
 *
 * This is a project-level snapshot hash. Any change to any file produces
 * a different hash, invalidating the entire cache.
 *
 * @param files - FileInfo array from file discovery
 * @returns 64-character hex string representing the project content snapshot
 */
export declare function computeProjectContentHash(files: FileInfo[]): Promise<string>;
/**
 * Returns the path to the cache directory for a given project.
 * Convention: .code-teacher-cache/ in the project root.
 * This directory should be in .gitignore (already added in Phase 1).
 *
 * @param projectPath - Root directory of the analyzed project
 * @returns Absolute path to the cache directory
 */
export declare function getProjectCacheDir(projectPath: string): string;
/**
 * Reads a cached analysis result from disk.
 * Returns null on any error: file not found, corrupted JSON, permission denied.
 * This makes cache misses cheap and safe — the caller just runs the analysis.
 *
 * @param key - 64-character hex cache key (used as filename)
 * @param cacheDir - Absolute path to the cache directory
 * @returns Parsed cached value, or null on miss/error
 */
export declare function getCached(key: string, cacheDir: string): Promise<unknown | null>;
/**
 * Writes an analysis result to the cache directory.
 * Creates the cache directory if it doesn't exist (recursive mkdir).
 * Silently ignores write failures — caching is best-effort, not critical.
 *
 * @param key - 64-character hex cache key (used as filename)
 * @param value - The value to cache (must be JSON-serializable)
 * @param cacheDir - Absolute path to the cache directory
 */
export declare function setCached(key: string, value: unknown, cacheDir: string): Promise<void>;
//# sourceMappingURL=cache.d.ts.map