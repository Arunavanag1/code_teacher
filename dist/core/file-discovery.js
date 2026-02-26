/**
 * File discovery
 * Walks the project directory tree and returns a list of analyzable files.
 * Respects .gitignore patterns, config ignore patterns, filters binaries,
 * and enforces maxFileSize limits.
 */
import { readdir, stat, readFile } from 'fs/promises';
import { join, extname, resolve } from 'path';
import ignore from 'ignore';
function isBinary(buffer) {
    const sample = buffer.subarray(0, Math.min(512, buffer.length));
    for (let i = 0; i < sample.length; i++) {
        if (sample[i] === 0)
            return true;
    }
    return false;
}
async function buildIgnoreFilter(projectPath, ignorePatterns) {
    const ig = ignore();
    // Load .gitignore from project root only
    try {
        const gitignoreContent = await readFile(join(projectPath, '.gitignore'), 'utf-8');
        ig.add(gitignoreContent);
    }
    catch {
        // .gitignore doesn't exist — not an error
    }
    // Add config ignore patterns
    ig.add(ignorePatterns);
    return ig;
}
async function walk(baseDir, relDir, ig, maxFileSize) {
    const results = [];
    // Wrap readdir so an unreadable subdirectory is skipped without crashing
    let entries;
    try {
        entries = await readdir(join(baseDir, relDir), { withFileTypes: true });
    }
    catch {
        // Skip unreadable directory silently (permission denied, broken symlink, etc.)
        return results;
    }
    for (const entry of entries) {
        const relPath = relDir ? `${relDir}/${entry.name}` : entry.name;
        const fullPath = join(baseDir, relPath);
        // Check ignore patterns first (cheap, avoids I/O)
        if (ig.ignores(relPath))
            continue;
        if (entry.isDirectory()) {
            // Recurse into subdirectory (walk already handles its own readdir errors)
            const subFiles = await walk(baseDir, relPath, ig, maxFileSize);
            results.push(...subFiles);
        }
        else if (entry.isFile()) {
            // Wrap per-file stat/read in try/catch so a single unreadable file
            // does not abort the entire directory walk
            try {
                // Get file stats
                const fileStat = await stat(fullPath);
                // Check size limit before reading content
                if (fileStat.size > maxFileSize) {
                    console.warn(`Warning: Skipping ${relPath} (${fileStat.size} bytes exceeds maxFileSize of ${maxFileSize} bytes)`);
                    continue;
                }
                // Read file content for binary detection and line counting
                const content = await readFile(fullPath);
                // Skip binary files silently
                if (isBinary(content))
                    continue;
                // Count lines
                const textContent = content.toString('utf-8');
                const rawLines = textContent.split('\n');
                const lineCount = rawLines[rawLines.length - 1] === '' ? rawLines.length - 1 : rawLines.length;
                results.push({
                    path: resolve(fullPath),
                    extension: extname(entry.name).toLowerCase(),
                    size: fileStat.size,
                    lineCount,
                });
            }
            catch {
                // Skip unreadable entry silently (permission denied, broken symlink, etc.)
                continue;
            }
        }
    }
    return results;
}
export async function discoverFiles(projectPath, ignorePatterns, maxFileSize) {
    const resolvedPath = resolve(projectPath);
    const ig = await buildIgnoreFilter(resolvedPath, ignorePatterns);
    return walk(resolvedPath, '', ig, maxFileSize);
}
//# sourceMappingURL=file-discovery.js.map