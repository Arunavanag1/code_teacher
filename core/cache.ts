/**
 * Analysis cache
 * Caches analysis results to avoid re-running expensive LLM calls.
 * Uses content-hash-based keys (SHA of commit hash + file content hash + agent version).
 * Stores in .code-teacher-cache/ directory.
 */

export async function getCached(_key: string): Promise<unknown | null> {
  // TODO: Implement in Phase 6
  return null;
}

export async function setCached(_key: string, _value: unknown): Promise<void> {
  // TODO: Implement in Phase 6
}

export function computeCacheKey(
  _commitHash: string,
  _contentHash: string,
  _agentVersion: string,
): string {
  // TODO: Implement in Phase 6
  return '';
}
