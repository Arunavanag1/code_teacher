/**
 * Terminal output formatting
 * Handles ANSI colors, Unicode box-drawing, score formatting, and risk labels
 * for rendering analysis results. Uses raw ANSI escape codes (zero dependencies).
 */

/**
 * Raw ANSI escape code constants for terminal styling.
 * Used instead of chalk/picocolors to avoid adding dependencies.
 */
export const ANSI = {
  // Reset
  reset: '\x1b[0m',

  // Styles
  bold: '\x1b[1m',
  dim: '\x1b[2m',

  // Colors
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',

  // Bright colors
  brightWhite: '\x1b[97m',
} as const;

/**
 * Strips ANSI escape sequences from a string to get its visible width.
 * Matches all standard ANSI escape patterns: CSI sequences using \x1b[...m format.
 */
export function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

/**
 * Pads a string to a given visible width, accounting for invisible ANSI escape codes.
 * The visible width is calculated by stripping ANSI sequences first.
 */
export function padRight(str: string, width: number): string {
  const visibleLength = stripAnsi(str).length;
  if (visibleLength >= width) return str;
  return str + ' '.repeat(width - visibleLength);
}

/**
 * Returns the current terminal width, defaulting to 80 when not in a TTY
 * (e.g., when output is piped). Enforces a minimum of 60 characters.
 */
export function getTerminalWidth(): number {
  const columns = process.stdout.columns ?? 80;
  return Math.max(columns, 60);
}

/**
 * Generates the analysis header using Unicode double-line box-drawing characters.
 * Matches the spec format:
 *   ╔══════════════════════════════════════════════════════════════╗
 *   ║  code-teacher Analysis: my-project                          ║
 *   ║  Files analyzed: 47 | Languages: TypeScript, Python         ║
 *   ║  Analysis time: 12.3s                                       ║
 *   ╚══════════════════════════════════════════════════════════════╝
 *
 * @param projectName - The project name (typically path.basename of target)
 * @param filesCount - Number of files analyzed
 * @param languages - Array of detected language names
 * @param durationSec - Analysis duration in seconds (with 1 decimal)
 */
export function formatHeader(
  projectName: string,
  filesCount: number,
  languages: string[],
  durationSec: number,
): string {
  const width = getTerminalWidth();
  // Inner width is total width minus the two vertical border characters
  const innerWidth = width - 2;

  const TOP_LEFT = '\u2554'; // ╔
  const TOP_RIGHT = '\u2557'; // ╗
  const BOTTOM_LEFT = '\u255a'; // ╚
  const BOTTOM_RIGHT = '\u255d'; // ╝
  const HORIZONTAL = '\u2550'; // ═
  const VERTICAL = '\u2551'; // ║

  const horizontalBar = HORIZONTAL.repeat(innerWidth);
  const topBorder = TOP_LEFT + horizontalBar + TOP_RIGHT;
  const bottomBorder = BOTTOM_LEFT + horizontalBar + BOTTOM_RIGHT;

  // Content lines (padded to fill inner width)
  const line1 = `  code-teacher Analysis: ${projectName}`;
  const line2 = `  Files analyzed: ${filesCount} | Languages: ${languages.join(', ') || 'Unknown'}`;
  const line3 = `  Analysis time: ${durationSec.toFixed(1)}s`;

  function boxLine(content: string): string {
    const visible = stripAnsi(content);
    const padding = Math.max(0, innerWidth - visible.length);
    return VERTICAL + content + ' '.repeat(padding) + VERTICAL;
  }

  const lines = [
    topBorder,
    boxLine(line1),
    boxLine(line2),
    boxLine(line3),
    bottomBorder,
  ];

  return `${ANSI.bold}${ANSI.cyan}${lines.join('\n')}${ANSI.reset}`;
}
