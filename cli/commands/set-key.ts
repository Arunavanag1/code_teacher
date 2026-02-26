/**
 * set-key command
 * Saves an API key to ~/.code-teacher/credentials.json so it persists
 * across all environments including Claude Code and Codex.
 */

import { saveCredential } from '../../core/credentials.js';

const SUPPORTED_PROVIDERS: Record<string, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  google: 'GOOGLE_API_KEY',
};

export async function setKeyCommand(provider: string, key: string): Promise<void> {
  const normalized = provider.toLowerCase();
  const envVar = SUPPORTED_PROVIDERS[normalized];

  if (!envVar) {
    console.error(
      `Unknown provider '${provider}'. Supported: ${Object.keys(SUPPORTED_PROVIDERS).join(', ')}`,
    );
    process.exitCode = 1;
    return;
  }

  saveCredential(envVar, key);
  console.log(`Saved ${normalized} API key to ~/.code-teacher/credentials.json`);
  console.log(`code-teacher will now auto-detect ${normalized} in any environment.`);
}
