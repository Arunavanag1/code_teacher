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
export declare function discoverFiles(projectPath: string, ignorePatterns: string[], maxFileSize: number): Promise<FileInfo[]>;
//# sourceMappingURL=file-discovery.d.ts.map