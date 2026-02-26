/**
 * Terminal output formatting
 * Handles ANSI colors, Unicode box-drawing, score formatting, and risk labels
 * for rendering analysis results. Uses raw ANSI escape codes (zero dependencies).
 */
/**
 * Raw ANSI escape code constants for terminal styling.
 * Used instead of chalk/picocolors to avoid adding dependencies.
 */
export declare const ANSI: {
    readonly reset: "\u001B[0m";
    readonly bold: "\u001B[1m";
    readonly dim: "\u001B[2m";
    readonly red: "\u001B[31m";
    readonly green: "\u001B[32m";
    readonly yellow: "\u001B[33m";
    readonly cyan: "\u001B[36m";
    readonly white: "\u001B[37m";
    readonly gray: "\u001B[90m";
    readonly brightWhite: "\u001B[97m";
};
/**
 * Strips ANSI escape sequences from a string to get its visible width.
 * Matches all standard ANSI escape patterns: CSI sequences using \x1b[...m format.
 */
export declare function stripAnsi(str: string): string;
/**
 * Pads a string to a given visible width, accounting for invisible ANSI escape codes.
 * The visible width is calculated by stripping ANSI sequences first.
 */
export declare function padRight(str: string, width: number): string;
/**
 * Returns the current terminal width, defaulting to 80 when not in a TTY
 * (e.g., when output is piped). Enforces a minimum of 60 characters.
 */
export declare function getTerminalWidth(): number;
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
export declare function formatHeader(projectName: string, filesCount: number, languages: string[], durationSec: number): string;
/**
 * Formats a section header with emoji and horizontal divider.
 * Example output:
 *   🎯 TOP HIGH-IMPACT SECTIONS
 *   ────────────────────────────────────────────────────────────
 *
 * @param emoji - The emoji prefix (e.g., '🎯', '📚', '🏗️')
 * @param label - The section label text
 */
export declare function formatSectionHeader(emoji: string, label: string): string;
/**
 * Formats a numeric score with color coding.
 * - Green for high scores (8.0-10.0)
 * - Yellow for medium scores (4.0-7.9)
 * - Red for low scores (0-3.9)
 *
 * Output format: "9.2/10"
 *
 * @param score - The numeric score (0-10)
 * @param max - The maximum possible score (typically 10)
 */
export declare function formatScore(score: number, max: number): string;
/**
 * Converts a numeric score (0-10) into a colored risk label.
 * - 8-10: HIGH (bold red)
 * - 4-7:  MEDIUM (yellow)
 * - 0-3:  LOW (green)
 *
 * Used for Blast Radius and Refactor Risk in the impact section.
 */
export declare function formatRiskLabel(numericScore: number): string;
//# sourceMappingURL=formatter.d.ts.map