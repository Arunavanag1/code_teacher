/**
 * Config file validation schema
 * Validates code-teacher.config.json files and merges with defaults.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { type Config, defaults } from './defaults.js';

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
  maxAnalyzedFiles?: number;
  ollamaUrl?: string;
}

/**
 * Errors found during config validation.
 */
export class ConfigValidationError extends Error {
  constructor(
    message: string,
    public readonly errors: string[],
  ) {
    super(message);
    this.name = 'ConfigValidationError';
  }
}

/**
 * Validates a raw parsed object against the config schema.
 * Returns a fully-resolved Config merged with defaults.
 *
 * Throws ConfigValidationError if the input contains invalid field types.
 */
export function validateConfig(raw: unknown): Config {
  if (raw === null || raw === undefined) {
    return { ...defaults };
  }

  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ConfigValidationError('Config must be a JSON object', [
      'Expected an object, got ' + (Array.isArray(raw) ? 'array' : typeof raw),
    ]);
  }

  const obj = raw as Record<string, unknown>;
  const errors: string[] = [];

  // Validate ignore
  if (obj.ignore !== undefined) {
    if (!Array.isArray(obj.ignore)) {
      errors.push('"ignore" must be an array of strings');
    } else if (!obj.ignore.every((item: unknown) => typeof item === 'string')) {
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
    } else if (!obj.customAgents.every((item: unknown) => typeof item === 'string')) {
      errors.push('"customAgents" must contain only strings');
    }
  }

  // Validate maxAnalyzedFiles
  if (obj.maxAnalyzedFiles !== undefined) {
    if (
      typeof obj.maxAnalyzedFiles !== 'number' ||
      obj.maxAnalyzedFiles < 0 ||
      !Number.isInteger(obj.maxAnalyzedFiles)
    ) {
      errors.push('"maxAnalyzedFiles" must be a non-negative integer');
    }
  }

  // Validate ollamaUrl
  if (obj.ollamaUrl !== undefined) {
    if (typeof obj.ollamaUrl !== 'string') {
      errors.push('"ollamaUrl" must be a string');
    }
  }

  if (errors.length > 0) {
    throw new ConfigValidationError(`Invalid config: ${errors.length} error(s) found`, errors);
  }

  // Merge with defaults — user values override defaults
  const schema = obj as ConfigSchema;
  return {
    ignore: schema.ignore ?? defaults.ignore,
    maxFileSize: schema.maxFileSize ?? defaults.maxFileSize,
    topN: schema.topN ?? defaults.topN,
    provider: schema.provider ?? defaults.provider,
    model: schema.model ?? defaults.model,
    customAgents: schema.customAgents ?? defaults.customAgents,
    maxAnalyzedFiles: schema.maxAnalyzedFiles ?? defaults.maxAnalyzedFiles,
    ollamaUrl: schema.ollamaUrl ?? defaults.ollamaUrl,
  };
}

/**
 * Loads and validates a code-teacher.config.json file from the given project path.
 * Returns defaults if no config file is present.
 * Throws ConfigValidationError if the config file exists but is invalid.
 */
export function loadConfig(projectPath: string): Config {
  const configPath = join(projectPath, 'code-teacher.config.json');

  if (!existsSync(configPath)) {
    return { ...defaults };
  }

  let rawContent: string;
  try {
    rawContent = readFileSync(configPath, 'utf-8');
  } catch (err) {
    throw new ConfigValidationError(`Failed to read config file: ${configPath}`, [
      err instanceof Error ? err.message : String(err),
    ]);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawContent);
  } catch {
    throw new ConfigValidationError(`Invalid JSON in config file: ${configPath}`, [
      'Config file must contain valid JSON',
    ]);
  }

  return validateConfig(parsed);
}
