# Error Resilience Framework

A comprehensive error handling, retry, and notification system for the Meteora Liquidity Bot.

## Overview

This framework provides:

1. **Typed Error Classification** - Hierarchical error types that distinguish retryable vs non-retryable errors
2. **Smart Retry Policies** - Context-aware retry logic with exponential backoff
3. **Circuit Breakers** - Prevent cascading failures for external services
4. **Structured Notifications** - User-friendly error messages with actionable next steps
5. **Telemetry & Metrics** - Error tracking and observability

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                  Application Layer                      │
│  (Use Cases, Services, Adapters)                        │
└────────────────────┬────────────────────────────────────┘
                     │ throws ResilienceError
                     ▼
┌─────────────────────────────────────────────────────────┐
│              Error Resilience Framework                 │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐ │
│  │ Error Types │  │ Error Metadata│  │ Normalizer    │ │
│  └─────────────┘  └──────────────┘  └───────────────┘ │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐ │
│  │ Telemetry   │  │ Notifications│  │ Retry Strategy│ │
│  └─────────────┘  └──────────────┘  └───────────────┘ │
└────────────────────┬────────────────────────────────────┘
                     │ logs, metrics, user messages
                     ▼
┌─────────────────────────────────────────────────────────┐
│       Infrastructure (Logging, Queues, Telegram)        │
└─────────────────────────────────────────────────────────┘
```

## Error Types

### Error Categories

- **VALIDATION** - Invalid input (non-retryable)
- **AUTHORIZATION** - Permission denied (non-retryable)
- **NOT_FOUND** - Resource not found (non-retryable)
- **BLOCKCHAIN** - Solana RPC errors (partially retryable)
- **EXTERNAL_SERVICE** - DEX/Jupiter API errors (retryable)
- **RATE_LIMIT** - Rate limit exceeded (retryable with backoff)
- **TIMEOUT** - Operation timeout (retryable)
- **INTERNAL** - Unexpected errors (retryable as safety net)

### Error Severity

- **LOW** - Minor issues, degraded functionality
- **MEDIUM** - Significant issues, partial failure
- **HIGH** - Critical failures, user action blocked
- **CRITICAL** - System-wide failures

### Common Error Classes

```typescript
// Validation errors (non-retryable)
throw new ValidationError("amount", "Must be positive", { userId });
throw new InsufficientBalanceError("1.5", "1.0", "SOL", { userId });
throw new InvalidParameterError("slippage", "Must be between 0 and 100");

// Blockchain errors
throw new BlockchainConnectionError("https://api.mainnet-beta.solana.com", "Timeout");
throw new TransactionFailedError(signature, "Insufficient funds", false);
throw new TransactionTimeoutError(signature, 60000);

// External service errors
throw new DexAdapterError("Meteora", "getPool", "API unavailable", true);
throw new RpcError(endpoint, "getBalance", "Connection refused");
throw new JupiterApiError("getQuote", "Rate limit exceeded", true);

// Not found errors (non-retryable)
throw new PositionNotFoundError(positionId);
throw new PoolNotFoundError(poolAddress);
```

## Usage Examples

### In Services/Use Cases

```typescript
import {
  ValidationError,
  InsufficientBalanceError,
  trackError,
  trackSuccess,
  normalizeError,
} from "@/utils/errors";

class CreatePositionUseCase {
  async execute(params: CreatePositionParams): Promise<Position> {
    const startTime = Date.now();
    
    try {
      // Validate inputs
      if (params.amount <= 0) {
        throw new ValidationError("amount", "Must be positive", {
          userId: params.userId,
          operation: "createPosition",
        });
      }

      // Check balance
      const balance = await this.walletService.getBalance(params.userId);
      if (balance < params.amount) {
        throw new InsufficientBalanceError(
          params.amount.toString(),
          balance.toString(),
          "SOL",
          { userId: params.userId, operation: "createPosition" }
        );
      }

      // Execute operation
      const position = await this.executePositionCreation(params);

      // Track success
      trackSuccess("createPosition", params.userId, Date.now() - startTime);

      return position;
    } catch (error) {
      // Normalize and track error
      const normalized = normalizeError(error, {
        userId: params.userId,
        operation: "createPosition",
        poolAddress: params.poolAddress,
      });

      trackError(normalized, "createPosition", params.userId);
      throw normalized;
    }
  }
}
```

### In Adapters

```typescript
import { normalizeAdapterError, DexAdapterError } from "@/utils/errors";

class MeteoraAdapter {
  async getPool(poolAddress: string): Promise<Pool> {
    try {
      const response = await this.api.get(`/pools/${poolAddress}`);
      return response.data;
    } catch (error) {
      throw normalizeAdapterError(error, "Meteora", "getPool", {
        poolAddress,
      });
    }
  }
}
```

### In Workers

```typescript
import { shouldRetryJob, handleWorkerError } from "@/infrastructure/jobs/retry-strategy";
import { trackRetry } from "@/utils/errors";

class TransactionConfirmWorker {
  async process(job: Job<TransactionConfirmJobData>) {
    try {
      // Process job
      const result = await this.confirmTransaction(job.data.signature);
      return result;
    } catch (error) {
      // Handle and log error
      handleWorkerError(job, error, "TransactionConfirmWorker");

      // Track retry
      if (shouldRetryJob(job, error)) {
        trackRetry(error, "confirmTransaction", job.attemptsMade, job.data.userId);
      }

      throw error; // Let BullMQ handle retry
    }
  }
}
```

### Sending Error Notifications

```typescript
import { NotificationService } from "@/infrastructure/messaging/notification.service";

// Automatic error notification
await notificationService.sendErrorNotification(error, {
  userId,
  operation: "Create Position",
  signature,
  poolAddress,
});

// Specific notification types
await notificationService.sendPositionCreationErrorNotification(error, {
  userId,
  poolAddress,
  depositAmount: "1.5",
  token: "SOL",
});

await notificationService.sendTransactionFailedNotification(error, {
  userId,
  signature,
  operation: "Close Position",
  canRetry: true,
});
```

## Retry Strategy

### Job Queue Retry

Jobs are automatically retried based on error classification:

```typescript
// Non-retryable errors (never retry)
- ValidationError
- InsufficientBalanceError
- InvalidParameterError
- AuthorizationError
- ResourceNotFoundError
- TransactionSimulationError

// Retryable with limits
- ExternalServiceError (max 5 attempts)
- BlockchainConnectionError (max 5 attempts)
- RateLimitError (max 3 attempts)
- TimeoutError (max 3 attempts)

// Retry delays (exponential backoff with jitter)
- Base delay: 2000ms
- Multiplier: 2^attemptNumber
- Max delay: 60000ms (1 minute)
- Jitter: ±15%
```

### Custom Retry Logic

```typescript
import { retry } from "@/infrastructure/resilience/retry";

const result = await retry(
  async () => await fetchData(),
  {
    retries: 3,
    minDelayMs: 1000,
    maxDelayMs: 10000,
    factor: 2,
    jitter: true,
    shouldRetry: (error) => isRetryableError(error),
  }
);
```

## Circuit Breakers

Circuit breakers prevent cascading failures:

```typescript
import { CircuitBreaker } from "@/infrastructure/resilience/circuit-breaker";

const breaker = new CircuitBreaker({
  name: "jupiter-api",
  failureThreshold: 5, // Open after 5 failures
  successThreshold: 2, // Close after 2 successes
  timeoutMs: 30000, // Wait 30s before retry
});

const result = await breaker.execute(
  () => jupiterApi.getQuote(params),
  async () => {
    // Fallback logic
    return getCachedQuote(params);
  }
);
```

### Monitored Services

- Solana RPC (primary and secondary)
- Jupiter API
- Meteora API
- Saros API

## Telemetry & Metrics

### Error Tracking

```typescript
import {
  trackError,
  trackSuccess,
  trackRetry,
  getErrorMetrics,
} from "@/utils/errors";

// Track errors
trackError(error, "createPosition", userId, { poolAddress });

// Track successes (for calculating error rates)
trackSuccess("createPosition", userId, durationMs);

// Track retries
trackRetry(error, "createPosition", attemptNumber, userId);

// Get metrics
const metrics = getErrorMetrics();
/*
{
  totalErrors: 42,
  errorsByCode: {
    "error:VALIDATION_ERROR": 10,
    "error:INSUFFICIENT_BALANCE": 15,
    "error:RPC_ERROR": 12,
    ...
  },
  errorsByCategory: {
    "VALIDATION": 25,
    "BLOCKCHAIN": 12,
    "EXTERNAL_SERVICE": 5,
  },
  errorsBySeverity: {
    "HIGH": 30,
    "MEDIUM": 10,
    "LOW": 2,
  },
  ...
}
*/
```

### Structured Logging

All errors are automatically logged with structured data:

```json
{
  "level": "error",
  "errorCode": "TRANSACTION_FAILED",
  "errorCategory": "BLOCKCHAIN",
  "errorMessage": "Transaction abc123 failed: Insufficient funds",
  "userMessage": "Transaction failed: Insufficient funds",
  "retryable": false,
  "severity": "HIGH",
  "operation": "createPosition",
  "userId": "user-123",
  "signature": "abc123",
  "correlationId": "cor_xyz",
  "timestamp": 1234567890,
  "stack": "..."
}
```

## Testing Error Handling

```typescript
import { ValidationError, normalizeError } from "@/utils/errors";

describe("CreatePositionUseCase", () => {
  it("should throw ValidationError for invalid amount", async () => {
    await expect(
      useCase.execute({ amount: -1, userId: "test" })
    ).rejects.toThrow(ValidationError);
  });

  it("should track error telemetry", async () => {
    const trackErrorSpy = vi.spyOn(ErrorTelemetry, "trackError");

    try {
      await useCase.execute({ amount: -1, userId: "test" });
    } catch (error) {
      // Error is tracked
    }

    expect(trackErrorSpy).toHaveBeenCalledWith(
      expect.any(ValidationError),
      "createPosition",
      "test"
    );
  });
});
```

## Best Practices

1. **Always use typed errors** - Throw ResilienceError subclasses, not generic Error
2. **Include context** - Add userId, operation, correlationId to metadata
3. **Normalize external errors** - Use normalizeError, normalizeAdapterError, normalizeRpcError
4. **Track all errors** - Call trackError for observability
5. **Test error paths** - Write tests for error scenarios
6. **Use circuit breakers** - Wrap external service calls
7. **Provide user guidance** - Error messages should be actionable
8. **Monitor error rates** - Alert on unusual error patterns

## Migration Guide

To migrate existing error handling:

1. Replace `throw new Error(...)` with appropriate ResilienceError class
2. Wrap external service calls with circuit breakers
3. Use normalizeError to convert legacy errors
4. Update workers to use shouldRetryJob
5. Replace generic error notifications with specific templates

## Configuration

Environment variables for error handling:

```bash
# Logging
LOG_LEVEL=info  # debug, info, warn, error

# Circuit breakers (default values shown)
CIRCUIT_BREAKER_FAILURE_THRESHOLD=5
CIRCUIT_BREAKER_SUCCESS_THRESHOLD=2
CIRCUIT_BREAKER_TIMEOUT_MS=30000

# Retry policies
RETRY_MAX_ATTEMPTS=3
RETRY_BASE_DELAY_MS=2000
RETRY_MAX_DELAY_MS=60000
```

## Future Enhancements

- [ ] Integration with external monitoring services (Datadog, Sentry)
- [ ] Error dashboards and visualization
- [ ] Machine learning for error pattern detection
- [ ] Automatic error resolution suggestions
- [ ] Error budget tracking per feature
- [ ] Custom retry policies per operation type
