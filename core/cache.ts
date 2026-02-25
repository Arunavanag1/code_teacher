/**
 * Analysis cache
 * Caches analysis results to avoid re-running expensive LLM calls.
 * Uses content-hash-based keys (SHA256 of commit hash + file content hash + agent version).
 * Stores in .code-teacher-cache/ directory (already gitignored).
 */

import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import type { FileInfo } from './file-discovery.js';

/**
 * Computes SHA256 hex digest of a file's content.
 * Content-addressable: identical content always produces the same hash,
 * regardless of filename, mtime, or other metadata.
 *
 * @param filePath - Absolute path to the file
 * @returns 64-character hex string
 */
export async function computeFileHash(filePath: string): Promise<string> {
  const content = await readFile(filePath, 'utf-8');
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Retrieves the current git HEAD commit hash for the project being analyzed.
 * Runs 'git rev-parse HEAD' in the given project directory.
 * Returns empty string if the project is not a git repo or git is unavailable.
 *
 * @param projectPath - Root directory of the project being analyzed (NOT the code-teacher repo)
 * @returns 40-character git SHA or empty string
 */
export function computeCommitHash(projectPath: string): string {
  try {
    const result = execSync('git rev-parse HEAD', {
      cwd: projectPath,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'], // Suppress stderr output
    });
    return result.trim();
  } catch {
    // Not a git repo, or git not available
    return '';
  }
}

/**
 * Computes SHA256 hex digest of an agent markdown file's content.
 * This ensures the cache invalidates when an agent definition is edited.
 *
 * @param agentPath - Absolute path to the agent .md file
 * @returns 64-character hex string
 */
export async function computeAgentVersion(agentPath: string): Promise<string> {
  const content = await readFile(agentPath, 'utf-8');
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Computes the final cache key by hashing the concatenation of:
 * commit hash + file content hash + agent version.
 *
 * @param commitHash - Git HEAD SHA (or empty string for non-git projects)
 * @param contentHash - SHA256 of all file content hashes concatenated
 * @param agentVersion - SHA256 of all agent definitions concatenated
 * @returns 64-character hex string used as the cache filename
 */
export function computeCacheKey(
  commitHash: string,
  contentHash: string,
  agentVersion: string,
): string {
  return createHash('sha256')
    .update(commitHash + contentHash + agentVersion)
    .digest('hex');
}

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
export async function computeProjectContentHash(files: FileInfo[]): Promise<string> {
  // Sort by path for deterministic ordering
  const sorted = [...files].sort((a, b) => a.path.localeCompare(b.path));

  // Hash each file's content and concatenate
  const hashes: string[] = [];
  for (const file of sorted) {
    const hash = await computeFileHash(file.path);
    hashes.push(hash);
  }

  return createHash('sha256').update(hashes.join('')).digest('hex');
}

/**
 * Returns the path to the cache directory for a given project.
 * Convention: .code-teacher-cache/ in the project root.
 * This directory should be in .gitignore (already added in Phase 1).
 *
 * @param projectPath - Root directory of the analyzed project
 * @returns Absolute path to the cache directory
 */
export function getProjectCacheDir(projectPath: string): string {
  return join(projectPath, '.code-teacher-cache');
}

/**
 * Reads a cached analysis result from disk.
 * Returns null on any error: file not found, corrupted JSON, permission denied.
 * This makes cache misses cheap and safe — the caller just runs the analysis.
 *
 * @param key - 64-character hex cache key (used as filename)
 * @param cacheDir - Absolute path to the cache directory
 * @returns Parsed cached value, or null on miss/error
 */
export async function getCached(key: string, cacheDir: string): Promise<unknown | null> {
  try {
    const filePath = join(cacheDir, `${key}.json`);
    const content = await readFile(filePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * Writes an analysis result to the cache directory.
 * Creates the cache directory if it doesn't exist (recursive mkdir).
 * Silently ignores write failures — caching is best-effort, not critical.
 *
 * @param key - 64-character hex cache key (used as filename)
 * @param value - The value to cache (must be JSON-serializable)
 * @param cacheDir - Absolute path to the cache directory
 */
export async function setCached(key: string, value: unknown, cacheDir: string): Promise<void> {
  try {
    await mkdir(cacheDir, { recursive: true });
    const filePath = join(cacheDir, `${key}.json`);
    await writeFile(filePath, JSON.stringify(value), 'utf-8');
  } catch {
    // Cache write failure is non-fatal — silently ignore
  }
}
