/**
 * Static import parser
 * Extracts import/export relationships from source files using regex patterns.
 * Replaces the LLM-based Dependency Mapper agent for standard import/export analysis.
 *
 * Supports: TypeScript/JavaScript, Python, Go, Rust, Java, C/C++, Ruby, PHP
 */
import type { FileInfo } from './file-discovery.js';
import type { AgentResult } from '../agents/runner.js';
import { type DependencyGraph } from './dependency-graph.js';
export interface ParsedImport {
    /** The file that contains the import statement */
    sourceFile: string;
    /** The raw import specifier as written in code */
    rawSpecifier: string;
    /** The resolved relative path to the imported file (if resolvable) */
    resolvedPath: string | undefined;
}
/**
 * Parses all import relationships from discovered files and builds a DependencyGraph.
 * Also returns a synthetic AgentResult matching the Dependency Mapper output schema.
 */
export declare function parseImports(files: FileInfo[], projectPath: string): Promise<{
    graph: DependencyGraph;
    agentResult: AgentResult;
}>;
//# sourceMappingURL=import-parser.d.ts.map