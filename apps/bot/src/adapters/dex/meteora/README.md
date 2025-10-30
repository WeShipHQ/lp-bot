# Meteora DEX Adapter

This module provides a complete implementation of the Meteora DEX adapter for the bot's v2 architecture.

## Components

### MeteoraDlmmService (`meteora-dlmm.service.ts`)

Low-level service that wraps the Meteora DLMM SDK and provides:

- Position creation and management
- Pool state queries
- Transaction building with compute budget optimization
- SOL auto-convert support via Jupiter integration

#### Key Methods

- `buildCreatePositionIxs()` - Legacy instruction builder (returns raw instructions)
- `buildCreatePositionTransaction()` - **V2 transaction builder** (returns VersionedTransaction with preview data)
- `buildClosePositionIxs()` - Close position instructions
- `buildClaimFeesIxs()` - Claim fees instructions
- `calculatePriceRange()` - Calculate price range for bin intervals

### MeteoraAdapter (`../../meteora.adapter.ts`)

High-level adapter that implements `IDexAdapter` interface:

- `createPositionIxs()` - Legacy method for backward compatibility
- `createPosition()` - **V2 method** that calls `buildCreatePositionTransaction()`
- `closePositionIxs()` - Close position
- `claimFeesIxs()` - Claim fees
- `getPool()` - Fetch pool data
- `getUserPositions()` - Fetch user positions

## Transaction Building Flow

### V2 Architecture (Recommended)

```typescript
// 1. Use MeteoraAdapter.createPosition()
const adapter = dexRegistry.get('meteora');
const result = await adapter.createPosition({
  poolAddress: "PoolXXX",
  userAddress: "UserXXX", 
  tokenAAmount: "1.0",
  tokenBAmount: "100",
  strategy: "spot",
  rangeInterval: 10,
  solAutoConvert: {
    solAmount: 5.0,
    jupiterQuotes: {
      tokenX: { /* ... */ },
      tokenY: { /* ... */ }
    }
  }
});

// 2. Result contains:
// - transaction: VersionedTransaction ready for signing
// - signers: [positionKeypair] 
// - preview: { tokenAmounts, priceRange, fees, strategy }
// - metadata: { positionAddress, poolAddress, binRange }
```

### Legacy Architecture (Deprecated)

```typescript
// Old flow - returns raw instructions only
const result = await adapter.createPositionIxs({...});
// result.instructions: TransactionInstruction[]
// result.positionKp: Keypair
```

## Transaction Structure

The V2 builder creates a transaction with:

1. **Compute Budget Instructions**
   - `setComputeUnitLimit`: 200k (basic) or 400k (with SOL convert)
   - `setComputeUnitPrice`: Priority fee (default 1000 microlamports)

2. **Swap Instructions** (if SOL auto-convert)
   - Jupiter swap: SOL → TokenA
   - Jupiter swap: SOL → TokenB

3. **Position Instructions**
   - Initialize position account
   - Add liquidity to bins based on strategy

## Strategy Support

| Strategy | Description | Use Case |
|----------|-------------|----------|
| `spot` | Balanced liquidity around current price | Stable pairs, beginners |
| `curve` | Concentrated liquidity in narrow range | Experienced users, volatile pairs |
| `bid-ask` | Single-sided liquidity | Directional bets, specific tokens |

Each strategy maps to Meteora SDK `StrategyType` enum:
- `spot` → `StrategyType.Spot` (0)
- `curve` → `StrategyType.Curve` (1)
- `bid-ask` → `StrategyType.BidAsk` (2)

## Preview Data

The V2 builder returns rich preview data for UI display:

```typescript
interface Preview {
  // Token composition
  tokenAAmount: string;
  tokenBAmount: string;
  tokenASymbol: string;
  tokenBSymbol: string;
  
  // Price range
  priceRange: {
    min: string;    // Lower price bound
    max: string;    // Upper price bound
    current: string; // Current market price
  };
  
  // Cost breakdown
  fees: {
    network: string;  // Base network fee (0.000005 SOL)
    swap?: string;    // Swap fees (if SOL convert)
    total: string;    // Total cost in SOL
  };
  
  // Strategy details
  strategy: {
    type: string;           // "spot" | "curve" | "bid-ask"
    minBinId: number;       // Lower bin boundary
    maxBinId: number;       // Upper bin boundary
    activeBinId: number;    // Current active bin
    rangeInterval: number;  // Bins from active (±)
  };
  
  slippage?: number; // User-specified slippage tolerance
}
```

## SOL Auto-Convert

When users want to provide liquidity with SOL:

1. **Calculate Split**:
   - Split SOL 50/50 after fees
   - Reserve buffer for transaction fees

2. **Get Jupiter Quotes**:
   ```typescript
   const quotes = await jupiterService.getQuote({
     inputMint: SOL_MINT,
     outputMint: tokenMint,
     amount: solAmountLamports,
   });
   ```

3. **Build Transaction**:
   - Include swap instructions in transaction
   - Calculate expected output amounts
   - Add slippage tolerance

4. **Preview Shows**:
   - Estimated token amounts after swaps
   - Swap fees (2x swap operations)
   - Total cost including priority fees

## Testing

Run unit tests:
```bash
pnpm test meteora-dlmm-transaction-builder.test.ts
```

Tests cover:
- Transaction building for all strategies
- Bin range calculation
- Fee estimation
- SOL auto-convert flow
- Preview data accuracy
- Error handling

## Migration from V1

If you're using the old `createPositionIxs()`:

**Before:**
```typescript
const result = await adapter.createPositionIxs(params);
// Manually build transaction
// Manually estimate fees
// No preview data
```

**After:**
```typescript
const result = await adapter.createPosition(params);
// Transaction ready to sign
// Fees estimated
// Preview data included
```

## Future Enhancements

- [ ] Multi-hop swaps for exotic token pairs
- [ ] Dynamic priority fee calculation based on network congestion
- [ ] Transaction simulation before building
- [ ] Advanced bin strategies (custom distributions)
- [ ] Rebalancing transaction builder
