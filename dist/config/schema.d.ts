/**
 * Config file validation schema
 * Validates code-teacher.config.json files and merges with defaults.
 */
import { type Config } from './defaults.js';
/**
 * Shape of the user-provided config file (all fields optional).
 */
export interface ConfigSchema {
    ignore?: string[];
    maxFileSize?: number;
    topN?: number;
    provider?: string;
    model?: string;
    customAgents?: string[];
}
/**
 * Errors found during config validation.
 */
export declare class ConfigValidationError extends Error {
    readonly errors: string[];
    constructor(message: string, errors: string[]);
}
/**
 * Validates a raw parsed object against the config schema.
 * Returns a fully-resolved Config merged with defaults.
 *
 * Throws ConfigValidationError if the input contains invalid field types.
 */
export declare function validateConfig(raw: unknown): Config;
/**
 * Loads and validates a code-teacher.config.json file from the given project path.
 * Returns defaults if no config file is present.
 * Throws ConfigValidationError if the config file exists but is invalid.
 */
export declare function loadConfig(projectPath: string): Config;
//# sourceMappingURL=schema.d.ts.map