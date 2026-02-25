/**
 * File chunker
 * Splits large files into logical, overlapping chunks that fit within
 * LLM context windows. Targets ~200 lines with 20-line overlap,
 * splitting on logical boundaries (function/class declarations).
 */

export interface Chunk {
  filePath: string;
  startLine: number;
  endLine: number;
  chunkIndex: number;
  content: string;
}

export function chunkFile(_content: string, _filePath: string): Chunk[] {
  // TODO: Implement in Phase 2
  return [];
}
