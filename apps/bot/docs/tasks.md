# Refactoring Tasks - MVP Version
## Meteora Liquidity Bot Code Restructuring

**Version:** 1.0  
**Last Updated:** October 17, 2025  
**Focus:** MVP Implementation (No Testing Tasks)  
**Estimated Timeline:** 5 weeks

---

## Phase 1: Foundation Setup (Week 1)

### 1.1 Folder Structure Setup

#### Task 1.1.1: Create New Directory Structure
- [ ] Create `src/domain/` directory
- [ ] Create `src/domain/position/` directory
- [ ] Create `src/domain/pool/` directory
- [ ] Create `src/domain/user/` directory
- [ ] Create `src/domain/shared/` directory
- [ ] Create `src/domain/shared/value-objects/` directory
- [ ] Create `src/domain/shared/errors/` directory
- [ ] Create `src/application/` directory
- [ ] Create `src/application/position/` directory
- [ ] Create `src/application/portfolio/` directory
- [ ] Create `src/application/wallet/` directory
- [ ] Create `src/application/trending/` directory
- [ ] Create `src/infrastructure/` directory
- [ ] Create `src/infrastructure/cache/` directory
- [ ] Create `src/infrastructure/database/` directory
- [ ] Create `src/infrastructure/database/repositories/` directory
- [ ] Create `src/infrastructure/jobs/` directory
- [ ] Create `src/infrastructure/jobs/workers/` directory
- [ ] Create `src/infrastructure/logging/` directory
- [ ] Create `src/presentation/` directory
- [ ] Create `src/presentation/formatters/` directory
- [ ] Create `src/presentation/validators/` directory
- [ ] Create `src/adapters/dex/` directory
- [ ] Create `src/adapters/blockchain/` directory
- [ ] Create `src/adapters/external-api/` directory
- [ ] Create `src/shared/` directory
- [ ] Create `src/shared/types/` directory
- [ ] Create `src/shared/constants/` directory
- [ ] Create `src/shared/utils/` directory
- [ ] Create `src/shared/errors/` directory

#### Task 1.1.2: Move Existing Files to New Structure
- [ ] Move `src/bot/commands/` to `src/presentation/commands/`
- [ ] Move `src/bot/scenes/` to `src/presentation/scenes/`
- [ ] Move `src/bot/keyboards/` to `src/presentation/keyboards/`
- [ ] Move `src/bot/handlers/` to `src/presentation/handlers/`
- [ ] Move `src/bot/middleware/` to `src/presentation/middleware/`
- [ ] Keep `src/config/` as is
- [ ] Keep `src/db/` as is
- [ ] Keep `src/plugins/` as is

#### Task 1.1.3: Extract Shared Types
- [ ] Create `src/shared/types/index.ts`
- [ ] Move common type definitions from `src/types/` to `src/shared/types/`
- [ ] Create `src/shared/types/dex.types.ts` for DEX-related types
- [ ] Create `src/shared/types/position.types.ts` for position types
- [ ] Create `src/shared/types/pool.types.ts` for pool types
- [ ] Create `src/shared/types/user.types.ts` for user types
- [ ] Update imports across codebase

#### Task 1.1.4: Extract Constants
- [ ] Move `src/bot/constants/` content to `src/shared/constants/`
- [ ] Create `src/shared/constants/index.ts`
- [ ] Create `src/shared/constants/telegram.constants.ts`
- [ ] Create `src/shared/constants/dex.constants.ts`
- [ ] Update imports across codebase

### 1.2 Domain Layer - Value Objects

#### Task 1.2.1: Create Money Value Object
- [ ] Create `src/domain/shared/value-objects/money.ts`
- [ ] Implement `Money` class with USD operations
- [ ] Add methods: `add()`, `subtract()`, `multiply()`, `divide()`
- [ ] Add methods: `greaterThan()`, `lessThan()`, `equals()`
- [ ] Add static factory methods: `Money.usd()`, `Money.zero()`
- [ ] Add `toNumber()` and `toString()` methods

#### Task 1.2.2: Create PnL Value Object
- [ ] Create `src/domain/shared/value-objects/pnl.ts`
- [ ] Implement `PnL` class with absolute and percentage values
- [ ] Add `isPositive()`, `isNegative()` methods
- [ ] Add formatting methods

#### Task 1.2.3: Create TokenAmount Value Object
- [ ] Create `src/domain/shared/value-objects/token-amount.ts`
- [ ] Implement `TokenAmount` class with token and amount
- [ ] Add conversion methods (raw to UI, UI to raw)
- [ ] Add comparison methods

#### Task 1.2.4: Create Range Value Object
- [ ] Create `src/domain/shared/value-objects/range.ts`
- [ ] Implement `Range` class with min and max
- [ ] Add `contains()`, `isInRange()` methods
- [ ] Add `calculateDeviation()` method

#### Task 1.2.5: Create DexMetrics Value Object
- [ ] Create `src/domain/shared/value-objects/dex-metrics.ts`
- [ ] Implement `DexMetrics` class with positions count, value, PnL
- [ ] Add `add()` method to combine metrics
- [ ] Add static `empty()` factory method

### 1.3 Domain Layer - Error Classes

#### Task 1.3.1: Create Base Domain Errors
- [ ] Create `src/domain/shared/errors/domain-error.ts`
- [ ] Implement `DomainError` base class
- [ ] Create `ValidationError` class
- [ ] Create `InvalidStateError` class
- [ ] Create `InvalidAmountError` class
- [ ] Create `InsufficientBalanceError` class

#### Task 1.3.2: Create Application Errors
- [ ] Create `src/shared/errors/application-error.ts`
- [ ] Implement `ApplicationError` base class
- [ ] Create `NotFoundError` class
- [ ] Create `UnauthorizedError` class
- [ ] Create `RateLimitError` class

#### Task 1.3.3: Create Infrastructure Errors
- [ ] Create `src/shared/errors/infrastructure-error.ts`
- [ ] Implement `InfrastructureError` base class
- [ ] Create `DatabaseError` class
- [ ] Create `ExternalApiError` class
- [ ] Create `CacheError` class

### 1.4 Domain Layer - Position Entity

#### Task 1.4.1: Create Position Entity Base
- [ ] Create `src/domain/position/position.entity.ts`
- [ ] Define `Position` class with private constructor
- [ ] Add readonly properties: id, userId, poolAddress, dex
- [ ] Add mutable properties: status, currentValue, etc.
- [ ] Implement factory method `Position.create()`
- [ ] Implement factory method `Position.reconstitute()` for loading from DB

#### Task 1.4.2: Add Position Business Logic Methods
- [ ] Add `calculatePnL()` method returning `PnL` value object
- [ ] Add `canClaim()` method checking if fees can be claimed
- [ ] Add `shouldRebalance(threshold)` method
- [ ] Add `priceDeviation()` method calculating deviation from range
- [ ] Add `isInRange()` method checking if position is in range

#### Task 1.4.3: Add Position State Transition Methods
- [ ] Add `close()` method to close position
- [ ] Add `updateCurrentValue(value)` method
- [ ] Add `addClaimedFees(amount)` method
- [ ] Add `setTransactionSignature(signature)` method
- [ ] Add validation in each state transition

#### Task 1.4.4: Create Position Validators
- [ ] Create `src/domain/position/position.validators.ts`
- [ ] Implement `validateCreateParams()` function
- [ ] Implement `validateAmount()` function
- [ ] Implement `validatePoolAddress()` function
- [ ] Implement `validateStrategy()` function

#### Task 1.4.5: Create Position Events
- [ ] Create `src/domain/position/position.events.ts`
- [ ] Define `PositionCreatedEvent` class
- [ ] Define `PositionClosedEvent` class
- [ ] Define `FeesClaimedEvent` class
- [ ] Define `PositionRebalancedEvent` class
- [ ] Add `addEvent()` method to Position entity

### 1.5 Domain Layer - Repository Interfaces

#### Task 1.5.1: Create Position Repository Interface
- [ ] Create `src/domain/position/position.repository.ts`
- [ ] Define `IPositionRepository` interface
- [ ] Add method: `findById(id: string): Promise<Position | null>`
- [ ] Add method: `findByUser(userId: string): Promise<Position[]>`
- [ ] Add method: `findActiveByUser(userId: string): Promise<Position[]>`
- [ ] Add method: `save(position: Position): Promise<void>`
- [ ] Add method: `update(position: Position): Promise<void>`
- [ ] Add method: `delete(id: string): Promise<void>`

#### Task 1.5.2: Create User Repository Interface
- [ ] Create `src/domain/user/user.repository.ts`
- [ ] Define `IUserRepository` interface
- [ ] Add method: `findById(id: string): Promise<User | null>`
- [ ] Add method: `findByTelegramId(telegramId: string): Promise<User | null>`
- [ ] Add method: `findByWalletAddress(address: string): Promise<User | null>`
- [ ] Add method: `save(user: User): Promise<void>`
- [ ] Add method: `update(user: User): Promise<void>`

#### Task 1.5.3: Create Pool Repository Interface (Optional)
- [ ] Create `src/domain/pool/pool.repository.ts`
- [ ] Define `IPoolRepository` interface if needed
- [ ] Or skip if pools are fetched from APIs only

### 1.6 Domain Layer - User Entity

#### Task 1.6.1: Create User Entity
- [ ] Create `src/domain/user/user.entity.ts`
- [ ] Define `User` class with properties
- [ ] Add properties: id, telegramId, walletAddress, preferences
- [ ] Implement factory methods: `create()`, `reconstitute()`
- [ ] Add method: `hasNotificationEnabled(type)` for notification checks
- [ ] Add method: `updatePreferences(preferences)` 

#### Task 1.6.2: Create User Validators
- [ ] Create `src/domain/user/user.validators.ts`
- [ ] Implement `validateTelegramId()` function
- [ ] Implement `validateWalletAddress()` function

### 1.7 Domain Layer - Portfolio Aggregate

#### Task 1.7.1: Create Portfolio Entity
- [ ] Create `src/domain/portfolio/portfolio.entity.ts`
- [ ] Define `Portfolio` class as aggregate root
- [ ] Add properties: userId, positions, calculatedAt
- [ ] Add method: `calculateTotalValue(): Money`
- [ ] Add method: `calculateTotalPnL(): PnL`
- [ ] Add method: `getDexBreakdown(): Map<DexType, DexMetrics>`
- [ ] Add method: `getTopPerformers(limit): Position[]`
- [ ] Add method: `needsRebalancing(threshold): Position[]`

---

## Phase 2: Core Services Refactoring (Week 2-3)

### 2.1 Infrastructure Layer - Repository Implementations

#### Task 2.1.1: Implement Position Repository
- [ ] Create `src/infrastructure/database/repositories/position.repository.ts`
- [ ] Implement `PositionRepository` class
- [ ] Implement `findById()` method using Drizzle
- [ ] Implement `findByUser()` method
- [ ] Implement `findActiveByUser()` method with status filter
- [ ] Implement `save()` method
- [ ] Implement `update()` method
- [ ] Add helper method `toDomain()` to map DB row to entity
- [ ] Add helper method `toPersistence()` to map entity to DB row

#### Task 2.1.2: Implement User Repository
- [ ] Create `src/infrastructure/database/repositories/user.repository.ts`
- [ ] Implement `UserRepository` class
- [ ] Implement all interface methods
- [ ] Add domain/persistence mapping helpers

### 2.2 Application Layer - Position Use Cases

#### Task 2.2.1: Create CreatePositionUseCase
- [ ] Create `src/application/position/create-position.use-case.ts`
- [ ] Define `CreatePositionUseCase` class
- [ ] Inject dependencies: positionRepository, dexRegistry, transactionService
- [ ] Implement `execute(params)` method
- [ ] Add validation logic
- [ ] Add position creation flow
- [ ] Add transaction building and submission
- [ ] Add database save logic
- [ ] Add job queue enqueue for monitoring
- [ ] Return `CreatePositionResult` with positionId and signature

#### Task 2.2.2: Create ClosePositionUseCase
- [ ] Create `src/application/position/close-position.use-case.ts`
- [ ] Define `ClosePositionUseCase` class
- [ ] Inject dependencies
- [ ] Implement `execute(positionId)` method
- [ ] Fetch position from repository
- [ ] Build close transaction via DEX adapter
- [ ] Submit transaction
- [ ] Update position status to CLOSED
- [ ] Save to database

#### Task 2.2.3: Create ClaimFeesUseCase
- [ ] Create `src/application/position/claim-fees.use-case.ts`
- [ ] Define `ClaimFeesUseCase` class
- [ ] Inject dependencies
- [ ] Implement `execute(positionId)` method
- [ ] Fetch position and validate can claim
- [ ] Build claim transaction via DEX adapter
- [ ] Submit transaction
- [ ] Update position with claimed fees
- [ ] Save to database

#### Task 2.2.4: Create RebalancePositionUseCase
- [ ] Create `src/application/position/rebalance-position.use-case.ts`
- [ ] Define `RebalancePositionUseCase` class
- [ ] Inject dependencies
- [ ] Implement `execute(positionId, params)` method
- [ ] Close old position
- [ ] Claim fees
- [ ] Create new position with new range
- [ ] Record rebalance event in database

#### Task 2.2.5: Create GetPositionUseCase
- [ ] Create `src/application/position/get-position.use-case.ts`
- [ ] Define `GetPositionUseCase` class
- [ ] Inject dependencies: positionRepository, dexRegistry
- [ ] Implement `execute(positionId)` method
- [ ] Fetch position from repository
- [ ] Enrich with current data from DEX adapter
- [ ] Return enriched position

### 2.3 Refactor Meteora Adapter

#### Task 2.3.1: Update Meteora Adapter Structure
- [ ] Move `src/services/meteora/meteora.adapter.ts` to `src/adapters/dex/meteora.adapter.ts`
- [ ] Update `MeteoraAdapter` to extend `BaseDexAdapter`
- [ ] Update class signature: `export class MeteoraAdapter extends BaseDexAdapter implements IDexAdapter`
- [ ] Add constructor with dependencies: dlmmService, apiClient, tokenPriceService
- [ ] Set `readonly dexType = 'meteora'`
- [ ] Set `readonly name = 'Meteora'`

#### Task 2.3.2: Implement getPool Method
- [ ] Implement `getPool(poolId: string): Promise<UnifiedPool>`
- [ ] Fetch pool from Meteora API client
- [ ] Transform to `UnifiedPool` using helper method
- [ ] Handle errors appropriately

#### Task 2.3.3: Implement getTrendingPools Method
- [ ] Implement `getTrendingPools(params?: TrendingParams): Promise<PaginatedTrendingPools>`
- [ ] Fetch trending pools from API
- [ ] Transform each pool to `UnifiedPool`
- [ ] Return paginated result with current page, total pages

#### Task 2.3.4: Implement createPosition Method
- [ ] Implement `createPosition(params: CreatePositionParams): Promise<TransactionResult>`
- [ ] Use `dlmmService` to build transaction
- [ ] Return transaction and estimated fees
- [ ] Do NOT submit transaction (use case handles that)

#### Task 2.3.5: Implement closePosition Method
- [ ] Implement `closePosition(positionAddress: string): Promise<TransactionResult>`
- [ ] Build close transaction using dlmmService
- [ ] Return transaction result

#### Task 2.3.6: Implement claimFees Method
- [ ] Implement `claimFees(positionAddress: string): Promise<TransactionResult>`
- [ ] Build claim fees transaction
- [ ] Return transaction result

#### Task 2.3.7: Implement getUserPositions Method
- [ ] Implement `getUserPositions(userAddress: string): Promise<UnifiedPosition[]>`
- [ ] Fetch positions from dlmmService
- [ ] Transform each to `UnifiedPosition`
- [ ] Enrich with token prices
- [ ] Calculate current values
- [ ] Return unified positions array

#### Task 2.3.8: Implement rebalancePosition Method
- [ ] Implement `rebalancePosition(positionAddress, params): Promise<TransactionResult>`
- [ ] Build close transaction for old position
- [ ] Build create transaction for new position
- [ ] Return both transactions

#### Task 2.3.9: Create Meteora API Client
- [ ] Create `src/adapters/dex/meteora-api.client.ts`
- [ ] Extract API calls from adapter
- [ ] Implement `getPool(poolAddress)` method
- [ ] Implement `getTrendingPools(params)` method
- [ ] Implement `getAllPools()` method
- [ ] Add error handling and retry logic

#### Task 2.3.10: Refactor MeteoraDlmmService
- [ ] Keep `src/services/meteora/meteora-dlmm.service.ts` as SDK wrapper
- [ ] Focus only on SDK interactions
- [ ] Remove business logic
- [ ] Implement `buildCreatePositionTx()` method
- [ ] Implement `buildClosePositionTx()` method
- [ ] Implement `buildClaimFeesTx()` method
- [ ] Implement `getPositions(userAddress)` method

### 2.4 Update Presentation Layer

#### Task 2.4.1: Update Create Position Scene
- [ ] Open `src/presentation/scenes/create-position.scene.ts`
- [ ] Import `CreatePositionUseCase`
- [ ] Replace direct service calls with use case
- [ ] Update confirmation handler to call `useCase.execute(params)`
- [ ] Update error handling to catch domain/application errors
- [ ] Keep message formatting in scene (temporary, will extract later)

#### Task 2.4.2: Update Position Detail Scene
- [ ] Open `src/presentation/scenes/position-detail.scene.ts`
- [ ] Import `ClosePositionUseCase`, `ClaimFeesUseCase`
- [ ] Replace service calls with use cases
- [ ] Update handlers

#### Task 2.4.3: Update Portfolio Command
- [ ] Open `src/presentation/commands/portfolio.ts`
- [ ] Import `GetPortfolioUseCase`
- [ ] Replace service calls with use case
- [ ] Update command handler

### 2.5 Portfolio Management

#### Task 2.5.1: Create GetPortfolioUseCase
- [ ] Create `src/application/portfolio/get-portfolio.use-case.ts`
- [ ] Define `GetPortfolioUseCase` class
- [ ] Inject dependencies: positionRepository, dexRegistry, cacheService
- [ ] Implement `execute(userId, forceRefresh)` method
- [ ] Check cache first (if not forceRefresh)
- [ ] Fetch positions from repository
- [ ] Enrich positions with current blockchain data
- [ ] Group positions by DEX for batch fetching
- [ ] Create `Portfolio` aggregate
- [ ] Cache result with 5-minute TTL
- [ ] Return portfolio

#### Task 2.5.2: Create CalculateMetricsUseCase
- [ ] Create `src/application/portfolio/calculate-metrics.use-case.ts`
- [ ] Define `CalculateMetricsUseCase` class
- [ ] Implement `execute(portfolio)` method
- [ ] Calculate metrics using portfolio entity methods
- [ ] Return formatted metrics

#### Task 2.5.3: Create SyncPortfolioUseCase
- [ ] Create `src/application/portfolio/sync-portfolio.use-case.ts`
- [ ] Define `SyncPortfolioUseCase` class
- [ ] Implement `execute(userId)` method
- [ ] Fetch latest position data from blockchain
- [ ] Update database with latest values
- [ ] Invalidate cache

### 2.6 Caching Layer

#### Task 2.6.1: Create Cache Service
- [ ] Create `src/infrastructure/cache/cache.service.ts`
- [ ] Define `ICacheService` interface
- [ ] Implement `CacheService` class wrapping Redis
- [ ] Implement `get<T>(key: string): Promise<T | null>`
- [ ] Implement `set(key: string, value: any, ttlSeconds: number): Promise<void>`
- [ ] Implement `invalidate(pattern: string): Promise<void>`
- [ ] Implement `has(key: string): Promise<boolean>`
- [ ] Add JSON serialization/deserialization

#### Task 2.6.2: Create Cache Keys Helper
- [ ] Create `src/infrastructure/cache/cache-keys.ts`
- [ ] Define cache key patterns as functions
- [ ] Create `portfolioKey(userId)` function
- [ ] Create `positionKey(positionId)` function
- [ ] Create `poolKey(dex, poolId)` function
- [ ] Create `trendingPoolsKey(dex, sortBy, page)` function
- [ ] Create `tokenPriceKey(address)` function
- [ ] Create `walletBalanceKey(address)` function

#### Task 2.6.3: Add Caching to Trending Pools
- [ ] Update `GetTrendingPoolsUseCase` to use cache
- [ ] Cache trending pools with 10-minute TTL
- [ ] Use cache key pattern

#### Task 2.6.4: Add Caching to Token Prices
- [ ] Update Jupiter service or create wrapper
- [ ] Cache token prices with 1-minute TTL
- [ ] Use cache key pattern

#### Task 2.6.5: Implement Cache Invalidation Logic
- [ ] Invalidate portfolio cache on position creation
- [ ] Invalidate portfolio cache on position close
- [ ] Invalidate position cache on position update
- [ ] Add cache invalidation to use cases

---

## Phase 3: Supporting Services (Week 4)

### 3.1 Wallet Management

#### Task 3.1.1: Create ConnectWalletUseCase
- [ ] Create `src/application/wallet/connect-wallet.use-case.ts`
- [ ] Define `ConnectWalletUseCase` class
- [ ] Inject dependencies: userRepository, privyService
- [ ] Implement `execute(telegramId, privyToken)` method
- [ ] Authenticate with Privy
- [ ] Get or create wallet
- [ ] Create or update user in database
- [ ] Return wallet info

#### Task 3.1.2: Create GetBalanceUseCase
- [ ] Create `src/application/wallet/get-balance.use-case.ts`
- [ ] Define `GetBalanceUseCase` class
- [ ] Inject dependencies: solanaService, cacheService
- [ ] Implement `execute(walletAddress)` method
- [ ] Check cache first
- [ ] Fetch balances from Solana
- [ ] Cache with 2-minute TTL
- [ ] Return token balances

#### Task 3.1.3: Create SendTokensUseCase
- [ ] Create `src/application/wallet/send-tokens.use-case.ts`
- [ ] Define `SendTokensUseCase` class
- [ ] Inject dependencies: solanaService, userRepository
- [ ] Implement `execute(params)` method
- [ ] Validate recipient address
- [ ] Check balance
- [ ] Build transfer transaction
- [ ] Submit transaction
- [ ] Return transaction result

#### Task 3.1.4: Update Wallet Command
- [ ] Update `src/presentation/commands/wallet.ts`
- [ ] Use new wallet use cases
- [ ] Replace service calls

### 3.2 Trending Service

#### Task 3.2.1: Create GetTrendingPoolsUseCase
- [ ] Create `src/application/trending/get-trending-pools.use-case.ts`
- [ ] Define `GetTrendingPoolsUseCase` class
- [ ] Inject dependencies: dexRegistry, cacheService
- [ ] Implement `execute(params)` method
- [ ] Check cache first
- [ ] Get trending pools from all DEXes or specific DEX
- [ ] Merge and sort pools
- [ ] Cache results
- [ ] Return paginated pools

#### Task 3.2.2: Create SearchPoolsUseCase
- [ ] Create `src/application/trending/search-pools.use-case.ts`
- [ ] Define `SearchPoolsUseCase` class
- [ ] Inject dependencies: dexRegistry
- [ ] Implement `execute(tokenAddress)` method
- [ ] Search pools containing the token across all DEXes
- [ ] Return matching pools

#### Task 3.2.3: Update Trending Command
- [ ] Update `src/presentation/commands/trending.ts`
- [ ] Use new trending use cases
- [ ] Replace service calls

### 3.3 Message Service Refactoring

#### Task 3.3.1: Extract Position Formatter
- [ ] Create `src/presentation/formatters/position.formatter.ts`
- [ ] Define `PositionFormatter` class
- [ ] Extract position formatting logic from message service
- [ ] Implement `formatSummary(position)` method
- [ ] Implement `formatCreationSuccess(result)` method
- [ ] Implement `formatCloseConfirmation(position)` method
- [ ] Implement `formatFeeClaim(position)` method

#### Task 3.3.2: Extract Portfolio Formatter
- [ ] Create `src/presentation/formatters/portfolio.formatter.ts`
- [ ] Define `PortfolioFormatter` class
- [ ] Implement `formatOverview(portfolio)` method
- [ ] Implement `formatPositionList(positions)` method
- [ ] Implement `formatMetrics(metrics)` method

#### Task 3.3.3: Extract Pool Formatter
- [ ] Create `src/presentation/formatters/pool.formatter.ts`
- [ ] Define `PoolFormatter` class
- [ ] Implement `formatPoolCard(pool)` method
- [ ] Implement `formatPoolDetails(pool)` method
- [ ] Implement `formatTrendingList(pools)` method

#### Task 3.3.4: Create Base Formatter
- [ ] Create `src/presentation/formatters/base.formatter.ts`
- [ ] Extract common formatting utilities
- [ ] Implement `formatNumber(value)` function
- [ ] Implement `formatPercentage(value)` function
- [ ] Implement `formatCurrency(value)` function
- [ ] Implement `formatDuration(milliseconds)` function
- [ ] Implement `formatTxLink(signature)` function

#### Task 3.3.5: Create Telegram Client Wrapper
- [ ] Create `src/infrastructure/messaging/telegram-client.ts`
- [ ] Define `ITelegramClient` interface
- [ ] Implement `TelegramClient` class
- [ ] Wrap Telegraf bot instance
- [ ] Implement `sendMessage(chatId, text, options)` method
- [ ] Implement `editMessage(chatId, messageId, text)` method
- [ ] Implement `deleteMessage(chatId, messageId)` method
- [ ] Add rate limiting logic

#### Task 3.3.6: Create Notification Service
- [ ] Create `src/infrastructure/messaging/notification.service.ts`
- [ ] Define `NotificationService` class
- [ ] Inject dependencies: telegramClient, userRepository, jobQueue
- [ ] Implement `sendNotification(userId, notification)` method
- [ ] Check user notification preferences
- [ ] Format notification message
- [ ] Send via Telegram client
- [ ] Implement `scheduleNotification(userId, notification, scheduleAt)` method

#### Task 3.3.7: Update Scenes to Use Formatters
- [ ] Update all scenes to import and use formatters
- [ ] Replace inline formatting with formatter calls
- [ ] Keep formatting logic in presentation layer

### 3.4 Error Handling

#### Task 3.4.1: Create Global Error Handler
- [ ] Create `src/shared/errors/error-handler.ts`
- [ ] Define `ErrorHandler` class
- [ ] Implement `handle(error, context)` method
- [ ] Map domain errors to user-friendly messages
- [ ] Map application errors to user-friendly messages
- [ ] Log errors with appropriate level
- [ ] Return formatted error message for Telegram

#### Task 3.4.2: Add Error Handler to Bot
- [ ] Update `src/bot/index.ts` or main bot initialization
- [ ] Add global error handler middleware
- [ ] Catch all errors and pass to ErrorHandler
- [ ] Send user-friendly error messages

#### Task 3.4.3: Implement Circuit Breaker
- [ ] Create `src/infrastructure/resilience/circuit-breaker.ts`
- [ ] Implement `CircuitBreaker` class
- [ ] Add states: CLOSED, OPEN, HALF_OPEN
- [ ] Add failure threshold tracking
- [ ] Add timeout logic
- [ ] Add fallback execution

#### Task 3.4.4: Add Circuit Breaker to Jupiter Service
- [ ] Wrap Jupiter API calls with circuit breaker
- [ ] Add fallback to cached prices
- [ ] Add monitoring/logging

#### Task 3.4.5: Add Circuit Breaker to Meteora API
- [ ] Wrap Meteora API calls with circuit breaker
- [ ] Add fallback to on-chain data
- [ ] Add monitoring/logging

#### Task 3.4.6: Add Circuit Breaker to Solana RPC
- [ ] Wrap Solana RPC calls with circuit breaker
- [ ] Add fallback to secondary RPC
- [ ] Add monitoring/logging

#### Task 3.4.7: Implement Retry Logic
- [ ] Create `src/infrastructure/resilience/retry.ts`
- [ ] Implement `retry(fn, options)` utility
- [ ] Add exponential backoff
- [ ] Add max retries configuration
- [ ] Add retry condition logic (only for transient errors)

#### Task 3.4.8: Add Retry Logic to External API Calls
- [ ] Wrap Jupiter API calls with retry
- [ ] Wrap Meteora API calls with retry
- [ ] Wrap Solana RPC calls with retry
- [ ] Configure appropriate retry counts and delays

---

## Phase 4: Infrastructure (Week 5)

### 4.1 Job Queue Refactoring

#### Task 4.1.1: Extract Position Monitor Worker
- [ ] Create `src/infrastructure/jobs/workers/position-monitor.worker.ts`
- [ ] Define `PositionMonitorWorker` class
- [ ] Inject dependencies: getPositionUseCase, notificationService, jobQueue
- [ ] Implement `process(job)` method
- [ ] Fetch current position state
- [ ] Check if position out of range
- [ ] Send notification if needed
- [ ] Check if rebalancing needed
- [ ] Enqueue rebalancing job if needed
- [ ] Re-enqueue monitoring job for 5 minutes later

#### Task 4.1.2: Extract Rebalance Worker
- [ ] Create `src/infrastructure/jobs/workers/rebalance.worker.ts`
- [ ] Define `RebalanceWorker` class
- [ ] Inject dependencies: rebalancePositionUseCase, notificationService
- [ ] Implement `process(job)` method
- [ ] Execute rebalancing use case
- [ ] Send success/failure notification
- [ ] Handle errors gracefully

#### Task 4.1.3: Extract Notification Worker
- [ ] Create `src/infrastructure/jobs/workers/notification.worker.ts`
- [ ] Define `NotificationWorker` class
- [ ] Inject dependencies: notificationService
- [ ] Implement `process(job)` method
- [ ] Send notification
- [ ] Handle rate limiting

#### Task 4.1.4: Extract Transaction Confirm Worker
- [ ] Create `src/infrastructure/jobs/workers/transaction-confirm.worker.ts`
- [ ] Define `TransactionConfirmWorker` class
- [ ] Inject dependencies: solanaService, positionRepository
- [ ] Implement `process(job)` method
- [ ] Check transaction status
- [ ] Update position status if confirmed
- [ ] Retry if pending
- [ ] Mark as failed if timeout

#### Task 4.1.5: Create Worker Registry
- [ ] Create `src/infrastructure/jobs/worker-registry.ts`
- [ ] Define `WorkerRegistry` class
- [ ] Implement `register(name, workerInstance)` method
- [ ] Implement `get(name)` method
- [ ] Implement `getAll()` method

#### Task 4.1.6: Refactor Job Queue Service
- [ ] Update `src/infrastructure/jobs/job-queue.service.ts`
- [ ] Simplify to thin orchestrator
- [ ] Use worker registry for job processing
- [ ] Implement `enqueue(queueName, data, options)` method
- [ ] Set up queues and workers in constructor
- [ ] Configure concurrency per queue

#### Task 4.1.7: Create Job Definitions
- [ ] Create `src/infrastructure/jobs/job-definitions.ts`
- [ ] Define job data types for each job
- [ ] Export job name constants
- [ ] Document job purposes and data structures

### 4.2 Database Optimization

#### Task 4.2.1: Review Database Schema
- [ ] Review `src/db/schema.ts`
- [ ] Identify missing indexes
- [ ] List frequently queried columns

#### Task 4.2.2: Add Missing Indexes
- [ ] Add index on `Position.userId` and `Position.status` (composite)
- [ ] Add index on `Position.positionAddress`
- [ ] Add index on `Position.poolAddress` and `Position.dex` (composite)
- [ ] Add index on `Position.createdAt` (for sorting)
- [ ] Add index on `User.telegramId`
- [ ] Add index on `User.walletAddress`
- [ ] Add index on `PositionSnapshot.positionId` and `PositionSnapshot.snapshotTimestamp`
- [ ] Add index on `PendingTransaction.status` and `PendingTransaction.createdAt`
- [ ] Create migration file for new indexes

#### Task 4.2.3: Optimize Repository Queries
- [ ] Review all repository queries
- [ ] Use `EXPLAIN ANALYZE` on slow queries
- [ ] Optimize `findActiveByUser()` query
- [ ] Add pagination to large result sets
- [ ] Use proper ordering with indexes

#### Task 4.2.4: Implement Connection Pooling
- [ ] Update database connection setup
- [ ] Configure connection pool size (max: 20)
- [ ] Configure idle timeout (20s)
- [ ] Configure connect timeout (10s)
- [ ] Test pool behavior under load

### 4.3 Performance Optimization

#### Task 4.3.1: Profile Application
- [ ] Set up profiling tools
- [ ] Profile position creation flow
- [ ] Profile portfolio fetching
- [ ] Identify bottlenecks
- [ ] Document findings

#### Task 4.3.2: Optimize Hot Paths
- [ ] Optimize most-called functions
- [ ] Reduce unnecessary async/await
- [ ] Batch API calls where possible
- [ ] Use parallel processing for independent operations

#### Task 4.3.3: Implement Parallel Processing
- [ ] In `GetPortfolioUseCase`, use `Promise.all()` for fetching positions
- [ ] Group by DEX and fetch in parallel
- [ ] In trending pools, fetch from all DEXes in parallel
- [ ] Balance parallelism with rate limiting

#### Task 4.3.4: Add Performance Metrics
- [ ] Add timing logging to use cases
- [ ] Track p50, p95, p99 response times
- [ ] Add metrics for database queries
- [ ] Add metrics for external API calls
- [ ] Set up dashboards

### 4.4 Adapters for External APIs

#### Task 4.4.1: Create Solana Adapter
- [ ] Create `src/adapters/blockchain/solana.adapter.ts`
- [ ] Move Solana service logic to adapter
- [ ] Implement connection management
- [ ] Implement transaction submission
- [ ] Implement balance fetching
- [ ] Add RPC rotation logic
- [ ] Add error handling

#### Task 4.4.2: Create Jupiter Adapter
- [ ] Create `src/adapters/external-api/jupiter.adapter.ts`
- [ ] Extract Jupiter API calls
- [ ] Implement `getTokenPrice(address)` method
- [ ] Implement `getSwapRoute(params)` method
- [ ] Implement `getTokenInfo(address)` method
- [ ] Add caching
- [ ] Add error handling

#### Task 4.4.3: Create Privy Adapter
- [ ] Create `src/adapters/external-api/privy.adapter.ts`
- [ ] Extract Privy integration
- [ ] Implement `authenticateUser()` method
- [ ] Implement `getWalletSigner()` method
- [ ] Implement `refreshToken()` method
- [ ] Add error handling

---

## Phase 5: Cleanup and Migration (Week 6)

### 5.1 Dependency Injection Setup

#### Task 5.1.1: Choose DI Container
- [ ] Evaluate DI options (TSyringe, InversifyJS, TypeDI)
- [ ] Choose TSyringe for simplicity
- [ ] Install `tsyringe` package
- [ ] Install `reflect-metadata` package

#### Task 5.1.2: Set Up DI Container
- [ ] Create `src/infrastructure/di/container.ts`
- [ ] Import `reflect-metadata` at entry point
- [ ] Configure container
- [ ] Register all dependencies

#### Task 5.1.3: Register Repositories
- [ ] Register `PositionRepository` with `IPositionRepository` token
- [ ] Register `UserRepository` with `IUserRepository` token
- [ ] Use singleton lifecycle

#### Task 5.1.4: Register Use Cases
- [ ] Register all position use cases
- [ ] Register all portfolio use cases
- [ ] Register all wallet use cases
- [ ] Register all trending use cases
- [ ] Use transient lifecycle (new instance per request)

#### Task 5.1.5: Register Services
- [ ] Register cache service
- [ ] Register notification service
- [ ] Register job queue service
- [ ] Register telegram client
- [ ] Register DEX adapters

#### Task 5.1.6: Register Adapters
- [ ] Register Solana adapter
- [ ] Register Jupiter adapter
- [ ] Register Privy adapter
- [ ] Register Meteora adapter
- [ ] Register Saros adapter
- [ ] Register with DEX registry

#### Task 5.1.7: Update Presentation Layer
- [ ] Update scenes to resolve use cases from container
- [ ] Update commands to resolve use cases from container
- [ ] Remove hard-coded instantiations

### 5.2 Update Imports Across Codebase

#### Task 5.2.1: Update Type Imports
- [ ] Search for imports from old `src/types/`
- [ ] Replace with imports from `src/shared/types/`
- [ ] Fix any broken imports

#### Task 5.2.2: Update Constants Imports
- [ ] Search for imports from old `src/bot/constants/`
- [ ] Replace with imports from `src/shared/constants/`
- [ ] Fix any broken imports

#### Task 5.2.3: Update Service Imports
- [ ] Update imports in scenes and commands
- [ ] Point to new use case locations
- [ ] Point to new formatter locations

#### Task 5.2.4: Update Adapter Imports
- [ ] Update imports pointing to old adapter locations
- [ ] Point to new locations in `src/adapters/`

### 5.3 Deprecate Old Services

#### Task 5.3.1: Mark position.service.ts as Deprecated
- [ ] Add `@deprecated` JSDoc comment to class
- [ ] Add comment explaining new usage
- [ ] Keep file for now (remove later)

#### Task 5.3.2: Mark portfolio.service.ts as Deprecated
- [ ] Add deprecation notice
- [ ] Keep file for now

#### Task 5.3.3: Mark message.service.ts as Deprecated
- [ ] Add deprecation notice
- [ ] Keep file for now

#### Task 5.3.4: Mark Other Old Services as Deprecated
- [ ] Add deprecation notices to all old service files
- [ ] Document which use case replaces each

### 5.4 Integration and Smoke Testing

#### Task 5.4.1: Run Bot Locally
- [ ] Start bot in development mode
- [ ] Test `/start` command
- [ ] Test wallet connection flow
- [ ] Test trending pools display

#### Task 5.4.2: Test Position Creation Flow
- [ ] Select trending pool
- [ ] Go through position creation wizard
- [ ] Verify transaction builds correctly
- [ ] Verify position saved to database
- [ ] Verify monitoring job enqueued

#### Task 5.4.3: Test Portfolio View
- [ ] Open portfolio
- [ ] Verify positions display
- [ ] Verify metrics calculate correctly
- [ ] Verify caching works

#### Task 5.4.4: Test Fee Claiming
- [ ] Open position detail
- [ ] Claim fees (if available)
- [ ] Verify transaction succeeds
- [ ] Verify database updated

#### Task 5.4.5: Test Position Closing
- [ ] Open position detail
- [ ] Close position
- [ ] Verify transaction succeeds
- [ ] Verify status updated to CLOSED

#### Task 5.4.6: Test Error Scenarios
- [ ] Test with insufficient balance
- [ ] Test with invalid pool address
- [ ] Test with network errors
- [ ] Verify error messages are user-friendly

#### Task 5.4.7: Test Background Jobs
- [ ] Verify position monitoring job runs
- [ ] Verify notification job runs
- [ ] Check job queue dashboard
- [ ] Verify no stuck jobs

### 5.5 Remove Old Code

#### Task 5.5.1: Remove Deprecated Services
- [ ] Delete `src/services/position.service.ts`
- [ ] Delete `src/services/portfolio.service.ts`
- [ ] Delete `src/services/message.service.ts`
- [ ] Delete other deprecated service files

#### Task 5.5.2: Remove Old Adapters
- [ ] Delete old `src/services/meteora/meteora.adapter.ts` if moved
- [ ] Clean up any duplicate files

#### Task 5.5.3: Clean Up Old Utilities
- [ ] Review `src/bot/utils/`
- [ ] Move still-needed utilities to `src/shared/utils/`
- [ ] Delete unused utilities

#### Task 5.5.4: Clean Up Old Types
- [ ] Review `src/types/`
- [ ] Ensure all needed types moved to `src/shared/types/`
- [ ] Delete old type files

### 5.6 Documentation Updates

#### Task 5.6.1: Update README
- [ ] Document new folder structure
- [ ] Explain architecture layers
- [ ] Add diagrams (copy from SystemDesign.md)
- [ ] Update setup instructions

#### Task 5.6.2: Document Use Cases
- [ ] Add JSDoc comments to all use cases
- [ ] Explain parameters and return values
- [ ] Add usage examples

#### Task 5.6.3: Document Domain Entities
- [ ] Add JSDoc comments to entities
- [ ] Explain business logic methods
- [ ] Document validation rules

#### Task 5.6.4: Document Adapters
- [ ] Add JSDoc comments to adapters
- [ ] Explain data transformations
- [ ] Document interface implementations

#### Task 5.6.5: Create Developer Onboarding Guide
- [ ] Write `docs/developer-guide.md`
- [ ] Explain architecture
- [ ] How to add new use case
- [ ] How to add new DEX adapter
- [ ] How to run and test locally

#### Task 5.6.6: Create ADR (Architecture Decision Records)
- [ ] Document key architectural decisions
- [ ] Why clean architecture?
- [ ] Why use case pattern?
- [ ] Why repository pattern?
- [ ] Store in `docs/adr/` folder

### 5.7 Final Checks

#### Task 5.7.1: Run Linter
- [ ] Run `pnpm lint` in apps/bot
- [ ] Fix all linting errors
- [ ] Fix all warnings

#### Task 5.7.2: Run Type Checker
- [ ] Run `pnpm typecheck` in apps/bot
- [ ] Fix all TypeScript errors
- [ ] Ensure strict mode enabled

#### Task 5.7.3: Check for Circular Dependencies
- [ ] Use `madge` or similar tool
- [ ] Identify circular dependencies
- [ ] Break circular dependencies

#### Task 5.7.4: Review Code
- [ ] Self-review all changed files
- [ ] Check for TODO comments
- [ ] Check for console.log statements
- [ ] Verify error handling

#### Task 5.7.5: Performance Check
- [ ] Compare response times before/after
- [ ] Ensure < 5% regression
- [ ] Document improvements

#### Task 5.7.6: Deploy to Staging
- [ ] Deploy refactored code to staging
- [ ] Run smoke tests
- [ ] Monitor for errors
- [ ] Check logs

#### Task 5.7.7: Production Deployment
- [ ] Create deployment plan
- [ ] Schedule deployment window
- [ ] Deploy to production
- [ ] Monitor metrics closely
- [ ] Be ready to rollback

---

## Additional Tasks (Optional/Future)

### Testing Tasks (Excluded from MVP)

These tasks are important but excluded from MVP per requirements. Add back when ready:

- Write unit tests for domain entities
- Write unit tests for use cases
- Write unit tests for adapters
- Write integration tests for repositories
- Write integration tests for use cases
- Write E2E tests for user flows
- Set up test coverage reporting
- Achieve 80% test coverage

### Advanced Features (Post-MVP)

- Implement event sourcing for positions
- Add read models for performance
- Implement CQRS pattern
- Add GraphQL API
- Add WebSocket for real-time updates
- Implement saga pattern for complex workflows
- Add distributed tracing
- Implement feature flags service

---

## Task Tracking

**Recommended Approach:**
1. Copy this file to a project management tool (Jira, Linear, Asana, etc.)
2. Create epics for each phase
3. Create stories for each section (e.g., "Domain Layer - Position Entity")
4. Create tasks for each checkbox item
5. Assign priority and estimates
6. Track progress

**Priority Guide:**
- **P0 (Critical):** Phase 1, Phase 2 (Foundation and Core Services)
- **P1 (High):** Phase 3 (Supporting Services)
- **P2 (Medium):** Phase 4 (Infrastructure)
- **P3 (Low):** Phase 5 (Cleanup, can be done incrementally)

**Estimated Hours per Task:**
- Small tasks: 1-2 hours
- Medium tasks: 2-4 hours
- Large tasks: 4-8 hours
- Break down any task > 8 hours into smaller tasks

**Total Estimated Effort:**
- Phase 1: 40 hours (1 week)
- Phase 2: 80 hours (2 weeks)
- Phase 3: 40 hours (1 week)
- Phase 4: 40 hours (1 week)
- Phase 5: 40 hours (1 week)
- **Total: ~240 hours (~6 weeks at 40 hours/week)**

---

## Notes

- This is an MVP refactoring focused on code structure and maintainability
- Testing is explicitly excluded per requirements but should be added later
- Use feature flags or keep old code during migration for safety
- Deploy incrementally and test thoroughly at each phase
- Document decisions and learnings as you go
- Adjust timeline based on team size and velocity
- Consider pair programming for complex refactorings
- Regular code reviews to ensure consistency
- Keep stakeholders informed of progress

---

**Status:** Ready for Execution  
**Next Steps:** 
1. Review and approve tasks
2. Import to project management tool
3. Assign tasks to team members
4. Start with Phase 1, Task 1.1.1
5. Track progress and adjust as needed

Good luck with the refactoring! 🚀
