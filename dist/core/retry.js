/**
 * Retry utility with exponential backoff
 * Handles API rate limits, server errors, and timeouts for LLM provider calls.
 * Delays: 1s, 2s, 4s (max 3 retries, max 8s delay cap).
 */
/**
 * Returns a promise that resolves after the specified number of milliseconds.
 * Used for retry delay between attempts.
 */
export function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
/**
 * Determines whether an error is retryable (transient) or permanent.
 *
 * Retryable errors:
 * - HTTP 429 (rate limit) — all three provider SDKs expose this via err.status
 * - HTTP 5xx (server errors) — transient server-side failures
 * - Timeout errors — message contains 'timeout' or 'ETIMEDOUT'
 * - Network errors — err.code is 'ECONNRESET' or 'ECONNREFUSED'
 *
 * Non-retryable errors (will NOT be retried):
 * - HTTP 4xx (except 429) — client errors like 401 (bad key), 400 (bad request)
 * - JSON parse errors
 * - File system errors
 */
export function isRetryableError(err) {
    if (err == null || typeof err !== 'object')
        return false;
    const error = err;
    // Check HTTP status (works for Anthropic, OpenAI, Google SDK errors)
    const status = error.status;
    if (typeof status === 'number') {
        if (status === 429)
            return true; // Rate limit
        if (status >= 500)
            return true; // Server error
    }
    // Check for network error codes
    const code = error.code;
    if (code === 'ECONNRESET' || code === 'ECONNREFUSED' || code === 'ETIMEDOUT') {
        return true;
    }
    // Check for timeout in error message
    const message = error.message;
    if (typeof message === 'string') {
        const lower = message.toLowerCase();
        if (lower.includes('timeout') || lower.includes('etimedout'))
            return true;
    }
    return false;
}
/**
 * Returns a human-readable retry message based on the error type.
 * Used for console.warn output before each retry.
 */
function getRetryMessage(err, delayMs) {
    const delaySec = (delayMs / 1000).toFixed(0);
    if (err != null && typeof err === 'object') {
        const error = err;
        const status = error.status;
        if (typeof status === 'number' && status === 429) {
            return `Rate limit hit. Retrying in ${delaySec}s...`;
        }
        const message = error.message;
        if (typeof message === 'string' && message.toLowerCase().includes('timeout')) {
            return `Request timed out. Retrying in ${delaySec}s...`;
        }
    }
    return `API error. Retrying in ${delaySec}s...`;
}
/**
 * Wraps an async function with exponential backoff retry logic.
 *
 * The delay sequence for maxRetries=3, baseDelayMs=1000, maxDelayMs=8000:
 *   Attempt 0: call fn() (initial attempt)
 *   Attempt 1: wait 1s, call fn() (1st retry)
 *   Attempt 2: wait 2s, call fn() (2nd retry)
 *   Attempt 3: wait 4s, call fn() (3rd retry)
 *
 * If fn() throws a non-retryable error (e.g., 401 auth error), it is thrown
 * immediately without any retries. Only retryable errors trigger the backoff.
 *
 * @param fn - Async function to retry
 * @param options - Retry configuration (optional, uses defaults)
 * @returns The result of fn() on success
 * @throws The last error if all retries are exhausted, or any non-retryable error immediately
 */
export async function withRetry(fn, options) {
    const maxRetries = options?.maxRetries ?? 3;
    const baseDelayMs = options?.baseDelayMs ?? 1000;
    const maxDelayMs = options?.maxDelayMs ?? 8000;
    let lastError;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        }
        catch (err) {
            lastError = err;
            // Non-retryable errors are thrown immediately (e.g., 401 auth failure)
            if (!isRetryableError(err)) {
                throw err;
            }
            // If this was the last attempt, throw the error
            if (attempt === maxRetries) {
                throw err;
            }
            // Calculate delay: baseDelay * 2^attempt, capped at maxDelay
            const delayMs = Math.min(baseDelayMs * Math.pow(2, attempt), maxDelayMs);
            console.warn(getRetryMessage(err, delayMs));
            await sleep(delayMs);
        }
    }
    // TypeScript: unreachable, but satisfies return type
    throw lastError;
}
//# sourceMappingURL=retry.js.map