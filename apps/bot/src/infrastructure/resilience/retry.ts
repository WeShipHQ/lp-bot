export interface RetryOptions {
  retries?: number;
  minDelayMs?: number;
  maxDelayMs?: number;
  factor?: number; // exponential backoff factor
  jitter?: boolean; // add random jitter
  shouldRetry?: (error: unknown) => boolean;
}

const defaultShouldRetry = (error: unknown) => {
  if (!error) return false;
  const msg = (error as any)?.message || String(error);
  // Retry on typical transient conditions
  return /timeout|ECONNRESET|ENOTFOUND|EAI_AGAIN|429|5\d\d|rate limit/i.test(msg);
};

export async function retry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const retries = options.retries ?? 3;
  const minDelayMs = options.minDelayMs ?? 500;
  const maxDelayMs = options.maxDelayMs ?? 5_000;
  const factor = options.factor ?? 2;
  const jitter = options.jitter ?? true;
  const shouldRetry = options.shouldRetry ?? defaultShouldRetry;

  let attempt = 0;
  let lastError: unknown;

  while (attempt <= retries) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt === retries || !shouldRetry(err)) {
        throw err;
      }
      const delay = Math.min(maxDelayMs, minDelayMs * Math.pow(factor, attempt));
      const jittered = jitter ? delay * (0.5 + Math.random()) : delay;
      await new Promise((resolve) => setTimeout(resolve, jittered));
      attempt += 1;
    }
  }

  // Should never reach here
  throw lastError ?? new Error('Retry failed with unknown error');
}
