/**
 * File discovery
 * Walks the project directory tree and returns a list of analyzable files.
 * Respects .gitignore patterns, config ignore patterns, filters binaries,
 * and enforces maxFileSize limits.
 */

export interface FileInfo {
  path: string;
  extension: string;
  size: number;
  lineCount: number;
}

export async function discoverFiles(
  _projectPath: string,
  _ignorePatterns: string[],
  _maxFileSize: number,
): Promise<FileInfo[]> {
  // TODO: Implement in Phase 2
  return [];
}
