# Meteora API Client Comparison

**Date:** 2025-01-XX  
**Scope:** Task 2.1 - Compare API Methods  
**Status:** Complete

---

## Executive Summary

This document provides a comprehensive comparison between the legacy `MeteoraApiService` and the new `MeteoraApiClient`. The goal is to guide the consolidation of these two implementations into a single, resilient API client as part of the Meteora adapter refactoring initiative.

### Key Findings

1. **Significant Overlap**: Both implementations provide nearly identical methods for fetching DLMM pool data
2. **Legacy Has Additional Features**: `MeteoraApiService` includes DAMM v1/v2 support and circuit breaker + caching
3. **New Client Is Cleaner**: `MeteoraApiClient` has better configuration management and cleaner code structure
4. **Consolidation Opportunity**: Merge the best features from both into enhanced `MeteoraApiClient`
5. **Limited Active Usage**: Only one service (`pool.service.ts`) actively uses `MeteoraApiService`

---

## 1. Implementation Status

### 1.1 MeteoraApiClient (New/Target Implementation)

**Location:** `apps/bot/src/adapters/dex/meteora-api.client.ts`  
**Status:** ✅ Active, Production-ready  
**Created:** Part of adapter-based architecture  
**Lines of Code:** 112 lines

**Design Philosophy:**
- Config-driven (uses `getDexConfig()`)
- Clean separation of concerns
- Focused on DLMM pools only
- Designed to be used by `MeteoraAdapter`

### 1.2 MeteoraApiService (Legacy Implementation)

**Location:** `apps/bot/src/services/meteora/meteora-api.service.ts`  
**Status:** ⚠️ Legacy, Pending consolidation  
**Created:** Original implementation before adapter pattern  
**Lines of Code:** 349 lines (mostly commented out)

**Design Philosophy:**
- Standalone service with built-in resilience
- Supports DLMM, DAMM v1, and DAMM v2
- Integrated circuit breaker and caching
- Self-contained HTTP handling

### 1.3 MeteoraPoolService (Related Legacy Service)

**Location:** `apps/bot/src/services/meteora/pool.service.ts`  
**Status:** ⚠️ Active but should be internalized to adapter  
**Lines of Code:** 369 lines

**Relationship:**
- Wraps Meteora API calls with additional data transformation
- Provides mapper functions (used by both services)
- Includes position-related API methods (claim fees, rewards, deposits, withdrawals)
- Should be migrated to adapter or consolidated

---

## 2. Method-by-Method Comparison Matrix

### 2.1 Core Pool Fetching Methods

| Method | MeteoraApiClient (New) | MeteoraApiService (Legacy) | MeteoraPoolService | Notes |
|--------|------------------------|----------------------------|-------------------|-------|
| **Get Single DLMM Pool** | ✅ `getPool(poolAddress)` | ✅ `getDlmmPool(poolAddress)` | ✅ `getDlmmPoolInfo(poolAddress)` | All three implement this; new client is cleanest |
| **Get Trending/Paginated Pools** | ✅ `getTrendingPools(params)` | ❌ Commented out | ✅ `getAllDlmmPools(params)` | New client active; legacy commented out |
| **Get All Pools** | ✅ `getAllPools()` | ❌ Not implemented | ❌ Not implemented | Only in new client |
| **Get DAMM v1 Pool** | ❌ Not implemented | ✅ `getDammV1Pool(poolId)` | ✅ `getDammV1PoolInfo(poolId)` | Only in legacy implementations |
| **Get DAMM v2 Pool** | ❌ Not implemented | ✅ `getDammV2Pool(poolId)` | ✅ `getDammV2PoolInfo(poolId)` | Only in legacy implementations |

### 2.2 Position-Related Methods

| Method | MeteoraApiClient | MeteoraApiService | MeteoraPoolService | Notes |
|--------|------------------|-------------------|-------------------|-------|
| **Get Position Claim Fees** | ❌ Not implemented | ❌ Commented out | ✅ `getPositionClaimFees(positionAddress)` | Only in MeteoraPoolService |
| **Get Position Claim Rewards** | ❌ Not implemented | ❌ Commented out | ✅ `getPositionClaimRewards(positionAddress)` | Only in MeteoraPoolService |
| **Get Position Deposits** | ❌ Not implemented | ❌ Commented out | ✅ `getPositionDeposits(positionAddress)` | Only in MeteoraPoolService |
| **Get Position Withdraws** | ❌ Not implemented | ❌ Commented out | ✅ `getPositionWithdraws(positionAddress)` | Only in MeteoraPoolService |

### 2.3 Data Transformation Methods

| Method | Location | Purpose | Should Migrate To |
|--------|----------|---------|-------------------|
| `mapDlmmToMeteoraPoolData()` | MeteoraPoolService (exported) | Transform DLMM API response to unified format | MeteoraAdapter (internal) |
| `mapDammV1ToMeteoraPoolData()` | MeteoraPoolService (exported), MeteoraApiService (commented) | Transform DAMM v1 API response | MeteoraAdapter (internal) |
| `mapDammV2ToMeteoraPoolData()` | MeteoraPoolService (exported), MeteoraApiService (commented) | Transform DAMM v2 API response | MeteoraAdapter (internal) |

---

## 3. Detailed Method Signatures

### 3.1 MeteoraApiClient (New Implementation)

```typescript
export class MeteoraApiClient {
  private readonly baseUrl: string;
  private readonly retries: number;

  constructor();

  // Core methods
  async getPool(poolAddress: string): Promise<MeteoraDlmmPoolResponse>;
  
  async getTrendingPools(
    params: DlmmPoolsPaginationParams = {}
  ): Promise<MeteoraDlmmPoolsPaginationResponse>;
  
  async getAllPools(): Promise<MeteoraDlmmPoolResponse[]>;
}

export const meteoraApiClient = new MeteoraApiClient();
```

**Parameters:**
- `getPool`: Takes pool address (string), returns single pool response
- `getTrendingPools`: Takes pagination params object with optional fields:
  - `page?: number`
  - `limit?: number`
  - `skip_size?: number`
  - `pools_to_top?: string[]`
  - `sort_key?: string`
  - `order_by?: 'asc' | 'desc'`
  - `search_term?: string`
  - `include_unknown?: boolean`
  - `hide_low_tvl?: number`
  - `hide_low_apr?: number`
  - `include_token_mints?: string[]`
  - `include_pool_token_pairs?: string[]`
  - `tags?: string[]`
  - `launchpad?: string[]`
- `getAllPools`: No parameters, returns all pools

**Return Types:**
- Uses standard Meteora API response types from `@/types/meteora.types.ts`
- `MeteoraDlmmPoolResponse`: Single pool data
- `MeteoraDlmmPoolsPaginationResponse`: Paginated pools with metadata

**Error Handling:**
- Uses `api.getWithRetry()` from `http-client.util.ts`
- Configurable retry count from DEX config
- Exponential backoff enabled
- Console.error logging on failure
- Re-throws errors after logging

**Configuration:**
- Reads from `getDexConfig("meteora")`
- Base URL: Defaults to `https://dlmm-api.meteora.ag`
- Retries: Configurable via config (default 3)

### 3.2 MeteoraApiService (Legacy Implementation)

```typescript
export class MeteoraApiService {
  private readonly dlmmApiUrl = "https://dlmm-api.meteora.ag";
  private readonly dammV1ApiUrl = "https://damm-api.meteora.ag";
  private readonly dammV2ApiUrl = "https://dammv2-api.meteora.ag";
  private readonly breaker: CircuitBreaker;
  private readonly cache: CacheService;

  // Active methods
  async getDlmmPool(poolAddress: string): Promise<MeteoraDlmmPoolResponse>;
  async getDammV1Pool(poolId: string): Promise<MeteoraDammV1PoolResponse>;
  async getDammV2Pool(poolId: string): Promise<MeteoraDammV2PoolResponse>;

  // Commented out methods (193 lines, lines 89-204)
  // async getPositionClaimFees(positionAddress: string): Promise<DlmmClaimFee[]>;
  // async getPositionClaimRewards(positionAddress: string): Promise<DlmmClaimReward[]>;
  // async getPositionDeposits(positionAddress: string): Promise<DlmmDepositWithdraw[]>;
  // async getPositionWithdraws(positionAddress: string): Promise<DlmmDepositWithdraw[]>;
  // async getAllDlmmPools(params: DlmmPoolsPaginationParams): Promise<MeteoraDlmmPoolsPaginationResponse>;
}
```

**Parameters:**
- `getDlmmPool`: Takes pool address (string)
- `getDammV1Pool`: Takes pool ID (string), builds complex query with filters
- `getDammV2Pool`: Takes pool ID (string)

**Return Types:**
- DLMM: `MeteoraDlmmPoolResponse`
- DAMM v1: `MeteoraDammV1PoolResponse` (returns first element of array)
- DAMM v2: `MeteoraDammV2PoolResponse`

**Error Handling:**
- Wrapped in circuit breaker (`breaker.execute()`)
- Fallback logic: Returns cached data on circuit open
- Cache integration: Stores successful responses
- Console.log for info, console.error for errors
- Re-throws errors after fallback attempt

**Resilience Features:**
- **Circuit Breaker**: 5 failure threshold, 15s timeout
- **Caching**: 60-second TTL for DLMM pools
- **Retry Logic**: Via `api.getWithRetry()` inside circuit breaker
- **Fallback**: Cached data when API unavailable

### 3.3 MeteoraPoolService (Related Legacy Service)

```typescript
export class MeteoraPoolService {
  private readonly dlmmApiUrl = "https://dlmm-api.meteora.ag";
  private readonly dammV1ApiUrl = "https://damm-api.meteora.ag";
  private readonly dammV2ApiUrl = "https://dammv2-api.meteora.ag";

  // Pool fetching
  async getDlmmPoolInfo(poolAddress: string): Promise<MeteoraDlmmPoolResponse>;
  async getDammV1PoolInfo(poolId: string): Promise<MeteoraDammV1PoolResponse>;
  async getDammV2PoolInfo(poolId: string): Promise<MeteoraDammV2PoolResponse>;
  async getPoolInfo(poolId: string, poolType: MeteoraPoolType): Promise<MeteoraPoolData>;
  async getAllDlmmPools(params: DlmmPoolsPaginationParams): Promise<MeteoraDlmmPoolsPaginationResponse>;

  // Position methods
  async getPositionClaimFees(positionAddress: string): Promise<DlmmClaimFee[]>;
  async getPositionClaimRewards(positionAddress: string): Promise<DlmmClaimReward[]>;
  async getPositionDeposits(positionAddress: string): Promise<DlmmDepositWithdraw[]>;
  async getPositionWithdraws(positionAddress: string): Promise<DlmmDepositWithdraw[]>;
}

export const meteoraPoolService = new MeteoraPoolService();

// Mapper functions (exported)
export function mapDlmmToMeteoraPoolData(data: MeteoraDlmmPoolResponse): MeteoraPoolData;
export function mapDammV1ToMeteoraPoolData(data: MeteoraDammV1PoolResponse): MeteoraPoolData;
export function mapDammV2ToMeteoraPoolData(data: MeteoraDammV2PoolResponse["data"]): MeteoraPoolData;
```

**Additional Features:**
- Generic `getPoolInfo()` method that routes to correct fetcher based on pool type
- Position-specific methods (fees, rewards, deposits, withdrawals)
- Mapper functions for transforming API responses to `MeteoraPoolData` format
- Pagination support for DLMM pools

**Error Handling:**
- Direct use of `api.getWithRetry()`
- Console logging
- Position methods: Return empty array on 404, throw on other errors
- Re-throws all other errors

---

## 4. Call Site Analysis

### 4.1 MeteoraApiClient Usage

**Called By:**
1. **MeteoraAdapter** (`adapters/dex/meteora.adapter.ts`)
   - Line 80: `this.api.getPool(poolId)` in `getPool()` method
   - Line 95: `this.api.getTrendingPools({...})` in `getTrendingPools()` method
   - Line 124: `this.api.getAllPools()` in `searchPools()` method
   
**Usage Pattern:**
- Exclusively used by `MeteoraAdapter`
- Part of clean adapter architecture
- Dependency-injected (can be overridden in constructor)
- Default instance: `meteoraApiClient` singleton

**Dependency Chain:**
```
MeteoraAdapter (adapters/dex/meteora.adapter.ts)
  └── MeteoraApiClient (adapters/dex/meteora-api.client.ts)
      └── http-client.util.ts (api.getWithRetry)
```

### 4.2 MeteoraApiService Usage

**Called By:**
1. **PoolService** (`services/pool.service.ts`)
   - Line 11: `new MeteoraApiService()` (instantiated but NOT actively used)
   - Line 155: Commented out call to `meteoraApiService.getDlmmPool(poolAddress)`

**Current Status:**
- ⚠️ **INSTANTIATED BUT UNUSED**: Created in PoolService but all calls commented out
- Previously used in `getPoolV2()` method (now commented, lines 150-159)
- No active production usage found

**Historical Usage:**
```typescript
// services/pool.service.ts (lines 146-159) - COMMENTED OUT
async getPoolV2(poolAddress: string, dex: PoolDex = "meteora"): Promise<Pool> {
  // const dlmmPool = await this.meteoraApiService.getDlmmPool(poolAddress);
  // return this.meteoraAdapter.transformDlmmPool(dlmmPool);
  throw new Error(`Unsupported DEX: ${dex}`);
}
```

### 4.3 MeteoraPoolService Usage

**Called By:**
1. **PoolService** (`services/pool.service.ts`)
   - Line 2: `import { meteoraPoolService }`
   - Line 134: `meteoraPoolService.getPoolInfo(poolAddress, poolType)` in `getPool()` method

**Usage Pattern:**
- Actively used in legacy `getPool()` method
- Provides unified interface for DLMM/DAMM v1/v2 pools
- Includes data transformation via mapper functions

**Dependency Chain:**
```
PoolService (services/pool.service.ts)
  └── MeteoraPoolService (services/meteora/pool.service.ts)
      └── http-client.util.ts (api.getWithRetry)
```

### 4.4 Usage Summary Table

| Implementation | Active Consumers | Instantiations | Usage Status |
|----------------|------------------|----------------|--------------|
| **MeteoraApiClient** | 1 (MeteoraAdapter) | 1 singleton | ✅ Active, production |
| **MeteoraApiService** | 0 | 1 (unused) | ❌ Dead code |
| **MeteoraPoolService** | 1 (PoolService) | 1 singleton | ⚠️ Active but should migrate |

---

## 5. Unique Logic & Features

### 5.1 Features Only in MeteoraApiClient

1. **Config-driven Base URL**
   - Uses `getDexConfig("meteora")` for configuration
   - Allows environment-specific API endpoints
   - Centralizes Meteora configuration

2. **getAllPools() Method**
   - Fetches all pools at once (no pagination)
   - Handles both array response and object with `pairs` property
   - Used for search functionality

3. **Cleaner URL Building**
   - Uses native `URL` class for query string building
   - More readable and maintainable
   - Example:
     ```typescript
     const url = new URL(`${this.baseUrl}/pair/all_with_pagination`);
     if (params.page !== undefined) url.searchParams.set("page", String(params.page));
     ```

### 5.2 Features Only in MeteoraApiService

1. **Circuit Breaker Integration**
   - Automatic failure detection and recovery
   - Configuration:
     - `failureThreshold: 5`
     - `successThreshold: 2`
     - `timeoutMs: 15000`
   - Prevents cascading failures
   - Implements half-open state for gradual recovery

2. **Cache Integration**
   - 60-second TTL for DLMM pool data
   - Uses `CacheService` from infrastructure
   - Cache key pattern: `CacheKeys.poolKey("meteora", poolAddress)`
   - Fallback to cache when circuit breaker open

3. **Multi-DEX API Support**
   - Three separate API URLs:
     - DLMM: `https://dlmm-api.meteora.ag`
     - DAMM v1: `https://damm-api.meteora.ag`
     - DAMM v2: `https://dammv2-api.meteora.ag`
   - Different response formats handled

4. **DAMM v1 Special Handling**
   - Complex query string: `?address=${poolId}&unknown=true&pool_type=dynamic&is_monitoring=true`
   - Returns array, extracts first element
   - Type cast workaround: `return arr[0] as any`

5. **DAMM v2 Special Handling**
   - Empty object fallback: `async () => ({}) as any`
   - Type cast workaround for error cases

### 5.3 Features Only in MeteoraPoolService

1. **Unified getPoolInfo() Method**
   - Single entry point for all pool types
   - Routes to correct API based on `MeteoraPoolType` enum
   - Automatically applies appropriate mapper function
   - Example:
     ```typescript
     async getPoolInfo(poolId: string, poolType: MeteoraPoolType): Promise<MeteoraPoolData> {
       switch (poolType) {
         case "damm_v1": return mapDammV1ToMeteoraPoolData(await this.getDammV1PoolInfo(poolId));
         case "damm_v2": return mapDammV2ToMeteoraPoolData((await this.getDammV2PoolInfo(poolId)).data);
         case "dlmm": return mapDlmmToMeteoraPoolData(await this.getDlmmPoolInfo(poolId));
       }
     }
     ```

2. **Position-Specific API Methods**
   - `getPositionClaimFees()`: Fetches claimable fees for a position
   - `getPositionClaimRewards()`: Fetches claimable rewards
   - `getPositionDeposits()`: Fetches deposit history
   - `getPositionWithdraws()`: Fetches withdrawal history
   - All handle 404 gracefully (return empty array)
   - URL pattern: `{dlmmApiUrl}/position/{positionAddress}/{endpoint}`

3. **Data Transformation Mappers**
   - Exported mapper functions for each pool type
   - Transform raw API responses to `MeteoraPoolData` format
   - Handle missing fields with defaults
   - Calculate derived fields (e.g., TVL, farm status)

---

## 6. Overlaps with HTTP Utilities

### 6.1 HTTP Client Utility Features

**Location:** `apps/bot/src/utils/http-client.util.ts`

**Key Features:**
1. **Retry Logic** (`getWithRetry`)
   - Configurable max retries (default 3)
   - Exponential backoff support
   - Custom retry conditions
   - Retry delay configuration

2. **Error Handling**
   - Custom `HTTPError` class
   - Captures status, statusText, and response body
   - Proper error propagation

3. **Request Methods**
   - GET, POST, PUT, PATCH, DELETE
   - With and without retry variants
   - JSON content-type by default
   - Custom headers support

### 6.2 Usage Across Implementations

| Feature | MeteoraApiClient | MeteoraApiService | MeteoraPoolService |
|---------|------------------|-------------------|-------------------|
| **Uses `api.getWithRetry()`** | ✅ Yes | ✅ Yes | ✅ Yes |
| **Custom retry config** | ✅ Yes (from DEX config) | ❌ No (uses defaults) | ❌ No (uses defaults) |
| **Exponential backoff** | ✅ Yes | ✅ Yes (via getWithRetry) | ✅ Yes (via getWithRetry) |
| **Circuit breaker** | ❌ No | ✅ Yes (custom) | ❌ No |
| **Caching** | ❌ No | ✅ Yes (custom) | ❌ No |

### 6.3 Redundant Logic

**Retry Logic:**
- HTTP util provides retry with exponential backoff
- MeteoraApiService adds circuit breaker on top
- **Recommendation**: Circuit breaker should be added to MeteoraApiClient, not HTTP util (service-specific resilience)

**Error Logging:**
- All three implementations log errors via `console.error`
- HTTP util throws `HTTPError` with context
- **Recommendation**: Standardize on structured logging with context

---

## 7. Recommended Migration Sequence

### Phase 1: Enhance MeteoraApiClient (Priority: P0)

**Goal:** Add resilience features from MeteoraApiService to MeteoraApiClient

**Tasks:**

1. **Add Circuit Breaker** (1-2 days)
   - Import existing `CircuitBreaker` class
   - Add circuit breaker instance to `MeteoraApiClient`
   - Configuration:
     ```typescript
     private readonly breaker = new CircuitBreaker({
       name: "meteora-api",
       failureThreshold: 5,
       successThreshold: 2,
       timeoutMs: 15000,
     });
     ```
   - Wrap all API calls: `await this.breaker.execute(() => api.getWithRetry(...))`

2. **Add Cache Integration** (1-2 days)
   - Add `CacheService` dependency
   - Cache `getPool()` responses (60s TTL)
   - Cache `getTrendingPools()` responses (60s TTL)
   - Implement fallback to cache when circuit breaker open
   - Cache key pattern: `pool:meteora:{poolAddress}` and `trending:meteora:{sortKey}:{page}`

3. **Add DAMM v1/v2 Support** (2-3 days)
   - Add separate API URL properties:
     ```typescript
     private readonly dammV1ApiUrl: string;
     private readonly dammV2ApiUrl: string;
     ```
   - Implement methods:
     ```typescript
     async getDammV1Pool(poolId: string): Promise<MeteoraDammV1PoolResponse>
     async getDammV2Pool(poolId: string): Promise<MeteoraDammV2PoolResponse>
     ```
   - Update constructor to read from DEX config
   - Add separate circuit breakers if needed (or share one)

4. **Add Position API Methods** (1-2 days)
   - Migrate from `MeteoraPoolService`:
     ```typescript
     async getPositionClaimFees(positionAddress: string): Promise<DlmmClaimFee[]>
     async getPositionClaimRewards(positionAddress: string): Promise<DlmmClaimReward[]>
     async getPositionDeposits(positionAddress: string): Promise<DlmmDepositWithdraw[]>
     async getPositionWithdraws(positionAddress: string): Promise<DlmmDepositWithdraw[]>
     ```
   - Include 404 handling (return empty arrays)

5. **Update Tests** (1 day)
   - Add unit tests for circuit breaker behavior
   - Add tests for cache integration
   - Mock circuit breaker in existing adapter tests

**Estimated Effort:** 6-10 days

**Success Criteria:**
- [ ] Circuit breaker integrated and tested
- [ ] Caching working with appropriate TTLs
- [ ] DAMM v1/v2 methods implemented
- [ ] Position API methods migrated
- [ ] All tests passing
- [ ] No breaking changes to MeteoraAdapter

---

### Phase 2: Internalize Data Transformers (Priority: P1)

**Goal:** Move mapper functions from MeteoraPoolService to MeteoraAdapter

**Tasks:**

1. **Move Mapper Functions** (1 day)
   - Copy `mapDlmmToMeteoraPoolData()` to MeteoraAdapter as private method
   - Copy `mapDammV1ToMeteoraPoolData()` to MeteoraAdapter as private method
   - Copy `mapDammV2ToMeteoraPoolData()` to MeteoraAdapter as private method
   - Update imports in MeteoraAdapter

2. **Update MeteoraAdapter** (1 day)
   - Use new DAMM methods from enhanced MeteoraApiClient
   - Apply mappers internally when fetching pools
   - Ensure `UnifiedPool` transformation still works

3. **Deprecate Exports** (0.5 days)
   - Mark exported mappers in MeteoraPoolService as `@deprecated`
   - Add JSDoc comments pointing to MeteoraAdapter

**Estimated Effort:** 2-3 days

**Success Criteria:**
- [ ] Mappers available in MeteoraAdapter
- [ ] No external dependencies on mapper functions
- [ ] Pool fetching works for all types (DLMM, DAMM v1/v2)

---

### Phase 3: Remove Legacy Services (Priority: P2)

**Goal:** Delete MeteoraApiService and MeteoraPoolService after migration

**Tasks:**

1. **Audit Remaining References** (0.5 days)
   - Search codebase for `MeteoraApiService` imports
   - Search for `MeteoraPoolService` imports
   - Verify all consumers migrated to MeteoraApiClient via MeteoraAdapter

2. **Update PoolService** (1 day)
   - Remove unused `meteoraApiService` instantiation (line 11)
   - Migrate `getPool()` method to use MeteoraAdapter instead of MeteoraPoolService
   - Remove commented-out code in `getPoolV2()` (lines 150-159)
   - Update tests

3. **Delete Legacy Files** (0.5 days)
   - Delete `services/meteora/meteora-api.service.ts`
   - Delete `services/meteora/pool.service.ts`
   - Delete `services/meteora/meteora-dex.adapter.ts` (already commented out)
   - Update `services/meteora/position.service.ts` (already commented out - delete if confirmed)

4. **Update Imports** (0.5 days)
   - Remove from barrel exports if any
   - Update any remaining import statements
   - Run type checker to catch missing imports

**Estimated Effort:** 2-3 days

**Success Criteria:**
- [ ] No references to `MeteoraApiService` in codebase
- [ ] No references to `MeteoraPoolService` in codebase
- [ ] All legacy files deleted
- [ ] All tests passing
- [ ] No TypeScript errors

---

### Phase 4: Documentation & Monitoring (Priority: P2)

**Goal:** Document the consolidated API client and add monitoring

**Tasks:**

1. **Add JSDoc Documentation** (1 day)
   - Document all public methods in MeteoraApiClient
   - Add usage examples
   - Document circuit breaker behavior
   - Document caching strategy

2. **Add Metrics** (1 day)
   - Track circuit breaker state changes
   - Track cache hit/miss rates
   - Track API latency
   - Track error rates by endpoint

3. **Update System Design Document** (0.5 days)
   - Update architecture diagrams
   - Document consolidated API client
   - Update dependency graphs

**Estimated Effort:** 2-3 days

**Success Criteria:**
- [ ] All methods documented
- [ ] Metrics implemented and verified
- [ ] System design doc updated

---

## 8. Prioritized Migration List

### P0 - Critical (Must Port Immediately)

| Method | Current Location | Reason |
|--------|-----------------|--------|
| **Circuit Breaker Pattern** | MeteoraApiService | Critical for production resilience; prevents cascading failures |
| **Cache Integration** | MeteoraApiService | Performance optimization; reduces API load |
| **getPool() for DLMM** | All three | Core functionality; most used method |
| **getTrendingPools()** | MeteoraApiClient, MeteoraPoolService | User-facing feature; trending pools display |

**Timeline:** Week 1-2  
**Estimated Effort:** 6-10 days

---

### P1 - Important (Port Soon)

| Method | Current Location | Reason |
|--------|-----------------|--------|
| **DAMM v1/v2 Pool Fetching** | MeteoraApiService, MeteoraPoolService | Support for non-DLMM pools; may be needed for future features |
| **Position API Methods** | MeteoraPoolService | Fee claiming, rewards, transaction history |
| **Data Transformation Mappers** | MeteoraPoolService | Standardize pool data format |
| **getAllPools()** | MeteoraApiClient | Search functionality |

**Timeline:** Week 3-4  
**Estimated Effort:** 5-8 days

---

### P2 - Nice to Have (Can Defer)

| Method | Current Location | Reason |
|--------|-----------------|--------|
| **Metrics & Monitoring** | None | Observability improvements |
| **Advanced Cache Strategies** | None | Further optimization (e.g., stale-while-revalidate) |
| **Structured Logging** | None | Better debugging and monitoring |
| **Configuration Validation** | None | Fail fast on misconfiguration |

**Timeline:** Week 5+  
**Estimated Effort:** 3-5 days

---

## 9. Dependencies & Prerequisites

### 9.1 Type Dependencies

**Required Types:**
- `MeteoraDlmmPoolResponse` - ✅ Available in `@/types/meteora.types.ts`
- `MeteoraDammV1PoolResponse` - ✅ Available in `@/types/meteora.types.ts`
- `MeteoraDammV2PoolResponse` - ✅ Available in `@/types/meteora.types.ts`
- `DlmmPoolsPaginationParams` - ✅ Available in `@/types/meteora.types.ts`
- `MeteoraDlmmPoolsPaginationResponse` - ✅ Available in `@/types/meteora.types.ts`
- `DlmmClaimFee`, `DlmmClaimReward`, `DlmmDepositWithdraw` - ✅ Available in `@/types/portfolio.types.ts`

**No missing types identified.**

### 9.2 Utility Dependencies

**Required Utilities:**
- `api.getWithRetry()` - ✅ Available in `@/utils/http-client.util.ts`
- `CircuitBreaker` - ✅ Available in `@/infrastructure/resilience/circuit-breaker.ts`
- `CacheService` - ✅ Available in `@/infrastructure/cache/cache.service.ts`
- `CacheKeys` - ✅ Available in `@/infrastructure/cache/cache-keys.ts`
- `getDexConfig()` - ✅ Available in `@/config/dex.config.ts`

**All dependencies available.**

### 9.3 Configuration Dependencies

**Required Configuration:**
- DEX config for Meteora (API URLs, retry counts)
- Circuit breaker thresholds (can use defaults)
- Cache TTL values (can use defaults)

**Action Items:**
- [ ] Verify DEX config includes DAMM v1/v2 API URLs
- [ ] Add circuit breaker config to DEX config (optional, can use defaults)
- [ ] Document cache TTL strategy in code comments

### 9.4 Testing Dependencies

**Test Infrastructure:**
- Unit tests with mocked HTTP client
- Circuit breaker behavior tests
- Cache behavior tests
- Integration tests with real API (optional, dev environment only)

**Action Items:**
- [ ] Set up test fixtures for Meteora API responses
- [ ] Create circuit breaker test utilities
- [ ] Mock CacheService for unit tests

---

## 10. Risk Assessment

### 10.1 High Risks

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|-----------|
| **Breaking Changes to MeteoraAdapter** | High | Medium | Thorough testing; feature flags; gradual rollout |
| **Circuit Breaker Misconfiguration** | High | Low | Use proven defaults; add monitoring; test failure scenarios |
| **Cache Inconsistency** | Medium | Medium | Short TTLs; cache invalidation strategy; document staleness |

### 10.2 Medium Risks

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|-----------|
| **DAMM v1/v2 API Changes** | Medium | Low | Version API URLs if possible; add API response validation |
| **Position API 404 Handling** | Medium | Medium | Maintain existing behavior (return empty arrays); document expectations |
| **Performance Regression** | Medium | Low | Benchmark before/after; monitor latency metrics |

### 10.3 Low Risks

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|-----------|
| **Type Mismatches** | Low | Low | TypeScript catches at compile time |
| **Dead Code Removal** | Low | Low | Thorough search before deletion; version control safety net |

---

## 11. Success Metrics

### 11.1 Code Quality Metrics

- [ ] **Lines of Code Reduced**: Target 30%+ reduction (eliminate duplication)
- [ ] **Test Coverage**: Maintain or increase coverage (target 80%+)
- [ ] **TypeScript Strict Mode**: Zero type errors
- [ ] **Linting**: Zero ESLint warnings

### 11.2 Functional Metrics

- [ ] **API Success Rate**: >99% (circuit breaker prevents cascading failures)
- [ ] **Cache Hit Rate**: >70% for pool data (reduces API load)
- [ ] **Average Response Time**: <500ms for cached responses, <2s for API calls
- [ ] **Circuit Breaker Trips**: <5 per day in production

### 11.3 Developer Experience Metrics

- [ ] **Import Simplicity**: Single import path (`MeteoraApiClient`)
- [ ] **Method Discoverability**: All methods documented with JSDoc
- [ ] **Error Messages**: Clear, actionable error messages
- [ ] **Configuration**: Centralized in DEX config

---

## 12. Appendix

### 12.1 File Locations

```
apps/bot/src/
├── adapters/dex/
│   ├── meteora-api.client.ts (✅ Keep & Enhance)
│   └── meteora.adapter.ts (✅ Keep)
├── services/meteora/
│   ├── meteora-api.service.ts (❌ Delete after migration)
│   ├── pool.service.ts (❌ Delete after migration)
│   ├── meteora-dex.adapter.ts (❌ Already commented, delete)
│   └── position.service.ts (❌ Already commented, delete)
├── services/
│   └── pool.service.ts (⚠️ Update to use adapter)
├── utils/
│   └── http-client.util.ts (✅ Keep)
├── infrastructure/
│   ├── resilience/circuit-breaker.ts (✅ Keep, use in client)
│   └── cache/cache.service.ts (✅ Keep, use in client)
└── types/
    ├── meteora.types.ts (✅ Keep)
    └── portfolio.types.ts (✅ Keep)
```

### 12.2 Related Documentation

- [MIGRATION_AUDIT.md](./MIGRATION_AUDIT.md) - Overall Meteora migration audit
- [System Design Document](../../../README.md) - Adapter pattern architecture
- [DEX Config](../../src/config/dex.config.ts) - DEX configuration structure

### 12.3 Glossary

- **DLMM**: Dynamic Liquidity Market Maker (Meteora's bin-based AMM)
- **DAMM**: Dynamic AMM (Meteora's earlier AMM versions: v1, v2)
- **Circuit Breaker**: Resilience pattern that prevents cascading failures
- **Adapter Pattern**: Design pattern for unified interface across different implementations
- **TTL**: Time To Live (cache expiration time)

---

## Conclusion

This comparison reveals significant duplication between `MeteoraApiService` and `MeteoraApiClient`, with an opportunity to consolidate into a single, robust implementation. The recommended approach is to enhance `MeteoraApiClient` with the resilience features from `MeteoraApiService`, then migrate all consumers and delete the legacy services.

**Next Steps:**
1. Review this document with team
2. Approve migration plan
3. Create implementation tickets for each phase
4. Begin Phase 1: Enhance MeteoraApiClient

**Estimated Total Effort:** 13-21 days (across 4 phases)

---

**Document Status:** ✅ Complete  
**Ready for:** Implementation Planning  
**No code changes made** (documentation only, as required by acceptance criteria)
