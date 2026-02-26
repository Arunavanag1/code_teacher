/**
 * Agent runner
 * Loads agent markdown (.md) files, constructs prompts from their sections,
 * and orchestrates LLM calls with JSON parsing and retry logic.
 */
import type { LLMProvider } from '../providers/index.js';
import type { FileInfo } from '../core/file-discovery.js';
import type { Chunk } from '../core/chunker.js';
/**
 * Parsed representation of an agent markdown definition file.
 * Each field corresponds to a ## section in the .md file.
 */
export interface AgentDefinition {
    name: string;
    role: string;
    systemPrompt: string;
    input: string;
    scoringRubric: string;
    outputSchema: string;
}
/**
 * All inputs required to run an agent.
 * The caller (analyze.ts) pre-computes chunks and passes the provider instance.
 */
export interface AgentRunOptions {
    agentPath: string;
    files: FileInfo[];
    chunks: Map<string, Chunk[]>;
    projectPath: string;
    provider: LLMProvider;
    model: string;
    importMap?: Record<string, string[]>;
    stage1Outputs?: AgentResult[];
}
/**
 * Output of a single agent run.
 */
export interface AgentResult {
    agentName: string;
    output: Record<string, unknown>;
    rawContent: string;
    tokenUsage: {
        inputTokens: number;
        outputTokens: number;
    };
}
/**
 * Parses an agent markdown definition file into an AgentDefinition.
 *
 * Format expected:
 *   # Agent Name
 *   ## Role
 *   ## System Prompt
 *   ## Input
 *   ## Scoring Rubric
 *   ## Output Schema
 *
 * Uses a regex walker to find ## headings and capture the text between them.
 * No markdown library — the format is machine-consistent and simple string splitting suffices.
 */
export declare function parseAgentMarkdown(content: string): AgentDefinition;
/**
 * Builds the system prompt by concatenating the agent's System Prompt,
 * Scoring Rubric, and Output Schema sections.
 *
 * The role field is informational metadata and is NOT sent to the LLM
 * (it would be redundant with the System Prompt section content).
 * The input field describes what context to assemble but is also not sent directly.
 */
export declare function buildSystemPrompt(agent: AgentDefinition): string;
/**
 * Runs a single agent: loads its .md definition, assembles context, calls the LLM,
 * parses the JSON response, and retries once on parse failure.
 *
 * Retry strategy (Phase 4): exactly 1 retry with stricter system prompt and lower
 * temperature (0.1). No exponential backoff — that is Phase 7's responsibility.
 * On two consecutive failures, returns an empty output {} with a console.warn.
 */
export declare function runAgent(options: AgentRunOptions): Promise<AgentResult>;
/**
 * Returns absolute paths to all built-in agent definition files.
 *
 * Path resolution: This file compiles to dist/agents/runner.js at runtime.
 * The agent .md files are in agents/definitions/ (NOT in dist/).
 * Navigation: dist/agents/runner.js → ../../agents/definitions/
 *
 * import.meta.url is the ESM equivalent of __filename in CommonJS.
 * This approach works correctly when the package is installed via npm/GitHub.
 */
export declare function getBuiltInAgentPaths(): string[];
//# sourceMappingURL=runner.d.ts.map