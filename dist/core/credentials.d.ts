/**
 * Credential storage for API keys.
 * Saves keys to ~/.code-teacher/credentials.json so they persist
 * across all environments (Claude Code, Codex, regular terminal).
 */
interface Credentials {
    [key: string]: string;
}
/**
 * Load saved credentials from ~/.code-teacher/credentials.json.
 * Returns an empty object if no credentials file exists.
 */
export declare function loadCredentials(): Credentials;
/**
 * Save an API key to ~/.code-teacher/credentials.json.
 * Creates the directory if it doesn't exist.
 */
export declare function saveCredential(envVarName: string, value: string): void;
/**
 * Inject saved credentials into process.env if not already set.
 * This makes stored keys available to the provider detection chain.
 */
export declare function injectCredentials(): void;
export {};
//# sourceMappingURL=credentials.d.ts.map