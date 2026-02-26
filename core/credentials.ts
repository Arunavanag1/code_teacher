/**
 * Credential storage for API keys.
 * Saves keys to ~/.code-teacher/credentials.json so they persist
 * across all environments (Claude Code, Codex, regular terminal).
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const CREDENTIALS_DIR = join(homedir(), '.code-teacher');
const CREDENTIALS_FILE = join(CREDENTIALS_DIR, 'credentials.json');

interface Credentials {
  [key: string]: string;
}

/**
 * Load saved credentials from ~/.code-teacher/credentials.json.
 * Returns an empty object if no credentials file exists.
 */
export function loadCredentials(): Credentials {
  try {
    if (!existsSync(CREDENTIALS_FILE)) return {};
    const raw = readFileSync(CREDENTIALS_FILE, 'utf-8');
    return JSON.parse(raw) as Credentials;
  } catch {
    return {};
  }
}

/**
 * Save an API key to ~/.code-teacher/credentials.json.
 * Creates the directory if it doesn't exist.
 */
export function saveCredential(envVarName: string, value: string): void {
  mkdirSync(CREDENTIALS_DIR, { recursive: true });
  const creds = loadCredentials();
  creds[envVarName] = value;
  writeFileSync(CREDENTIALS_FILE, JSON.stringify(creds, null, 2) + '\n', 'utf-8');
}

/**
 * Inject saved credentials into process.env if not already set.
 * This makes stored keys available to the provider detection chain.
 */
export function injectCredentials(): void {
  const creds = loadCredentials();
  for (const [key, value] of Object.entries(creds)) {
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}
