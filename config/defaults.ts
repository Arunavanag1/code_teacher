/**
 * Default configuration values for code-teacher.
 * These are used when no config file is present or when config fields are omitted.
 */

export interface Config {
  /** Glob patterns for files and directories to ignore during analysis */
  ignore: string[];
  /** Maximum file size in bytes; files larger than this are skipped */
  maxFileSize: number;
  /** Number of top results to display per category */
  topN: number;
  /** LLM provider override (undefined = auto-detect) */
  provider: string | undefined;
  /** LLM model override (undefined = provider default) */
  model: string | undefined;
  /** Paths to custom agent markdown definition files */
  customAgents: string[];
  /** Maximum number of files to send to LLM agents (0 = unlimited) */
  maxAnalyzedFiles: number;
  /** Ollama base URL for local LLM inference */
  ollamaUrl: string | undefined;
}

export const defaults: Config = {
  ignore: [
    'node_modules',
    'dist',
    'build',
    '.git',
    '__pycache__',
    '*.min.js',
    '*.min.css',
    '*.lock',
    'package-lock.json',
    'yarn.lock',
    '*.png',
    '*.jpg',
    '*.gif',
    '*.svg',
    '*.ico',
    '*.woff',
    '*.woff2',
    '*.ttf',
    '*.eot',
  ],
  maxFileSize: 50000,
  topN: 5,
  provider: undefined,
  model: undefined,
  customAgents: [],
  maxAnalyzedFiles: 50,
  ollamaUrl: undefined,
};
