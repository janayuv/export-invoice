/**
 * Retry with exponential backoff for transient failures (e.g. database locked).
 */

export interface RetryOptions {
  /** Total attempts including the first try (default 3). */
  maxAttempts?: number;
  /** Initial delay in ms before the second attempt (default 80). */
  baseDelayMs?: number;
  /** Maximum delay cap in ms (default 1500). */
  maxDelayMs?: number;
  /** Optional predicate — return false to stop retrying immediately. */
  shouldRetry?: (error: unknown, attempt: number) => boolean;
}

const DEFAULT_OPTIONS: Required<Omit<RetryOptions, "shouldRetry">> = {
  maxAttempts: 3,
  baseDelayMs: 80,
  maxDelayMs: 1500,
};

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableError(error: unknown): boolean {
  const msg = String(error).toLowerCase();
  return (
    msg.includes("database is locked") ||
    msg.includes("code: 5") ||
    msg.includes("busy") ||
    msg.includes("timeout") ||
    msg.includes("network")
  );
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? DEFAULT_OPTIONS.maxAttempts;
  const baseDelayMs = options.baseDelayMs ?? DEFAULT_OPTIONS.baseDelayMs;
  const maxDelayMs = options.maxDelayMs ?? DEFAULT_OPTIONS.maxDelayMs;
  const shouldRetry = options.shouldRetry ?? isRetryableError;

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      if (attempt >= maxAttempts || !shouldRetry(e, attempt)) {
        throw e;
      }
      const backoff = Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs);
      await delay(backoff);
    }
  }
  throw lastError;
}
