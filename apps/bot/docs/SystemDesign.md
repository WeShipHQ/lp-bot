# System Design Document
## Meteora Liquidity Bot - Technical Architecture

**Version:** 1.0  
**Last Updated:** October 17, 2025  
**Status:** Active Development  
**Initial Focus:** Meteora DEX with Multi-DEX Extensibility

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [High-Level Architecture](#2-high-level-architecture)
3. [Technology Stack](#3-technology-stack)
4. [Component Design](#4-component-design)
5. [Data Architecture](#5-data-architecture)
6. [Integration Patterns](#6-integration-patterns)
7. [Security Architecture](#7-security-architecture)
8. [Scalability & Performance](#8-scalability--performance)
9. [Deployment Architecture](#9-deployment-architecture)
10. [Monitoring & Observability](#10-monitoring--observability)
11. [Multi-DEX Extensibility](#11-multi-dex-extensibility)

---

## 1. Executive Summary

### 1.1 Purpose
This document defines the technical architecture for the Meteora Liquidity Bot, a Telegram-based DeFi application built on Node.js with Fastify, Telegraf, and Solana Web3 technologies.

### 1.2 Architectural Goals
- **Modularity:** Clean separation of concerns with pluggable DEX adapters
- **Scalability:** Handle 10,000+ concurrent users with horizontal scaling
- **Reliability:** 99.5%+ uptime with graceful degradation
- **Extensibility:** Easy addition of new DEXes (Orca, Raydium, Saros)
- **Security:** Non-custodial wallet management with industry best practices
- **Performance:** Sub-3-second response times for 95% of operations

### 1.3 Core Design Principles
1. **Separation of Concerns:** Clear boundaries between bot logic, business logic, and data access
2. **Interface-Based Design:** All DEX interactions through abstract interfaces
3. **Event-Driven Architecture:** Background jobs for monitoring, rebalancing, notifications
4. **Fail-Safe Operations:** Transaction rollback, retry logic, circuit breakers
5. **Stateless Services:** Scale horizontally without session affinity

---

## 2. High-Level Architecture

### 2.1 System Context Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                          External Systems                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐            │
│  │   Telegram   │  │    Privy     │  │   Solana     │            │
│  │   Bot API    │  │    Wallet    │  │   Mainnet    │            │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘            │
│         │                  │                  │                     │
│         │                  │                  │                     │
└─────────┼──────────────────┼──────────────────┼─────────────────────┘
          │                  │                  │
          │                  │                  │
┌─────────▼──────────────────▼──────────────────▼─────────────────────┐
│                     Meteora Liquidity Bot                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │                   Presentation Layer                        │  │
│  │  ┌──────────────────────────────────────────────────────┐  │  │
│  │  │  Telegraf Bot (Commands, Scenes, Keyboards)          │  │  │
│  │  └──────────────────────────────────────────────────────┘  │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                              │                                      │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │                   Application Layer                         │  │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐           │  │
│  │  │  Message   │  │ Position   │  │ Portfolio  │           │  │
│  │  │  Service   │  │  Service   │  │  Service   │           │  │
│  │  └────────────┘  └────────────┘  └────────────┘           │  │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐           │  │
│  │  │   Wallet   │  │  Trending  │  │    User    │           │  │
│  │  │  Service   │  │  Service   │  │  Service   │           │  │
│  │  └────────────┘  └────────────┘  └────────────┘           │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                              │                                      │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │                   Domain Layer                              │  │
│  │  ┌────────────────────────────────────────────────────┐    │  │
│  │  │           DEX Adapter Registry                     │    │  │
│  │  │  ┌──────────────┐  ┌──────────────┐               │    │  │
│  │  │  │   Meteora    │  │    Saros     │  [Orca] ...   │    │  │
│  │  │  │   Adapter    │  │   Adapter    │               │    │  │
│  │  │  └──────────────┘  └──────────────┘               │    │  │
│  │  └────────────────────────────────────────────────────┘    │  │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐           │  │
│  │  │  Solana    │  │  Jupiter   │  │   Privy    │           │  │
│  │  │  Service   │  │  Service   │  │  Service   │           │  │
│  │  └────────────┘  └────────────┘  └────────────┘           │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                              │                                      │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │                   Infrastructure Layer                      │  │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐           │  │
│  │  │ PostgreSQL │  │   Redis    │  │   Pino     │           │  │
│  │  │  (Drizzle) │  │  (BullMQ)  │  │  Logger    │           │  │
│  │  └────────────┘  └────────────┘  └────────────┘           │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
          │                  │                  │
          │                  │                  │
┌─────────▼──────────────────▼──────────────────▼─────────────────────┐
│                     External DEX APIs                               │
├─────────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐            │
│  │   Meteora    │  │   Jupiter    │  │    Token     │            │
│  │     API      │  │     API      │  │  Metadata    │            │
│  └──────────────┘  └──────────────┘  └──────────────┘            │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 Component Interaction Flow

**User Position Creation Flow:**
```
User → Telegram → Bot Commands → Position Service → DEX Adapter
                                        ↓
                                  Solana Service
                                        ↓
                                  Transaction
                                        ↓
                                  Database (Drizzle)
                                        ↓
                                  Job Queue (BullMQ)
                                        ↓
                               Background Monitoring
```

### 2.3 Data Flow Diagram

```
┌─────────────┐
│    User     │
└──────┬──────┘
       │
       │ /create position
       ▼
┌─────────────────┐
│  Telegraf Bot   │
│   (Commands)    │
└──────┬──────────┘
       │
       │ handleCreatePosition()
       ▼
┌─────────────────────┐
│  Position Service   │
│  - Validate input   │
│  - Fetch pool data  │
│  - Calculate params │
└──────┬──────────────┘
       │
       │ createPosition()
       ▼
┌─────────────────────┐
│  DEX Adapter        │
│  (Meteora/Saros)    │
│  - Build tx         │
└──────┬──────────────┘
       │
       │ signAndSend()
       ▼
┌─────────────────────┐
│  Solana Service     │
│  - Simulate tx      │
│  - Submit tx        │
│  - Confirm tx       │
└──────┬──────────────┘
       │
       │ Transaction ID
       ▼
┌─────────────────────┐
│  Database           │
│  - Save position    │
│  - Save snapshot    │
└──────┬──────────────┘
       │
       │ enqueueJob()
       ▼
┌─────────────────────┐
│  Job Queue          │
│  - Monitor job      │
│  - Rebalance job    │
└─────────────────────┘
```

---

## 3. Technology Stack

### 3.1 Core Technologies

| Layer | Technology | Version | Justification |
|-------|-----------|---------|---------------|
| **Runtime** | Node.js | 22+ | Latest LTS, modern async features, wide library support |
| **Language** | TypeScript | 5.6+ | Type safety, better IDE support, maintainability |
| **Web Framework** | Fastify | 4.26+ | Fast, low overhead, plugin architecture, good for microservices |
| **Bot Framework** | Telegraf | 4.16+ | Mature Telegram bot library, scene support, middleware pattern |
| **Database** | PostgreSQL | 16+ | ACID compliance, JSON support, mature ecosystem |
| **ORM** | Drizzle | 0.30+ | Type-safe, lightweight, great TypeScript integration |
| **Cache/Queue** | Redis | 7+ | In-memory speed, pub/sub, job queue support |
| **Job Queue** | BullMQ | 5+ | Robust job processing, retry logic, priority queues |
| **Blockchain** | Solana Web3.js | 1.95+ | Official Solana JavaScript SDK |
| **Logger** | Pino | 8+ | Fast, structured logging, low overhead |

### 3.2 External SDKs & APIs

| Service | SDK/API | Purpose |
|---------|---------|---------|
| **Meteora** | Meteora DLMM SDK | Pool data, position creation, fee claiming |
| **Saros** | @saros-finance/dlmm-sdk | Saros DLMM operations |
| **Jupiter** | Jupiter API (HTTP) | Token prices, swap routing, price aggregation |
| **Privy** | @privy-io/server-auth | Wallet authentication, key management |
| **Solana** | @solana/web3.js | Transaction building, RPC calls |
| **Anchor** | @coral-xyz/anchor | Program instruction building |

### 3.3 Development Tools

| Tool | Purpose |
|------|---------|
| **pnpm** | Monorepo package management |
| **Turborepo** | Build orchestration, caching |
| **ESLint** | Code linting |
| **Prettier** | Code formatting |
| **Vitest** | Unit testing |
| **tsup** | TypeScript bundling |
| **Drizzle Kit** | Database migrations |

### 3.4 Technology Justifications

**Fastify over Express:**
- 2-3x faster request handling
- Native async/await support
- Strong plugin ecosystem
- Built-in schema validation

**Drizzle over Prisma:**
- Lighter weight (no heavy runtime)
- Better TypeScript inference
- Direct SQL when needed
- Faster query performance

**BullMQ over Agenda:**
- Redis-backed (faster than MongoDB)
- Better priority queue support
- Advanced retry strategies
- Built-in UI for job monitoring

**Pino over Winston:**
- 5-10x faster logging
- Structured JSON logs
- Child loggers with context
- Lower memory footprint

---

## 4. Component Design

### 4.1 Presentation Layer

**Responsibilities:**
- Handle Telegram user interactions
- Route commands to appropriate handlers
- Manage conversational state (scenes)
- Format and send messages to users
- Render inline keyboards

**Components:**

#### 4.1.1 Bot Commands (`src/bot/commands/`)
```typescript
// Command structure
interface BotCommand {
  name: string;
  description: string;
  handler: (ctx: BotContext, server: FastifyInstance) => Promise<void>;
}

// Examples:
// - startCommand: /start - Initialize user, show main menu
// - portfolioCommand: /portfolio - Display user positions
// - trendingCommand: /trending - Show trending pools
// - walletCommand: /wallet - Display wallet info
// - settingsCommand: /settings - User preferences
```

**Design Pattern:** Command Pattern
- Each command is self-contained
- Easy to add new commands
- Consistent error handling
- Middleware support (auth, logging)

#### 4.1.2 Bot Scenes (`src/bot/scenes/`)
```typescript
// Scene for multi-step interactions
interface BotScene {
  id: string;
  enter: (ctx: SceneContext) => Promise<void>;
  handlers: Record<string, Handler>;
  leave: (ctx: SceneContext) => Promise<void>;
}

// Examples:
// - createPositionScene: Multi-step position creation wizard
// - positionDetailScene: Position management interface
// - poolDetailScene: Pool exploration and selection
```

**Design Pattern:** State Machine
- Each scene represents a conversational state
- State transitions via enter/leave handlers
- Session-scoped state storage
- Timeout handling (10 minutes default)

#### 4.1.3 Keyboards (`src/bot/keyboards/`)
```typescript
// Inline keyboard builders
interface KeyboardBuilder {
  build(context: any): InlineKeyboard;
}

// Examples:
// - mainMenu: Primary navigation
// - portfolioMenu: Portfolio actions
// - positionDetailMenu: Position management
// - trendingMenu: Pool browsing and filtering
```

**Design Pattern:** Builder Pattern
- Dynamic keyboard generation
- Context-aware button states
- Consistent styling and layout
- Callback data encoding

#### 4.1.4 Message Formatters (`src/bot/utils/messages/`)
```typescript
// Message formatting utilities
interface MessageFormatter {
  format(data: any): string;
}

// Examples:
// - formatPoolCard(pool): Display pool information
// - formatPositionSummary(position): Position details
// - formatPortfolioOverview(portfolio): Portfolio metrics
```

**Design Pattern:** Strategy Pattern
- Consistent message formatting
- Reusable templates
- Markdown/HTML escaping
- Number/currency formatting

### 4.2 Application Layer (Services)

**Responsibilities:**
- Implement business logic
- Coordinate between domain and presentation
- Transaction orchestration
- Error handling and validation

#### 4.2.1 Position Service (`src/services/position.service.ts`)
```typescript
class PositionService {
  // Position lifecycle
  async createPosition(params: CreatePositionParams): Promise<Position>
  async closePosition(positionId: string): Promise<TransactionResult>
  async getPosition(positionId: string): Promise<Position>
  async getUserPositions(userId: string): Promise<Position[]>
  
  // Position management
  async claimFees(positionId: string): Promise<TransactionResult>
  async rebalancePosition(positionId: string): Promise<TransactionResult>
  async updatePositionSnapshot(positionId: string): Promise<void>
  
  // Analytics
  async calculatePnL(position: Position): Promise<PnLResult>
  async getPositionPerformance(positionId: string): Promise<Performance>
}
```

**Key Responsibilities:**
- Validate position creation parameters
- Coordinate with DEX adapters for on-chain operations
- Persist position state to database
- Calculate performance metrics (P&L, APY, fees)
- Manage position lifecycle (create → active → closed)

**Error Handling:**
- Validate inputs before blockchain interaction
- Wrap DEX adapter errors with user-friendly messages
- Transaction simulation before submission
- Automatic retry for transient failures

#### 4.2.2 Portfolio Service (`src/services/portfolio.service.ts`)
```typescript
class PortfolioService {
  async getPortfolio(userId: string): Promise<Portfolio>
  async calculateTotalValue(positions: Position[]): Promise<number>
  async getPerformanceMetrics(userId: string): Promise<PortfolioMetrics>
  async getPositionBreakdown(userId: string): Promise<DexBreakdown>
  async refreshPortfolio(userId: string): Promise<Portfolio>
}
```

**Key Responsibilities:**
- Aggregate positions across DEXes
- Calculate total portfolio value and P&L
- Generate performance metrics
- Support filtering and sorting

**Optimization:**
- Cache portfolio calculations (5-minute TTL)
- Batch fetch position data
- Parallel RPC calls for different positions

#### 4.2.3 Wallet Service (`src/services/wallet.service.ts`)
```typescript
class WalletService {
  async connectWallet(telegramId: string, privyToken: string): Promise<Wallet>
  async getBalance(walletAddress: string): Promise<TokenBalance[]>
  async getTransactionHistory(walletAddress: string): Promise<Transaction[]>
  async sendTokens(params: SendParams): Promise<TransactionResult>
}
```

**Key Responsibilities:**
- Interface with Privy for wallet management
- Fetch token balances from Solana
- Parse and format transaction history
- Build and submit token transfer transactions

**Security:**
- Never expose private keys
- Validate recipient addresses
- Simulate transfers before submission
- Rate limiting on send operations

#### 4.2.4 Trending Service (`src/services/trending.service.ts`)
```typescript
class TrendingService {
  async getTrendingPools(params: TrendingParams): Promise<PaginatedPools>
  async searchPoolsByToken(tokenAddress: string): Promise<Pool[]>
  async getPoolDetails(poolAddress: string, dex: DexType): Promise<Pool>
}
```

**Key Responsibilities:**
- Fetch trending pools from DEX adapters
- Aggregate and normalize pool data
- Sort and filter pools by metrics
- Cache trending data (10-minute TTL)

**Data Sources:**
- DEX adapter APIs (Meteora, Saros, etc.)
- Jupiter for token prices
- On-chain pool state when APIs unavailable

#### 4.2.5 Message Service (`src/services/message.service.ts`)
```typescript
class MessageService {
  async sendMessage(chatId: number, text: string, options?: MessageOptions): Promise<void>
  async editMessage(chatId: number, messageId: number, text: string): Promise<void>
  async deleteMessage(chatId: number, messageId: number): Promise<void>
  async sendNotification(userId: string, notification: Notification): Promise<void>
}
```

**Key Responsibilities:**
- Centralized message sending
- Message templating and formatting
- Notification delivery
- Message queueing and rate limiting

**Rate Limiting:**
- Respect Telegram API limits (30 msg/sec)
- Queue messages when limit approached
- Priority queue for important notifications

#### 4.2.6 Job Queue Service (`src/services/job-queue.service.ts`)
```typescript
class JobQueueService {
  async enqueuePositionMonitor(positionId: string): Promise<void>
  async enqueueRebalanceCheck(positionId: string): Promise<void>
  async enqueuePortfolioSync(userId: string): Promise<void>
  async enqueueNotification(notification: Notification): Promise<void>
}
```

**Job Types:**
1. **Position Monitor Job:** Check position health every 5 minutes
2. **Rebalance Check Job:** Evaluate if rebalancing needed
3. **Portfolio Sync Job:** Refresh portfolio from blockchain
4. **Notification Job:** Send scheduled notifications
5. **Transaction Confirmation Job:** Monitor pending transactions

**Configuration:**
- Position monitoring: Every 5 minutes
- Rebalance check: When position monitor detects deviation
- Portfolio sync: On-demand + every 10 minutes for active users
- Max retries: 3 with exponential backoff

### 4.3 Domain Layer (DEX Adapters)

**Responsibilities:**
- Abstract DEX-specific logic
- Provide unified interface for all DEXes
- Handle blockchain interactions
- Transform DEX-specific data to unified models

#### 4.3.1 Base DEX Adapter Interface
```typescript
interface IDexAdapter {
  readonly dexType: DexType; // 'meteora' | 'saros' | 'orca' | 'raydium'
  readonly name: string;
  readonly isEnabled: boolean;
  
  // Pool operations
  getPool(poolId: string): Promise<UnifiedPool>;
  getTrendingPools(params?: TrendingParams): Promise<PaginatedTrendingPools>;
  searchPools(query: string): Promise<UnifiedPool[]>;
  
  // Position operations
  getUserPositions(userAddress: string): Promise<UnifiedPosition[]>;
  getPosition(positionAddress: string): Promise<UnifiedPosition>;
  createPosition(params: CreatePositionParams): Promise<TransactionResult>;
  closePosition(positionAddress: string): Promise<TransactionResult>;
  claimFees(positionAddress: string): Promise<TransactionResult>;
  rebalancePosition(positionAddress: string, params: RebalanceParams): Promise<TransactionResult>;
  
  // Portfolio operations
  getUserPortfolio(userAddress: string): Promise<UnifiedPortfolio>;
  
  // Utility methods
  parsePoolUrl(url: string): UrlParseResult | null;
  isValidPoolUrl(url: string): boolean;
  isHealthy(): Promise<boolean>;
}
```

**Design Pattern:** Adapter Pattern
- Uniform interface for all DEXes
- DEX-specific implementations hidden
- Easy to add new DEXes
- Fallback to on-chain data if API fails

#### 4.3.2 Meteora Adapter (`src/services/meteora/meteora.adapter.ts`)
```typescript
class MeteoraAdapter extends BaseDexAdapter {
  readonly dexType = 'meteora';
  readonly name = 'Meteora';
  
  private dlmmService: MeteoraDlmmService;
  
  async getPool(poolId: string): Promise<UnifiedPool> {
    const meteoraPool = await this.dlmmService.getPool(poolId);
    return this.transformToUnifiedPool(meteoraPool);
  }
  
  async createPosition(params: CreatePositionParams): Promise<TransactionResult> {
    // Build Meteora-specific transaction
    const tx = await this.dlmmService.createPositionIx(params);
    return this.submitTransaction(tx);
  }
  
  // Transform Meteora data structures to unified models
  private transformToUnifiedPool(meteoraPool: MeteoraDlmmPool): UnifiedPool {
    return {
      id: meteoraPool.address,
      dex: 'meteora',
      type: 'DLMM',
      tokenA: this.transformToken(meteoraPool.tokenX),
      tokenB: this.transformToken(meteoraPool.tokenY),
      tvl: meteoraPool.liquidity,
      apr: meteoraPool.apr,
      // ... other mappings
    };
  }
}
```

#### 4.3.3 Saros Adapter (`src/services/saros/saros.adapter.ts`)
```typescript
class SarosAdapter extends BaseDexAdapter {
  readonly dexType = 'saros';
  readonly name = 'Saros';
  
  private dlmmService: SarosDlmmService;
  
  // Similar structure to Meteora adapter
  // Implements all IDexAdapter methods
  // Transforms Saros-specific data to unified models
}
```

#### 4.3.4 DEX Registry (`src/services/dex-registry.service.ts`)
```typescript
class DexRegistry {
  private adapters: Map<DexType, IDexAdapter> = new Map();
  
  register(adapter: IDexAdapter): void {
    this.adapters.set(adapter.dexType, adapter);
  }
  
  getAdapter(dexType: DexType): IDexAdapter {
    const adapter = this.adapters.get(dexType);
    if (!adapter) throw new Error(`No adapter registered for ${dexType}`);
    return adapter;
  }
  
  getSupportedDexes(): DexType[] {
    return Array.from(this.adapters.keys());
  }
  
  async getAllTrendingPools(params?: TrendingParams): Promise<UnifiedPool[]> {
    const allPools = await Promise.all(
      Array.from(this.adapters.values()).map(adapter => 
        adapter.getTrendingPools(params)
      )
    );
    return this.mergeAndSort(allPools);
  }
}
```

**Usage:**
```typescript
// Initialize registry
const registry = new DexRegistry();
registry.register(new MeteoraAdapter());
registry.register(new SarosAdapter());

// Get DEX-specific adapter
const meteoraAdapter = registry.getAdapter('meteora');
const pools = await meteoraAdapter.getTrendingPools();

// Get trending pools across all DEXes
const allPools = await registry.getAllTrendingPools();
```

### 4.4 Infrastructure Layer

#### 4.4.1 Database (Drizzle ORM)
```typescript
// Schema definition (src/db/schema.ts)
export const users = pgTable('User', {
  id: uuid('id').primaryKey().defaultRandom(),
  telegramId: text('telegramId').notNull().unique(),
  walletAddress: text('walletAddress').notNull().unique(),
  walletId: text('walletId').notNull(),
  autoRebalanceEnabled: boolean('autoRebalanceEnabled').default(true),
  rebalanceThreshold: decimal('rebalanceThreshold').default('20.00'),
  createdAt: timestamp('createdAt').defaultNow(),
  updatedAt: timestamp('updatedAt').defaultNow(),
});

export const positions = pgTable('Position', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('userId').references(() => users.id),
  positionAddress: text('positionAddress').notNull().unique(),
  poolAddress: text('poolAddress').notNull(),
  dex: text('dex').notNull(), // 'meteora', 'saros', etc.
  strategyType: strategyTypeEnum('strategyType').notNull(),
  status: positionStatusEnum('status').default('ACTIVE'),
  tokenX: jsonb('tokenX').$type<Token>().notNull(),
  tokenY: jsonb('tokenY').$type<Token>().notNull(),
  initialValueUSD: decimal('initialValueUSD').notNull(),
  currentSegmentNumber: integer('currentSegmentNumber').default(1),
  isRebalancingEnabled: boolean('isRebalancingEnabled').default(false),
  createdAt: timestamp('createdAt').defaultNow(),
  // ... many more fields for tracking position state
});
```

**Database Access Pattern:**
```typescript
// Repository pattern for data access
class PositionRepository {
  constructor(private db: PostgresJsDatabase) {}
  
  async findById(id: string): Promise<Position | null> {
    const [position] = await this.db
      .select()
      .from(positions)
      .where(eq(positions.id, id))
      .limit(1);
    return position || null;
  }
  
  async findByUser(userId: string): Promise<Position[]> {
    return this.db
      .select()
      .from(positions)
      .where(
        and(
          eq(positions.userId, userId),
          eq(positions.status, 'ACTIVE')
        )
      )
      .orderBy(desc(positions.createdAt));
  }
  
  async create(data: NewPosition): Promise<Position> {
    const [position] = await this.db
      .insert(positions)
      .values(data)
      .returning();
    return position;
  }
  
  async update(id: string, data: Partial<Position>): Promise<Position> {
    const [updated] = await this.db
      .update(positions)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(positions.id, id))
      .returning();
    return updated;
  }
}
```

#### 4.4.2 Redis Cache & Job Queue
```typescript
// Cache service (src/utils/cache.ts)
class CacheService {
  constructor(private redis: Redis) {}
  
  async get<T>(key: string): Promise<T | null> {
    const value = await this.redis.get(key);
    return value ? JSON.parse(value) : null;
  }
  
  async set(key: string, value: any, ttlSeconds: number): Promise<void> {
    await this.redis.setex(key, ttlSeconds, JSON.stringify(value));
  }
  
  async invalidate(pattern: string): Promise<void> {
    const keys = await this.redis.keys(pattern);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }
}

// Job queue configuration (src/services/job-queue.service.ts)
class JobQueueService {
  private positionMonitorQueue: Queue;
  private rebalanceQueue: Queue;
  private notificationQueue: Queue;
  
  constructor(redisConnection: ConnectionOptions) {
    this.positionMonitorQueue = new Queue('position-monitor', {
      connection: redisConnection,
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 500,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      },
    });
    
    // Initialize workers
    new Worker('position-monitor', this.processPositionMonitor.bind(this), {
      connection: redisConnection,
      concurrency: 10,
    });
  }
  
  private async processPositionMonitor(job: Job): Promise<void> {
    const { positionId } = job.data;
    // Check position health, trigger rebalancing if needed
    const position = await this.positionService.getPosition(positionId);
    const needsRebalance = await this.checkRebalanceCondition(position);
    if (needsRebalance) {
      await this.rebalanceQueue.add('rebalance', { positionId });
    }
  }
}
```

#### 4.4.3 Logging (Pino)
```typescript
// Logger configuration (src/utils/logger.ts)
import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV === 'development' ? {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
    },
  } : undefined,
  formatters: {
    level: (label) => ({ level: label }),
  },
  serializers: {
    error: pino.stdSerializers.err,
  },
});

// Usage with context
const childLogger = logger.child({ 
  userId: 'user-123',
  positionId: 'pos-456'
});

childLogger.info({ action: 'createPosition' }, 'Position created successfully');
childLogger.error({ error, action: 'claimFees' }, 'Failed to claim fees');
```

---

## 5. Data Architecture

### 5.1 Database Schema

**Core Tables:**

1. **User** - User profiles and preferences
2. **Wallet** - Wallet information (address, Privy ID)
3. **Position** - Liquidity positions with lifecycle tracking
4. **PositionSegment** - Tracks position history across rebalances
5. **ClaimHistory** - Fee claim records
6. **RebalanceEvent** - Rebalancing operations
7. **PositionSnapshot** - Periodic position state snapshots
8. **Transaction** - Transaction history
9. **PendingTransaction** - Transactions awaiting confirmation
10. **Referral** - Referral relationships
11. **Points** - User reward points

**Key Relationships:**
```
User (1) ──< (N) Position
Position (1) ──< (N) PositionSegment
Position (1) ──< (N) ClaimHistory
Position (1) ──< (N) RebalanceEvent
Position (1) ──< (N) PositionSnapshot
User (1) ──< (N) Referral
User (1) ──< (N) Points
```

### 5.2 Data Models

#### 5.2.1 Unified Pool Model
```typescript
interface UnifiedPool {
  id: string;
  address: string;
  name: string; // e.g., "SOL-USDC"
  dex: PoolDex; // 'meteora' | 'saros' | 'orca' | 'raydium'
  type: PoolType; // 'DLMM' | 'DAMM' | 'CONCENTRATED' | 'STANDARD'
  
  // Tokens
  tokenA: Token;
  tokenB: Token;
  
  // Metrics
  currentPrice: number; // TokenB per TokenA
  liquidity: string; // Total liquidity USD
  tvl: string; // Total Value Locked USD
  apr: number; // Annual Percentage Rate
  apy: number; // Annual Percentage Yield
  
  // Volume & Fees
  volume24h?: number;
  fees24h?: number;
  feeTvlRatio24h?: number;
  
  // Detailed time-series (optional)
  volume?: {
    hour1?: number;
    hour4?: number;
    hour12?: number;
    hour24?: number;
  };
  fees?: {
    hour1?: number;
    hour4?: number;
    hour12?: number;
    hour24?: number;
  };
  
  // Metadata
  isVerified: boolean;
  metadata?: Record<string, any>; // DEX-specific data
}
```

#### 5.2.2 Unified Position Model
```typescript
interface UnifiedPosition {
  id: string;
  address: string;
  poolAddress: string;
  dex: DexType;
  type: PoolType;
  
  // Tokens
  tokenA: Token;
  tokenB: Token;
  
  // Amounts
  tokenAAmount: string;
  tokenBAmount: string;
  
  // Values
  currentValueUsd: number;
  initialValueUsd: number;
  
  // Fees & Rewards
  unclaimedFeesUsd: number;
  claimedFeesUsd: number;
  unclaimedRewardsUsd?: number;
  claimedRewardsUsd?: number;
  
  // Performance
  pnlUsd: number;
  pnlPercentage: number;
  
  // Status
  inRange: boolean;
  isActive: boolean;
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
  
  // DEX-specific metadata
  metadata?: Record<string, any>;
}
```

#### 5.2.3 Unified Portfolio Model
```typescript
interface UnifiedPortfolio {
  userAddress: string;
  positions: UnifiedPosition[];
  
  // Aggregated metrics
  totalValueUsd: number;
  totalPnlUsd: number;
  totalFeesUsd: number;
  totalRewardsUsd?: number;
  
  // Breakdown by DEX
  dexBreakdown: Record<DexType, {
    positions: number;
    valueUsd: number;
    pnlUsd: number;
  }>;
}
```

### 5.3 Caching Strategy

**Cache Layers:**

1. **Redis Cache (Application-level)**
   - Trending pools: 10-minute TTL
   - Token prices: 1-minute TTL
   - User portfolio: 5-minute TTL
   - Pool details: 5-minute TTL
   - User balances: 2-minute TTL

2. **In-Memory Cache (Process-level)**
   - DEX adapter instances: Singleton
   - Token metadata: 1-hour TTL
   - RPC connections: Connection pooling

**Cache Invalidation:**
- On user action: Invalidate user-specific caches
- On transaction confirmation: Invalidate position/portfolio caches
- Scheduled: Full cache refresh every 1 hour
- On error: Remove stale cache entry

**Cache Keys Pattern:**
```
user:{userId}:portfolio
position:{positionId}:details
pool:{dex}:{poolId}:details
trending:{dex}:{sortBy}:page:{page}
token:{address}:price
wallet:{address}:balance
```

### 5.4 Data Synchronization

**Blockchain → Database Sync:**

1. **Transaction Confirmation Monitor**
   - Poll pending transactions every 30 seconds
   - Update position status on confirmation
   - Retry failed transactions (max 3 attempts)

2. **Position State Sync**
   - Fetch latest position data every 5 minutes for active positions
   - Calculate and update P&L
   - Store snapshot for historical tracking

3. **Portfolio Reconciliation**
   - Daily job to reconcile database with blockchain
   - Detect and fix discrepancies
   - Alert on unreconcilable positions

**Data Consistency Guarantees:**
- Position creation: Atomic database transaction
- Fee claiming: Update position + insert claim record in single transaction
- Rebalancing: Close old + create new + record event in single logical transaction
- Use database transactions for multi-table updates

---

## 6. Integration Patterns

### 6.1 Telegram Bot API

**Integration Type:** WebSocket (Long Polling) / Webhook

**Connection Management:**
```typescript
// Initialize bot with graceful shutdown
const bot = new Telegraf<BotContext>(CONFIG.TELEGRAM_BOT_TOKEN);

// Graceful shutdown
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

// Launch bot
await bot.launch({ 
  dropPendingUpdates: true // Skip old updates on restart
});
```

**Rate Limiting:**
- Telegram limit: 30 messages/second per bot
- Implementation: Token bucket algorithm
- Queue excess messages
- Priority queue for important notifications

**Error Handling:**
- Retry on 429 (Too Many Requests) with exponential backoff
- Handle 403 (Bot blocked by user) gracefully
- Log but don't crash on 400 (Bad Request)

### 6.2 Privy Authentication

**Integration Type:** OAuth 2.0 / JWT

**Authentication Flow:**
```typescript
class PrivyService {
  async authenticateUser(telegramId: string): Promise<PrivyAuthResult> {
    // 1. Create Privy auth URL
    const authUrl = await this.privy.createAuthUrl({
      loginMethods: ['email', 'wallet', 'google'],
      redirectUri: `${CONFIG.APP_URL}/auth/callback`,
      state: telegramId, // Pass Telegram ID as state
    });
    
    // 2. Send auth URL to user via Telegram
    // User authenticates in browser
    
    // 3. Handle callback after authentication
    // Privy redirects back with auth code
    
    // 4. Exchange auth code for access token
    const tokens = await this.privy.exchangeAuthCode(authCode);
    
    // 5. Get user's wallet from Privy
    const privyUser = await this.privy.getUser(tokens.accessToken);
    const walletAddress = privyUser.wallet.address;
    
    // 6. Link Telegram user to wallet
    await this.userService.linkWallet(telegramId, {
      walletAddress,
      privyUserId: privyUser.id,
      accessToken: tokens.accessToken,
    });
    
    return { walletAddress, privyUserId: privyUser.id };
  }
  
  async getWalletSigner(userId: string): Promise<Keypair> {
    // Use Privy's embedded wallet to sign transactions
    const privyWallet = await this.privy.getEmbeddedWallet(userId);
    return privyWallet.getSigner();
  }
}
```

**Security:**
- Store Privy user ID and refresh tokens in database (encrypted)
- Never store access tokens (short-lived, 1-hour expiry)
- Refresh access token before each sensitive operation
- Validate JWT signature on every request

### 6.3 Solana Blockchain

**RPC Configuration:**
```typescript
class SolanaService {
  private connections: Connection[];
  private currentIndex = 0;
  
  constructor(rpcUrls: string[]) {
    this.connections = rpcUrls.map(url => new Connection(url, {
      commitment: 'confirmed',
      confirmTransactionInitialTimeout: 60000,
    }));
  }
  
  // Round-robin RPC selection with fallback
  private getConnection(): Connection {
    const connection = this.connections[this.currentIndex];
    this.currentIndex = (this.currentIndex + 1) % this.connections.length;
    return connection;
  }
  
  async submitTransaction(
    transaction: VersionedTransaction,
    signer: Keypair
  ): Promise<string> {
    const connection = this.getConnection();
    
    // 1. Simulate transaction first
    const simulation = await connection.simulateTransaction(transaction);
    if (simulation.value.err) {
      throw new Error(`Simulation failed: ${JSON.stringify(simulation.value.err)}`);
    }
    
    // 2. Sign transaction
    transaction.sign([signer]);
    
    // 3. Submit with retry
    const signature = await this.sendAndConfirmWithRetry(connection, transaction);
    
    return signature;
  }
  
  private async sendAndConfirmWithRetry(
    connection: Connection,
    transaction: VersionedTransaction,
    maxRetries = 3
  ): Promise<string> {
    for (let i = 0; i < maxRetries; i++) {
      try {
        const signature = await connection.sendTransaction(transaction, {
          skipPreflight: false,
          preflightCommitment: 'confirmed',
        });
        
        // Wait for confirmation
        const confirmation = await connection.confirmTransaction({
          signature,
          blockhash: transaction.message.recentBlockhash,
          lastValidBlockHeight: await connection.getBlockHeight(),
        }, 'confirmed');
        
        if (confirmation.value.err) {
          throw new Error(`Transaction failed: ${confirmation.value.err}`);
        }
        
        return signature;
      } catch (error) {
        if (i === maxRetries - 1) throw error;
        await this.sleep(2000 * Math.pow(2, i)); // Exponential backoff
      }
    }
    
    throw new Error('Transaction failed after retries');
  }
}
```

**Transaction Building:**
- Fetch latest blockhash before each transaction
- Set priority fees dynamically based on network congestion
- Use versioned transactions for lower fees
- Simulate before submitting to catch errors early

**Account Monitoring:**
- Subscribe to account changes via WebSocket
- Update database when position state changes
- Use commitment level 'confirmed' for balance checks

### 6.4 Jupiter API

**Integration Type:** REST API

**Token Price Service:**
```typescript
class JupiterService {
  private baseUrl = 'https://api.jup.ag';
  private httpClient: HttpClient;
  
  async getTokenPrice(mintAddress: string): Promise<number> {
    const cacheKey = `token:${mintAddress}:price`;
    
    // Check cache first
    const cached = await this.cache.get<number>(cacheKey);
    if (cached) return cached;
    
    // Fetch from Jupiter
    const response = await this.httpClient.get<JupiterPriceResponse>(
      `${this.baseUrl}/price`, 
      { params: { ids: mintAddress } }
    );
    
    const price = response.data.data[mintAddress]?.price || 0;
    
    // Cache for 1 minute
    await this.cache.set(cacheKey, price, 60);
    
    return price;
  }
  
  async getSwapRoute(params: SwapParams): Promise<SwapRoute> {
    const response = await this.httpClient.get<JupiterQuoteResponse>(
      `${this.baseUrl}/quote`,
      {
        params: {
          inputMint: params.inputMint,
          outputMint: params.outputMint,
          amount: params.amount,
          slippageBps: params.slippageBps || 50, // 0.5% default
        },
      }
    );
    
    return response.data;
  }
}
```

**Error Handling:**
- Fallback to on-chain price oracles if Jupiter unavailable
- Retry with exponential backoff for transient errors
- Use stale cache if API fails (with warning to user)

### 6.5 DEX APIs (Meteora, Saros)

**Meteora API:**
```typescript
class MeteoraDlmmService {
  private baseUrl = 'https://dlmm-api.meteora.ag';
  
  async getPools(params: GetPoolsParams): Promise<MeteoraDlmmPool[]> {
    const response = await this.httpClient.get<MeteoraDlmmResponse>(
      `${this.baseUrl}/pair/all`,
      { params }
    );
    return response.data.groups.flatMap(g => g.pairs);
  }
  
  async getPool(poolAddress: string): Promise<MeteoraDlmmPool> {
    const response = await this.httpClient.get<{ pair: MeteoraDlmmPool }>(
      `${this.baseUrl}/pair/${poolAddress}`
    );
    return response.data.pair;
  }
  
  async getUserPositions(userAddress: string): Promise<MeteoraPosition[]> {
    // Call Meteora SDK to fetch on-chain positions
    const dlmm = await DLMM.create(this.connection, poolAddress);
    const positions = await dlmm.getPositionsByUserAndLbPair(userAddress);
    return positions;
  }
}
```

**Saros API:**
```typescript
class SarosPoolService {
  private baseUrl = 'https://saros-api.io';
  
  async getAllDlmmPools(params: GetPoolsParams): Promise<SarosDlmmPool[]> {
    const response = await this.httpClient.get<SarosPoolsResponse>(
      `${this.baseUrl}/api/v1/pools/dlmm`,
      { params }
    );
    return response.data.data;
  }
  
  async getDlmmPool(poolAddress: string): Promise<SarosDlmmPoolDetail> {
    const response = await this.httpClient.get<SarosPoolDetailResponse>(
      `${this.baseUrl}/api/v1/pools/dlmm/${poolAddress}`
    );
    return response.data.data;
  }
}
```

**API Circuit Breaker:**
- Track API failure rate
- Open circuit if failure rate > 50% over 1 minute
- Fallback to on-chain data when circuit open
- Half-open after 30 seconds, close after 3 successful requests

---

## 7. Security Architecture

### 7.1 Authentication & Authorization

**Multi-Layer Security:**

1. **Telegram User Verification**
   ```typescript
   // Middleware to verify Telegram user
   bot.use(async (ctx, next) => {
     if (!ctx.from) {
       return ctx.reply('Unable to verify user');
     }
     
     // Verify Telegram auth data hash
     const isValid = verifyTelegramWebAppData(ctx.from);
     if (!isValid) {
       logger.warn({ userId: ctx.from.id }, 'Invalid Telegram auth');
       return ctx.reply('Authentication failed');
     }
     
     await next();
   });
   ```

2. **Wallet Ownership Verification**
   - Privy handles wallet connection and ownership proof
   - Bot never directly handles private keys
   - All transactions signed via Privy's secure enclave

3. **Two-Factor Authentication (Optional)**
   ```typescript
   class TwoFactorAuthService {
     async enableTwoFactor(userId: string): Promise<TwoFactorSecret> {
       const secret = speakeasy.generateSecret({
         name: `Meteora Bot (${userId})`,
       });
       
       // Store encrypted secret
       await this.db.update(users)
         .set({ 
           twoFactorSecret: this.encrypt(secret.base32),
           twoFactorEnabled: true,
         })
         .where(eq(users.id, userId));
       
       return {
         secret: secret.base32,
         qrCode: secret.otpauth_url,
       };
     }
     
     async verifyToken(userId: string, token: string): Promise<boolean> {
       const user = await this.userService.getUser(userId);
       if (!user.twoFactorSecret) return false;
       
       const secret = this.decrypt(user.twoFactorSecret);
       return speakeasy.totp.verify({
         secret,
         encoding: 'base32',
         token,
         window: 1, // Allow 30s window
       });
     }
   }
   ```

4. **Session Management**
   - Telegram session: 24-hour timeout
   - Scene session: 10-minute timeout
   - Privy token: 1-hour expiry, auto-refresh

### 7.2 Data Protection

**Encryption at Rest:**
```typescript
// Encrypt sensitive data before database storage
class EncryptionService {
  private algorithm = 'aes-256-gcm';
  private key: Buffer;
  
  constructor(encryptionKey: string) {
    this.key = Buffer.from(encryptionKey, 'hex');
  }
  
  encrypt(plaintext: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);
    
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    // Return: iv:authTag:ciphertext
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  }
  
  decrypt(ciphertext: string): string {
    const [ivHex, authTagHex, encrypted] = ciphertext.split(':');
    
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv(this.algorithm, this.key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }
}
```

**What to Encrypt:**
- Two-factor authentication secrets
- Privy refresh tokens
- Sensitive user settings
- Backup codes

**What NOT to Encrypt:**
- Wallet addresses (public data)
- Position addresses (public data)
- Transaction signatures (public data)
- User preferences (non-sensitive)

**Encryption at Transit:**
- TLS 1.3 for all external API calls
- HTTPS only for webhooks
- WebSocket Secure (WSS) for real-time connections

### 7.3 Transaction Security

**Transaction Validation:**
```typescript
async function validateTransaction(params: CreatePositionParams): Promise<void> {
  // 1. Validate wallet ownership
  const user = await userService.getUser(params.userId);
  if (params.walletAddress !== user.walletAddress) {
    throw new Error('Wallet address mismatch');
  }
  
  // 2. Check balance
  const balance = await solanaService.getBalance(params.walletAddress);
  if (balance < params.amount) {
    throw new Error('Insufficient balance');
  }
  
  // 3. Validate pool exists
  const pool = await dexAdapter.getPool(params.poolAddress);
  if (!pool) {
    throw new Error('Pool not found');
  }
  
  // 4. Check 2FA if enabled
  if (user.twoFactorEnabled && !params.twoFactorToken) {
    throw new Error('Two-factor authentication required');
  }
  
  // 5. Rate limit check
  const recentTxCount = await getRecentTransactionCount(params.userId, 60);
  if (recentTxCount > 5) {
    throw new Error('Rate limit exceeded. Please try again later.');
  }
}
```

**Transaction Simulation:**
```typescript
// Simulate before submitting to catch errors
const simulation = await connection.simulateTransaction(transaction);

if (simulation.value.err) {
  // Parse error and provide user-friendly message
  if (simulation.value.err.toString().includes('InsufficientFunds')) {
    throw new Error('Insufficient SOL for transaction fees');
  } else if (simulation.value.err.toString().includes('SlippageToleranceExceeded')) {
    throw new Error('Price moved too much. Try again or increase slippage');
  } else {
    throw new Error(`Transaction simulation failed: ${simulation.value.err}`);
  }
}
```

**Slippage Protection:**
- Default slippage: 0.5% (50 bps)
- Max slippage: 5% (500 bps)
- Display estimated vs. worst-case execution
- User can customize slippage tolerance

### 7.4 Rate Limiting

**Multi-Level Rate Limiting:**

1. **User-Level Limits:**
   ```typescript
   // Redis-based rate limiter
   class RateLimiter {
     async checkLimit(
       userId: string,
       action: string,
       limit: number,
       windowSeconds: number
     ): Promise<boolean> {
       const key = `ratelimit:${userId}:${action}`;
       const current = await redis.incr(key);
       
       if (current === 1) {
         await redis.expire(key, windowSeconds);
       }
       
       if (current > limit) {
         throw new Error(`Rate limit exceeded. Try again in ${windowSeconds}s`);
       }
       
       return true;
     }
   }
   
   // Usage
   await rateLimiter.checkLimit(userId, 'create_position', 2, 60); // 2 per minute
   await rateLimiter.checkLimit(userId, 'claim_fees', 10, 3600); // 10 per hour
   await rateLimiter.checkLimit(userId, 'refresh', 20, 60); // 20 per minute
   ```

2. **IP-Level Limits (for API abuse):**
   - 100 requests per minute per IP
   - Block IPs with suspicious patterns
   - CAPTCHA for high-frequency requesters

3. **Global System Limits:**
   - Max 1000 transactions per minute system-wide
   - Circuit breaker if Solana RPC overloaded
   - Queue excess requests

### 7.5 Security Best Practices

**Input Validation:**
- Sanitize all user inputs
- Validate Solana addresses (base58 check)
- Prevent SQL injection (use parameterized queries)
- Escape Markdown/HTML in messages

**Error Messages:**
- Don't leak sensitive information
- Generic errors for authentication failures
- Detailed errors for transaction failures (safe)
- Log detailed errors server-side

**Dependency Security:**
- Regular dependency audits (`pnpm audit`)
- Automated security updates (Dependabot)
- Pin exact versions in production
- Review before updating major versions

**Environment Variables:**
- Never commit secrets to Git
- Use `.env` files (gitignored)
- Rotate secrets quarterly
- Different secrets for dev/staging/prod

---

## 8. Scalability & Performance

### 8.1 Horizontal Scaling

**Stateless Application Design:**
- No in-memory session state (use Redis)
- All state in database or distributed cache
- Any instance can handle any request
- Scale by adding more containers

**Load Balancing:**
```
                 ┌─────────────┐
                 │   Nginx     │
                 │ Load Balancer│
                 └──────┬──────┘
                        │
         ┌──────────────┼──────────────┐
         │              │              │
    ┌────▼───┐     ┌────▼───┐     ┌────▼───┐
    │  Bot   │     │  Bot   │     │  Bot   │
    │Instance│     │Instance│     │Instance│
    │   1    │     │   2    │     │   3    │
    └────┬───┘     └────┬───┘     └────┬───┘
         │              │              │
         └──────────────┼──────────────┘
                        │
              ┌─────────▼─────────┐
              │   PostgreSQL      │
              │   (Primary)       │
              │                   │
              │   Redis           │
              │   (Shared)        │
              └───────────────────┘
```

**Scaling Strategy:**
- Start with 2 instances (high availability)
- Auto-scale based on CPU/memory (70% threshold)
- Max 10 instances initially
- Separate job workers from web instances

### 8.2 Database Optimization

**Indexing Strategy:**
```sql
-- Critical indexes for query performance
CREATE INDEX idx_positions_user_status ON "Position" (userId, status);
CREATE INDEX idx_positions_address ON "Position" (positionAddress);
CREATE INDEX idx_positions_pool ON "Position" (poolAddress, dex);
CREATE INDEX idx_positions_created ON "Position" (createdAt DESC);

CREATE INDEX idx_users_telegram_id ON "User" (telegramId);
CREATE INDEX idx_users_wallet_address ON "User" (walletAddress);

CREATE INDEX idx_snapshots_position_time ON "PositionSnapshot" (positionId, snapshotTimestamp DESC);

CREATE INDEX idx_pending_tx_status ON "PendingTransaction" (status, createdAt);
```

**Query Optimization:**
- Use `EXPLAIN ANALYZE` to identify slow queries
- Avoid N+1 queries (use joins or batch fetch)
- Paginate large result sets
- Use partial indexes for frequently filtered columns

**Connection Pooling:**
```typescript
// Drizzle with connection pooling
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

const queryClient = postgres(DATABASE_URL, {
  max: 20, // Max connections
  idle_timeout: 20, // Close idle connections after 20s
  connect_timeout: 10, // Connection timeout 10s
});

export const db = drizzle(queryClient);
```

**Read Replicas (Future):**
- Route read queries to replicas
- Write queries to primary
- Eventual consistency acceptable for portfolio/trending

### 8.3 Caching Strategy

**Multi-Tier Caching:**

1. **L1: In-Memory Cache (per instance)**
   ```typescript
   // LRU cache for frequently accessed data
   import LRU from 'lru-cache';
   
   const tokenMetadataCache = new LRU<string, TokenMetadata>({
     max: 1000, // Max 1000 entries
     ttl: 1000 * 60 * 60, // 1 hour TTL
     updateAgeOnGet: true,
   });
   ```

2. **L2: Redis Cache (shared)**
   - Trending pools: 10-minute TTL
   - Token prices: 1-minute TTL
   - User portfolios: 5-minute TTL

3. **L3: CDN (static assets)**
   - Token logos cached at CDN edge
   - Generated images (pool cards, charts)

**Cache Invalidation Strategies:**
- **Time-based:** Most caches expire after TTL
- **Event-based:** Invalidate on user actions
- **Stale-while-revalidate:** Serve stale data while refreshing

### 8.4 Background Job Processing

**Job Queue Architecture:**
```
┌─────────────────┐
│  Redis Queue    │
│  (BullMQ)       │
└────────┬────────┘
         │
    ┌────┴─────┐
    │ Priority │
    │  Queue   │
    └────┬─────┘
         │
    ┌────▼────────────────────┐
    │   Job Workers           │
    │  ┌───────┐  ┌───────┐  │
    │  │Worker │  │Worker │  │
    │  │  1    │  │  2    │  │
    │  └───────┘  └───────┘  │
    │  ┌───────┐  ┌───────┐  │
    │  │Worker │  │Worker │  │
    │  │  3    │  │  4    │  │
    │  └───────┘  └───────┘  │
    └─────────────────────────┘
```

**Job Types & Priorities:**

| Job Type | Priority | Frequency | Timeout |
|----------|----------|-----------|---------|
| Transaction Confirmation | High | Every 30s | 2 min |
| Position Monitor | Medium | Every 5 min | 5 min |
| Rebalance Check | Medium | On-demand | 10 min |
| Portfolio Sync | Low | Every 10 min | 5 min |
| Notification | High | On-demand | 1 min |

**Concurrency & Parallelism:**
- Position monitoring: 10 concurrent jobs
- Rebalancing: 5 concurrent jobs (requires wallet signing)
- Notifications: 20 concurrent jobs
- Transaction confirmation: 10 concurrent jobs

**Error Handling:**
- Retry failed jobs up to 3 times
- Exponential backoff: 2s, 4s, 8s
- Dead letter queue for permanently failed jobs
- Alert on repeated failures

### 8.5 Performance Benchmarks

**Target Performance:**

| Operation | Target | Acceptable | Unacceptable |
|-----------|--------|------------|--------------|
| Command response | < 1s | < 2s | > 3s |
| Portfolio load | < 2s | < 3s | > 5s |
| Position creation | < 10s | < 30s | > 60s |
| Balance refresh | < 3s | < 5s | > 10s |
| Trending pools | < 2s | < 3s | > 5s |
| Database query | < 100ms | < 500ms | > 1s |

**Performance Monitoring:**
- Track p50, p95, p99 response times
- Alert on p95 > 3 seconds
- Daily performance reports
- Load testing before major releases

---

## 9. Deployment Architecture

### 9.1 Deployment Environment

**Production Infrastructure:**
```
┌─────────────────────────────────────────────────────────────┐
│                     Railway / Render                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────┐         ┌──────────────┐                │
│  │   Bot        │◄────────│   Nginx      │                │
│  │   Instances  │         │   Reverse    │                │
│  │   (2-10)     │         │   Proxy      │                │
│  └──────┬───────┘         └──────────────┘                │
│         │                                                   │
│         │                                                   │
│  ┌──────▼────────────────────────────┐                    │
│  │   PostgreSQL (Managed)            │                    │
│  │   - Primary: Read/Write           │                    │
│  │   - Replica: Read-only (future)   │                    │
│  └───────────────────────────────────┘                    │
│                                                             │
│  ┌─────────────────────────────────┐                      │
│  │   Redis (Managed)               │                      │
│  │   - Cache                       │                      │
│  │   - Job Queue                   │                      │
│  │   - Session Store               │                      │
│  └─────────────────────────────────┘                      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Recommended Hosting:**
- **Application:** Railway / Render / Fly.io
- **Database:** Railway Postgres / Supabase / Neon
- **Redis:** Upstash Redis / Railway Redis
- **Monitoring:** Better Stack / Datadog

### 9.2 CI/CD Pipeline

**GitHub Actions Workflow:**
```yaml
name: Deploy Bot

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: pnpm/action-setup@v2
      - run: pnpm install
      - run: pnpm test
      - run: pnpm lint
      - run: pnpm typecheck
  
  build:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: docker/build-push-action@v4
        with:
          context: .
          file: ./Dockerfile
          push: true
          tags: ${{ secrets.REGISTRY }}/bot:latest
  
  deploy:
    needs: build
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - name: Deploy to Railway
        run: railway up
        env:
          RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }}
```

**Deployment Strategy:**
- **Blue-Green Deployment:** Zero downtime
- **Health Checks:** Ensure new instance healthy before routing traffic
- **Rollback:** Automatic rollback on health check failure
- **Database Migrations:** Run before deployment, backwards-compatible

### 9.3 Environment Configuration

**Environment Variables:**
```bash
# Application
NODE_ENV=production
PORT=8080
LOG_LEVEL=info

# Telegram
TELEGRAM_BOT_TOKEN=<telegram-bot-token>
TELEGRAM_WEBHOOK_DOMAIN=<domain>

# Database
DATABASE_URL=postgresql://user:pass@host:5432/db

# Redis
REDIS_URL=redis://default:pass@host:6379

# Solana
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
SOLANA_RPC_URL_FALLBACK=https://solana-api.projectserum.com

# Privy
PRIVY_APP_ID=<privy-app-id>
PRIVY_APP_SECRET=<privy-secret>

# Encryption
ENCRYPTION_KEY=<32-byte-hex-key>

# External APIs
METEORA_API_URL=https://dlmm-api.meteora.ag
JUPITER_API_URL=https://api.jup.ag

# Monitoring
SENTRY_DSN=<sentry-dsn>
BETTER_STACK_SOURCE_TOKEN=<token>
```

### 9.4 Docker Configuration

**Dockerfile:**
```dockerfile
FROM node:22-alpine AS base

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Build stage
FROM base AS builder
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/bot ./apps/bot
COPY packages ./packages
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @repo/bot build

# Production stage
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

# Copy built files
COPY --from=builder /app/apps/bot/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/bot/package.json ./

# Run as non-root user
USER node

EXPOSE 8080
CMD ["node", "dist/index.js"]
```

### 9.5 Health Checks & Monitoring

**Health Check Endpoint:**
```typescript
// Fastify health check route
fastify.get('/health', async (request, reply) => {
  const checks = await Promise.allSettled([
    // Database health
    db.execute(sql`SELECT 1`),
    
    // Redis health
    redis.ping(),
    
    // Bot health
    bot.telegram.getMe(),
    
    // RPC health
    connection.getBlockHeight(),
  ]);
  
  const allHealthy = checks.every(c => c.status === 'fulfilled');
  
  return reply.code(allHealthy ? 200 : 503).send({
    status: allHealthy ? 'healthy' : 'unhealthy',
    timestamp: new Date().toISOString(),
    checks: {
      database: checks[0].status === 'fulfilled',
      redis: checks[1].status === 'fulfilled',
      telegram: checks[2].status === 'fulfilled',
      solana: checks[3].status === 'fulfilled',
    },
  });
});
```

**Readiness vs. Liveness:**
- **Liveness:** Is the service running? (always check)
- **Readiness:** Is the service ready to accept traffic? (check dependencies)

---

## 10. Monitoring & Observability

### 10.1 Logging Strategy

**Structured Logging with Pino:**
```typescript
// Create logger with context
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  base: {
    env: process.env.NODE_ENV,
    revision: process.env.GIT_COMMIT,
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

// Usage with context
const requestLogger = logger.child({
  requestId: request.id,
  userId: user.id,
});

requestLogger.info({ action: 'createPosition', poolId }, 'Creating position');
requestLogger.error({ error, action: 'submitTransaction' }, 'Transaction failed');
```

**What to Log:**
- All user actions (command executions)
- Transaction submissions and confirmations
- API errors and retries
- Performance metrics (slow queries)
- Security events (failed auth, rate limits)

**Log Levels:**
- `error`: Errors requiring immediate attention
- `warn`: Warnings that should be reviewed
- `info`: Important business events
- `debug`: Detailed debugging information (dev only)
- `trace`: Very detailed, performance-impacting (never in prod)

### 10.2 Metrics Collection

**Key Metrics:**

**Application Metrics:**
- Request rate (requests per second)
- Response time (p50, p95, p99)
- Error rate (errors per minute)
- Active users (current concurrent users)
- Command usage (histogram by command type)

**Business Metrics:**
- Positions created (count per hour/day)
- Total value locked (sum of all positions)
- Fees claimed (total USD per day)
- User retention (DAU/MAU ratio)
- Position success rate (successful / attempted)

**Infrastructure Metrics:**
- CPU usage (% per instance)
- Memory usage (MB per instance)
- Database connections (active/idle)
- Redis memory usage
- Job queue depth

**Blockchain Metrics:**
- Transaction confirmation time
- Transaction failure rate
- RPC latency (ms)
- Solana network congestion

**Metrics Export:**
```typescript
// Prometheus metrics
import { register, Counter, Histogram } from 'prom-client';

const positionCreationCounter = new Counter({
  name: 'position_creations_total',
  help: 'Total number of positions created',
  labelNames: ['dex', 'status'],
});

const transactionDuration = new Histogram({
  name: 'transaction_duration_seconds',
  help: 'Transaction confirmation duration',
  labelNames: ['type'],
  buckets: [1, 5, 10, 30, 60, 120],
});

// Expose metrics endpoint
fastify.get('/metrics', async (request, reply) => {
  reply.type('text/plain').send(await register.metrics());
});
```

### 10.3 Error Tracking

**Sentry Integration:**
```typescript
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1, // Sample 10% of transactions
  beforeSend(event, hint) {
    // Filter sensitive data
    if (event.request) {
      delete event.request.cookies;
      delete event.request.headers?.authorization;
    }
    return event;
  },
});

// Capture errors
try {
  await positionService.createPosition(params);
} catch (error) {
  Sentry.captureException(error, {
    tags: { userId, action: 'createPosition' },
    extra: { params },
  });
  throw error;
}
```

### 10.4 Alerting

**Alert Rules:**

| Alert | Condition | Severity | Notification |
|-------|-----------|----------|--------------|
| High Error Rate | Error rate > 5% for 5 min | Critical | PagerDuty + SMS |
| Slow Response | p95 response time > 5s | Warning | Slack |
| Database Down | Database unreachable | Critical | PagerDuty + SMS |
| Job Queue Stalled | No jobs processed in 10 min | Warning | Slack |
| Transaction Failures | TX failure rate > 20% | Critical | PagerDuty |
| Low Balance | Bot wallet < 1 SOL | Warning | Email |

**Alert Channels:**
- **Critical:** PagerDuty (SMS/Call)
- **Warning:** Slack #alerts channel
- **Info:** Email digest (daily)

### 10.5 Dashboards

**Grafana Dashboard Panels:**

1. **Overview Panel:**
   - Current active users
   - Requests per minute
   - Error rate
   - Avg response time

2. **Business Metrics Panel:**
   - Positions created today
   - Total value locked
   - Fees claimed today
   - New users today

3. **Performance Panel:**
   - Response time percentiles (p50, p95, p99)
   - Slow query count
   - Database query time
   - RPC latency

4. **Infrastructure Panel:**
   - CPU usage per instance
   - Memory usage per instance
   - Database connections
   - Redis memory

5. **Blockchain Panel:**
   - Transaction confirmation time
   - Transaction success rate
   - Solana network TPS
   - RPC availability

---

## 11. Multi-DEX Extensibility

### 11.1 Adapter Pattern Implementation

**Adding a New DEX:**

**Step 1: Implement IDexAdapter Interface**
```typescript
// src/services/orca/orca.adapter.ts
import { BaseDexAdapter } from '@/adapters/base-dex.adapter';
import { IDexAdapter } from '@/types/dex-adapter.interface';

export class OrcaAdapter extends BaseDexAdapter implements IDexAdapter {
  readonly dexType: DexType = 'orca';
  readonly name: string = 'Orca';
  readonly isEnabled: boolean = true;
  
  constructor(
    private orcaSdk: OrcaSDK,
    private connection: Connection
  ) {
    super();
  }
  
  async getPool(poolId: string): Promise<UnifiedPool> {
    // 1. Fetch pool data from Orca SDK/API
    const orcaPool = await this.orcaSdk.getPool(poolId);
    
    // 2. Transform to UnifiedPool
    return this.transformOrcaPoolToUnified(orcaPool);
  }
  
  async getTrendingPools(params?: TrendingParams): Promise<PaginatedTrendingPools> {
    // Fetch and paginate Orca pools
    const orcaPools = await this.orcaSdk.getAllPools(params);
    return {
      pools: orcaPools.map(p => this.transformOrcaPoolToUnified(p)),
      currentPage: params?.page || 1,
      totalPages: Math.ceil(orcaPools.total / (params?.limit || 10)),
      sortBy: params?.sortBy || 'tvl',
    };
  }
  
  async createPosition(params: CreatePositionParams): Promise<TransactionResult> {
    // 1. Build Orca-specific transaction
    const tx = await this.buildOrcaPositionTx(params);
    
    // 2. Sign and submit
    return this.submitTransaction(tx, params.signer);
  }
  
  // ... implement other interface methods
  
  private transformOrcaPoolToUnified(orcaPool: OrcaPool): UnifiedPool {
    return {
      id: orcaPool.address,
      address: orcaPool.address,
      name: `${orcaPool.tokenA.symbol}-${orcaPool.tokenB.symbol}`,
      dex: 'orca',
      type: orcaPool.isWhirlpool ? 'CONCENTRATED' : 'STANDARD',
      tokenA: this.transformToken(orcaPool.tokenA),
      tokenB: this.transformToken(orcaPool.tokenB),
      tvl: orcaPool.tvl,
      apr: orcaPool.apr,
      // ... map other fields
    };
  }
}
```

**Step 2: Register Adapter**
```typescript
// src/index.ts or src/bot/index.ts
import { dexRegistry } from '@/services/dex-registry.service';
import { OrcaAdapter } from '@/services/orca/orca.adapter';

// Initialize and register
const orcaAdapter = new OrcaAdapter(orcaSdk, connection);
dexRegistry.register(orcaAdapter);
```

**Step 3: Update Configuration**
```typescript
// src/config/dex.config.ts
export const DEX_CONFIG = {
  meteora: {
    name: 'Meteora',
    enabled: true,
    apiUrl: 'https://dlmm-api.meteora.ag',
    poolTypes: ['DLMM', 'DAMM'],
  },
  orca: {
    name: 'Orca',
    enabled: true,
    apiUrl: 'https://api.orca.so',
    poolTypes: ['CONCENTRATED', 'STANDARD'],
  },
  // Add more DEXes...
};
```

**Step 4: Update Database Schema**
```typescript
// Database already supports multiple DEXes via 'dex' field
// No schema changes needed!

// Just update the enum type:
export const dexTypeEnum = pgEnum('DexType', [
  'meteora',
  'saros',
  'orca',    // Add new DEX
  'raydium', // Add new DEX
]);
```

### 11.2 Multi-DEX Features

**Unified Trending Pools:**
```typescript
// Get trending pools across all DEXes
const allTrendingPools = await dexRegistry.getAllTrendingPools({
  sortBy: 'apy',
  limit: 10,
});

// Filter by specific DEXes
const filteredPools = allTrendingPools.filter(pool => 
  ['meteora', 'orca'].includes(pool.dex)
);
```

**Cross-DEX Portfolio:**
```typescript
// User's positions across all DEXes
const portfolio = await portfolioService.getPortfolio(userId);

// Portfolio automatically includes positions from all registered DEXes
console.log(portfolio.dexBreakdown);
// {
//   meteora: { positions: 3, valueUsd: 5000, pnlUsd: 500 },
//   orca: { positions: 2, valueUsd: 3000, pnlUsd: 200 },
//   saros: { positions: 1, valueUsd: 1000, pnlUsd: 50 },
// }
```

**DEX Selection in UI:**
```typescript
// Trending command with DEX filter
bot.command('trending', async (ctx) => {
  const keyboard = Markup.inlineKeyboard([
    [
      Markup.button.callback('🟣 Meteora', 'trending:meteora'),
      Markup.button.callback('🔵 Orca', 'trending:orca'),
    ],
    [
      Markup.button.callback('🟢 Saros', 'trending:saros'),
      Markup.button.callback('🌐 All DEXes', 'trending:all'),
    ],
  ]);
  
  await ctx.reply('Select DEX to browse trending pools:', keyboard);
});
```

### 11.3 Future DEX Roadmap

**Planned DEX Integrations:**

| DEX | Priority | Timeline | Pool Types | Complexity |
|-----|----------|----------|------------|------------|
| Meteora | P0 | Launch | DLMM, DAMM | Medium |
| Saros | P0 | Launch | DLMM | Medium |
| Orca | P1 | Month 3 | Whirlpools, Standard AMM | Medium |
| Raydium | P1 | Month 6 | CPMM, Standard AMM | Low |
| Phoenix | P2 | Month 9 | Order Book | High |
| Lifinity | P2 | Month 12 | Proactive AMM | Medium |

**Effort Estimate per DEX:**
- **Low Complexity (Standard AMM):** 2-3 weeks
- **Medium Complexity (DLMM/Concentrated):** 4-6 weeks
- **High Complexity (Order Book):** 8-12 weeks

**Integration Checklist:**
- [ ] Study DEX SDK/API documentation
- [ ] Implement IDexAdapter interface
- [ ] Transform DEX data models to unified models
- [ ] Implement position creation transaction building
- [ ] Implement position closing and fee claiming
- [ ] Add DEX-specific tests
- [ ] Update UI with DEX branding/logos
- [ ] Add to DEX registry
- [ ] Deploy to staging for testing
- [ ] Launch to production with feature flag

---

## 12. Appendix

### 12.1 Technology Decision Records

**TDR-001: Why Fastify over Express?**
- **Decision:** Use Fastify as web framework
- **Rationale:**
  - 2-3x faster request handling
  - Native async/await support
  - Strong plugin ecosystem
  - Built-in schema validation
  - Lower memory footprint
- **Trade-offs:** Smaller community than Express, fewer middleware packages

**TDR-002: Why Drizzle over Prisma?**
- **Decision:** Use Drizzle as ORM
- **Rationale:**
  - Lighter weight (no heavy runtime)
  - Better TypeScript inference
  - Direct SQL when needed
  - Faster query performance
  - No schema generation lag
- **Trade-offs:** Less mature, smaller ecosystem, no visual studio

**TDR-003: Why Privy for Wallet Management?**
- **Decision:** Use Privy for wallet authentication
- **Rationale:**
  - Non-custodial wallet creation
  - Social login integration
  - Embedded wallet SDK
  - Secure key management (HSM-backed)
  - Good developer experience
- **Trade-offs:** Third-party dependency, vendor lock-in risk

**TDR-004: Why BullMQ over Agenda?**
- **Decision:** Use BullMQ for job queues
- **Rationale:**
  - Redis-backed (faster than MongoDB)
  - Better priority queue support
  - Advanced retry strategies
  - Built-in UI for job monitoring
  - Active development
- **Trade-offs:** Requires Redis (additional infrastructure)

### 12.2 Performance Optimization Checklist

**Database:**
- [ ] Add indexes for all foreign keys
- [ ] Index frequently queried columns
- [ ] Use connection pooling
- [ ] Enable query result caching
- [ ] Paginate large result sets
- [ ] Use EXPLAIN ANALYZE for slow queries

**Caching:**
- [ ] Cache trending pools (10-min TTL)
- [ ] Cache token prices (1-min TTL)
- [ ] Cache user portfolios (5-min TTL)
- [ ] Implement cache warming for popular data
- [ ] Use stale-while-revalidate pattern

**API Calls:**
- [ ] Batch multiple API calls
- [ ] Use parallel requests where possible
- [ ] Implement circuit breakers
- [ ] Add request retries with backoff
- [ ] Cache API responses

**Frontend (Telegram):**
- [ ] Minimize message edits (use new messages)
- [ ] Batch keyboard updates
- [ ] Compress inline keyboard data
- [ ] Use photo/document cache IDs

**Code:**
- [ ] Use async/await consistently
- [ ] Avoid blocking operations
- [ ] Stream large data sets
- [ ] Use worker threads for CPU-intensive tasks

### 12.3 Security Hardening Checklist

**Authentication:**
- [ ] Verify Telegram user hash
- [ ] Implement 2FA for sensitive operations
- [ ] Use short-lived access tokens
- [ ] Implement session timeouts

**Data Protection:**
- [ ] Encrypt sensitive data at rest
- [ ] Use TLS for all external communications
- [ ] Never log sensitive data (keys, tokens)
- [ ] Implement secure random generation

**Input Validation:**
- [ ] Validate all user inputs
- [ ] Sanitize data before database insertion
- [ ] Use parameterized queries (prevent SQL injection)
- [ ] Escape user-generated content

**Rate Limiting:**
- [ ] Implement per-user rate limits
- [ ] Implement per-IP rate limits
- [ ] Add CAPTCHA for high-frequency requests
- [ ] Circuit breakers for external APIs

**Dependencies:**
- [ ] Regular security audits (`pnpm audit`)
- [ ] Automated dependency updates
- [ ] Pin exact versions in production
- [ ] Review before major version updates

**Infrastructure:**
- [ ] Use environment variables for secrets
- [ ] Rotate secrets quarterly
- [ ] Implement least privilege access
- [ ] Enable database encryption at rest
- [ ] Regular backup verification

---

**Document Status:** Complete and Ready for Implementation  
**Next Steps:**
1. Review and approve system design
2. Set up infrastructure (database, Redis, hosting)
3. Implement core components following this design
4. Set up monitoring and alerting
5. Deploy to staging environment
6. Load testing and performance tuning
7. Production deployment

---

*This system design document should be reviewed and updated as the system evolves and new requirements emerge.*
