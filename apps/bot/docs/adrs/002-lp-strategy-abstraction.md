# ADR 002: Liquidity Provision Strategy Abstraction Pattern

**Status:** Proposed  
**Date:** 2025-01-XX  
**Deciders:** Engineering Team  
**Context:** Baseline position flow audit

## Context and Problem Statement

The position creation wizard currently handles strategy-specific logic directly in `create-position.scene.ts`, leading to:

- Tight coupling between presentation logic and strategy details
- Incomplete feature support (e.g., single-sided deposits branch contains TODOs)
- Difficulty introducing new strategies (Spot, Curve, Bid-Ask share same pipeline)
- Missing hooks for strategy-specific validation, price range calculations, and messaging
- Hard to reuse strategies across other flows (rebalance, auto-rebalance, analytics)

To support the PRD’s plan for advanced strategies, we need a formal abstraction that encapsulates strategy-specific behavior across the stack.

## Decision Drivers

- **Extensibility:** Enable rapid introduction of new strategies
- **Consistency:** Ensure strategy behavior is consistent across create/rebalance flows
- **Maintainability:** Reduce duplication and conditional logic in scenes
- **Testability:** Allow isolated testing of strategy logic
- **User Experience:** Provide accurate, strategy-specific guidance to users

## Considered Options

### Option 1: Expand Scene Logic with Switch Statements
Keep strategy logic centralized in the scene and use-case files using switch statements.

**Pros:**
- Minimal refactoring effort
- Keeps logic in one place initially

**Cons:**
- Strategy behavior scattered across multiple functions
- Difficult to test strategy logic in isolation
- High risk of regression when adding new strategies

### Option 2: Strategy Registry with Command Objects (SELECTED)
Implement Strategy objects with a shared interface that encapsulate all strategy-specific behavior. Use a registry for discovery.

**Pros:**
- Clean separation of strategy behavior
- Easy to add new strategies by implementing the interface
- Strategies reusable across flows (create, rebalance, analytics)
- Enables feature flags and A/B testing for strategies

**Cons:**
- Requires refactoring of existing flows
- Slight overhead introducing new abstraction

### Option 3: Strategy Microservices
Move strategy logic to separate services or Lambda functions.

**Pros:**
- Complete isolation of strategy logic
- Potential for independent scaling per strategy

**Cons:**
- Overkill for current scope
- Latency from network calls
- Increases operational complexity

## Decision

We will implement **Option 2: Strategy Registry with Command Objects** using the Strategy Pattern backed by dependency injection.

### Strategy Interface

```typescript
export interface PositionStrategy {
  readonly id: MeteoraCreatePositionStrategy; // 'spot' | 'curve' | 'bid-ask' | ...
  readonly displayName: string;
  readonly description: string;
  readonly recommendedFor: string;
  readonly riskLevel: 'low' | 'medium' | 'high';
  readonly supportsSingleSided: boolean;
  
  // Presentation layer hooks
  getWizardSteps(context: StrategyContext): StrategyStep[];
  getSummary(context: StrategyContext): StrategySummary;
  getUserFacingWarnings(context: StrategyContext): string[];
  
  // Application layer hooks
  derivePriceRange(input: PriceRangeInput): Promise<PriceRangeResult>;
  computeDepositDistribution(input: DepositInput): Promise<DepositResult>;
  validateDeposit(input: DepositValidationInput): ValidationResult;
  
  // Rebalance hooks
  adjustRebalancePlan?(input: RebalanceInput): RebalancePlan;
  
  // Analytics hooks
  getPerformanceMetrics?(position: PositionModel): StrategyMetrics;
}
```

### Strategy Registry

```typescript
class StrategyRegistry {
  private strategies = new Map<MeteoraCreatePositionStrategy, PositionStrategy>();
  
  register(strategy: PositionStrategy) {
    this.strategies.set(strategy.id, strategy);
  }
  
  get(id: MeteoraCreatePositionStrategy): PositionStrategy {
    const strategy = this.strategies.get(id);
    if (!strategy) {
      throw new StrategyNotFoundError(id);
    }
    return strategy;
  }
  
  list(): PositionStrategy[] {
    return Array.from(this.strategies.values());
  }
}
```

### Implementation Plan

1. **Define Shared Types** (Week 1)
   - `StrategyContext` for wizard state
   - `StrategyStep` describing wizard UI elements
   - `DepositInput`, `PriceRangeInput`, `RebalanceInput` data models

2. **Port Spot Strategy** (Week 2)
   - Implement `SpotStrategy` class
   - Migrate existing logic from scene/use-case
   - Update create-position scene to pull steps from strategy

3. **Add Curve & Bid-Ask Strategies** (Week 3)
   - Implement dedicated classes for each strategy
   - Leverage strategy-specific price range and messaging
   - Update analytics to track strategy performance

4. **Integrate Rebalance Flow** (Week 4)
   - Use strategies to drive rebalance planning
   - Support custom range intervals per strategy

5. **Enable Feature Flags** (Week 5)
   - Allow toggling strategies based on user segments
   - Instrument usage metrics per strategy

6. **Documentation & Testing** (Week 6)
   - Document strategy development guide
   - Add unit tests for each strategy class
   - Update position flow docs with new abstraction

### Example Strategy Implementation

```typescript
class SpotStrategy implements PositionStrategy {
  readonly id = 'spot';
  readonly displayName = 'Spot (Balanced)';
  readonly description = 'Evenly distributes liquidity around the current price';
  readonly recommendedFor = 'General-purpose, volatile pairs';
  readonly riskLevel: 'low' | 'medium' | 'high' = 'medium';
  readonly supportsSingleSided = false;
  
  getWizardSteps(context: StrategyContext): StrategyStep[] {
    return [
      {
        key: 'deposit_method',
        type: 'selection',
        options: [
          { id: 'sol_auto_convert', label: 'Balanced (SOL only)', default: true },
          { id: 'single_sided', label: 'Single-sided (coming soon)', disabled: true },
        ],
      },
      {
        key: 'amount',
        type: 'amount',
        token: 'SOL',
        minAmount: 0.1,
      },
      {
        key: 'auto_rebalance',
        type: 'toggle',
        default: true,
      },
    ];
  }
  
  async derivePriceRange(input: PriceRangeInput): Promise<PriceRangeResult> {
    const { pool, userPreferences } = input;
    const rangeInterval = userPreferences?.defaultBinRange ?? 10;
    const priceRange = await getPriceRangeUseCase.execute({
      poolAddress: pool.address,
      dex: pool.dex,
      rangeInterval,
    });
    return {
      min: priceRange.fromPrice,
      max: priceRange.toPrice,
      rangeInterval,
    };
  }
  
  async computeDepositDistribution(input: DepositInput): Promise<DepositResult> {
    const { solAmount, pool } = input;
    const dist = await calculateBalancedDistributionUseCase.execute({
      pool,
      solAmount,
    });
    return {
      tokenAAmount: dist.tokenAAmount,
      tokenBAmount: dist.tokenBAmount,
      fees: dist.fees,
    };
  }
  
  validateDeposit(input: DepositValidationInput): ValidationResult {
    if (input.solAmount < 0.1) {
      return { valid: false, reason: 'Minimum deposit is 0.1 SOL' };
    }
    return { valid: true };
  }
}
```

## Consequences

### Positive

- **Extensibility:** Easily add new strategies with minimal risk
- **Consistency:** Strategy behavior unified across flows (create, rebalance)
- **Testability:** Each strategy can be tested independently
- **UX:** Tailored messaging and validation per strategy
- **Future-proofing:** Supports advanced features like dynamic strategies

### Negative

- **Refactoring Effort:** Requires significant code changes to adopt
- **Duplication Risk:** Need to avoid duplication in shared behaviors (e.g., SOL auto-convert)
- **Runtime Overhead:** Slight overhead to resolve strategy objects (negligible)

### Neutral

- **Learning Curve:** Team must learn how to register and implement strategies
- **Tooling:** Need to ensure DI container supports strategy registry

## Validation

Success criteria:
- ✅ No strategy-specific logic remains in scene/use-case files
- ✅ New strategies can be added without modifying existing ones
- ✅ Strategy behavior configurable without code changes (via registry)
- ✅ Tests cover all strategy behaviors
- ✅ UX strings pulled from strategy definitions

## Related Work

- ADR 003 (State management) – strategy steps plug into state machine
- ADR 004 (Transaction safety) – strategy-specific transaction flows must be idempotent

## References

- [PRD](../PRD.md) – Strategy definitions and UX requirements
- [Create Position Scene](../../src/presentation/scenes/create-position.scene.ts)
- [Rebalance Position Use Case](../../src/application/position/rebalance-position.use-case.ts)
- Strategy Pattern in TypeScript: https://refactoring.guru/design-patterns/strategy/typescript
