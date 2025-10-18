export type CircuitBreakerState = "CLOSED" | "OPEN" | "HALF_OPEN";

export interface CircuitBreakerOptions {
  failureThreshold?: number; // number of consecutive failures before opening
  successThreshold?: number; // number of consecutive successes to close from half-open
  timeoutMs?: number; // time to stay open before trying half-open
  name?: string; // for logging/metrics
}

export class CircuitBreaker {
  private state: CircuitBreakerState = "CLOSED";
  private failures = 0;
  private successes = 0;
  private nextAttemptAt = 0;
  private readonly failureThreshold: number;
  private readonly successThreshold: number;
  private readonly timeoutMs: number;
  private readonly name: string;

  constructor(options: CircuitBreakerOptions = {}) {
    this.failureThreshold = options.failureThreshold ?? 5;
    this.successThreshold = options.successThreshold ?? 2;
    this.timeoutMs = options.timeoutMs ?? 15_000;
    this.name = options.name ?? "circuit";
  }

  getState(): CircuitBreakerState {
    return this.state;
  }

  private setState(next: CircuitBreakerState) {
    if (this.state !== next) {
      // eslint-disable-next-line no-console
      console.warn(`[CircuitBreaker:${this.name}] State change ${this.state} -> ${next}`);
      this.state = next;
    }
  }

  async execute<T>(fn: () => Promise<T>, fallback?: () => Promise<T>): Promise<T> {
    const now = Date.now();

    if (this.state === "OPEN") {
      if (now >= this.nextAttemptAt) {
        this.setState("HALF_OPEN");
      } else {
        if (fallback) return fallback();
        throw new Error(`[CircuitBreaker:${this.name}] Open`);
      }
    }

    try {
      const result = await fn();

      if (this.state === "HALF_OPEN") {
        this.successes += 1;
        if (this.successes >= this.successThreshold) {
          this.reset();
        }
      } else if (this.state === "CLOSED") {
        this.reset();
      }

      return result;
    } catch (err) {
      this.failures += 1;
      this.successes = 0;

      if (this.state === "HALF_OPEN" || this.failures >= this.failureThreshold) {
        this.trip();
      }

      if (fallback) return fallback();
      throw err;
    }
  }

  private trip() {
    this.setState("OPEN");
    this.nextAttemptAt = Date.now() + this.timeoutMs;
    // eslint-disable-next-line no-console
    console.warn(`[CircuitBreaker:${this.name}] Tripped. Next attempt after ${new Date(this.nextAttemptAt).toISOString()}`);
  }

  private reset() {
    this.failures = 0;
    this.successes = 0;
    this.setState("CLOSED");
  }
}
