/**
 * Renders analysis results to stdout.
 * Supports summary (default), verbose, and JSON output modes.
 * Consumes AgentResult arrays and uses formatter.ts for visual styling.
 */

import { basename, extname } from 'node:path';
import type { AgentResult } from '../../agents/runner.js';
import type { FileInfo } from '../../core/file-discovery.js';
import type { ResolvedConfig } from '../commands/analyze.js';
import {
  ANSI,
  formatHeader,
  formatSectionHeader,
  formatScore,
  formatRiskLabel,
  padRight,
} from './formatter.js';

/**
 * Finds an AgentResult by agentName string (not by array index).
 * Returns undefined if no matching agent is found.
 */
function findResult(allResults: AgentResult[], agentName: string): AgentResult | undefined {
  return allResults.find((r) => r.agentName === agentName);
}

/**
 * Derives a sorted, unique list of programming languages from file extensions.
 * Maps common extensions to human-readable language names.
 */
function deriveLanguages(files: FileInfo[]): string[] {
  const langMap: Record<string, string> = {
    '.ts': 'TypeScript',
    '.tsx': 'TypeScript',
    '.js': 'JavaScript',
    '.jsx': 'JavaScript',
    '.py': 'Python',
    '.go': 'Go',
    '.rs': 'Rust',
    '.java': 'Java',
    '.kt': 'Kotlin',
    '.rb': 'Ruby',
    '.php': 'PHP',
    '.c': 'C',
    '.cpp': 'C++',
    '.h': 'C',
    '.hpp': 'C++',
    '.cs': 'C#',
    '.swift': 'Swift',
    '.scala': 'Scala',
    '.sh': 'Shell',
    '.sql': 'SQL',
  };
  const languages = new Set<string>();
  for (const file of files) {
    const ext = extname(file.path).toLowerCase();
    const lang = langMap[ext];
    if (lang) languages.add(lang);
  }
  return [...languages].sort();
}

/**
 * Safely extracts an array field from agent output, returning empty array on failure.
 */
function getOutputArray(result: AgentResult | undefined, field: string): Record<string, unknown>[] {
  if (!result) return [];
  const value = result.output[field];
  if (!Array.isArray(value)) return [];
  return value as Record<string, unknown>[];
}

/**
 * Safely extracts a string field from agent output.
 */
function getOutputString(result: AgentResult | undefined, field: string): string {
  if (!result) return '';
  const value = result.output[field];
  return typeof value === 'string' ? value : '';
}
