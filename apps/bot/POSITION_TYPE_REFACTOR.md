# Position Type Refactor Summary

## Overview
This refactor reshapes the position type hierarchy to separate raw on-chain data from price-enriched data. The goal is to create a cleaner separation of concerns where DEX adapters only return raw blockchain data, and USD value calculations happen at the service/formatter layer.

## Type Hierarchy Changes

### Before (OLD)
```typescript
interface UnifiedPosition {
  // ... token info, amounts
  currentValueUsd: number;
  initialValueUsd: number;
  unclaimedFeesUsd: number;
  claimedFeesUsd: number;
  pnlUsd: number;
  pnlPercentage: number;
  // ...
}
```

### After (NEW)
```typescript
// Raw position - no USD/PnL fields
interface UnifiedPosition {
  id: string;
  address: string;
  poolAddress: string;
  dex: DexType;
  type: PoolType;
  tokenA: Token;
  tokenB: Token;
  tokenAAmount: string;
  tokenBAmount: string;
  inRange: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  metadata?: Record<string, any>;
}

// Enriched with current prices
interface PositionWithPrices extends UnifiedPosition {
  currentValueUsd: number;
  unclaimedFeesUsd: number;
  claimedFeesUsd: number;
  unclaimedRewardsUsd?: number;
  claimedRewardsUsd?: number;
}

// Full position with historical context
interface UserPosition extends PositionWithPrices {
  initialValueUsd: number;
  pnlUsd: number;
  pnlPercentage: number;
}
```

## Files Modified

### Type Definitions
1. **`src/types/core.types.ts`**
   - Removed USD/PnL fields from `UnifiedPosition`
   - Added `PositionWithPrices` interface
   - Added `UserPosition` interface
   - Updated `UnifiedPortfolio` to use `UserPosition[]`

2. **`src/shared/types/position.types.ts`**
   - Same changes as above (duplicate definition removed)

3. **`src/shared/types/portfolio.types.ts`**
   - Updated `UnifiedPortfolio.positions` to use `UserPosition[]`
   - Updated `PortfolioMetrics` types to use `UserPosition`

### Adapter Layer
4. **`src/adapters/dex/meteora/meteora-transformers.ts`**
   - Removed USD value calculations from `onChainToUnifiedPosition()`
   - Returns raw position data only

5. **`src/services/saros/saros.adapter.ts`**
   - Removed USD value initialization from `transformSarosPositionToUnified()`
   - Returns raw position data only

6. **`src/adapters/base-dex.adapter.ts`**
   - Deprecated `getUserPortfolio()` method
   - Added deprecation comment explaining portfolio enrichment should happen at service layer

7. **`src/types/dex-adapter.interface.ts`**
   - Added `@deprecated` JSDoc to `getUserPortfolio()` interface method

### Service Layer
8. **`src/application/portfolio/get-portfolio.use-case.ts`**
   - Removed `p.updateCurrentValue(Money.usd(up.currentValueUsd))` call
   - Added comment about USD calculation moving to enrichment layer

9. **`src/application/portfolio/sync-portfolio.use-case.ts`**
   - Removed `p.updateCurrentValue(Money.usd(u.currentValueUsd))` call
   - Added comment about enrichment layer

10. **`src/application/position/get-position.use-case.ts`**
    - Removed `position.updateCurrentValue(Money.usd(onchain.currentValueUsd))` call
    - Added comment about USD calculation in formatter layer

### Presentation Layer
11. **`src/presentation/formatters/position-detail.formatter.ts`**
    - Changed `unclaimedFeesUsd` to use hardcoded 0 (with comment)
    - Calculates USD values from token amounts + prices

12. **`src/presentation/formatters/portfolio.formatter.ts`**
    - Updated `formatPositionList` signature to accept both `UnifiedPosition[]` and `UserPosition[]`
    - Note: `formatOverview` uses `currentValueUsd` which is fine since it receives `UnifiedPortfolio` with `UserPosition[]`

13. **`src/presentation/commands/portfolio.ts`**
    - Removed fee enrichment logic that accessed `up.unclaimedFeesUsd`
    - Added comment about enrichment happening elsewhere

14. **`src/presentation/handlers/portfolio.ts`**
    - Removed fee enrichment logic that accessed `up.unclaimedFeesUsd`
    - Added comment about enrichment happening elsewhere

## Migration Guide

### For Adapter Implementers
When implementing a new DEX adapter, your `getUserPositions()` and `getPosition()` methods should:

**DO:**
- Return raw token amounts (as strings)
- Include position status (`inRange`, `isActive`)
- Include timestamps
- Store DEX-specific metadata in the `metadata` field

**DON'T:**
- Calculate USD values
- Calculate PnL
- Calculate fees in USD
- Access price APIs

**Example:**
```typescript
async getUserPositions(userAddress: string): Promise<UnifiedPosition[]> {
  const rawPositions = await this.fetchFromBlockchain(userAddress);
  
  return rawPositions.map(pos => ({
    id: pos.id,
    address: pos.address,
    poolAddress: pos.poolAddress,
    dex: 'meteora',
    type: 'DLMM',
    tokenA: pos.tokenA,
    tokenB: pos.tokenB,
    tokenAAmount: pos.amountA.toString(), // Raw amount
    tokenBAmount: pos.amountB.toString(), // Raw amount
    inRange: pos.activeId >= pos.lowerBin && pos.activeId <= pos.upperBin,
    isActive: true,
    createdAt: new Date(pos.createdAt),
    updatedAt: new Date(pos.updatedAt),
    metadata: { /* dex-specific data */ }
  }));
}
```

### For Service Layer
When working with positions at the service layer:

1. **Fetch raw positions** from adapters via `getUserPositions()`
2. **Calculate USD values** separately if needed using price service
3. **Build enriched types** (`PositionWithPrices`, `UserPosition`) for presentation layer

```typescript
// Example enrichment pattern
const rawPositions = await adapter.getUserPositions(userAddress);
const prices = await priceService.getPrices(tokenAddresses);

const enrichedPositions: UserPosition[] = rawPositions.map(pos => {
  const tokenAPrice = prices[pos.tokenA.address]?.price ?? 0;
  const tokenBPrice = prices[pos.tokenB.address]?.price ?? 0;
  
  const tokenAUi = parseFloat(pos.tokenAAmount);
  const tokenBUi = parseFloat(pos.tokenBAmount);
  
  const currentValueUsd = tokenAUi * tokenAPrice + tokenBUi * tokenBPrice;
  
  // Fetch initial value from DB
  const dbPosition = await positionRepo.findByAddress(pos.address);
  const initialValueUsd = dbPosition?.initialValueUsd ?? 0;
  
  const pnlUsd = currentValueUsd - initialValueUsd;
  const pnlPercentage = initialValueUsd > 0 ? (pnlUsd / initialValueUsd) * 100 : 0;
  
  return {
    ...pos,
    currentValueUsd,
    unclaimedFeesUsd: 0, // Calculate from fee amounts + prices
    claimedFeesUsd: dbPosition?.claimedFeesUsd ?? 0,
    initialValueUsd,
    pnlUsd,
    pnlPercentage,
  };
});
```

## Benefits

1. **Separation of Concerns**: Adapters only handle blockchain data, not pricing
2. **Easier Testing**: Can test adapters without mocking price APIs
3. **Better Caching**: Can cache raw positions separately from prices
4. **Multi-DEX Support**: Uniform raw data from all DEXes, enriched consistently
5. **Performance**: Can batch price lookups for multiple positions
6. **Flexibility**: Different views can enrich differently (e.g., different fiat currencies)

## Migration Status

✅ Type definitions updated
✅ Adapter implementations updated (Meteora, Saros)
✅ Service layer updated to not expect USD fields
✅ Presentation layer updated to calculate USD values locally
⚠️ Fee enrichment logic temporarily disabled (needs dedicated service)
⏳ Database Position entity still tracks currentValueUsd (future work)

## Next Steps

1. Create a `PositionEnrichmentService` to centralize USD/PnL calculations
2. Update fee claiming to work with enriched positions
3. Consider removing `currentValueUsd` from database Position entity
4. Add tests for the new type hierarchy
5. Update documentation with enrichment patterns
