/**
 * File chunker
 * Splits large files into logical, overlapping chunks that fit within
 * LLM context windows. Targets ~200 lines with 20-line overlap,
 * splitting on logical boundaries (function/class declarations).
 */
const CHUNK_SIZE = 200; // target lines per chunk
const OVERLAP = 20; // overlap lines between consecutive chunks
// Language-agnostic boundary patterns
const BOUNDARY_PATTERNS = [
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
function isLogicalBoundary(line) {
    const trimmed = line.trimStart();
    return BOUNDARY_PATTERNS.some((pattern) => pattern.test(trimmed));
}
function findBoundaryBefore(lines, targetIdx, minIdx) {
    // Search backward from targetIdx for a logical boundary
    for (let i = targetIdx - 1; i >= minIdx; i--) {
        if (isLogicalBoundary(lines[i])) {
            return i;
        }
    }
    // Fallback: look for a blank line
    for (let i = targetIdx - 1; i >= minIdx; i--) {
        if (lines[i].trim() === '') {
            return i + 1; // start new chunk AFTER the blank line
        }
    }
    // No boundary found — return targetIdx (raw cut)
    return targetIdx;
}
export function chunkFile(content, filePath) {
    // Handle empty content
    if (!content || content.trim() === '') {
        return [];
    }
    const lines = content.split('\n');
    // Remove trailing empty line from files ending with newline
    if (lines.length > 0 && lines[lines.length - 1] === '') {
        lines.pop();
    }
    const totalLines = lines.length;
    // Empty after trimming trailing newline
    if (totalLines === 0) {
        return [];
    }
    // Single chunk case: file fits in one chunk
    if (totalLines <= CHUNK_SIZE) {
        return [
            {
                filePath,
                startLine: 1,
                endLine: totalLines,
                chunkIndex: 0,
                content: lines.join('\n'),
            },
        ];
    }
    // Multi-chunk case
    const chunks = [];
    let start = 0;
    let chunkIndex = 0;
    while (start < totalLines) {
        let end = Math.min(start + CHUNK_SIZE, totalLines);
        // If not the last chunk, try to snap to a logical boundary
        if (end < totalLines) {
            // Only snap if we'd still make meaningful progress (at least 1/4 of CHUNK_SIZE)
            const minEnd = start + Math.floor(CHUNK_SIZE / 4);
            const snapped = findBoundaryBefore(lines, end, minEnd);
            if (snapped > minEnd) {
                end = snapped;
            }
        }
        chunks.push({
            filePath,
            startLine: start + 1, // 1-indexed
            endLine: end, // 1-indexed, inclusive
            chunkIndex,
            content: lines.slice(start, end).join('\n'),
        });
        chunkIndex++;
        // If we reached the end of the file, stop
        if (end >= totalLines) {
            break;
        }
        // Calculate next start with overlap
        const nextStart = end - OVERLAP;
        // CRITICAL: guarantee forward progress to prevent infinite loops
        if (nextStart <= start) {
            start = end;
        }
        else {
            start = nextStart;
        }
    }
    return chunks;
}
//# sourceMappingURL=chunker.js.map