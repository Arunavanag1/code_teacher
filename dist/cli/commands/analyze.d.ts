/**
 * Main analysis orchestrator command
 * Coordinates file discovery, chunking, agent execution, and output rendering.
 */
import { providerDefaults } from '../../providers/index.js';
/**
 * CLI options passed from commander to the analyze command.
 * Fields are optional when no default is set in commander,
 * so undefined means "not provided by the user".
 */
export interface AnalyzeOptions {
    mode?: string;
    file?: string;
    verbose?: true;
    top?: string;
    json?: true;
    provider?: string;
    model?: string;
    watch?: true;
    fullAnalysis?: true;
}
/**
 * Resolved configuration combining config file values and CLI flag overrides.
 */
export interface ResolvedConfig {
    targetPath: string;
    mode: string;
    file: string | undefined;
    verbose: boolean;
    topN: number;
    json: boolean;
    provider: string | undefined;
    model: string | undefined;
    ignore: string[];
    maxFileSize: number;
    customAgents: string[];
}
/**
 * Main analyze command handler.
 * Loads config from the target project path, merges with CLI flags, and prints
 * resolved configuration. Actual analysis will be implemented in later phases.
 */
export declare function analyzeCommand(path: string, options: AnalyzeOptions): Promise<void>;
export { providerDefaults };
//# sourceMappingURL=analyze.d.ts.map