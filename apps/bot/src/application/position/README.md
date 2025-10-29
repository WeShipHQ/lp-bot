# Position Use Cases

## Create Position Use Case

The `CreatePositionUseCase` orchestrates the creation of liquidity positions with comprehensive validation and business rule enforcement.

### Features

#### 1. Preview Mode
The `preview()` method provides deterministic estimates without executing transactions:
- Token distribution calculations (50/50 split for balanced strategies)
- Price range estimation based on strategy
- Fee breakdown (position creation fee + transaction fees)
- Slippage guidance based on pool liquidity
- User warnings for risky pools

#### 2. Execution Mode
The `execute()` method creates positions with full validation:
- Position limit enforcement (max 10 active positions)
- Minimum deposit validation (≥0.1 SOL)
- Balance checking with fee buffer (0.01 SOL)
- SOL auto-convert flow (swaps then position creation)
- Direct position creation with existing tokens

#### 3. Input Validation
Uses Zod schemas for type-safe input validation:
- `CreatePositionPreviewInputSchema` - For preview requests
- `CreatePositionExecuteInputSchema` - For execution requests

### Usage Examples

#### Preview Position Creation
```typescript
const useCase = new CreatePositionUseCase(dexRegistry, positionRepository);

const previewInput: CreatePositionPreviewInput = {
  userId: "user-id",
  poolAddress: "pool-address",
  dex: "meteora",
  tokenA: { address: "...", symbol: "SOL", decimals: 9 },
  tokenB: { address: "...", symbol: "USDC", decimals: 6 },
  strategy: "spot",
  depositMethod: "sol_auto_convert",
  solAmount: 1.0,
  autoRebalance: true,
};

const result = await useCase.preview(previewInput);
if (result.success) {
  console.log("Price range:", result.priceRange);
  console.log("Token amounts:", result.tokenAmounts);
  console.log("Fees:", result.fees);
  console.log("Warnings:", result.warnings);
}
```

#### Execute Position Creation
```typescript
const executeInput: CreatePositionExecuteInput = {
  ...previewInput,
  walletId: "wallet-id",
  walletAddress: "wallet-address",
  tokenAAmount: "0.005",
  tokenBAmount: "500",
};

const result = await useCase.execute(executeInput);
if (result.success) {
  console.log("Transaction signature:", result.signature);
  console.log("Position address:", result.positionAddress);
  console.log("Pending transaction ID:", result.pendingTransactionId);
}
```

### Business Rules Enforced

1. **Position Limits**
   - Maximum 10 active positions per user
   - Checked before preview and execution

2. **Minimum Deposits**
   - SOL auto-convert: ≥0.1 SOL
   - Single-sided: Token-specific minimums

3. **Balance Requirements**
   - SOL balance check includes 0.01 SOL buffer for fees
   - Fails gracefully if balance check fails (fail-open pattern)

4. **Fee Calculations**
   - 1% position creation fee (OPEN_POSITION_FEE)
   - Estimated transaction fee (~0.000005 SOL)
   - Total cost displayed in preview

5. **Error Handling**
   - User-friendly error messages
   - Automatic mapping of technical errors
   - Validation errors from Zod schemas

### Transaction Pipeline

The use case delegates to the transaction pipeline:

1. **Direct Creation** (single-sided or existing tokens)
   - Build transaction via DEX adapter
   - Sign and send via WalletService
   - Record pending transaction in database
   - Enqueue confirmation job

2. **SOL Auto-Convert** (balanced positions)
   - Split SOL 50/50 after fees
   - Enqueue swap jobs (SOL → TokenA, SOL → TokenB)
   - Position creation occurs after swaps complete
   - Tracked via position creation ID

### Pending Transaction Format

```typescript
{
  signature: string,              // Transaction signature or position creation ID
  operationType: "CREATE_POSITION",
  userId: string,
  status: "PENDING",
  metadata: {
    command: { /* execution parameters */ },
    positionContext: { /* full position context */ },
    rebalanceSession?: { /* optional rebalance metadata */ }
  },
  retryCount: 0,
  maxRetries: 3
}
```

### Testing

Comprehensive unit tests cover:
- Preview success scenarios
- Execution validation
- Position limit enforcement
- Balance checking
- Error message formatting
- Fee calculations

Run tests:
```bash
pnpm test create-position.use-case
```

### Migration Notes

#### Legacy Code Removal
The following legacy methods should be marked for removal:
- `PositionService.createBalancedPositionV1` - Replaced by this use case
- Direct adapter calls from scenes - Should use this use case

#### Integration Points
- Scenes should call `useCase.preview()` before showing confirmation
- Scenes should call `useCase.execute()` after user confirmation
- Results include all data needed for user display

### Future Enhancements

1. **Token-specific validation**
   - Check token balance for single-sided deposits
   - Validate token account existence

2. **Advanced strategies**
   - Curve strategy with custom price ranges
   - Bid-ask strategy for directional positions

3. **Slippage configuration**
   - User-configurable slippage tolerance
   - Dynamic slippage based on pool conditions

4. **Gas optimization**
   - Priority fee estimation
   - Transaction batching
