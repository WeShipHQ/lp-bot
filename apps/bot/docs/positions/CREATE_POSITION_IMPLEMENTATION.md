# CREATE POSITION Flow - Error Handling & Validation

## Overview
This document outlines the current implementation of the CREATE POSITION flow focusing on error handling, validation, and user experience improvements.

## Key Components

### 1. Error Framework (ADR-001)
- **File:** `apps/bot/src/domain/position/errors/position-errors.ts`
- Defines 13 domain-specific error classes with user-friendly messages
- Provides retry metadata (`retryable`, `calculateBackoff`) and categories
- Exported via `apps/bot/src/domain/position/index.ts`

### 2. Use Case Integration
- **File:** `apps/bot/src/application/position/create-position.use-case.ts`
- Throws PositionErrors (e.g., `InvalidPositionAmountError`, `AdapterError`, `SignatureRejectedError`, `PositionPersistenceError`)
- Returns `error.userMessage` for PositionErrors
- Ensures all validation and adapter failures surface clear, actionable messages to the user

### 3. Flow Validation
- **File:** `apps/bot/src/services/flows/create-position-flow.ts`
- Validation step leverages error framework and strategy registry
- Provides consistent error messages when flows are executed through the flow system

### 4. Presentation Layer
- **File:** `apps/bot/src/presentation/scenes/create-position.scene.ts`
- Uses `formatErrorWithHelp` to display friendly messages and support instructions
- Ensures users see consistent error formatting regardless of error origin

### 5. Error Display Utilities
- **File:** `apps/bot/src/presentation/utils/error-display.util.ts`
- Functions include:
  - `formatErrorForDisplay`
  - `formatErrorWithRetry`
  - `formatErrorWithHelp`
  - `shouldShowRetryButton`
  - `getErrorCategory`

## Current Execution Path

```
Scene → CreatePositionUseCase → WalletService → Pending Transactions → TransactionConfirmWorker → positionPersistenceService
```

- The existing execution path remains unchanged
- All error handling improvements have been integrated directly into `CreatePositionUseCase`
- Flow definition enhancements prepare for future migrations without affecting the current execution

## User Experience Improvements

- Users now receive clear, actionable messages (e.g., "Insufficient SOL balance. You need 5 but only have 2.")
- Retry guidance is provided for transient issues
- Help options guide users to /help for further assistance
- Logging captures structured metadata for debugging and monitoring

## Testing Checklist

- Validate domain errors instantiate with correct messages and metadata
- Ensure `CreatePositionUseCase` throws and surfaces errors correctly
- Verify scene displays formatted messages
- Confirm flow validation returns PositionError messages when executed via flow system
- Manually test common failure scenarios:
  - Invalid amounts
  - Pool validation
  - Insufficient balance
  - Adapter errors
  - Signature rejection
  - Database persistence failure

## Future Considerations

- The current implementation keeps the architecture simple while providing immediate UX improvements
- Flow state machine integration remains available for future use if orchestration requirements increase
- Monitor error categories to identify recurring issues and improve user guidance

## Summary

The CREATE POSITION flow now benefits from:
- A comprehensive error framework
- Enhanced validation with strategy integration
- Improved user messaging in the presentation layer
- Consistent error handling across use case, flow, and UI layers

These improvements deliver immediate value without requiring changes to the existing execution architecture.
