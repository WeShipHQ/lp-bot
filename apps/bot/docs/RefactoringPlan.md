# Refactoring Plan
## Meteora Liquidity Bot - Code Restructuring Strategy

**Version:** 1.0  
**Last Updated:** October 17, 2025  
**Target:** apps/bot folder  
**Focus:** Meteora DEX (with multi-DEX extensibility)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Current State Assessment](#2-current-state-assessment)
3. [Target Architecture](#3-target-architecture)
4. [Refactoring Strategy](#4-refactoring-strategy)
5. [Module-by-Module Refactoring](#5-module-by-module-refactoring)
6. [Step-by-Step Implementation Plan](#6-step-by-step-implementation-plan)
7. [Testing Strategy](#7-testing-strategy)
8. [Risk Mitigation](#8-risk-mitigation)
9. [Success Criteria](#9-success-criteria)

---

## 1. Executive Summary

### 1.1 Purpose
This document provides a comprehensive refactoring plan for the Telegram bot codebase in the `apps/bot` folder. The current codebase implements most features for Meteora and Saros but suffers from poor structure, tight coupling, and lack of maintainability.

### 1.2 Key Problems Identified
1. **Bloated Services:** `position.service.ts` is 114KB with mixed responsibilities
2. **Incomplete Adapters:** MeteoraAdapter doesn't implement BaseDexAdapter interface
3. **Inconsistent Error Handling:** No unified error handling strategy
4. **Tight Coupling:** Services directly instantiate dependencies
5. **Missing Abstractions:** No clear domain layer separation
6. **Code Duplication:** Similar logic repeated across services
7. **Poor Testability:** Hard-coded dependencies, no dependency injection
8. **Unclear Ownership:** Responsibilities blur between layers

### 1.3 Refactoring Goals
1. **Modularity:** Clear separation of concerns across layers
2. **Extensibility:** Easy to add new DEXes without touching existing code
3. **Maintainability:** Single Responsibility Principle, clear ownership
4. **Testability:** Dependency injection, mockable interfaces
5. **Performance:** Optimize database queries, implement caching
6. **Reliability:** Consistent error handling, retry logic, circuit breakers

### 1.4 Success Metrics
- Reduce largest service file size from 114KB to < 30KB
- Achieve 80%+ test coverage
- All services < 500 lines of code
- Zero circular dependencies
- Add new DEX adapter in < 1 week
- < 5% performance regression (ideally improvements)

---

## 2. Current State Assessment

### 2.1 Folder Structure Analysis

**Current Structure:**
```
apps/bot/src/
├── adapters/               # ✅ Good: Adapter pattern started
│   ├── base-dex.adapter.ts
│   └── token.adapter.ts
├── assets/                 # ✅ Good: Separate assets
├── bot/                    # ⚠️ Mixed: Bot logic + handlers + utils
│   ├── commands/          # ✅ Good: Command pattern
│   ├── config/            # ✅ Good: Configuration
│   ├── constants/         # ✅ Good: Constants separated
│   ├── handlers/          # ✅ Good: Handler separation
│   ├── keyboards/         # ✅ Good: UI separated
│   ├── middleware/        # ✅ Good: Middleware pattern
│   ├── scenes/            # ✅ Good: Scene-based flows
│   └── utils/             # ⚠️ Mixed: Too many utils
├── config/                # ✅ Good: Global config
├── db/                    # ✅ Good: Database layer
│   ├── migrations/
│   └── schema.ts
├── plugins/               # ✅ Good: Fastify plugins
├── services/              # ❌ Bad: Bloated, mixed responsibilities
│   ├── meteora/           # ⚠️ Partial: Not using adapter pattern
│   ├── saros/             # ✅ Good: Uses adapter pattern
│   ├── hot-pools/         # ⚠️ Unclear: Purpose mixed with services
│   ├── position.service.ts      # ❌ 114KB!
│   ├── portfolio.service.ts     # ❌ 24KB, mixed concerns
│   ├── message.service.ts       # ❌ 37KB, too many responsibilities
│   ├── job-queue.service.ts     # ⚠️ 20KB, monolithic
│   └── [30+ other services]     # ⚠️ Too many, unclear boundaries
├── types/                 # ✅ Good: Type definitions
└── utils/                 # ✅ Good: Utility functions
```

### 2.2 Identified Issues by Category

#### 2.2.1 Architecture Issues

**Issue: Inconsistent Adapter Implementation**
- **Problem:** `MeteoraAdapter` exists but doesn't extend `BaseDexAdapter`
- **Location:** `src/services/meteora/meteora.adapter.ts`
- **Impact:** Can't use uniform DEX interface, breaks registry pattern
- **Evidence:**
  ```typescript
  // Current: MeteoraAdapter doesn't implement IDexAdapter
  export class MeteoraAdapter {
    async transformDlmmPool(apiData: MeteoraDlmmPool): Promise<Pool>
    // Only transforms data, doesn't implement full interface
  }
  
  // Expected: Should implement full interface
  export class MeteoraAdapter extends BaseDexAdapter implements IDexAdapter {
    async getPool(poolId: string): Promise<UnifiedPool>
    async getTrendingPools(...): Promise<PaginatedTrendingPools>
    async createPosition(...): Promise<TransactionResult>
    // ... all interface methods
  }
  ```

**Issue: Service Layer Over-Responsibilities**
- **Problem:** Services handle business logic, data access, formatting, and orchestration
- **Example:** `position.service.ts` (114KB) does:
  - Position creation (business logic)
  - Database operations (data access)
  - Message formatting (presentation)
  - Transaction building (domain logic)
  - Analytics calculation (business logic)
  - Fee claiming (business logic)
  - Rebalancing (business logic)
- **Impact:** Difficult to test, maintain, extend

**Issue: No Clear Domain Layer**
- **Problem:** Business rules scattered across services and adapters
- **Missing:** Domain models with behavior, domain events
- **Impact:** Logic duplication, inconsistent validation

#### 2.2.2 Code Quality Issues

**Issue: Bloated Service Files**
- **Files Over 10KB:**
  - `position.service.ts`: 114KB ❌
  - `message.service.ts`: 37KB ⚠️
  - `portfolio.service.ts`: 24KB ⚠️
  - `job-queue.service.ts`: 20KB ⚠️
  - `position-analytics.service.ts`: 19KB ⚠️
  - `solana.service.ts`: 16KB ⚠️
  - `token-price.service.ts`: 14KB ⚠️
- **Impact:** Hard to understand, navigate, test

**Issue: Hard-Coded Dependencies**
- **Problem:** Services directly instantiate dependencies
- **Example:**
  ```typescript
  // In position.service.ts
  class PositionService {
    private portfolioService = new PortfolioService();
    private solanaService = new SolanaService();
    private jupiterService = new JupiterService();
    // Hard to mock for testing
  }
  ```
- **Impact:** Tight coupling, poor testability, circular dependencies

**Issue: Inconsistent Error Handling**
- **Problem:** Different error handling approaches across services
- **Examples:**
  - Some throw raw errors
  - Some wrap in custom error types
  - Some log and swallow
  - No unified error recovery strategy
- **Impact:** Unpredictable error behavior, hard to debug

#### 2.2.3 Performance Issues

**Issue: No Caching Strategy**
- **Problem:** Every request fetches from external APIs/blockchain
- **Missing:** Redis caching for token prices, pool data, portfolios
- **Impact:** Slow responses, high RPC costs, rate limiting

**Issue: N+1 Query Problem**
- **Problem:** Fetching positions in loop without batch loading
- **Example:**
  ```typescript
  // In portfolio.service.ts
  for (const position of positions) {
    const poolData = await getPool(position.poolAddress); // N queries!
  }
  ```
- **Impact:** Slow portfolio loading

**Issue: Unoptimized Database Queries**
- **Problem:** Missing indexes, inefficient queries
- **Impact:** Slow database operations as data grows

#### 2.2.4 Testing Issues

**Issue: Low Test Coverage**
- **Problem:** Very few tests, especially integration tests
- **Coverage:** Estimated < 20% based on `vitest.config.ts` setup
- **Impact:** Fear of refactoring, bugs in production

**Issue: Untestable Code**
- **Problem:** Services too complex, hard-coded dependencies
- **Example:** Can't test `PositionService` without actual Solana connection
- **Impact:** Can't verify correctness without deploying

### 2.3 Technical Debt Quantification

**Estimated Refactoring Effort:**
- **High Priority Issues:** 2-3 weeks
- **Medium Priority Issues:** 1-2 weeks
- **Low Priority Issues:** 1 week
- **Testing & Documentation:** 1 week
- **Total:** 5-7 weeks

**Risk Level:** Medium-High
- Code is functional but fragile
- Changes risk breaking existing features
- Requires careful incremental refactoring

---

## 3. Target Architecture

### 3.1 Desired Folder Structure

```
apps/bot/src/
├── adapters/                       # External system adapters
│   ├── dex/                       # DEX-specific adapters
│   │   ├── base-dex.adapter.ts
│   │   ├── meteora.adapter.ts    # Refactored
│   │   ├── saros.adapter.ts      # Already good
│   │   └── orca.adapter.ts       # Future
│   ├── blockchain/                # Blockchain adapters
│   │   ├── solana.adapter.ts
│   │   └── transaction.adapter.ts
│   └── external-api/              # External API adapters
│       ├── jupiter.adapter.ts
│       ├── privy.adapter.ts
│       └── token-metadata.adapter.ts
│
├── application/                    # Application services (use cases)
│   ├── position/
│   │   ├── create-position.use-case.ts
│   │   ├── close-position.use-case.ts
│   │   ├── claim-fees.use-case.ts
│   │   └── rebalance-position.use-case.ts
│   ├── portfolio/
│   │   ├── get-portfolio.use-case.ts
│   │   ├── calculate-metrics.use-case.ts
│   │   └── sync-portfolio.use-case.ts
│   ├── wallet/
│   │   ├── connect-wallet.use-case.ts
│   │   ├── get-balance.use-case.ts
│   │   └── send-tokens.use-case.ts
│   └── trending/
│       ├── get-trending-pools.use-case.ts
│       └── search-pools.use-case.ts
│
├── domain/                         # Domain models and logic
│   ├── position/
│   │   ├── position.entity.ts
│   │   ├── position.repository.ts
│   │   ├── position.validators.ts
│   │   └── position.events.ts
│   ├── pool/
│   │   ├── pool.entity.ts
│   │   ├── pool.value-objects.ts
│   │   └── pool.repository.ts
│   ├── user/
│   │   ├── user.entity.ts
│   │   ├── user.repository.ts
│   │   └── user.validators.ts
│   └── shared/
│       ├── value-objects/
│       └── errors/
│
├── infrastructure/                 # Infrastructure concerns
│   ├── cache/
│   │   ├── cache.service.ts
│   │   └── cache-keys.ts
│   ├── database/
│   │   ├── connection.ts
│   │   ├── migrations/
│   │   └── repositories/       # Concrete repository implementations
│   ├── jobs/
│   │   ├── job-queue.ts
│   │   ├── workers/
│   │   │   ├── position-monitor.worker.ts
│   │   │   ├── rebalance.worker.ts
│   │   │   └── notification.worker.ts
│   │   └── job-definitions.ts
│   └── logging/
│       └── logger.ts
│
├── presentation/                   # Presentation layer (Telegram bot)
│   ├── commands/                  # Keep as-is (already good)
│   ├── scenes/                    # Keep as-is (already good)
│   ├── keyboards/                 # Keep as-is (already good)
│   ├── handlers/                  # Keep as-is (already good)
│   ├── middleware/                # Keep as-is (already good)
│   ├── formatters/                # Extract from utils
│   │   ├── pool.formatter.ts
│   │   ├── position.formatter.ts
│   │   └── portfolio.formatter.ts
│   └── validators/                # Input validation
│       └── telegram-input.validator.ts
│
├── shared/                         # Shared utilities and types
│   ├── types/                     # Type definitions
│   ├── constants/                 # Constants
│   ├── utils/                     # Pure utility functions
│   └── errors/                    # Error classes
│
├── config/                         # Configuration (keep as-is)
├── db/                            # Database schema (keep as-is)
└── index.ts                       # Entry point
```

### 3.2 Layer Responsibilities

**Presentation Layer (presentation/):**
- Handle Telegram user interactions
- Route commands to use cases
- Format responses for Telegram
- Validate user input
- **NO business logic, NO data access**

**Application Layer (application/):**
- Implement use cases (business workflows)
- Orchestrate between domain and infrastructure
- Transaction management
- **Thin layer, delegates to domain**

**Domain Layer (domain/):**
- Contain business rules and logic
- Entity behaviors and validations
- Domain events
- Repository interfaces (not implementations)
- **Pure TypeScript, NO external dependencies**

**Infrastructure Layer (infrastructure/):**
- Database access (repository implementations)
- External API calls
- Caching, logging, job queues
- **Technical concerns only**

**Adapters Layer (adapters/):**
- Transform external data to domain models
- Abstract external system details
- Provide uniform interfaces
- **Bridge between external world and domain**

### 3.3 Dependency Direction

```
┌────────────────┐
│ Presentation   │
└───────┬────────┘
        │ depends on
        ▼
┌────────────────┐
│  Application   │
└───────┬────────┘
        │ depends on
        ▼
┌────────────────┐      ┌────────────────┐
│    Domain      │ ◄─── │   Adapters     │
└───────┬────────┘      └────────────────┘
        │ depends on
        ▼
┌────────────────┐
│ Infrastructure │
└────────────────┘
```

**Key Rules:**
- Presentation depends on Application
- Application depends on Domain
- Infrastructure implements Domain interfaces
- Adapters transform external data to Domain models
- Domain has NO dependencies on outer layers

---

## 4. Refactoring Strategy

### 4.1 Approach: Incremental Refactoring (Strangler Fig Pattern)

**Why Incremental?**
- Minimize risk of breaking existing functionality
- Can deploy and test after each step
- Team can continue feature development
- Learn and adjust as we go

**Strategy:**
1. **Extract**: Extract new clean modules alongside old code
2. **Route**: Gradually route traffic to new modules
3. **Deprecate**: Mark old modules as deprecated
4. **Remove**: Delete old code once fully migrated

### 4.2 Refactoring Phases

**Phase 1: Foundation (Week 1)**
- Set up new folder structure
- Extract domain entities and value objects
- Define repository interfaces
- Implement dependency injection
- Set up testing infrastructure

**Phase 2: Core Services (Week 2-3)**
- Refactor position management
- Refactor portfolio management
- Refactor DEX adapters (complete Meteora adapter)
- Implement caching layer

**Phase 3: Supporting Services (Week 4)**
- Refactor wallet service
- Refactor trending service
- Refactor message service
- Implement error handling

**Phase 4: Infrastructure (Week 5)**
- Refactor job queue service
- Optimize database queries
- Implement circuit breakers
- Performance optimization

**Phase 5: Testing & Documentation (Week 6-7)**
- Write unit tests (80% coverage target)
- Write integration tests
- Update documentation
- Code review and cleanup

### 4.3 Guiding Principles

1. **Test First:** Write tests before refactoring
2. **Small Steps:** Each commit should be deployable
3. **Backward Compatible:** Keep old code working during migration
4. **Single Responsibility:** One class = one reason to change
5. **Interface Segregation:** Small, focused interfaces
6. **Dependency Inversion:** Depend on abstractions, not concretions

---

## 5. Module-by-Module Refactoring

### 5.1 Position Service Refactoring

**Current Problems:**
- 114KB file, 3000+ lines
- Mixed responsibilities: creation, closing, claiming, rebalancing, analytics
- Hard-coded dependencies
- Direct database access
- Message formatting mixed in

**Target Structure:**
```
domain/position/
├── position.entity.ts              # Position domain model with behavior
├── position.repository.ts          # Interface (implemented in infrastructure)
├── position.value-objects.ts       # PnL, TokenAmount, Range, etc.
├── position.validators.ts          # Domain validation rules
└── position.events.ts              # Domain events (PositionCreated, etc.)

application/position/
├── create-position.use-case.ts     # Use case for creating position
├── close-position.use-case.ts      # Use case for closing position
├── claim-fees.use-case.ts          # Use case for claiming fees
├── rebalance-position.use-case.ts  # Use case for rebalancing
└── get-position.use-case.ts        # Use case for fetching position

infrastructure/database/repositories/
└── position.repository.impl.ts     # Concrete Drizzle implementation
```

**Refactoring Steps:**

**Step 1: Extract Domain Entity**
```typescript
// domain/position/position.entity.ts
export class Position {
  private constructor(
    public readonly id: string,
    public readonly userId: string,
    public readonly poolAddress: string,
    public readonly dex: DexType,
    private status: PositionStatus,
    private currentValue: Money,
    private initialValue: Money,
    // ... other properties
  ) {}
  
  // Factory methods
  static create(params: CreatePositionParams): Position {
    // Validation
    if (params.amount <= 0) {
      throw new InvalidAmountError('Amount must be positive');
    }
    
    return new Position(
      generateId(),
      params.userId,
      params.poolAddress,
      params.dex,
      'ACTIVE',
      // ... initialize properties
    );
  }
  
  // Business logic methods
  calculatePnL(): PnL {
    const diff = this.currentValue.subtract(this.initialValue);
    return new PnL(diff, diff.divide(this.initialValue));
  }
  
  canClaim(): boolean {
    return this.status === 'ACTIVE' && this.unclaimedFees.greaterThan(Money.zero());
  }
  
  shouldRebalance(threshold: number): boolean {
    return !this.inRange && this.priceDeviation() > threshold;
  }
  
  // State transitions
  close(): void {
    if (this.status !== 'ACTIVE') {
      throw new InvalidStateError('Can only close active position');
    }
    this.status = 'CLOSED';
    // Emit domain event
    this.addEvent(new PositionClosedEvent(this.id));
  }
}
```

**Step 2: Extract Repository Interface**
```typescript
// domain/position/position.repository.ts
export interface IPositionRepository {
  findById(id: string): Promise<Position | null>;
  findByUser(userId: string): Promise<Position[]>;
  findActiveByUser(userId: string): Promise<Position[]>;
  save(position: Position): Promise<void>;
  update(position: Position): Promise<void>;
  delete(id: string): Promise<void>;
}

// infrastructure/database/repositories/position.repository.impl.ts
export class PositionRepository implements IPositionRepository {
  constructor(private db: PostgresJsDatabase) {}
  
  async findById(id: string): Promise<Position | null> {
    const [row] = await this.db
      .select()
      .from(positions)
      .where(eq(positions.id, id))
      .limit(1);
    
    if (!row) return null;
    
    // Map database row to domain entity
    return this.toDomain(row);
  }
  
  async save(position: Position): Promise<void> {
    const data = this.toPersistence(position);
    await this.db.insert(positions).values(data);
  }
  
  private toDomain(row: any): Position {
    // Map database row to domain entity
    return Position.reconstitute({
      id: row.id,
      userId: row.userId,
      // ... map all properties
    });
  }
  
  private toPersistence(position: Position): any {
    // Map domain entity to database row
    return {
      id: position.id,
      userId: position.userId,
      // ... map all properties
    };
  }
}
```

**Step 3: Extract Use Cases**
```typescript
// application/position/create-position.use-case.ts
export class CreatePositionUseCase {
  constructor(
    private positionRepository: IPositionRepository,
    private dexRegistry: DexRegistry,
    private walletService: IWalletService,
    private transactionService: ITransactionService,
  ) {}
  
  async execute(params: CreatePositionParams): Promise<CreatePositionResult> {
    // 1. Validate
    this.validateParams(params);
    
    // 2. Create domain entity
    const position = Position.create(params);
    
    // 3. Get DEX adapter
    const dexAdapter = this.dexRegistry.getAdapter(params.dex);
    
    // 4. Build transaction
    const transaction = await dexAdapter.createPosition({
      poolAddress: params.poolAddress,
      amount: params.amount,
      strategy: params.strategy,
    });
    
    // 5. Submit transaction
    const signature = await this.transactionService.submit(transaction);
    
    // 6. Wait for confirmation
    await this.transactionService.confirm(signature);
    
    // 7. Save to database
    position.setTransactionSignature(signature);
    await this.positionRepository.save(position);
    
    // 8. Enqueue monitoring job
    await this.jobQueue.enqueue('position-monitor', { positionId: position.id });
    
    return {
      positionId: position.id,
      signature,
    };
  }
  
  private validateParams(params: CreatePositionParams): void {
    if (!params.userId) throw new ValidationError('userId is required');
    if (!params.poolAddress) throw new ValidationError('poolAddress is required');
    // ... more validation
  }
}
```

**Step 4: Update Presentation Layer**
```typescript
// presentation/commands/create-position.command.ts (pseudocode in scene)
// In create-position.scene.ts
import { CreatePositionUseCase } from '@/application/position/create-position.use-case';

// In scene handler
async function handleConfirmation(ctx: SceneContext) {
  const useCase = container.resolve(CreatePositionUseCase);
  
  try {
    const result = await useCase.execute({
      userId: ctx.from.id,
      poolAddress: ctx.scene.state.poolAddress,
      amount: ctx.scene.state.amount,
      strategy: ctx.scene.state.strategy,
      dex: ctx.scene.state.dex,
    });
    
    await ctx.reply(
      formatSuccessMessage(result),
      getPositionDetailKeyboard(result.positionId)
    );
  } catch (error) {
    if (error instanceof InsufficientBalanceError) {
      await ctx.reply('Insufficient balance. Please add funds and try again.');
    } else {
      await ctx.reply('Failed to create position. Please try again.');
      logger.error(error);
    }
  }
}
```

**Benefits:**
- `position.service.ts` 114KB → split into ~10 files of < 15KB each
- Clear single responsibilities
- Easy to test each use case independently
- Business logic in domain, not services
- Repository pattern enables easy testing with mocks

---

### 5.2 DEX Adapter Refactoring (Meteora)

**Current Problems:**
- `MeteoraAdapter` doesn't implement `IDexAdapter` interface
- Only handles data transformation, not full operations
- Separate `MeteoraDlmmService` for operations (should be inside adapter)
- Can't use uniform interface with registry

**Target Structure:**
```
adapters/dex/
├── base-dex.adapter.ts              # Keep as-is (already good)
├── meteora.adapter.ts               # Refactor to implement full interface
└── dex-registry.ts                  # Keep, but ensure it works with all adapters

services/meteora/
├── meteora-dlmm.service.ts          # Rename and focus on SDK interactions
├── meteora-api.client.ts            # Extract API calls
└── types.ts                         # Meteora-specific types
```

**Refactoring Steps:**

**Step 1: Complete Meteora Adapter Implementation**
```typescript
// adapters/dex/meteora.adapter.ts
import { BaseDexAdapter } from './base-dex.adapter';
import { IDexAdapter } from '@/types/dex-adapter.interface';
import { MeteoraDlmmService } from '@/services/meteora/meteora-dlmm.service';
import { MeteoraApiClient } from '@/services/meteora/meteora-api.client';

export class MeteoraAdapter extends BaseDexAdapter implements IDexAdapter {
  readonly dexType: DexType = 'meteora';
  readonly name: string = 'Meteora';
  
  constructor(
    private dlmmService: MeteoraDlmmService,
    private apiClient: MeteoraApiClient,
    private tokenPriceService: ITokenPriceService,
  ) {
    super();
  }
  
  async getPool(poolId: string): Promise<UnifiedPool> {
    const meteoraPool = await this.apiClient.getPool(poolId);
    return this.transformToUnified(meteoraPool);
  }
  
  async getTrendingPools(params?: TrendingParams): Promise<PaginatedTrendingPools> {
    const meteoraPools = await this.apiClient.getTrendingPools(params);
    return {
      pools: meteoraPools.map(p => this.transformToUnified(p)),
      currentPage: params?.page || 1,
      totalPages: meteoraPools.totalPages,
      sortBy: params?.sortBy || 'tvl',
    };
  }
  
  async createPosition(params: CreatePositionParams): Promise<TransactionResult> {
    // Use dlmmService to build transaction
    const transaction = await this.dlmmService.buildCreatePositionTx({
      poolAddress: params.poolAddress,
      userPublicKey: params.userPublicKey,
      amount: params.amount,
      strategy: params.strategy,
    });
    
    return {
      transaction,
      estimatedFees: await this.estimateFees(transaction),
    };
  }
  
  async getUserPositions(userAddress: string): Promise<UnifiedPosition[]> {
    const meteoraPositions = await this.dlmmService.getPositions(userAddress);
    return Promise.all(
      meteoraPositions.map(p => this.transformPositionToUnified(p))
    );
  }
  
  async closePosition(positionAddress: string): Promise<TransactionResult> {
    const transaction = await this.dlmmService.buildClosePositionTx(positionAddress);
    return { transaction };
  }
  
  async claimFees(positionAddress: string): Promise<TransactionResult> {
    const transaction = await this.dlmmService.buildClaimFeesTx(positionAddress);
    return { transaction };
  }
  
  async rebalancePosition(
    positionAddress: string,
    params: RebalanceParams
  ): Promise<TransactionResult> {
    // 1. Close old position
    const closeTx = await this.closePosition(positionAddress);
    
    // 2. Create new position with new range
    const createTx = await this.createPosition(params.newPosition);
    
    return {
      transactions: [closeTx.transaction, createTx.transaction],
    };
  }
  
  // Transform Meteora-specific data to unified models
  private transformToUnified(meteoraPool: MeteoraDlmmPool): UnifiedPool {
    return {
      id: meteoraPool.address,
      address: meteoraPool.address,
      name: meteoraPool.name,
      dex: 'meteora',
      type: 'DLMM',
      tokenA: this.transformToken(meteoraPool.mint_x),
      tokenB: this.transformToken(meteoraPool.mint_y),
      tvl: meteoraPool.liquidity,
      apr: meteoraPool.apr,
      apy: meteoraPool.apy,
      currentPrice: meteoraPool.current_price,
      // ... map other fields
    };
  }
  
  private async transformPositionToUnified(
    meteoraPosition: MeteoraPosition
  ): Promise<UnifiedPosition> {
    // Fetch current prices
    const [tokenAPrice, tokenBPrice] = await Promise.all([
      this.tokenPriceService.getPrice(meteoraPosition.tokenA.address),
      this.tokenPriceService.getPrice(meteoraPosition.tokenB.address),
    ]);
    
    return {
      id: meteoraPosition.address,
      address: meteoraPosition.address,
      poolAddress: meteoraPosition.poolAddress,
      dex: 'meteora',
      type: 'DLMM',
      tokenA: meteoraPosition.tokenA,
      tokenB: meteoraPosition.tokenB,
      tokenAAmount: meteoraPosition.tokenAAmount,
      tokenBAmount: meteoraPosition.tokenBAmount,
      currentValueUsd: this.calculateValueUsd(
        meteoraPosition,
        tokenAPrice,
        tokenBPrice
      ),
      // ... map other fields
    };
  }
}
```

**Step 2: Refactor MeteoraDlmmService**
```typescript
// services/meteora/meteora-dlmm.service.ts
// Focus only on SDK interactions, no business logic

export class MeteoraDlmmService {
  constructor(
    private connection: Connection,
    private dlmmProgramId: PublicKey,
  ) {}
  
  // Pure SDK wrapper methods
  async buildCreatePositionTx(params: BuildPositionParams): Promise<Transaction> {
    const dlmm = await DLMM.create(this.connection, params.poolAddress);
    
    const positionIx = await dlmm.initializePosition({
      user: params.userPublicKey,
      strategy: params.strategy,
      amount: params.amount,
    });
    
    return this.buildTransaction([positionIx]);
  }
  
  async buildClosePositionTx(positionAddress: string): Promise<Transaction> {
    const closeIx = await this.dlmm.closePosition(positionAddress);
    return this.buildTransaction([closeIx]);
  }
  
  async getPositions(userAddress: string): Promise<MeteoraPosition[]> {
    // Fetch from on-chain
    const positions = await this.dlmm.getPositionsByUser(userAddress);
    return positions;
  }
  
  private buildTransaction(instructions: TransactionInstruction[]): Transaction {
    const tx = new Transaction();
    tx.add(...instructions);
    return tx;
  }
}
```

**Benefits:**
- MeteoraAdapter now fully implements IDexAdapter
- Can be used interchangeably with SarosAdapter, OrcaAdapter
- MeteoraDlmmService focused only on SDK interactions
- Clear separation: Adapter (business logic) vs Service (SDK wrapper)

---

### 5.3 Message Service Refactoring

**Current Problems:**
- 37KB file with too many responsibilities
- Handles message sending, formatting, notification scheduling
- Direct Telegraf dependency (hard to test)
- Mixed concerns: presentation and infrastructure

**Target Structure:**
```
infrastructure/messaging/
├── telegram-client.ts              # Wrapper around Telegraf
├── message-queue.ts                # Queue for rate-limited sending
└── notification.service.ts         # Notification scheduling

presentation/formatters/
├── pool.formatter.ts               # Pool message formatting
├── position.formatter.ts           # Position message formatting
├── portfolio.formatter.ts          # Portfolio message formatting
└── base.formatter.ts               # Common formatting utilities
```

**Refactoring Steps:**

**Step 1: Extract Formatting Logic**
```typescript
// presentation/formatters/position.formatter.ts
export class PositionFormatter {
  formatSummary(position: Position): string {
    const pnl = position.calculatePnL();
    const pnlEmoji = pnl.isPositive() ? '🟢' : '🔴';
    
    return `
🟣 ${position.dex.toUpperCase()} Position
${position.tokenA.symbol}-${position.tokenB.symbol} ${position.isVerified ? '✅' : '⚠️'}

📊 Performance
─────────────────────────
Current Value: $${formatNumber(position.currentValue)}
Initial Deposit: $${formatNumber(position.initialValue)}
Profit/Loss: ${pnlEmoji} $${formatNumber(pnl.absolute)} (${formatPercentage(pnl.percentage)})

💰 Fees & Rewards
─────────────────────────
Unclaimed Fees: $${formatNumber(position.unclaimedFees)}
Claimed Fees: $${formatNumber(position.claimedFees)}

📈 Position Details
─────────────────────────
Strategy: ${position.strategy}
Status: ${position.inRange ? '✅ In Range' : '⚠️ Out of Range'}
Age: ${formatDuration(position.age)}
    `.trim();
  }
  
  formatCreationSuccess(result: CreatePositionResult): string {
    return `
✅ Position Created Successfully!

Transaction: ${formatTxLink(result.signature)}
Position ID: ${result.positionId}

Your position is now active and earning fees!
    `.trim();
  }
}
```

**Step 2: Extract Telegram Client**
```typescript
// infrastructure/messaging/telegram-client.ts
export interface ITelegramClient {
  sendMessage(chatId: number, text: string, options?: MessageOptions): Promise<Message>;
  editMessage(chatId: number, messageId: number, text: string): Promise<void>;
  deleteMessage(chatId: number, messageId: number): Promise<void>;
}

export class TelegramClient implements ITelegramClient {
  constructor(private bot: Telegraf) {}
  
  async sendMessage(
    chatId: number,
    text: string,
    options?: MessageOptions
  ): Promise<Message> {
    return this.bot.telegram.sendMessage(chatId, text, {
      parse_mode: 'Markdown',
      ...options,
    });
  }
  
  async editMessage(
    chatId: number,
    messageId: number,
    text: string
  ): Promise<void> {
    await this.bot.telegram.editMessageText(chatId, messageId, undefined, text, {
      parse_mode: 'Markdown',
    });
  }
  
  async deleteMessage(chatId: number, messageId: number): Promise<void> {
    await this.bot.telegram.deleteMessage(chatId, messageId);
  }
}
```

**Step 3: Extract Notification Service**
```typescript
// infrastructure/messaging/notification.service.ts
export class NotificationService {
  constructor(
    private telegramClient: ITelegramClient,
    private userRepository: IUserRepository,
    private jobQueue: JobQueue,
  ) {}
  
  async sendNotification(userId: string, notification: Notification): Promise<void> {
    const user = await this.userRepository.findById(userId);
    if (!user) return;
    
    // Check notification preferences
    if (!user.hasNotificationEnabled(notification.type)) {
      return;
    }
    
    // Format notification message
    const message = this.formatNotification(notification);
    
    // Send via Telegram
    await this.telegramClient.sendMessage(
      user.telegramId,
      message,
      notification.keyboard
    );
  }
  
  async scheduleNotification(
    userId: string,
    notification: Notification,
    scheduleAt: Date
  ): Promise<void> {
    await this.jobQueue.enqueue('send-notification', {
      userId,
      notification,
    }, {
      delay: scheduleAt.getTime() - Date.now(),
    });
  }
  
  private formatNotification(notification: Notification): string {
    switch (notification.type) {
      case 'REBALANCE_TRIGGERED':
        return `🔄 Auto-Rebalancing Triggered\n\nPosition: ${notification.data.positionName}...`;
      case 'POSITION_OUT_OF_RANGE':
        return `⚠️ Position Out of Range\n\nPosition: ${notification.data.positionName}...`;
      // ... other notification types
    }
  }
}
```

**Benefits:**
- Message formatting separated from sending logic
- Telegram client abstracted (easy to mock for testing)
- Notification service handles scheduling and preferences
- Clear single responsibilities

---

### 5.4 Portfolio Service Refactoring

**Current Problems:**
- 24KB file with mixed concerns
- Fetches data, calculates metrics, formats output
- No caching strategy
- N+1 query problem when fetching positions

**Target Structure:**
```
application/portfolio/
├── get-portfolio.use-case.ts        # Main portfolio use case
├── calculate-metrics.use-case.ts    # Portfolio analytics
└── sync-portfolio.use-case.ts       # Sync with blockchain

domain/portfolio/
├── portfolio.entity.ts              # Portfolio aggregate
└── portfolio.value-objects.ts       # Metrics, breakdown, etc.
```

**Refactoring Steps:**

**Step 1: Extract Portfolio Entity**
```typescript
// domain/portfolio/portfolio.entity.ts
export class Portfolio {
  constructor(
    public readonly userId: string,
    public readonly positions: Position[],
    private calculatedAt: Date,
  ) {}
  
  calculateTotalValue(): Money {
    return this.positions.reduce(
      (total, pos) => total.add(pos.currentValue),
      Money.zero()
    );
  }
  
  calculateTotalPnL(): PnL {
    const totalCurrent = this.calculateTotalValue();
    const totalInitial = this.positions.reduce(
      (total, pos) => total.add(pos.initialValue),
      Money.zero()
    );
    
    return new PnL(
      totalCurrent.subtract(totalInitial),
      totalCurrent.subtract(totalInitial).divide(totalInitial)
    );
  }
  
  getDexBreakdown(): Map<DexType, DexMetrics> {
    const breakdown = new Map<DexType, DexMetrics>();
    
    for (const position of this.positions) {
      const existing = breakdown.get(position.dex) || DexMetrics.empty();
      breakdown.set(
        position.dex,
        existing.add({
          positions: 1,
          valueUsd: position.currentValue,
          pnlUsd: position.calculatePnL().absolute,
        })
      );
    }
    
    return breakdown;
  }
  
  getTopPerformers(limit: number = 3): Position[] {
    return [...this.positions]
      .sort((a, b) => b.calculatePnL().percentage - a.calculatePnL().percentage)
      .slice(0, limit);
  }
  
  needsRebalancing(threshold: number): Position[] {
    return this.positions.filter(pos => pos.shouldRebalance(threshold));
  }
}
```

**Step 2: Extract Use Case with Caching**
```typescript
// application/portfolio/get-portfolio.use-case.ts
export class GetPortfolioUseCase {
  private readonly CACHE_TTL = 300; // 5 minutes
  
  constructor(
    private positionRepository: IPositionRepository,
    private dexRegistry: DexRegistry,
    private cacheService: ICacheService,
  ) {}
  
  async execute(userId: string, forceRefresh: boolean = false): Promise<Portfolio> {
    // Check cache first
    if (!forceRefresh) {
      const cached = await this.cacheService.get<Portfolio>(
        this.getCacheKey(userId)
      );
      if (cached) return cached;
    }
    
    // Fetch positions from database
    const positions = await this.positionRepository.findActiveByUser(userId);
    
    // Enrich positions with current blockchain data
    const enrichedPositions = await this.enrichPositions(positions);
    
    // Create portfolio aggregate
    const portfolio = new Portfolio(userId, enrichedPositions, new Date());
    
    // Cache result
    await this.cacheService.set(
      this.getCacheKey(userId),
      portfolio,
      this.CACHE_TTL
    );
    
    return portfolio;
  }
  
  private async enrichPositions(positions: Position[]): Promise<Position[]> {
    // Batch fetch current position data from DEXes
    const positionsByDex = this.groupByDex(positions);
    
    const enrichedByDex = await Promise.all(
      Array.from(positionsByDex.entries()).map(async ([dex, dexPositions]) => {
        const adapter = this.dexRegistry.getAdapter(dex);
        
        // Batch fetch for this DEX
        const currentData = await Promise.all(
          dexPositions.map(pos => adapter.getPosition(pos.address))
        );
        
        return dexPositions.map((pos, i) => pos.updateWithCurrentData(currentData[i]));
      })
    );
    
    return enrichedByDex.flat();
  }
  
  private groupByDex(positions: Position[]): Map<DexType, Position[]> {
    return positions.reduce((map, pos) => {
      const dexPositions = map.get(pos.dex) || [];
      dexPositions.push(pos);
      map.set(pos.dex, dexPositions);
      return map;
    }, new Map<DexType, Position[]>());
  }
  
  private getCacheKey(userId: string): string {
    return `portfolio:${userId}`;
  }
}
```

**Benefits:**
- Portfolio domain logic in entity
- Use case handles orchestration and caching
- Batch fetching eliminates N+1 problem
- Clear caching strategy
- Easy to test each component

---

### 5.5 Job Queue Service Refactoring

**Current Problems:**
- 20KB monolithic file
- All job types and workers in one place
- Hard to add new job types
- Poor separation of concerns

**Target Structure:**
```
infrastructure/jobs/
├── job-queue.service.ts             # Queue management
├── job-definitions.ts               # Job type definitions
└── workers/
    ├── position-monitor.worker.ts   # Monitor positions
    ├── rebalance.worker.ts          # Execute rebalancing
    ├── notification.worker.ts       # Send notifications
    ├── transaction-confirm.worker.ts # Confirm transactions
    └── portfolio-sync.worker.ts     # Sync portfolios
```

**Refactoring Steps:**

**Step 1: Extract Worker Classes**
```typescript
// infrastructure/jobs/workers/position-monitor.worker.ts
export class PositionMonitorWorker {
  constructor(
    private getPositionUseCase: GetPositionUseCase,
    private checkRebalanceUseCase: CheckRebalanceUseCase,
    private notificationService: NotificationService,
    private jobQueue: JobQueue,
  ) {}
  
  async process(job: Job<PositionMonitorJobData>): Promise<void> {
    const { positionId } = job.data;
    
    // Fetch current position state
    const position = await this.getPositionUseCase.execute(positionId);
    
    if (!position) {
      throw new Error(`Position ${positionId} not found`);
    }
    
    // Check if position is out of range
    if (!position.inRange) {
      await this.notificationService.sendNotification(position.userId, {
        type: 'POSITION_OUT_OF_RANGE',
        data: { positionId, positionName: position.name },
      });
    }
    
    // Check if rebalancing needed
    if (position.isRebalancingEnabled) {
      const shouldRebalance = await this.checkRebalanceUseCase.execute(position);
      
      if (shouldRebalance) {
        // Enqueue rebalancing job
        await this.jobQueue.enqueue('rebalance', {
          positionId: position.id,
        });
      }
    }
    
    // Re-enqueue monitoring job for 5 minutes later
    await this.jobQueue.enqueue('position-monitor', {
      positionId,
    }, {
      delay: 5 * 60 * 1000, // 5 minutes
    });
  }
}
```

**Step 2: Simplify Job Queue Service**
```typescript
// infrastructure/jobs/job-queue.service.ts
export class JobQueueService {
  private queues: Map<string, Queue> = new Map();
  private workers: Map<string, Worker> = new Map();
  
  constructor(
    private redisConnection: ConnectionOptions,
    private workerRegistry: WorkerRegistry,
  ) {
    this.initializeQueues();
    this.initializeWorkers();
  }
  
  private initializeQueues(): void {
    const queueNames = ['position-monitor', 'rebalance', 'notification', 'transaction-confirm'];
    
    for (const name of queueNames) {
      this.queues.set(name, new Queue(name, {
        connection: this.redisConnection,
        defaultJobOptions: this.getDefaultOptions(name),
      }));
    }
  }
  
  private initializeWorkers(): void {
    for (const [name, queue] of this.queues) {
      const workerClass = this.workerRegistry.get(name);
      const worker = new Worker(name, workerClass.process.bind(workerClass), {
        connection: this.redisConnection,
        concurrency: this.getConcurrency(name),
      });
      
      this.workers.set(name, worker);
    }
  }
  
  async enqueue(queueName: string, data: any, options?: JobOptions): Promise<Job> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }
    
    return queue.add(queueName, data, options);
  }
  
  private getDefaultOptions(queueName: string): JobOptions {
    return {
      removeOnComplete: 100,
      removeOnFail: 500,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
    };
  }
  
  private getConcurrency(queueName: string): number {
    const concurrencyMap: Record<string, number> = {
      'position-monitor': 10,
      'rebalance': 5,
      'notification': 20,
      'transaction-confirm': 10,
    };
    return concurrencyMap[queueName] || 5;
  }
}
```

**Step 3: Worker Registry**
```typescript
// infrastructure/jobs/worker-registry.ts
export class WorkerRegistry {
  private workers: Map<string, any> = new Map();
  
  register(name: string, workerClass: any): void {
    this.workers.set(name, workerClass);
  }
  
  get(name: string): any {
    const worker = this.workers.get(name);
    if (!worker) {
      throw new Error(`Worker ${name} not found`);
    }
    return worker;
  }
}

// Usage in initialization
const workerRegistry = new WorkerRegistry();
workerRegistry.register('position-monitor', new PositionMonitorWorker(...deps));
workerRegistry.register('rebalance', new RebalanceWorker(...deps));
workerRegistry.register('notification', new NotificationWorker(...deps));
```

**Benefits:**
- Each worker is independent and testable
- Easy to add new job types
- Clear separation of concerns
- Job queue service is thin orchestrator

---

## 6. Step-by-Step Implementation Plan

### 6.1 Week 1: Foundation

**Day 1-2: Set Up New Structure**
- [ ] Create new folder structure
- [ ] Set up dependency injection container (e.g., TSyringe, TypeDI)
- [ ] Extract shared types to `shared/types`
- [ ] Extract constants to `shared/constants`
- [ ] Set up testing infrastructure (fixtures, mocks, utilities)

**Day 3-4: Extract Domain Entities**
- [ ] Extract `Position` entity with business logic
- [ ] Extract `Portfolio` aggregate
- [ ] Extract `Pool` entity
- [ ] Extract `User` entity
- [ ] Define value objects (Money, PnL, TokenAmount, etc.)
- [ ] Define domain events

**Day 5: Define Repository Interfaces**
- [ ] Define `IPositionRepository` interface
- [ ] Define `IUserRepository` interface
- [ ] Define `IPoolRepository` interface (if needed)
- [ ] Implement repository implementations in `infrastructure/`

**Milestone:** Foundation layer complete, domain models extracted

---

### 6.2 Week 2-3: Core Services Refactoring

**Week 2, Day 1-3: Position Management**
- [ ] Extract `CreatePositionUseCase`
- [ ] Extract `ClosePositionUseCase`
- [ ] Extract `ClaimFeesUseCase`
- [ ] Extract `RebalancePositionUseCase`
- [ ] Extract `GetPositionUseCase`
- [ ] Implement repository (Drizzle)
- [ ] Write unit tests for each use case
- [ ] Update presentation layer to use new use cases
- [ ] Deploy and test in staging

**Week 2, Day 4-5: Complete Meteora Adapter**
- [ ] Refactor `MeteoraAdapter` to implement full `IDexAdapter`
- [ ] Move SDK logic to `MeteoraDlmmService`
- [ ] Implement all interface methods
- [ ] Write adapter tests
- [ ] Verify with DEX registry

**Week 3, Day 1-2: Portfolio Management**
- [ ] Extract `Portfolio` entity with calculations
- [ ] Extract `GetPortfolioUseCase` with caching
- [ ] Extract `CalculateMetricsUseCase`
- [ ] Extract `SyncPortfolioUseCase`
- [ ] Implement batch fetching to solve N+1
- [ ] Write unit tests
- [ ] Update presentation layer
- [ ] Deploy and test

**Week 3, Day 3-5: Caching Layer**
- [ ] Implement `CacheService` wrapper around Redis
- [ ] Define cache key patterns
- [ ] Add caching to trending pools
- [ ] Add caching to token prices
- [ ] Add caching to user portfolios
- [ ] Implement cache invalidation logic
- [ ] Measure performance improvements

**Milestone:** Core services refactored, caching implemented

---

### 6.3 Week 4: Supporting Services

**Day 1-2: Wallet Service**
- [ ] Extract `ConnectWalletUseCase`
- [ ] Extract `GetBalanceUseCase`
- [ ] Extract `SendTokensUseCase`
- [ ] Refactor Privy integration
- [ ] Write tests
- [ ] Update presentation layer

**Day 2-3: Trending Service**
- [ ] Extract `GetTrendingPoolsUseCase`
- [ ] Extract `SearchPoolsUseCase`
- [ ] Implement cross-DEX trending
- [ ] Add caching
- [ ] Write tests

**Day 3-4: Message Service**
- [ ] Extract formatters to `presentation/formatters`
- [ ] Implement `TelegramClient` wrapper
- [ ] Implement `NotificationService`
- [ ] Implement message queue for rate limiting
- [ ] Write tests

**Day 5: Error Handling**
- [ ] Define custom error classes (domain, application, infrastructure)
- [ ] Implement global error handler
- [ ] Implement circuit breaker for external APIs
- [ ] Add retry logic with exponential backoff
- [ ] Add error logging and tracking

**Milestone:** Supporting services refactored, error handling unified

---

### 6.4 Week 5: Infrastructure

**Day 1-2: Job Queue Refactoring**
- [ ] Extract worker classes
- [ ] Implement `PositionMonitorWorker`
- [ ] Implement `RebalanceWorker`
- [ ] Implement `NotificationWorker`
- [ ] Implement `TransactionConfirmWorker`
- [ ] Simplify `JobQueueService`
- [ ] Implement `WorkerRegistry`
- [ ] Write tests

**Day 3: Database Optimization**
- [ ] Review and add missing indexes
- [ ] Optimize slow queries (use EXPLAIN ANALYZE)
- [ ] Implement connection pooling
- [ ] Add query result caching where appropriate
- [ ] Measure query performance improvements

**Day 4: Circuit Breakers**
- [ ] Implement circuit breaker for Jupiter API
- [ ] Implement circuit breaker for Meteora API
- [ ] Implement circuit breaker for Solana RPC
- [ ] Add fallback strategies (cached data, secondary RPC)
- [ ] Add monitoring and alerts

**Day 5: Performance Optimization**
- [ ] Profile application (identify bottlenecks)
- [ ] Optimize hot paths
- [ ] Implement parallel processing where possible
- [ ] Add performance metrics and monitoring
- [ ] Load testing

**Milestone:** Infrastructure optimized, performance improved

---

### 6.5 Week 6-7: Testing & Documentation

**Week 6, Day 1-3: Unit Tests**
- [ ] Write unit tests for all domain entities (80% coverage)
- [ ] Write unit tests for all use cases (80% coverage)
- [ ] Write unit tests for all adapters (70% coverage)
- [ ] Write unit tests for all workers (70% coverage)
- [ ] Run test coverage report, fill gaps

**Week 6, Day 4-5: Integration Tests**
- [ ] Write integration tests for position creation flow
- [ ] Write integration tests for portfolio fetching
- [ ] Write integration tests for fee claiming
- [ ] Write integration tests for rebalancing
- [ ] Test error scenarios

**Week 7, Day 1-2: End-to-End Tests**
- [ ] Set up E2E testing environment
- [ ] Write E2E test for complete user journey
- [ ] Write E2E test for position lifecycle
- [ ] Test with real Solana devnet

**Week 7, Day 3: Documentation**
- [ ] Update code documentation (TSDoc comments)
- [ ] Update README with new architecture
- [ ] Document each layer and its responsibilities
- [ ] Document how to add new DEX adapter
- [ ] Create developer onboarding guide

**Week 7, Day 4-5: Code Review & Cleanup**
- [ ] Code review all refactored modules
- [ ] Remove deprecated code
- [ ] Fix linting issues
- [ ] Verify all tests pass
- [ ] Performance regression testing
- [ ] Prepare for production deployment

**Milestone:** Testing complete, documentation updated, ready for production

---

## 7. Testing Strategy

### 7.1 Testing Pyramid

```
        /\
       /  \  E2E Tests (5%)
      /────\
     /      \  Integration Tests (15%)
    /────────\
   /          \  Unit Tests (80%)
  /────────────\
```

### 7.2 Unit Testing

**What to Test:**
- Domain entities (business logic)
- Use cases (orchestration)
- Adapters (data transformation)
- Formatters (message formatting)
- Validators (validation logic)

**Example: Position Entity Test**
```typescript
// domain/position/__tests__/position.entity.test.ts
describe('Position Entity', () => {
  describe('calculatePnL', () => {
    it('should calculate positive PnL correctly', () => {
      const position = Position.create({
        userId: 'user-1',
        initialValue: Money.usd(1000),
        // ... other params
      });
      
      position.updateCurrentValue(Money.usd(1200));
      
      const pnl = position.calculatePnL();
      
      expect(pnl.absolute.toNumber()).toBe(200);
      expect(pnl.percentage).toBe(0.2);
      expect(pnl.isPositive()).toBe(true);
    });
    
    it('should calculate negative PnL correctly', () => {
      const position = Position.create({
        userId: 'user-1',
        initialValue: Money.usd(1000),
      });
      
      position.updateCurrentValue(Money.usd(800));
      
      const pnl = position.calculatePnL();
      
      expect(pnl.absolute.toNumber()).toBe(-200);
      expect(pnl.percentage).toBe(-0.2);
      expect(pnl.isPositive()).toBe(false);
    });
  });
  
  describe('shouldRebalance', () => {
    it('should return true when price deviation exceeds threshold', () => {
      const position = createTestPosition({
        inRange: false,
        priceDeviation: 0.25, // 25%
      });
      
      expect(position.shouldRebalance(0.2)).toBe(true);
    });
    
    it('should return false when price deviation below threshold', () => {
      const position = createTestPosition({
        inRange: false,
        priceDeviation: 0.15, // 15%
      });
      
      expect(position.shouldRebalance(0.2)).toBe(false);
    });
  });
});
```

**Example: Use Case Test**
```typescript
// application/position/__tests__/create-position.use-case.test.ts
describe('CreatePositionUseCase', () => {
  let useCase: CreatePositionUseCase;
  let mockPositionRepo: jest.Mocked<IPositionRepository>;
  let mockDexRegistry: jest.Mocked<DexRegistry>;
  let mockTransactionService: jest.Mocked<ITransactionService>;
  
  beforeEach(() => {
    mockPositionRepo = createMockPositionRepository();
    mockDexRegistry = createMockDexRegistry();
    mockTransactionService = createMockTransactionService();
    
    useCase = new CreatePositionUseCase(
      mockPositionRepo,
      mockDexRegistry,
      mockTransactionService,
    );
  });
  
  it('should create position successfully', async () => {
    const params = createTestPositionParams();
    
    mockDexRegistry.getAdapter.mockReturnValue(createMockMeteorAdapter());
    mockTransactionService.submit.mockResolvedValue('signature-123');
    
    const result = await useCase.execute(params);
    
    expect(result.positionId).toBeDefined();
    expect(result.signature).toBe('signature-123');
    expect(mockPositionRepo.save).toHaveBeenCalledTimes(1);
  });
  
  it('should throw error when insufficient balance', async () => {
    const params = createTestPositionParams({ amount: 1000000 });
    
    await expect(useCase.execute(params)).rejects.toThrow(InsufficientBalanceError);
    
    expect(mockPositionRepo.save).not.toHaveBeenCalled();
  });
});
```

### 7.3 Integration Testing

**What to Test:**
- Database operations (repositories)
- External API calls (adapters with real APIs on testnet)
- Job queue processing
- Complete use case flows

**Example: Repository Integration Test**
```typescript
// infrastructure/database/repositories/__tests__/position.repository.test.ts
describe('PositionRepository (Integration)', () => {
  let repository: PositionRepository;
  let db: PostgresJsDatabase;
  
  beforeAll(async () => {
    db = await setupTestDatabase();
    repository = new PositionRepository(db);
  });
  
  afterAll(async () => {
    await teardownTestDatabase(db);
  });
  
  beforeEach(async () => {
    await db.delete(positions); // Clear table
  });
  
  it('should save and retrieve position', async () => {
    const position = createTestPosition();
    
    await repository.save(position);
    
    const retrieved = await repository.findById(position.id);
    
    expect(retrieved).toBeDefined();
    expect(retrieved!.id).toBe(position.id);
    expect(retrieved!.userId).toBe(position.userId);
  });
  
  it('should update position correctly', async () => {
    const position = createTestPosition();
    await repository.save(position);
    
    position.updateCurrentValue(Money.usd(2000));
    await repository.update(position);
    
    const retrieved = await repository.findById(position.id);
    
    expect(retrieved!.currentValue.toNumber()).toBe(2000);
  });
});
```

### 7.4 End-to-End Testing

**What to Test:**
- Complete user journeys via Telegram bot
- Position creation to closing lifecycle
- Error scenarios and recovery

**Example: E2E Test (Pseudo-code)**
```typescript
// tests/e2e/position-lifecycle.test.ts
describe('Position Lifecycle E2E', () => {
  let testBot: TestBotClient;
  let testUser: TestUser;
  
  beforeAll(async () => {
    testBot = await createTestBot();
    testUser = await createTestUser();
  });
  
  it('should complete full position lifecycle', async () => {
    // 1. User starts bot
    await testBot.sendCommand(testUser, '/start');
    let response = await testBot.getLastResponse(testUser);
    expect(response).toContain('Welcome');
    
    // 2. User views trending pools
    await testBot.clickButton(testUser, '🔥 Trending');
    response = await testBot.getLastResponse(testUser);
    expect(response).toContain('SOL-USDC');
    
    // 3. User creates position
    await testBot.clickButton(testUser, '➕ Open Position');
    await testBot.clickButton(testUser, '🎯 Spot');
    await testBot.clickButton(testUser, '💱 SOL Auto-convert');
    await testBot.clickButton(testUser, '50% of Balance');
    await testBot.clickButton(testUser, '✅ Yes');
    await testBot.clickButton(testUser, '✅ Confirm & Create');
    
    response = await testBot.getLastResponse(testUser);
    expect(response).toContain('Position Created Successfully');
    
    // 4. User views portfolio
    await testBot.sendCommand(testUser, '/portfolio');
    response = await testBot.getLastResponse(testUser);
    expect(response).toContain('Total Value');
    expect(response).toContain('SOL-USDC');
    
    // 5. User closes position
    await testBot.clickButton(testUser, '📊 Details');
    await testBot.clickButton(testUser, '❌ Close Position');
    await testBot.typeMessage(testUser, 'CLOSE');
    
    response = await testBot.getLastResponse(testUser);
    expect(response).toContain('Position closed successfully');
  });
});
```

### 7.5 Testing Tools

**Unit & Integration Tests:**
- **Framework:** Vitest (already configured)
- **Mocking:** Vitest mocks + custom mock factories
- **Assertions:** Vitest assertions (expect)
- **Coverage:** Vitest coverage (v8 provider)

**E2E Tests:**
- **Framework:** Vitest or Playwright
- **Test Bot:** Mock Telegram client or real bot on test account
- **Test Environment:** Solana devnet
- **Test Data:** Seed scripts for consistent test state

**Test Utilities:**
```typescript
// tests/utils/test-factories.ts
export function createTestPosition(overrides?: Partial<Position>): Position {
  return Position.reconstitute({
    id: 'pos-test-1',
    userId: 'user-test-1',
    poolAddress: 'pool-test-1',
    dex: 'meteora',
    initialValue: Money.usd(1000),
    currentValue: Money.usd(1000),
    ...overrides,
  });
}

export function createMockPositionRepository(): jest.Mocked<IPositionRepository> {
  return {
    findById: jest.fn(),
    findByUser: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };
}
```

---

## 8. Risk Mitigation

### 8.1 Identified Risks

**Risk 1: Breaking Existing Functionality**
- **Probability:** High
- **Impact:** High
- **Mitigation:**
  - Incremental refactoring with feature flags
  - Comprehensive test coverage before refactoring
  - Keep old code alongside new code during transition
  - Canary deployments (route 10% traffic to new code)
  - Rollback plan for each deployment

**Risk 2: Performance Regression**
- **Probability:** Medium
- **Impact:** Medium
- **Mitigation:**
  - Benchmark performance before refactoring
  - Performance tests after each major change
  - Monitor key metrics (response time, throughput)
  - Optimize hot paths identified via profiling
  - Accept < 5% regression, target improvements

**Risk 3: Timeline Overrun**
- **Probability:** Medium
- **Impact:** Medium
- **Mitigation:**
  - Prioritize high-impact refactorings first
  - Time-box each week, defer lower priorities
  - Parallelize independent refactorings
  - Accept "good enough" over perfect
  - Regular progress reviews

**Risk 4: Team Productivity Impact**
- **Probability:** Medium
- **Impact:** Medium
- **Mitigation:**
  - Document new architecture clearly
  - Pair programming for knowledge transfer
  - Code reviews to ensure consistency
  - Developer onboarding guide
  - Slack channel for refactoring questions

**Risk 5: Incomplete Testing**
- **Probability:** Medium
- **Impact:** High
- **Mitigation:**
  - Set 80% coverage target and enforce
  - Test critical paths first (position creation, closing)
  - Integration tests for external APIs
  - E2E tests for user journeys
  - Manual testing checklist for each feature

### 8.2 Rollback Strategy

**Per-Module Rollback:**
- Each module refactored behind feature flag
- Can toggle back to old implementation instantly
- Feature flag config stored in environment variable

**Example:**
```typescript
// Feature flag wrapper
class PositionService {
  constructor(
    private oldPositionService: OldPositionService,
    private createPositionUseCase: CreatePositionUseCase,
    private featureFlags: FeatureFlags,
  ) {}
  
  async createPosition(params: any) {
    if (this.featureFlags.isEnabled('NEW_POSITION_SERVICE')) {
      return this.createPositionUseCase.execute(params);
    } else {
      return this.oldPositionService.createPosition(params);
    }
  }
}
```

**Database Rollback:**
- All database migrations must be backwards-compatible
- Never drop columns in forward migration (mark as deprecated)
- Can roll back to previous code version without data loss

**Deployment Rollback:**
- Keep last 3 versions deployable
- Automated rollback via CI/CD (one click)
- Rollback procedure tested monthly

### 8.3 Contingency Plans

**If Refactoring Blocked:**
- Continue with minimal viable refactoring
- Focus on highest-priority modules only
- Defer nice-to-have improvements
- Document technical debt for future sprint

**If Tests Fail in Production:**
- Immediate rollback to previous version
- Hotfix in old codebase if critical
- Root cause analysis post-mortem
- Add missing test coverage before re-deploying

**If Performance Degrades:**
- Profile to identify bottleneck
- Quick optimization or rollback
- Investigate offline, re-deploy when fixed
- Consider horizontal scaling if needed

---

## 9. Success Criteria

### 9.1 Code Quality Metrics

- [ ] **File Size:** All service files < 30KB (currently max 114KB)
- [ ] **Function Complexity:** All functions < 50 lines (except pure data mappers)
- [ ] **Test Coverage:** 80%+ overall, 90%+ for critical paths
- [ ] **Linting:** Zero ESLint errors or warnings
- [ ] **Type Safety:** Zero TypeScript errors, strict mode enabled
- [ ] **Circular Dependencies:** Zero circular dependencies
- [ ] **Code Duplication:** < 5% code duplication (measured by tool)

### 9.2 Performance Metrics

- [ ] **Response Time:** p95 < 3 seconds for all commands (target < 2s)
- [ ] **Position Creation:** < 10 seconds end-to-end (target < 8s)
- [ ] **Portfolio Load:** < 3 seconds for 20 positions (target < 2s)
- [ ] **Database Queries:** p95 < 500ms (target < 200ms)
- [ ] **RPC Calls:** p95 < 2 seconds (target < 1s)
- [ ] **Cache Hit Rate:** > 70% for trending pools, token prices

### 9.3 Architecture Metrics

- [ ] **Layer Separation:** Clear boundaries, no cross-layer dependencies
- [ ] **Dependency Injection:** All services use DI, no hard-coded deps
- [ ] **Interface Segregation:** All adapters implement clean interfaces
- [ ] **Single Responsibility:** Each class has one reason to change
- [ ] **Open/Closed:** Can add new DEX without modifying existing code

### 9.4 Feature Metrics

- [ ] **Add DEX Adapter:** Can add new DEX adapter in < 1 week
- [ ] **Add Use Case:** Can add new use case in < 2 days
- [ ] **Bug Fix:** Average bug fix time < 4 hours
- [ ] **Feature Development:** New feature velocity increase by 30%

### 9.5 Developer Experience Metrics

- [ ] **Onboarding Time:** New developer productive in < 3 days (currently ~1 week)
- [ ] **Developer Satisfaction:** Team satisfaction score > 4/5
- [ ] **Code Review Time:** Average PR review time < 2 hours
- [ ] **Build Time:** Full build + test < 5 minutes

### 9.6 Acceptance Criteria

**Must Have (Required for Success):**
- All critical user flows work correctly
- Zero production incidents due to refactoring
- Test coverage > 80%
- Performance not regressed > 5%
- All old code removed (no deprecated code left)

**Should Have (Target but not blocker):**
- Performance improved by 20%+
- Code complexity reduced by 50%+
- Developer velocity increased by 30%+
- Documentation complete and up-to-date

**Nice to Have (Future improvements):**
- 90%+ test coverage
- Automated performance testing
- Visual architecture documentation
- Developer video tutorials

---

## 10. Conclusion

This refactoring plan provides a comprehensive roadmap to transform the Telegram bot codebase from a messy, hard-to-maintain state to a clean, modular, and extensible architecture.

**Key Takeaways:**

1. **Incremental Approach:** Refactor incrementally with feature flags to minimize risk
2. **Clear Architecture:** Adopt clean architecture with clear layer separation
3. **Domain-Driven:** Put business logic in domain entities, not services
4. **Test Coverage:** Achieve 80%+ test coverage for confidence
5. **Performance:** Implement caching and optimize database queries
6. **Extensibility:** Design for easy addition of new DEXes

**Timeline Summary:**
- **Week 1:** Foundation (structure, domain models)
- **Week 2-3:** Core services (position, portfolio, adapters)
- **Week 4:** Supporting services (wallet, trending, messaging)
- **Week 5:** Infrastructure (jobs, database, performance)
- **Week 6-7:** Testing and documentation

**Expected Outcomes:**
- Codebase that's easy to understand, test, and extend
- Improved developer productivity and satisfaction
- Better performance and reliability
- Ability to add new DEXes quickly
- Solid foundation for future growth

**Next Steps:**
1. Review and approve this refactoring plan
2. Set up new folder structure (Day 1)
3. Begin Phase 1: Foundation work
4. Daily standups to track progress and blockers
5. Weekly demos to showcase refactored modules

---

**Document Status:** Ready for Review and Execution  
**Author:** Development Team  
**Reviewed By:** [To be filled]  
**Approved By:** [To be filled]  

---

*This refactoring plan is a living document and should be updated as we learn during execution. Feedback and adjustments are expected and encouraged.*
