# LP Strategy Pattern

This module implements a modular strategy pattern for liquidity provision (LP) strategies, enabling clean separation of concerns and easy extensibility.

## Architecture Overview

The strategy pattern provides:

- **Type-safe strategy management** with TypeScript discriminated unions
- **Compile-time exhaustiveness checking** to prevent unhandled strategies
- **Cross-DEX compatibility** through adapter interfaces
- **Extension points** for single-sided deposits and custom parameters
- **Metadata-driven UI** generation capabilities

## Core Components

### 1. Strategy Types (`types.ts`)

Defines all core types and interfaces:

- **`StrategyName`**: Union type of all available strategies (`"spot" | "curve" | "bid-ask"`)
- **`ILPStrategy`**: Core interface all strategies must implement
- **`DepositPlan`**: Output from strategy calculations
- **`StrategyMetadata`**: Describes strategy capabilities and requirements
- **`DepositMode`**: How liquidity is provided (`sol_auto_convert`, `single_token_a`, `single_token_b`)

### 2. Base Strategy (`base-strategy.ts`)

Abstract base class providing:

- Common validation logic
- Helper methods for range calculations
- Fee estimation utilities
- Swap plan creation

### 3. Concrete Strategies

**Spot Strategy** (`spot-strategy.ts`)
- Evenly distributes liquidity across the range
- Beginner-friendly, low maintenance
- Risk level: 2/5
- Suitable for volatile pairs

**Curve Strategy** (`curve-strategy.ts`)
- Concentrates liquidity in the middle of the range
- Capital efficient, higher fee earnings
- Risk level: 3/5
- Suitable for stable pairs

**Bid-Ask Strategy** (`bid-ask-strategy.ts`)
- Provides liquidity on the edges for directional exposure
- Advanced strategy, high risk/reward
- Risk level: 4/5
- Suitable for experienced traders

### 4. Strategy Registry (`strategy-registry.ts`)

Centralized registry providing:

- **Type-safe strategy access**: `strategyRegistry.get("spot")`
- **Exhaustiveness checking**: `assertNever()` helper for switch statements
- **DEX compatibility filtering**: `strategyRegistry.getForDex("meteora")`
- **Strategy recommendations**: Based on user experience level

## Usage Examples

### 1. Getting a Strategy

```typescript
import { strategyRegistry, StrategyName } from "@/domain/strategies";

// Type-safe access
const strategy = strategyRegistry.get("spot");

// With fallback for unknown names
const strategy = strategyRegistry.getOrDefault(userInput);

// Get all available strategies
const allStrategies = strategyRegistry.getAll();

// Filter by DEX compatibility
const meteoraStrategies = strategyRegistry.getForDex("meteora");
```

### 2. Calculating Deposit Plans

```typescript
const strategy = strategyRegistry.get("spot");

const depositPlan = await strategy.calculateDepositPlan({
  poolAddress: "8sLbNZoA1cfnvMJLPfp98ZLAnFSYCFApfJKMbiXNLwxj",
  dex: "meteora",
  tokenA: { address: "So11...", symbol: "SOL", decimals: 9 },
  tokenB: { address: "EPjF...", symbol: "USDC", decimals: 6 },
  currentPrice: 102.5,
  depositMode: "sol_auto_convert",
  solAmount: 1.0,
  priceChangePercentage: 10,
});

console.log(depositPlan);
// {
//   mode: "sol_auto_convert",
//   tokenAAmount: 0.5,
//   tokenBAmount: 51.25,
//   swaps: [...],
//   priceRange: { min: 92.25, max: 112.75, rangeInterval: 10 },
//   estimatedFees: { ... }
// }
```

### 3. Validating Strategy Parameters

```typescript
const strategy = strategyRegistry.get("curve");

const validation = await strategy.validate({
  depositMode: "sol_auto_convert",
  solAmount: 1.0,
  solBalance: 5.0,
});

if (!validation.valid) {
  console.error(validation.error);
}

if (validation.warnings) {
  console.warn(validation.warnings);
}
```

### 4. Getting DEX-Specific Parameters

```typescript
const strategy = strategyRegistry.get("spot");

const depositPlan = await strategy.calculateDepositPlan({...});

const dexParams = await strategy.getDexParams("meteora", depositPlan);

console.log(dexParams);
// {
//   dex: "meteora",
//   params: {
//     strategyType: "Spot",
//     rangeInterval: 10,
//     minBinId: -10,
//     maxBinId: 10
//   }
// }
```

### 5. Exhaustive Strategy Handling

```typescript
import { assertNever, StrategyName } from "@/domain/strategies";

function handleStrategy(strategyName: StrategyName) {
  switch (strategyName) {
    case "spot":
      return handleSpot();
    case "curve":
      return handleCurve();
    case "bid-ask":
      return handleBidAsk();
    // If a new strategy is added and not handled here,
    // TypeScript will error at compile time
  }
  
  return assertNever(strategyName);
}
```

## Adding a New Strategy

To add a new strategy (e.g., "range-order"):

### Step 1: Add Strategy Name to Type

```typescript
// src/domain/strategies/types.ts
export type StrategyName = "spot" | "curve" | "bid-ask" | "range-order";
```

This immediately causes TypeScript errors in all places where strategies are handled, ensuring you don't forget to update anything.

### Step 2: Create Strategy Class

```typescript
// src/domain/strategies/range-order-strategy.ts
import { BaseLPStrategy } from "./base-strategy";
import { StrategyMetadata, ... } from "./types";

export class RangeOrderStrategy extends BaseLPStrategy {
  readonly metadata: StrategyMetadata = {
    name: "range-order",
    displayName: "Range Order",
    description: "Limit order-like behavior with liquidity provision",
    // ... other metadata
    compatibleDexes: ["meteora"],
  };

  async validateStrategy(params: ValidateStrategyParams): Promise<ValidationResult> {
    // Custom validation logic
  }

  async calculateDepositPlan(params: CalculateDepositPlanParams): Promise<DepositPlan> {
    // Custom deposit calculation
  }

  async getDexParams(dex: DexType, depositPlan: DepositPlan): Promise<DexStrategyParams> {
    // DEX-specific parameter mapping
  }
}
```

### Step 3: Register Strategy

```typescript
// src/domain/strategies/strategy-registry.ts
import { RangeOrderStrategy } from "./range-order-strategy";

export class StrategyRegistry {
  constructor() {
    this.register(new SpotStrategy());
    this.register(new CurveStrategy());
    this.register(new BidAskStrategy());
    this.register(new RangeOrderStrategy()); // Add here
  }
}
```

### Step 4: Export from Index

```typescript
// src/domain/strategies/index.ts
export { RangeOrderStrategy } from "./range-order-strategy";
```

### Step 5: Update Adapters (if needed)

```typescript
// src/adapters/dex/meteora.adapter.ts
// If the strategy requires special SDK handling, update mapStrategyToSDK
```

### Step 6: Add Tests

```typescript
// src/domain/strategies/__tests__/range-order-strategy.test.ts
describe("RangeOrderStrategy", () => {
  // Test validation, calculation, DEX params, etc.
});
```

## Type Safety Guarantees

The strategy pattern provides several compile-time safety guarantees:

1. **Exhaustive Strategy Names**: All strategy names must be in the `StrategyName` union
2. **Switch Exhaustiveness**: Using `assertNever()` ensures all cases are handled
3. **Strategy Map Completeness**: The `StrategyMap` type ensures all strategies are registered
4. **DEX Compatibility**: Runtime checks with TypeScript guards for DEX support

## Integration with Adapters

DEX adapters consume strategy outputs through the standard interface:

```typescript
// In Meteora adapter
const lpStrategy = strategyRegistry.getOrDefault(params.strategy);

// Validate DEX compatibility
if (!lpStrategy.supportsDex(this.dexType)) {
  throw new Error(`Strategy not supported`);
}

// Get DEX-specific params
const meteoraType = toMeteoraStrategyType(lpStrategy.metadata.name);
const strategy = this.mapStrategyToSDK(meteoraType);

// Use default range from strategy metadata
const rangeInterval = params.rangeInterval ?? lpStrategy.metadata.defaultRangeInterval;
```

## Extension Points

### Single-Sided Deposits

Strategies declare support via metadata:

```typescript
supportedDepositModes: ["sol_auto_convert", "single_token_a", "single_token_b"]
```

Token requirements are specified per mode:

```typescript
tokenRequirements: {
  balanced: [
    { token: "A", required: true },
    { token: "B", required: true }
  ],
  singleSidedA: [
    { token: "A", required: true },
    { token: "B", required: false }
  ]
}
```

### Custom DEX Parameters

Each strategy can return DEX-specific parameters:

```typescript
async getDexParams(dex: DexType, depositPlan: DepositPlan): Promise<DexStrategyParams> {
  switch (dex) {
    case "meteora":
      return {
        dex,
        params: {
          strategyType: "Spot",
          rangeInterval: depositPlan.priceRange?.rangeInterval,
          customMeteoraParam: "value"
        }
      };
    // ... other DEXes
  }
}
```

## Best Practices

1. **Always use `strategyRegistry.getOrDefault()`** for user input to handle unknown strategies gracefully
2. **Use `assertNever()`** in switch statements to ensure exhaustive handling
3. **Check DEX compatibility** before using a strategy with a specific adapter
4. **Leverage strategy metadata** for UI generation (descriptions, warnings, risk levels)
5. **Add comprehensive validation** in strategy implementations
6. **Test all deposit modes** for each strategy
7. **Document DEX-specific behaviors** in strategy class comments

## Testing

```typescript
import { strategyRegistry } from "@/domain/strategies";

describe("Strategy Pattern", () => {
  it("should register all strategies", () => {
    const strategies = strategyRegistry.getAll();
    expect(strategies).toHaveLength(3); // Update when adding strategies
  });

  it("should provide type-safe access", () => {
    const strategy = strategyRegistry.get("spot");
    expect(strategy.metadata.name).toBe("spot");
  });

  it("should handle unknown strategies", () => {
    const strategy = strategyRegistry.getOrDefault("unknown");
    expect(strategy.metadata.name).toBe("spot"); // Falls back to spot
  });

  it("should filter by DEX compatibility", () => {
    const meteoraStrategies = strategyRegistry.getForDex("meteora");
    expect(meteoraStrategies.length).toBeGreaterThan(0);
  });
});
```

## Future Enhancements

- **Dynamic strategy loading**: Plugin architecture for third-party strategies
- **Strategy composition**: Combine multiple strategies
- **Historical performance**: Track strategy success rates
- **AI recommendations**: ML-based strategy selection
- **Strategy marketplace**: Community-contributed strategies
