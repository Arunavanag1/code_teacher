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
}
export declare const defaults: Config;
//# sourceMappingURL=defaults.d.ts.map