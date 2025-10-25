# SOL Auto-Convert Implementation

## Overview

This document describes the implementation of SOL auto-convert functionality for position creation in the Meteora Liquidity Bot. When users select "SOL Auto-convert" as their deposit method, the system automatically swaps their SOL into the required pool tokens before creating the position.

## Problem Statement

Previously, when users selected "SOL Auto-convert" and entered an amount of SOL (e.g., 5 SOL), the system would:

1. Calculate expected token amounts using Jupiter quotes
2. Try to create a position using those calculated amounts
3. **Fail** because the user doesn't actually have the required tokens in their wallet

The root cause was that the system was calculating expected token amounts but not actually executing the swaps to acquire those tokens.

## Solution Architecture

The solution implements a multi-step transaction flow:

1. **Swap Execution Phase**: Execute two parallel swaps (SOL → TokenA, SOL → TokenB)
2. **Position Creation Phase**: After both swaps confirm, create the position using received tokens
3. **Error Handling**: Handle failures at each step with proper user notifications

## Implementation Details

### 1. New Job Types

#### Swap Execution Job
- **Job Name**: `JOB_SWAP_EXECUTION`
- **Purpose**: Execute SOL→Token swaps using Jupiter
- **Worker**: `SwapExecutionWorker`
- **Concurrency**: 3 (allows parallel swap processing)

#### Enhanced Transaction Confirmation
- **New Operation Type**: `SOL_TO_TOKEN_SWAP`
- **Enhanced Handler**: Process swap confirmations and trigger position creation

### 2. Modified Components

#### CreatePositionUseCase
```typescript
// New method to handle SOL auto-convert
private async handleSolAutoConvert(
  command: CreatePositionCommand
): Promise<CreatePositionUCResult>
```

**Key Features**:
- Generates unique position creation ID for tracking
- Calculates SOL amounts (50/50 split after fees)
- Enqueues two parallel swap jobs
- Stores context in pending transactions for later position creation

#### SwapExecutionWorker
```typescript
export class SwapExecutionWorker implements IWorker<SwapExecutionJobData>
```

**Key Features**:
- Executes SOL→Token swaps via Jupiter API
- Handles swap failures with proper error messages
- Stores swap results in pending transactions
- Supports retry logic for failed swaps

#### Enhanced TransactionConfirmWorker
```typescript
// New methods added
private async handleSwapConfirmation(signature: string, userId: string)
private async proceedWithPositionCreation(positionCreationId: string, confirmedSwaps: any[])
```

**Key Features**:
- Tracks swap confirmations per position creation
- Waits for both swaps to complete before proceeding
- Extracts actual received amounts from swap results
- Creates position using real token amounts (not just estimates)

### 3. Transaction Flow

#### Step 1: User Initiates Position Creation
1. User selects pool, strategy, and "SOL Auto-convert"
2. User enters SOL amount (e.g., 5 SOL)
3. System calculates:
   - Fee: 5 SOL × 1% = 0.05 SOL
   - Net amount: 4.95 SOL
   - Swap amounts: 2.475 SOL → TokenA, 2.475 SOL → TokenB

#### Step 2: Swap Execution
1. **Two parallel swap jobs are enqueued**:
   - Job 1: SOL → TokenA (2.475 SOL)
   - Job 2: SOL → TokenB (2.475 SOL)

2. **SwapExecutionWorker processes each job**:
   - Gets Jupiter quote for swap
   - Executes swap via Privy wallet
   - Stores swap result with actual received amounts
   - Updates pending transaction status

#### Step 3: Position Creation
1. **TransactionConfirmWorker monitors swap confirmations**:
   - Updates swap transaction status to "CONFIRMED"
   - Checks if both swaps for the same position creation are confirmed
   - Extracts actual token amounts received (may differ from quotes due to slippage)

2. **When both swaps confirm**:
   - Calls `proceedWithPositionCreation()`
   - Builds position creation transaction using actual received amounts
   - Submits position transaction via Privy wallet
   - Updates original pending transaction with real signature

#### Step 4: User Experience
1. **Immediate Feedback**: "🔄 SOL Conversion in Progress" message
2. **Progress Tracking**: Links to swap transaction monitoring
3. **Completion Notification**: Standard position creation success message
4. **Portfolio Update**: New position appears in user's portfolio

### 4. Error Handling

#### Swap Failures
- **Insufficient Balance**: Clear error with required vs. available amounts
- **Jupiter API Errors**: Retry with exponential backoff
- **Transaction Failures**: User-friendly error messages with retry options

#### Position Creation Failures
- **Insufficient Tokens**: Error if swaps didn't provide enough tokens
- **Slippage Too High**: Offer to retry with higher slippage
- **Network Issues**: Automatic retry with fallback RPCs

### 5. Database Schema Changes

#### Pending Transactions Table
```sql
-- New operation types
ALTER TYPE pending_transactions.operationType ADD VALUE 'SOL_TO_TOKEN_SWAP';

-- New status for tracking swaps
ALTER TYPE pending_transactions.status ADD VALUE 'PENDING_SWAPS';
```

#### Metadata Structure
```typescript
// Swap execution metadata
{
  positionCreationId: string;    // Links swaps to position creation
  swapIndex: "first" | "second"; // Which swap in pair
  inputMint: string;             // SOL_MINT
  outputMint: string;            // Token address
  inputAmount: string;             // Amount in lamports
  outputAmount: string;            // Actual received amount
  expectedOutputAmount?: string;  // Expected amount for comparison
}

// Position creation context (enhanced)
{
  depositMethod: "sol_auto_convert";
  solAmount: number;              // Original SOL amount
  // ... existing fields
}
```

### 6. User Interface Changes

#### Enhanced Progress Messages
```typescript
// SOL auto-convert in progress
"🔄 *SOL Conversion in Progress*\n\n" +
`Converting your SOL to ${poolData?.tokenA.symbol} and ${poolData?.tokenB.symbol}...\n\n` +
`${solScanLink}\n\n` +
`⏳ This usually takes 1-2 minutes. You'll receive a notification when your position is created.\n\n` +
`💡 *Tip:* Your position will be created with the exact amounts received from swaps.`
```

#### Transaction Links
- **Swap Tracking**: "Track Swaps" instead of "View Transaction"
- **Position Creation**: Standard "View Transaction" link

### 7. Performance Considerations

#### Concurrency
- **Swap Workers**: 3 concurrent workers for parallel processing
- **Transaction Workers**: 20 concurrent for fast confirmations
- **Rate Limiting**: Respects Jupiter API limits

#### Caching
- **Jupiter Quotes**: 30-second TTL to avoid repeated API calls
- **Token Prices**: 60-second TTL for amount calculations
- **Pool Data**: 5-minute TTL for pool information

#### Error Recovery
- **Automatic Retries**: 3 attempts with exponential backoff
- **Dead Letter Queue**: Failed jobs moved to DLT after max retries
- **Circuit Breaker**: Pauses processing on high failure rates

### 8. Security Considerations

#### Transaction Safety
- **Simulation First**: All transactions simulated before submission
- **Slippage Protection**: Default 0.5% slippage, user configurable
- **Buffer Amounts**: 0.01 SOL reserved for transaction fees

#### Wallet Security
- **Privy Integration**: All swaps signed via secure Privy wallets
- **Non-custodial**: Bot never handles private keys
- **Transaction Limits**: Rate limiting prevents abuse

### 9. Monitoring & Logging

#### Key Metrics
- **Swap Success Rate**: Percentage of successful swaps
- **Position Creation Time**: Time from SOL entry to position creation
- **Slippage Impact**: Difference between quoted and actual amounts
- **Error Rates**: By error type and reason

#### Logging Structure
```typescript
logger.info("[SwapExecutionWorker] Swap executed successfully", {
  userId,
  positionCreationId,
  swapIndex,
  signature: swapResult.result.signature,
  inputAmount,
  outputAmount: swapResult.result.outputAmount,
});

logger.info("[TxConfirmWorker] Both swaps confirmed, proceeding with position creation", {
  positionCreationId,
  swapCount: confirmedSwaps.length,
});
```

### 10. Future Enhancements

#### Potential Improvements
1. **Atomic Swaps**: Use Jupiter's batch swap API when available
2. **Dynamic Slippage**: Adjust slippage based on market conditions
3. **Cross-DEX Routing**: Route swaps through optimal DEXes
4. **Fee Optimization**: Minimize total transaction costs
5. **Real-time Quotes**: Stream quotes during position creation

#### Multi-Token Support
- **Multi-Token Pools**: Extend to pools with >2 tokens
- **Custom Ratios**: Allow users to set custom token ratios
- **Partial Swaps**: Support partial SOL conversion with existing tokens

## Testing

### Test Scenarios
1. **Happy Path**: 5 SOL → SOL-USDC position with 50/50 split
2. **Insufficient Balance**: 10 SOL with 5 SOL available
3. **High Slippage**: Volatile pool during high volatility
4. **Network Congestion**: Multiple users creating positions simultaneously
5. **Partial Failure**: One swap succeeds, one fails

### Rollout Plan
1. **Phase 1**: Deploy swap execution worker and job definitions
2. **Phase 2**: Update CreatePositionUseCase with SOL auto-convert logic
3. **Phase 3**: Enhance transaction confirmation worker
4. **Phase 4**: Update UI with progress messages
5. **Phase 5**: Monitor and optimize based on metrics

## Conclusion

The SOL auto-convert implementation provides a seamless user experience by:

1. **Eliminating Manual Steps**: Users don't need to manually swap tokens
2. **Accurate Position Creation**: Uses actual received amounts, not estimates
3. **Robust Error Handling**: Clear error messages and recovery options
4. **Transparent Process**: Users can track each step of the conversion
5. **Maintaining Security**: All operations through secure Privy wallets

This implementation ensures that users can successfully create positions using only SOL, with the bot handling all the complex swap logistics in the background.