# ADR 001: Error Handling & Classification Strategy

**Status:** Proposed  
**Date:** 2025-01-XX  
**Deciders:** Engineering Team  
**Context:** Baseline position flow audit

## Context and Problem Statement

The current position lifecycle flows (CREATE, CLAIM, CLOSE, REBALANCE) exhibit inconsistent error handling patterns across layers:

- Mixed use of `console.error`, `logger.error`, and `throw` statements
- No centralized error classification system (transient vs. permanent failures)
- Weak retry logic relying solely on BullMQ defaults without domain-specific strategies
- User-facing error messages are often technical and not actionable
- Error boundaries are poorly defined, causing failures to propagate unpredictably
- Missing validation in critical paths (e.g., FIXME at line 227 in `create-position.scene.ts`)

This results in:
- Poor user experience with cryptic error messages
- Difficulty diagnosing production issues
- Unnecessary retries for permanent failures
- Silent failures in non-critical paths

## Decision Drivers

- **User Experience:** Users need clear, actionable error messages
- **Observability:** Operations team needs structured error data for debugging
- **Reliability:** System must distinguish transient from permanent failures
- **Maintainability:** Developers need consistent error patterns across codebase
- **Performance:** Avoid wasting resources retrying permanent failures

## Considered Options

### Option 1: Status Code Based Classification
Create HTTP-like error codes (400, 500) for different error types.

**Pros:**
- Familiar pattern from web development
- Easy to map to user-facing messages

**Cons:**
- Doesn't fit non-HTTP contexts well
- Limited semantic meaning beyond categories

### Option 2: Error Class Hierarchy (SELECTED)
Implement domain-specific error classes with built-in classification.

**Pros:**
- Type-safe error handling with TypeScript
- Rich context and metadata support
- Clear separation of error categories
- Integrates well with logging and monitoring

**Cons:**
- Requires more initial boilerplate
- Need to ensure consistent adoption across codebase

### Option 3: Error Result Pattern (Either/Result monad)
Use Result<T, E> types instead of throwing exceptions.

**Pros:**
- Explicit error handling in type signatures
- Forces developers to handle errors
- Functional programming benefits

**Cons:**
- Significant refactoring required
- Less idiomatic in TypeScript/Node.js ecosystem
- Steeper learning curve for team

## Decision

We will implement **Option 2: Error Class Hierarchy** with the following structure:

### Error Classification Taxonomy

```typescript
// Base error class with common properties
abstract class DomainError extends Error {
  abstract readonly code: string;
  abstract readonly category: ErrorCategory;
  abstract readonly retryable: boolean;
  abstract readonly userMessage: string;
  
  constructor(
    message: string,
    public readonly context?: Record<string, any>
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

enum ErrorCategory {
  VALIDATION = "VALIDATION",           // Invalid input
  AUTHORIZATION = "AUTHORIZATION",     // Permission denied
  NOT_FOUND = "NOT_FOUND",            // Resource not found
  BLOCKCHAIN = "BLOCKCHAIN",           // On-chain errors
  EXTERNAL_SERVICE = "EXTERNAL_SERVICE", // Third-party API failures
  INTERNAL = "INTERNAL",              // System/unexpected errors
}

// Specific error classes
class ValidationError extends DomainError {
  readonly code = "VALIDATION_ERROR";
  readonly category = ErrorCategory.VALIDATION;
  readonly retryable = false;
  
  constructor(field: string, reason: string, context?: Record<string, any>) {
    super(`Validation failed for ${field}: ${reason}`, context);
    this.userMessage = `Invalid ${field}: ${reason}`;
  }
}

class InsufficientBalanceError extends DomainError {
  readonly code = "INSUFFICIENT_BALANCE";
  readonly category = ErrorCategory.VALIDATION;
  readonly retryable = false;
  
  constructor(required: number, available: number, token: string) {
    super(`Insufficient balance: need ${required} ${token}, have ${available}`, {
      required,
      available,
      token,
    });
    this.userMessage = `Insufficient ${token} balance. You need ${required} but only have ${available}.`;
  }
}

class TransactionFailedError extends DomainError {
  readonly code = "TRANSACTION_FAILED";
  readonly category = ErrorCategory.BLOCKCHAIN;
  readonly retryable: boolean;
  
  constructor(signature: string, reason: string, isTransient: boolean = false) {
    super(`Transaction ${signature} failed: ${reason}`, { signature, reason });
    this.retryable = isTransient;
    this.userMessage = isTransient
      ? "Transaction failed due to network congestion. Please try again."
      : `Transaction failed: ${reason}`;
  }
}

class RpcError extends DomainError {
  readonly code = "RPC_ERROR";
  readonly category = ErrorCategory.EXTERNAL_SERVICE;
  readonly retryable = true;
  
  constructor(endpoint: string, originalError: Error) {
    super(`RPC call to ${endpoint} failed`, {
      endpoint,
      originalError: originalError.message,
    });
    this.userMessage = "Blockchain network is temporarily unavailable. Please try again.";
  }
}

class PositionNotFoundError extends DomainError {
  readonly code = "POSITION_NOT_FOUND";
  readonly category = ErrorCategory.NOT_FOUND;
  readonly retryable = false;
  
  constructor(positionId: string) {
    super(`Position ${positionId} not found`, { positionId });
    this.userMessage = "Position not found. It may have been closed or never existed.";
  }
}

class UnauthorizedError extends DomainError {
  readonly code = "UNAUTHORIZED";
  readonly category = ErrorCategory.AUTHORIZATION;
  readonly retryable = false;
  
  constructor(resource: string, userId: string) {
    super(`User ${userId} unauthorized to access ${resource}`, { resource, userId });
    this.userMessage = "You don't have permission to perform this action.";
  }
}

class AdapterError extends DomainError {
  readonly code = "ADAPTER_ERROR";
  readonly category = ErrorCategory.EXTERNAL_SERVICE;
  readonly retryable: boolean;
  
  constructor(dex: string, operation: string, originalError: Error, isTransient: boolean = true) {
    super(`${dex} adapter failed for ${operation}`, {
      dex,
      operation,
      originalError: originalError.message,
    });
    this.retryable = isTransient;
    this.userMessage = isTransient
      ? `${dex} is temporarily unavailable. Please try again.`
      : `Unable to complete operation on ${dex}. Please contact support.`;
  }
}

class InternalError extends DomainError {
  readonly code = "INTERNAL_ERROR";
  readonly category = ErrorCategory.INTERNAL;
  readonly retryable = true;
  
  constructor(message: string, context?: Record<string, any>) {
    super(message, context);
    this.userMessage = "An unexpected error occurred. Our team has been notified. Please try again later.";
  }
}
```

### Error Handling Middleware Pattern

```typescript
// Use case error wrapper
abstract class UseCase<TCommand, TResult> {
  abstract execute(command: TCommand): Promise<TResult>;
  
  protected async executeWithErrorHandling(
    command: TCommand,
    operation: string
  ): Promise<TResult> {
    try {
      return await this.execute(command);
    } catch (error) {
      if (error instanceof DomainError) {
        // Already classified, just log and rethrow
        logger.error({
          error: error.message,
          code: error.code,
          category: error.category,
          context: error.context,
        }, `[${operation}] Domain error`);
        throw error;
      }
      
      // Classify unknown errors
      logger.error({ error }, `[${operation}] Unexpected error`);
      throw new InternalError(
        error instanceof Error ? error.message : "Unknown error",
        { operation, originalError: error }
      );
    }
  }
}

// Scene error handler
function handleSceneError(ctx: BotContext, error: unknown) {
  if (error instanceof DomainError) {
    logger.warn({
      userId: ctx.user?.id,
      error: error.message,
      code: error.code,
    }, "Scene error");
    
    return ctx.reply(
      `❌ ${error.userMessage}\n\nIf you need help, use /help to contact support.`
    );
  }
  
  logger.error({ error }, "Unexpected scene error");
  return ctx.reply(
    "❌ An unexpected error occurred. Our team has been notified. Please try again later."
  );
}

// Worker retry strategy
function shouldRetryJob(error: unknown, attemptsMade: number): boolean {
  if (!(error instanceof DomainError)) {
    // Unknown errors: retry up to 3 times
    return attemptsMade < 3;
  }
  
  if (!error.retryable) {
    // Non-retryable errors: don't retry
    return false;
  }
  
  // Retryable errors: use exponential backoff
  const maxAttempts = error.category === ErrorCategory.EXTERNAL_SERVICE ? 5 : 3;
  return attemptsMade < maxAttempts;
}
```

### Integration Points

1. **Use Cases**: Wrap execute methods with error classification
2. **Scenes**: Add error boundary middleware for all user interactions
3. **Workers**: Implement custom retry logic based on error classification
4. **Adapters**: Throw appropriate domain errors with proper classification
5. **Validation**: Use ValidationError consistently for all input validation

## Consequences

### Positive

- **Clear User Messages**: Every error has a user-friendly message
- **Structured Logging**: Consistent error metadata for debugging
- **Smart Retries**: System only retries transient failures
- **Type Safety**: TypeScript ensures proper error handling
- **Observability**: Easy to aggregate errors by category/code
- **Documentation**: Error classes serve as documentation of failure modes

### Negative

- **Migration Effort**: Existing code needs to be refactored to use new error classes
- **Learning Curve**: Team needs to learn when to use each error class
- **Boilerplate**: More code required compared to simple throw statements
- **Consistency Risk**: Partial adoption could lead to mixed error handling patterns

### Neutral

- **Testing**: Need to update tests to expect specific error types
- **Monitoring**: Error dashboards will need to be updated to use new error codes

## Implementation Plan

### Phase 1: Foundation (Week 1)
1. Create error class hierarchy in `src/domain/errors/`
2. Add error handling middleware for use cases and scenes
3. Update logging utility to handle DomainError instances

### Phase 2: Critical Paths (Week 2-3)
1. Refactor CreatePositionUseCase error handling
2. Refactor ClaimFeesUseCase error handling
3. Refactor ClosePositionUseCase error handling
4. Refactor RebalancePositionUseCase error handling
5. Update transaction-confirm.worker error handling

### Phase 3: Adapters & Services (Week 4)
1. Update MeteoraAdapter to throw domain errors
2. Update WalletService error handling
3. Update SwapService error handling
4. Update validation utilities

### Phase 4: Scenes & UI (Week 5)
1. Add error boundaries to all scenes
2. Update error messages throughout UI
3. Add error recovery suggestions

### Phase 5: Testing & Documentation (Week 6)
1. Add unit tests for all error classes
2. Update integration tests
3. Document error handling patterns in README
4. Train team on new patterns

## Validation

Success criteria:
- ✅ All position lifecycle operations use domain errors
- ✅ No console.error statements in production code
- ✅ User-facing errors are actionable and clear
- ✅ Error rates decrease due to better retry logic
- ✅ Mean time to resolution (MTTR) decreases due to better logging

## References

- [System Design Document](../SystemDesign.md) - Error Handling section
- [PRD](../PRD.md) - Non-Functional Requirements: Reliability
- Railway Oriented Programming: https://fsharpforfunandprofit.com/rop/
- TypeScript Error Handling Best Practices: https://kentcdodds.com/blog/get-a-catch-block-error-message-with-typescript
