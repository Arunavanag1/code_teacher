/**
 * Retry utility with exponential backoff
 * Handles API rate limits, server errors, and timeouts for LLM provider calls.
 * Delays: 1s, 2s, 4s (max 3 retries, max 8s delay cap).
 */
/**
 * Configuration options for the retry utility.
 */
export interface RetryOptions {
    maxRetries: number;
    baseDelayMs: number;
    maxDelayMs: number;
}
/**
 * Returns a promise that resolves after the specified number of milliseconds.
 * Used for retry delay between attempts.
 */
export declare function sleep(ms: number): Promise<void>;
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
export declare function isRetryableError(err: unknown): boolean;
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
export declare function withRetry<T>(fn: () => Promise<T>, options?: Partial<RetryOptions>): Promise<T>;
//# sourceMappingURL=retry.d.ts.map