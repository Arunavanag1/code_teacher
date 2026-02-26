/**
 * Config file validation schema
 * Validates code-teacher.config.json files and merges with defaults.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { defaults } from './defaults.js';
/**
 * Errors found during config validation.
 */
export class ConfigValidationError extends Error {
    errors;
    constructor(message, errors) {
        super(message);
        this.errors = errors;
        this.name = 'ConfigValidationError';
    }
}
/**
 * Validates a raw parsed object against the config schema.
 * Returns a fully-resolved Config merged with defaults.
 *
 * Throws ConfigValidationError if the input contains invalid field types.
 */
export function validateConfig(raw) {
    if (raw === null || raw === undefined) {
        return { ...defaults };
    }
    if (typeof raw !== 'object' || Array.isArray(raw)) {
        throw new ConfigValidationError('Config must be a JSON object', [
            'Expected an object, got ' + (Array.isArray(raw) ? 'array' : typeof raw),
        ]);
    }
    const obj = raw;
    const errors = [];
    // Validate ignore
    if (obj.ignore !== undefined) {
        if (!Array.isArray(obj.ignore)) {
            errors.push('"ignore" must be an array of strings');
        }
        else if (!obj.ignore.every((item) => typeof item === 'string')) {
            errors.push('"ignore" must contain only strings');
        }
    }
    // Validate maxFileSize
    if (obj.maxFileSize !== undefined) {
        if (typeof obj.maxFileSize !== 'number' || obj.maxFileSize <= 0) {
            errors.push('"maxFileSize" must be a positive number');
        }
    }
    // Validate topN
    if (obj.topN !== undefined) {
        if (typeof obj.topN !== 'number' || obj.topN <= 0 || !Number.isInteger(obj.topN)) {
            errors.push('"topN" must be a positive integer');
        }
    }
    // Validate provider
    if (obj.provider !== undefined) {
        if (typeof obj.provider !== 'string') {
            errors.push('"provider" must be a string');
        }
    }
    // Validate model
    if (obj.model !== undefined) {
        if (typeof obj.model !== 'string') {
            errors.push('"model" must be a string');
        }
    }
    // Validate customAgents
    if (obj.customAgents !== undefined) {
        if (!Array.isArray(obj.customAgents)) {
            errors.push('"customAgents" must be an array of strings');
        }
        else if (!obj.customAgents.every((item) => typeof item === 'string')) {
            errors.push('"customAgents" must contain only strings');
        }
    }
    if (errors.length > 0) {
        throw new ConfigValidationError(`Invalid config: ${errors.length} error(s) found`, errors);
    }
    // Merge with defaults — user values override defaults
    const schema = obj;
    return {
        ignore: schema.ignore ?? defaults.ignore,
        maxFileSize: schema.maxFileSize ?? defaults.maxFileSize,
        topN: schema.topN ?? defaults.topN,
        provider: schema.provider ?? defaults.provider,
        model: schema.model ?? defaults.model,
        customAgents: schema.customAgents ?? defaults.customAgents,
    };
}
/**
 * Loads and validates a code-teacher.config.json file from the given project path.
 * Returns defaults if no config file is present.
 * Throws ConfigValidationError if the config file exists but is invalid.
 */
export function loadConfig(projectPath) {
    const configPath = join(projectPath, 'code-teacher.config.json');
    if (!existsSync(configPath)) {
        return { ...defaults };
    }
    let rawContent;
    try {
        rawContent = readFileSync(configPath, 'utf-8');
    }
    catch (err) {
        throw new ConfigValidationError(`Failed to read config file: ${configPath}`, [
            err instanceof Error ? err.message : String(err),
        ]);
    }
    let parsed;
    try {
        parsed = JSON.parse(rawContent);
    }
    catch {
        throw new ConfigValidationError(`Invalid JSON in config file: ${configPath}`, [
            'Config file must contain valid JSON',
        ]);
    }
    return validateConfig(parsed);
}
//# sourceMappingURL=schema.js.map