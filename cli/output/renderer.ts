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

/**
 * Renders the High-Impact Sections from the impact-ranker output.
 * Cross-references fan-in from the dependency-mapper nodes.
 *
 * Spec format per entry:
 *   #N  file:startLine-endLine              Score: X.X/10
 *       "summary text..."
 *       Fan-in: N | Blast radius: LABEL | Refactor risk: LABEL
 */
function renderHighImpact(allResults: AgentResult[], topN: number): string {
  const impactResult = findResult(allResults, 'Impact Ranker');
  const mapperResult = findResult(allResults, 'Dependency Mapper');

  const sections = getOutputArray(impactResult, 'rankedSections').slice(0, topN);
  const narrative = getOutputString(impactResult, 'narrative');

  // Build fan-in lookup from dependency mapper nodes
  const fanInMap = new Map<string, number>();
  const mapperNodes = getOutputArray(mapperResult, 'nodes');
  for (const node of mapperNodes) {
    const id = typeof node.id === 'string' ? node.id : '';
    const fanIn = typeof node.fanIn === 'number' ? node.fanIn : 0;
    if (id) fanInMap.set(id, fanIn);
  }

  const lines: string[] = [];
  lines.push('');
  lines.push(formatSectionHeader('\uD83C\uDFAF', 'TOP HIGH-IMPACT SECTIONS'));

  for (let i = 0; i < sections.length; i++) {
    const s = sections[i];
    const file = typeof s.file === 'string' ? s.file : 'unknown';
    const startLine = typeof s.startLine === 'number' ? s.startLine : 0;
    const endLine = typeof s.endLine === 'number' ? s.endLine : 0;
    const compositeScore = typeof s.compositeScore === 'number' ? s.compositeScore : 0;
    const summary = typeof s.summary === 'string' ? s.summary : '';
    const criteria = (s.criteria ?? {}) as Record<string, unknown>;
    const blastRadius = typeof criteria.blastRadius === 'number' ? criteria.blastRadius : 0;
    const refactorRisk = typeof criteria.refactorRisk === 'number' ? criteria.refactorRisk : 0;

    // Look up fan-in by file path (try both with and without leading paths)
    let fanIn = fanInMap.get(file) ?? 0;
    if (fanIn === 0) {
      // Try matching by file suffix
      for (const [id, fi] of fanInMap) {
        if (id.endsWith('/' + file) || file.endsWith('/' + id)) {
          fanIn = fi;
          break;
        }
      }
    }

    const rank = ` #${i + 1}`;
    const location = `${ANSI.cyan}${file}:${startLine}-${endLine}${ANSI.reset}`;
    const score = `Score: ${formatScore(compositeScore, 10)}`;

    lines.push(` ${ANSI.bold}${ANSI.white}${rank}${ANSI.reset}  ${padRight(location, 45)}${score}`);

    if (summary) {
      // Wrap summary in quotes, indented
      const summaryLines = summary.split('\n');
      lines.push(`     ${ANSI.dim}"${summaryLines[0]}`);
      for (let j = 1; j < summaryLines.length; j++) {
        lines.push(`      ${summaryLines[j]}`);
      }
      lines[lines.length - 1] = lines[lines.length - 1] + `"${ANSI.reset}`;
    }

    lines.push(
      `     ${ANSI.gray}Fan-in: ${fanIn} | Blast radius: ${formatRiskLabel(blastRadius)} ${ANSI.gray}| Refactor risk: ${formatRiskLabel(refactorRisk)}${ANSI.reset}`,
    );
    lines.push('');
  }

  if (narrative) {
    lines.push(`${ANSI.dim}${narrative}${ANSI.reset}`);
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Renders the Teachable Sections from the teachability-scorer output.
 *
 * Spec format per entry:
 *   #N  file:startLine-endLine              Score: X.X/10
 *       "reasoning text..."
 *       Concepts: concept1, concept2, ...
 *       Prerequisites: prereq1, prereq2, ...
 */
function renderTeachable(allResults: AgentResult[], topN: number): string {
  const teachResult = findResult(allResults, 'Teachability Scorer');
  const sections = getOutputArray(teachResult, 'sections')
    .sort((a, b) => {
      const scoreA = typeof a.score === 'number' ? a.score : 0;
      const scoreB = typeof b.score === 'number' ? b.score : 0;
      return scoreB - scoreA;
    })
    .slice(0, topN);

  const lines: string[] = [];
  lines.push('');
  lines.push(formatSectionHeader('\uD83D\uDCDA', 'TOP TEACHABLE SECTIONS'));

  for (let i = 0; i < sections.length; i++) {
    const s = sections[i];
    const file = typeof s.file === 'string' ? s.file : 'unknown';
    const startLine = typeof s.startLine === 'number' ? s.startLine : 0;
    const endLine = typeof s.endLine === 'number' ? s.endLine : 0;
    const sectionScore = typeof s.score === 'number' ? s.score : 0;
    const reasoning = typeof s.reasoning === 'string' ? s.reasoning : '';
    const concepts = Array.isArray(s.concepts) ? (s.concepts as string[]).join(', ') : '';
    const prerequisites = Array.isArray(s.prerequisites)
      ? (s.prerequisites as string[]).join(', ')
      : '';

    const rank = ` #${i + 1}`;
    const location = `${ANSI.cyan}${file}:${startLine}-${endLine}${ANSI.reset}`;
    const score = `Score: ${formatScore(sectionScore, 10)}`;

    lines.push(` ${ANSI.bold}${ANSI.white}${rank}${ANSI.reset}  ${padRight(location, 45)}${score}`);

    if (reasoning) {
      lines.push(`     ${ANSI.dim}"${reasoning}"${ANSI.reset}`);
    }

    if (concepts) {
      lines.push(`     ${ANSI.gray}Concepts: ${ANSI.white}${concepts}${ANSI.reset}`);
    }
    if (prerequisites) {
      lines.push(`     ${ANSI.gray}Prerequisites: ${ANSI.white}${prerequisites}${ANSI.reset}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Renders Data Structure Decisions from the structure-analyzer output.
 *
 * Spec format per entry:
 *   *  file:startLine-endLine
 *      Chose: chosenStructure
 *      Over: alternatives[0]
 *      Why it matters: reasoning
 *      Performance impact: performanceImplication
 */
function renderStructureDecisions(allResults: AgentResult[], topN: number): string {
  const structResult = findResult(allResults, 'Structure Analyzer');
  const decisions = getOutputArray(structResult, 'decisions')
    .sort((a, b) => {
      const sigA = typeof a.significance === 'number' ? a.significance : 0;
      const sigB = typeof b.significance === 'number' ? b.significance : 0;
      return sigB - sigA;
    })
    .slice(0, topN);

  const lines: string[] = [];
  lines.push('');
  lines.push(formatSectionHeader('\uD83C\uDFD7\uFE0F', 'KEY DATA STRUCTURE DECISIONS'));

  for (const d of decisions) {
    const file = typeof d.file === 'string' ? d.file : 'unknown';
    const startLine = typeof d.startLine === 'number' ? d.startLine : 0;
    const endLine = typeof d.endLine === 'number' ? d.endLine : 0;
    const chosen = typeof d.chosenStructure === 'string' ? d.chosenStructure : 'Unknown';
    const alternatives = Array.isArray(d.alternatives) ? (d.alternatives as string[]) : [];
    const reasoning = typeof d.reasoning === 'string' ? d.reasoning : '';
    const perfImpact =
      typeof d.performanceImplication === 'string' ? d.performanceImplication : '';

    lines.push(
      ` ${ANSI.bold}\u2022${ANSI.reset}  ${ANSI.cyan}${file}:${startLine}-${endLine}${ANSI.reset}`,
    );
    lines.push(`    ${ANSI.gray}Chose:${ANSI.reset} ${ANSI.white}${chosen}${ANSI.reset}`);
    if (alternatives.length > 0) {
      lines.push(
        `    ${ANSI.gray}Over:${ANSI.reset} ${ANSI.white}${alternatives[0]}${ANSI.reset}`,
      );
    }
    if (reasoning) {
      lines.push(`    ${ANSI.gray}Why it matters:${ANSI.reset} ${reasoning}`);
    }
    if (perfImpact) {
      lines.push(`    ${ANSI.gray}Performance impact:${ANSI.reset} ${perfImpact}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
