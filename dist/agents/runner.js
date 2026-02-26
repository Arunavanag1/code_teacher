/**
 * Agent runner
 * Loads agent markdown (.md) files, constructs prompts from their sections,
 * and orchestrates LLM calls with JSON parsing and retry logic.
 */
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildContext } from './context.js';
import { withRetry } from '../core/retry.js';
// ---------------------------------------------------------------------------
// Markdown parsing
// ---------------------------------------------------------------------------
/**
 * Parses an agent markdown definition file into an AgentDefinition.
 *
 * Format expected:
 *   # Agent Name
 *   ## Role
 *   ## System Prompt
 *   ## Input
 *   ## Scoring Rubric
 *   ## Output Schema
 *
 * Uses a regex walker to find ## headings and capture the text between them.
 * No markdown library — the format is machine-consistent and simple string splitting suffices.
 */
export function parseAgentMarkdown(content) {
    // Extract the top-level title (# Agent Name)
    const titleMatch = /^#\s+(.+)$/m.exec(content);
    const name = titleMatch?.[1]?.trim() ?? 'Unknown Agent';
    // Walk ## headings and capture body text between consecutive headings
    const sectionRegex = /^##\s+(.+)$/gm;
    const sections = {};
    let lastHeading = null;
    let lastIndex = 0;
    let match;
    while ((match = sectionRegex.exec(content)) !== null) {
        if (lastHeading !== null) {
            // Body text is everything between the previous heading line and this one
            sections[lastHeading] = content.slice(lastIndex, match.index).trim();
        }
        lastHeading = match[1].trim();
        lastIndex = match.index + match[0].length;
    }
    // Capture the last section (runs to end of file)
    if (lastHeading !== null) {
        sections[lastHeading] = content.slice(lastIndex).trim();
    }
    return {
        name,
        role: sections['Role'] ?? '',
        systemPrompt: sections['System Prompt'] ?? '',
        input: sections['Input'] ?? '',
        scoringRubric: sections['Scoring Rubric'] ?? '',
        outputSchema: sections['Output Schema'] ?? '',
    };
}
// ---------------------------------------------------------------------------
// Prompt construction
// ---------------------------------------------------------------------------
/**
 * Builds the system prompt by concatenating the agent's System Prompt,
 * Scoring Rubric, and Output Schema sections.
 *
 * The role field is informational metadata and is NOT sent to the LLM
 * (it would be redundant with the System Prompt section content).
 * The input field describes what context to assemble but is also not sent directly.
 */
export function buildSystemPrompt(agent) {
    const parts = [agent.systemPrompt];
    if (agent.scoringRubric.trim()) {
        parts.push('## Scoring Rubric\n' + agent.scoringRubric);
    }
    if (agent.outputSchema.trim()) {
        parts.push('## Output Format\n' +
            'Respond ONLY with valid JSON matching this exact schema:\n' +
            agent.outputSchema);
    }
    return parts.join('\n\n');
}
/**
 * Extracts the task instruction from the agent's Input section.
 * Uses the first sentence of the Input section as the brief task instruction.
 * The Input section should begin with an imperative sentence describing the task.
 */
function buildTaskInstruction(agent) {
    // Use the first sentence of the Input section as the task instruction
    const firstSentence = agent.input.split(/[.!?]/)[0]?.trim();
    return firstSentence ?? `Analyze the provided code and produce output as specified.`;
}
// ---------------------------------------------------------------------------
// JSON parsing and retry
// ---------------------------------------------------------------------------
/**
 * Parses a JSON response from the LLM, stripping markdown fences if present.
 * Returns null if parsing fails (triggers retry in the caller).
 */
function parseJsonResponse(content) {
    // Strip markdown fences: ```json ... ``` or ``` ... ```
    const stripped = content
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/```\s*$/i, '')
        .trim();
    try {
        return JSON.parse(stripped);
    }
    catch {
        return null;
    }
}
const STRICT_JSON_SUFFIX = '\n\nYour previous response was not valid JSON. ' +
    'Respond ONLY with a single valid JSON object. ' +
    'No explanation, no markdown code fences, no text before or after the JSON.';
// ---------------------------------------------------------------------------
// Agent runner
// ---------------------------------------------------------------------------
/**
 * Runs a single agent: loads its .md definition, assembles context, calls the LLM,
 * parses the JSON response, and retries once on parse failure.
 *
 * Retry strategy (Phase 4): exactly 1 retry with stricter system prompt and lower
 * temperature (0.1). No exponential backoff — that is Phase 7's responsibility.
 * On two consecutive failures, returns an empty output {} with a console.warn.
 */
export async function runAgent(options) {
    const { agentPath, files, chunks, projectPath, provider, model, importMap } = options;
    // Load and parse the agent definition
    let rawMarkdown;
    try {
        rawMarkdown = await readFile(agentPath, 'utf-8');
    }
    catch {
        throw new Error(`Cannot load agent definition: ${agentPath}`);
    }
    const agent = parseAgentMarkdown(rawMarkdown);
    // Build system prompt from the agent's sections
    const systemPrompt = buildSystemPrompt(agent);
    // Assemble the context window string
    const systemPromptTokens = Math.ceil(systemPrompt.length / 4);
    const contextString = buildContext({
        files,
        chunks,
        projectPath,
        model,
        importMap,
        systemPromptTokens,
    });
    // Build user prompt: context + optional Stage 1 outputs + task instruction
    const taskInstruction = buildTaskInstruction(agent);
    let userPrompt = contextString;
    // If Stage 1 outputs are provided (Stage 2 agent), insert them before the task instruction
    if (options.stage1Outputs && options.stage1Outputs.length > 0) {
        const stage1Block = options.stage1Outputs
            .map((result) => JSON.stringify({ agentName: result.agentName, output: result.output }, null, 2))
            .join('\n\n');
        userPrompt += '\n\nSTAGE 1 AGENT OUTPUTS:\n' + stage1Block;
    }
    userPrompt += `\n\n---\n\nTASK:\n${taskInstruction}`;
    // First LLM call attempt (withRetry handles API rate limits and server errors)
    const response = await withRetry(() => provider.call(systemPrompt, userPrompt, {
        responseFormat: 'json',
        temperature: 0.2,
    }));
    const parsed = parseJsonResponse(response.content);
    if (parsed !== null) {
        return {
            agentName: agent.name,
            output: parsed,
            rawContent: response.content,
            tokenUsage: response.usage,
        };
    }
    // First attempt failed — retry with stricter system prompt and lower temperature
    const retrySystemPrompt = systemPrompt + STRICT_JSON_SUFFIX;
    const retryResponse = await withRetry(() => provider.call(retrySystemPrompt, userPrompt, {
        responseFormat: 'json',
        temperature: 0.1, // Lower temperature for more deterministic JSON output
    }));
    const retryParsed = parseJsonResponse(retryResponse.content);
    if (retryParsed !== null) {
        return {
            agentName: agent.name,
            output: retryParsed,
            rawContent: retryResponse.content,
            tokenUsage: retryResponse.usage,
        };
    }
    // Both attempts failed — return empty result with warning
    // Both JSON parse attempts failed — exponential backoff has been applied by withRetry on API errors
    console.warn(`Warning: Agent '${agent.name}' returned malformed JSON after 1 retry. Returning empty result.`);
    return {
        agentName: agent.name,
        output: {},
        rawContent: retryResponse.content,
        tokenUsage: retryResponse.usage,
    };
}
// ---------------------------------------------------------------------------
// Built-in agent path resolution
// ---------------------------------------------------------------------------
/**
 * Returns the absolute path to the agent definitions directory.
 * Path resolution: dist/agents/runner.js → ../../agents/definitions/
 */
function getDefinitionsDir() {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    return resolve(__dirname, '../../agents/definitions');
}
/**
 * Returns absolute paths to built-in agent definition files.
 * Uses the combined analyzer (1 LLM call) by default.
 * The dependency-mapper is first (index 0) and is replaced by static parsing.
 */
export function getBuiltInAgentPaths() {
    const definitionsDir = getDefinitionsDir();
    return [
        resolve(definitionsDir, 'dependency-mapper.md'),
        resolve(definitionsDir, 'combined-analyzer.md'),
    ];
}
/**
 * Returns absolute paths for full analysis mode (original separate agents).
 * Used when --full-analysis flag is passed.
 */
export function getFullAnalysisAgentPaths() {
    const definitionsDir = getDefinitionsDir();
    return [
        resolve(definitionsDir, 'dependency-mapper.md'),
        resolve(definitionsDir, 'teachability-scorer.md'),
        resolve(definitionsDir, 'structure-analyzer.md'),
    ];
}
/**
 * Returns agent paths for a specific focused mode.
 * - 'teachings': only teachability scorer
 * - 'structures': only structure analyzer
 * - 'sections': empty (impact is fully static, no LLM needed)
 * - 'all': combined analyzer (default)
 */
export function getAgentPathsForMode(mode) {
    const definitionsDir = getDefinitionsDir();
    switch (mode) {
        case 'teachings':
            return [
                resolve(definitionsDir, 'dependency-mapper.md'),
                resolve(definitionsDir, 'teachability-scorer.md'),
            ];
        case 'structures':
            return [
                resolve(definitionsDir, 'dependency-mapper.md'),
                resolve(definitionsDir, 'structure-analyzer.md'),
            ];
        case 'sections':
            // Impact ranking is fully static — no LLM agents needed
            return [resolve(definitionsDir, 'dependency-mapper.md')];
        default:
            return getBuiltInAgentPaths();
    }
}
//# sourceMappingURL=runner.js.map