# Meteora Migration Audit

**Date:** 2025-01-XX  
**Scope:** Phase 1 - Task 1.1 (Meteora Code Audit)  
**Status:** Complete

## Executive Summary

This document provides a comprehensive audit of all Meteora-related code in the bot application. It inventories files, traces dependencies, identifies legacy patterns, and provides migration notes for refactoring toward the adapter-based architecture outlined in the System Design Document.

### Key Findings

1. **Duplicate Adapter Implementations**: Two Meteora adapters exist:
   - `adapters/dex/meteora.adapter.ts` (complete, active implementation)
   - `services/meteora/meteora-dex.adapter.ts` (commented out, stub)

2. **Legacy Direct SDK Usage**: `meteoraDlmmService` is directly invoked in multiple places, bypassing the adapter pattern

3. **Circular Dependencies**: Risk detected between services and adapters

4. **Cross-DEX Coupling**: Some services (e.g., `position.service.ts`) mix Meteora and Saros logic

5. **API Client Duplication**: Both `MeteoraApiService` and `MeteoraApiClient` exist with similar responsibilities

---

## 1. File Inventory

### 1.1 Core Meteora Files

| # | Path | Purpose | Exports | Status | Migration Target |
|---|------|---------|---------|--------|------------------|
| 1 | `adapters/dex/meteora.adapter.ts` | Main adapter implementing `IDexAdapter` | `MeteoraAdapter` | ✅ Active | **Keep** - Primary adapter |
| 2 | `adapters/dex/meteora-api.client.ts` | HTTP client for Meteora DLMM API | `MeteoraApiClient`, `meteoraApiClient` | ✅ Active | **Keep** - Used by adapter |
| 3 | `services/meteora/dlmm.service.ts` | Direct DLMM SDK wrapper | `MeteoraDlmmService`, `meteoraDlmmService` | ⚠️ Legacy | **Refactor** - Internalize to adapter |
| 4 | `services/meteora/meteora-api.service.ts` | API service with circuit breaker | `MeteoraApiService` | ⚠️ Duplicate | **Consolidate** - Merge with api client |
| 5 | `services/meteora/pool.service.ts` | Pool data fetching & transformation | `MeteoraPoolService`, `meteoraPoolService`, mappers | ⚠️ Legacy | **Refactor** - Move to adapter |
| 6 | `services/meteora/position.service.ts` | Position service (commented out) | None | ❌ Dead code | **Remove** - Not used |
| 7 | `services/meteora/meteora-dex.adapter.ts` | Stub adapter (commented out) | None | ❌ Dead code | **Remove** - Duplicate |
| 8 | `types/meteora.types.ts` | Meteora-specific types | Various interfaces | ✅ Active | **Keep** - Shared types |

### 1.2 Services Using Meteora Code

| # | Path | Meteora Dependencies | Coupling Level | Migration Priority |
|---|------|---------------------|----------------|-------------------|
| 9 | `services/pool.service.ts` | `meteoraPoolService`, `MeteoraApiService`, `MeteoraAdapter` | High | P0 - Critical path |
| 10 | `services/position.service.ts` | `meteoraDlmmService`, Meteora types | High | P0 - Legacy service |
| 11 | `services/portfolio.service.ts` | Meteora types | Low | P2 - Type refs only |
| 12 | `services/rebalance.service.ts` | `meteoraDlmmService` | Medium | P1 - Business logic |
| 13 | `services/price-monitoring.service.ts` | Meteora types | Low | P2 - Type refs only |
| 14 | `application/position/get-price-range.use-case.ts` | `meteoraDlmmService` | Medium | P1 - Use case layer |

### 1.3 Configuration & Infrastructure

| # | Path | Meteora References | Purpose |
|---|------|-------------------|---------|
| 15 | `config/dex.config.ts` | DEX registry entry for Meteora | DEX-specific config |
| 16 | `infrastructure/di/container.ts` | `MeteoraAdapter` registration | Dependency injection |
| 17 | `db/schema.ts` | `dex: 'meteora'` enum | Database schema |

### 1.4 Presentation Layer (UI)

| # | Path | Meteora Dependencies | Type |
|---|------|---------------------|------|
| 18 | `presentation/scenes/create-position.scene.ts` | Meteora URL patterns | Scene handler |
| 19 | `presentation/scenes/pool-detail.scene.ts` | Meteora pool types | Scene handler |
| 20 | `presentation/commands/dev.ts` | `MeteoraAdapter` (commented) | Dev command |
| 21 | `presentation/handlers/trending.ts` | Meteora types | Handler |
| 22 | `presentation/handlers/message.ts` | Meteora URL parsing | Handler |
| 23 | `presentation/keyboards/pool-selection-menu.ts` | Meteora constants | Keyboard builder |
| 24 | `presentation/formatters/start.formatter.ts` | Meteora display logic | Formatter |

### 1.5 Shared/Utility Files

| # | Path | Meteora Usage |
|---|------|---------------|
| 25 | `services/hot-pools/sources/dlmm.ts` | Meteora DLMM pool source |
| 26 | `services/hot-pools/sources/dammv1.ts` | Meteora DAMM v1 pool source |
| 27 | `services/hot-pools/sources/dammv2.ts` | Meteora DAMM v2 pool source |
| 28 | `services/input-detection.service.ts` | Meteora URL detection |
| 29 | `utils/tx-parser.ts` | Meteora transaction parsing |

---

## 2. Dependency Graph

### 2.1 Core Dependency Chain

```
MeteoraAdapter (adapters/dex/meteora.adapter.ts)
    ├── MeteoraApiClient (adapters/dex/meteora-api.client.ts)
    │   └── dex.config.ts
    ├── MeteoraDlmmService (services/meteora/dlmm.service.ts) ⚠️ LEGACY
    │   └── @meteora-ag/dlmm SDK
    ├── TokenPriceService
    └── JupiterService
```

### 2.2 Legacy Service Dependencies

```
PositionService (services/position.service.ts) ⚠️ DEPRECATED
    ├── meteoraDlmmService ❌ Direct SDK access
    ├── poolService
    │   ├── meteoraPoolService ❌ Legacy
    │   ├── MeteoraApiService ❌ Duplicate
    │   └── MeteoraAdapter ✅ Correct
    └── jupiterService
```

### 2.3 Application Layer Dependencies

```
CreatePositionUseCase
    └── DexRegistry
        └── MeteoraAdapter ✅ Correct pattern

GetPriceRangeUseCase ⚠️ Mixed pattern
    └── meteoraDlmmService ❌ Direct access (should use adapter)
```

### 2.4 Full Dependency Adjacency List

**MeteoraAdapter** (adapters/dex/meteora.adapter.ts)
- **Imported by:**
  - `infrastructure/di/container.ts` (DI registration)
  - `services/pool.service.ts` (direct instantiation ⚠️)
  - `presentation/commands/dev.ts` (commented out)
- **Imports:**
  - `MeteoraApiClient`
  - `MeteoraDlmmService` ⚠️
  - `TokenPriceService`
  - `JupiterService`

**MeteoraApiClient** (adapters/dex/meteora-api.client.ts)
- **Imported by:**
  - `MeteoraAdapter`
- **Imports:**
  - `dex.config.ts`
  - `http-client.util.ts`
  - `types/meteora.types.ts`

**MeteoraDlmmService** (services/meteora/dlmm.service.ts)
- **Imported by:**
  - `MeteoraAdapter` ⚠️
  - `application/position/get-price-range.use-case.ts` ⚠️
  - `services/position.service.ts` ⚠️
  - `services/rebalance.service.ts` ⚠️
- **Imports:**
  - `@meteora-ag/dlmm` (external SDK)
  - `@solana/web3.js`
  - `CONFIG`

**MeteoraApiService** (services/meteora/meteora-api.service.ts)
- **Imported by:**
  - `services/pool.service.ts` ⚠️
- **Imports:**
  - `http-client.util.ts`
  - `types/meteora.types.ts`
  - `CircuitBreaker`
  - `CacheService`

**MeteoraPoolService** (services/meteora/pool.service.ts)
- **Imported by:**
  - `services/pool.service.ts` ⚠️
- **Imports:**
  - `http-client.util.ts`
  - `types/meteora.types.ts`

**meteora.types.ts**
- **Imported by:** (22 files)
  - All services, adapters, presentation layer
- **Exports:**
  - `MeteoraDlmmPoolResponse`
  - `MeteoraDammV1PoolResponse`
  - `MeteoraDammV2PoolResponse`
  - `MeteoraPoolData`
  - `MeteoraDlmmPosition`
  - Type definitions for strategies, params, etc.

---

## 3. Architecture Analysis

### 3.1 Current Architecture Issues

#### Issue 1: Adapter Leakage
**Problem:** `MeteoraDlmmService` (internal SDK wrapper) is directly imported outside the adapter layer.

**Evidence:**
- `application/position/get-price-range.use-case.ts:2` - imports `meteoraDlmmService`
- `services/position.service.ts:8` - imports `meteoraDlmmService`
- `services/rebalance.service.ts` - imports `meteoraDlmmService`

**Impact:** Violates adapter pattern; tightly couples application logic to Meteora SDK.

**Resolution:** Move SDK interactions into `MeteoraAdapter`; expose high-level methods via `IDexAdapter`.

---

#### Issue 2: Duplicate API Clients
**Problem:** Two API services with overlapping responsibilities:
- `MeteoraApiClient` (cleaner, config-driven)
- `MeteoraApiService` (circuit breaker, cache integration)

**Evidence:**
```typescript
// MeteoraApiClient
async getPool(poolAddress: string): Promise<MeteoraDlmmPoolResponse>

// MeteoraApiService
async getDlmmPool(poolAddress: string): Promise<MeteoraDlmmPoolResponse>
```

**Impact:** Code duplication, maintenance burden, inconsistent error handling.

**Resolution:** Consolidate into single client with circuit breaker + cache (prefer `MeteoraApiClient` with added resilience).

---

#### Issue 3: Legacy Service Usage
**Problem:** `PositionService` is deprecated but still actively used.

**Evidence:**
```typescript
// File: services/position.service.ts:1-7
/**
 * @deprecated This legacy service aggregates blockchain and DB logic and is being phased out.
 * Use application-layer use cases with DI instead:
 *  - CreatePositionUseCase, ClosePositionUseCase, ...
 */
```

**Consumers:**
- `presentation/scenes/create-position.scene.ts`
- Various handlers and commands (legacy paths)

**Impact:** Hinders migration to clean architecture; business logic scattered.

**Resolution:** Complete use-case migration; remove `PositionService` once all consumers migrated.

---

#### Issue 4: Dead Code
**Files:**
- `services/meteora/meteora-dex.adapter.ts` (entirely commented out)
- `services/meteora/position.service.ts` (entirely commented out)

**Impact:** Clutter, confusion, potential merge conflicts.

**Resolution:** Delete files after confirming no references.

---

### 3.2 Circular Dependency Risk

**Potential Cycle:**
```
PoolService → MeteoraAdapter → (via getDlmmService) → PoolService (if not careful)
```

**Current Status:** Not circular (MeteoraAdapter doesn't import PoolService).

**Risk:** Future changes could introduce cycles if not careful.

**Mitigation:** Enforce one-way dependency: `Presentation → Application → Adapters → External SDKs`.

---

### 3.3 Cross-DEX Coupling

**Example: PositionService**
```typescript
// services/position.service.ts:193-271
async createBalancedPositionV1(...) { /* Meteora logic */ }
async createBalancedPositionOnSaros(...) { /* Saros logic */ }
```

**Problem:** DEX-specific logic lives in shared service.

**Resolution:** Delegate to respective adapters via `DexRegistry`.

---

## 4. Migration Checklist

### Phase 1: Cleanup & Consolidation

#### Task 1.1 ✅ Audit Complete
- [x] Enumerate all Meteora files
- [x] Document dependencies
- [x] Identify legacy patterns
- [x] Create this migration audit document

#### Task 1.2: Remove Dead Code (P0)
- [ ] **File: `services/meteora/meteora-dex.adapter.ts`**
  - Action: Delete file
  - Reason: Entirely commented out, superseded by `adapters/dex/meteora.adapter.ts`
  - Risk: Low (no references found)

- [ ] **File: `services/meteora/position.service.ts`**
  - Action: Delete file
  - Reason: Entirely commented out, no exports
  - Risk: Low (no references found)

#### Task 1.3: Consolidate API Clients (P0)
- [ ] **Merge: `MeteoraApiService` → `MeteoraApiClient`**
  - Target: `adapters/dex/meteora-api.client.ts`
  - Actions:
    1. Add circuit breaker to `MeteoraApiClient`
    2. Add cache integration to `MeteoraApiClient`
    3. Migrate DAMM v1/v2 methods from `MeteoraApiService`
    4. Update `MeteoraAdapter` to use enhanced client
    5. Remove `services/meteora/meteora-api.service.ts`
  - Files to update:
    - `adapters/dex/meteora-api.client.ts` (enhance)
    - `adapters/dex/meteora.adapter.ts` (update imports)
    - `services/pool.service.ts` (update imports)
  - Risk: Medium (used in 2 places)

---

### Phase 2: Internalize SDK Access

#### Task 2.1: Internalize MeteoraDlmmService (P0)
- [ ] **File: `services/meteora/dlmm.service.ts`**
  - Current State: Exported, imported by 4 files
  - Target State: Internal to `MeteoraAdapter`, not exported
  - Actions:
    1. Move `MeteoraDlmmService` class into `MeteoraAdapter` as private helper
    2. OR: Keep as separate file but make imports internal-only
    3. Add adapter methods to expose needed functionality:
       - `getPriceRange()` → use via adapter
       - `analyzePositionInRange()` → use via adapter
    4. Update all external consumers to use adapter methods
  - Files to refactor:
    - ✅ `adapters/dex/meteora.adapter.ts` (already imports it)
    - ⚠️ `application/position/get-price-range.use-case.ts`
    - ⚠️ `services/position.service.ts`
    - ⚠️ `services/rebalance.service.ts`
  - Risk: High (breaking change for 3 consumers)

#### Task 2.2: Update GetPriceRangeUseCase (P1)
- [ ] **File: `application/position/get-price-range.use-case.ts`**
  - Current: Direct import of `meteoraDlmmService`
  - Target: Use `DexRegistry` → `MeteoraAdapter.getPriceRange()`
  - Actions:
    1. Add `getPriceRange()` method to `IDexAdapter` interface
    2. Implement in `MeteoraAdapter` (delegate to internal DLMM service)
    3. Update use case to resolve adapter from registry
    4. Remove direct SDK import
  - Dependencies:
    - Requires Task 2.1 completion
    - Update `SarosAdapter` to implement `getPriceRange()` too
  - Risk: Low (isolated use case)

---

### Phase 3: Pool Service Migration

#### Task 3.1: Migrate PoolService Logic (P1)
- [ ] **File: `services/pool.service.ts`**
  - Current State: Mixes adapter usage with legacy service calls
  - Target State: Pure adapter-based, no legacy services
  - Actions:
    1. Remove `meteoraPoolService` import and instantiation
    2. Remove `MeteoraApiService` instantiation
    3. Consolidate all pool operations via `MeteoraAdapter`
    4. Update `getPool()` to use adapter
    5. Update `getPoolV2()` to use adapter
    6. Remove mapper functions (move to adapter if needed)
  - Files to update:
    - `services/pool.service.ts`
  - Dependencies:
    - Task 1.3 (API client consolidation)
  - Risk: Medium (many consumers)

#### Task 3.2: Deprecate MeteoraPoolService (P2)
- [ ] **File: `services/meteora/pool.service.ts`**
  - Current: Exported and used by `pool.service.ts`
  - Target: Internalize mappers, delete service class
  - Actions:
    1. Move `mapDlmmToMeteoraPoolData()` to adapter or types file
    2. Move `mapDammV1ToMeteoraPoolData()` to adapter
    3. Move `mapDammV2ToMeteoraPoolData()` to adapter
    4. Delete `MeteoraPoolService` class
    5. Delete file after refactor
  - Dependencies: Task 3.1
  - Risk: Low (single consumer after Task 3.1)

---

### Phase 4: Legacy Service Migration

#### Task 4.1: Migrate Position Creation (P0)
- [ ] **File: `services/position.service.ts`**
  - Current: `createBalancedPositionV1()` uses `meteoraDlmmService` directly
  - Target: Route through `DexRegistry` → `MeteoraAdapter`
  - Actions:
    1. Audit all consumers of `PositionService.createBalancedPositionV1()`
    2. Migrate consumers to `CreatePositionUseCase`
    3. Mark method as fully deprecated once no consumers
  - Files to update:
    - All presentation/handlers using old position creation
  - Risk: High (critical business flow)

#### Task 4.2: Migrate Rebalance Logic (P1)
- [ ] **File: `services/rebalance.service.ts`**
  - Current: Direct `meteoraDlmmService` usage
  - Target: Use `MeteoraAdapter` methods
  - Actions:
    1. Add `analyzePositionInRange()` to `IDexAdapter`
    2. Implement in `MeteoraAdapter`
    3. Update rebalance service to use adapter
  - Dependencies: Task 2.1
  - Risk: Medium (rebalancing is critical)

#### Task 4.3: Remove PositionService (P2)
- [ ] **File: `services/position.service.ts`**
  - Action: Delete file after all consumers migrated
  - Prerequisites:
    - Task 4.1 complete
    - All handlers/scenes using use cases
    - No direct imports remaining
  - Risk: High (final cleanup, ensure thorough testing)

---

### Phase 5: Type Cleanup

#### Task 5.1: Review meteora.types.ts (P2)
- [ ] **File: `types/meteora.types.ts`**
  - Current: Mixed DEX-specific and unified types
  - Actions:
    1. Audit which types are truly Meteora-specific vs. generic
    2. Move generic types to `core.types.ts` or `pool.types.ts`
    3. Keep only Meteora SDK-specific types here
    4. Consider renaming to `meteora-sdk.types.ts` for clarity
  - Risk: Low (refactoring only, no logic change)

---

## 5. Detailed File Notes

### 5.1 adapters/dex/meteora.adapter.ts

**Purpose:** Primary adapter implementing `IDexAdapter` for Meteora DLMM pools.

**Exports:**
- `class MeteoraAdapter extends BaseDexAdapter implements IDexAdapter`

**Key Methods:**
- `getPool(poolId)` → UnifiedPool
- `getTrendingPools(params)` → PaginatedTrendingPools
- `getUserPositions(userAddress)` → UnifiedPosition[]
- `getPosition(positionAddress, context)` → UnifiedPosition
- `createPosition(params)` → TransactionResult
- `closePosition(params)` → TransactionResult
- `claimFees(params)` → TransactionResult
- `parsePoolUrl(url)` → UrlParseResult (DLMM, DAMM v1, v2)

**Dependencies:**
- ✅ `MeteoraApiClient` (correct)
- ⚠️ `MeteoraDlmmService` (should be internalized)
- ✅ `TokenPriceService` (correct)
- ✅ `JupiterService` (correct)

**Migration Target:** **KEEP** - This is the canonical adapter.

**Action Items:**
1. Internalize `MeteoraDlmmService` usage (make it private helper)
2. Add `getPriceRange()` method to `IDexAdapter` interface and implement here
3. Add `analyzePositionInRange()` method if needed by rebalancing

**Current Issues:**
- URL parsing for DAMM v1/v2 exists but pools may not be fully supported
- Some position data relies on SDK runtime properties (`lbPairPositionsData`) with TS type workarounds

---

### 5.2 adapters/dex/meteora-api.client.ts

**Purpose:** HTTP client for Meteora DLMM API (pagination, pool fetching).

**Exports:**
- `class MeteoraApiClient`
- `meteoraApiClient` (singleton instance)

**Key Methods:**
- `getPool(poolAddress)` → MeteoraDlmmPoolResponse
- `getTrendingPools(params)` → MeteoraDlmmPoolsPaginationResponse
- `getAllPools()` → MeteoraDlmmPoolResponse[]

**Dependencies:**
- `dex.config.ts` (reads Meteora API URL)
- `http-client.util.ts` (with retry logic)

**Migration Target:** **KEEP & ENHANCE**

**Action Items:**
1. Add circuit breaker from `MeteoraApiService`
2. Add cache integration from `MeteoraApiService`
3. Add DAMM v1/v2 methods from `MeteoraApiService`
4. Update constructor to accept optional dependencies for testing

**Notes:**
- Clean, focused implementation
- Uses config-driven approach (good)
- Needs resilience features

---

### 5.3 services/meteora/dlmm.service.ts

**Purpose:** Wrapper around `@meteora-ag/dlmm` SDK for transaction building and position queries.

**Exports:**
- `class MeteoraDlmmService`
- `meteoraDlmmService` (singleton instance)

**Key Methods:**
- `createPositionIx()` → { instructions }
- `closePositionIx()` → { instructions }
- `claimFeesIx()` → { instructions }
- `buildCreatePositionIxs()` → { instructions, positionKp }
- `getPriceRange()` → { fromPrice, toPrice }
- `getAllLbPairPositionsByUser()` → Map<poolAddress, PositionInfo>
- `getPosition()` → { lbPair, lbPosition }
- `analyzePositionInRange()` → { isInRange, activeBinId, ... }

**Dependencies:**
- `@meteora-ag/dlmm` (external SDK)
- `@solana/web3.js`
- `CONFIG.SOLANA.RPC_URL`

**Migration Target:** **INTERNALIZE** - Make internal to adapter layer.

**Current Consumers:**
- `adapters/dex/meteora.adapter.ts` ✅ (correct)
- `application/position/get-price-range.use-case.ts` ⚠️ (should use adapter)
- `services/position.service.ts` ⚠️ (deprecated service)
- `services/rebalance.service.ts` ⚠️ (should use adapter)

**Action Items:**
1. Make this class internal-only (either move into adapter file or limit exports)
2. Add wrapper methods to `MeteoraAdapter` for:
   - `getPriceRange(poolAddress, rangeInterval)`
   - `analyzePositionInRange(poolAddress, positionAddress)`
3. Update external consumers to use adapter methods
4. Consider renaming to `MeteoraDlmmSdkWrapper` for clarity

**Notes:**
- Good separation of concerns within this file
- Pool caching (30s TTL) is a good optimization
- Direct RPC connection creation here (consider dependency injection)

---

### 5.4 services/meteora/meteora-api.service.ts

**Purpose:** API service with circuit breaker and cache for Meteora DLMM/DAMM endpoints.

**Exports:**
- `class MeteoraApiService`

**Key Methods:**
- `getDlmmPool(poolAddress)` → MeteoraDlmmPoolResponse
- `getDammV1Pool(poolId)` → MeteoraDammV1PoolResponse
- `getDammV2Pool(poolId)` → MeteoraDammV2PoolResponse

**Dependencies:**
- `CircuitBreaker`
- `CacheService`
- `http-client.util.ts`

**Migration Target:** **CONSOLIDATE** - Merge into `MeteoraApiClient`.

**Current Consumers:**
- `services/pool.service.ts`

**Action Items:**
1. Copy circuit breaker logic to `MeteoraApiClient`
2. Copy cache integration to `MeteoraApiClient`
3. Copy DAMM v1/v2 methods to `MeteoraApiClient`
4. Update `pool.service.ts` to use `MeteoraApiClient`
5. Delete this file

**Notes:**
- Circuit breaker config: 5 failures, 2 successes to close, 15s timeout
- Cache TTL: 60s for pool data
- Good resilience patterns, just duplicated

---

### 5.5 services/meteora/pool.service.ts

**Purpose:** Pool data fetching with type mappers for DLMM/DAMM v1/v2.

**Exports:**
- `class MeteoraPoolService`
- `meteoraPoolService` (singleton)
- `mapDlmmToMeteoraPoolData()`
- `mapDammV1ToMeteoraPoolData()`
- `mapDammV2ToMeteoraPoolData()`

**Key Methods:**
- `getDlmmPoolInfo(poolAddress)`
- `getDammV1PoolInfo(poolId)`
- `getDammV2PoolInfo(poolId)`
- `getPoolInfo(poolId, poolType)` → MeteoraPoolData
- `getPositionClaimFees(positionAddress)`
- `getPositionClaimRewards(positionAddress)`
- `getPositionDeposits(positionAddress)`
- `getPositionWithdraws(positionAddress)`
- `getAllDlmmPools(params)` → MeteoraDlmmPoolsPaginationResponse

**Migration Target:** **REFACTOR & CONSOLIDATE**

**Current Consumers:**
- `services/pool.service.ts`

**Action Items:**
1. Move mapper functions to `MeteoraAdapter` (internal helpers)
2. Move position history methods to `MeteoraAdapter` if needed
3. Delete `MeteoraPoolService` class after migration
4. Update `pool.service.ts` to use `MeteoraAdapter` directly

**Notes:**
- Mappers are useful for transforming API responses to `MeteoraPoolData`
- `MeteoraPoolData` is a unified format for all pool types (DLMM/DAMM)
- Position history methods (claim fees/rewards/deposits/withdraws) should be in adapter

---

### 5.6 services/meteora/position.service.ts

**Purpose:** N/A - Entirely commented out.

**Exports:** None

**Migration Target:** **REMOVE**

**Action Items:**
1. Confirm no uncommitted code references this file
2. Delete file

---

### 5.7 services/meteora/meteora-dex.adapter.ts

**Purpose:** N/A - Stub adapter (commented out).

**Exports:** None

**Migration Target:** **REMOVE**

**Action Items:**
1. Confirm superseded by `adapters/dex/meteora.adapter.ts`
2. Delete file

---

### 5.8 types/meteora.types.ts

**Purpose:** Type definitions for Meteora SDK, API responses, and internal data models.

**Exports:**
- `MeteoraStrategyTypeKey`, `MeteoraPoolType`, `MeteoraCreatePositionStrategy`
- `CreateMeteoraPositionParams`, `CloseMeteoraPositionParams`
- `MeteoraDlmmPool`, `MeteoraDlmmPoolResponse`
- `MeteoraDammV1PoolResponse`, `MeteoraDammV2PoolResponse`
- `MeteoraPoolData` (unified pool format)
- `MeteoraDlmmPosition`
- `MeteoraDlmmPoolsPaginationResponse`
- `DlmmPoolsPaginationParams`

**Migration Target:** **KEEP & REVIEW**

**Current Consumers:** 22 files across all layers

**Action Items:**
1. Audit types to separate:
   - SDK-specific types (from `@meteora-ag/dlmm`)
   - API response types (from Meteora APIs)
   - Internal unified types (should be in `core.types.ts`)
2. Move `MeteoraPoolData` to `pool.types.ts` if it's a shared format
3. Consider renaming file to `meteora-sdk.types.ts` for clarity

**Notes:**
- Good centralized type definitions
- Some overlap with `core.types.ts` (e.g., UnifiedPool)
- `MeteoraPoolData` is a legacy unified format (predates UnifiedPool?)

---

### 5.9 application/position/get-price-range.use-case.ts

**Purpose:** Application use case to get DLMM price range for a pool.

**Current Implementation:**
```typescript
if (dex === "saros") {
  return this.saros.getPriceRange(poolAddress, rangeInterval);
}
return meteoraDlmmService.getPriceRange(poolAddress, rangeInterval);
```

**Issues:**
- Direct import of `meteoraDlmmService` ⚠️
- Comment: `// FIXME use DI to get dex registry`

**Migration Target:** **REFACTOR**

**Action Items:**
1. Add `getPriceRange()` to `IDexAdapter` interface
2. Implement in `MeteoraAdapter` and `SarosAdapter`
3. Update use case to use `DexRegistry.getAdapter(dex).getPriceRange()`
4. Remove direct SDK imports
5. Inject `DexRegistry` via constructor

**Priority:** P1 (use case layer should be clean)

---

### 5.10 services/pool.service.ts

**Purpose:** Application-level pool service (aggregates multiple DEX adapters).

**Current Implementation:**
```typescript
private meteoraApiService = new MeteoraApiService();
private meteoraAdapter = new MeteoraAdapter();
// ...
async getPool(poolAddress, poolType) {
  const pool = await meteoraPoolService.getPoolInfo(poolAddress, poolType);
  return pool;
}
```

**Issues:**
- Mixes legacy services and adapters
- Direct instantiation of adapters (should use DI)
- Uses `meteoraPoolService` ⚠️

**Migration Target:** **REFACTOR**

**Action Items:**
1. Remove `meteoraApiService` instantiation (use adapter only)
2. Remove `meteoraPoolService` import (use adapter)
3. Inject `DexRegistry` via constructor (don't instantiate adapters)
4. Update `getPool()` to use registry
5. Update `getPoolV2()` to use registry

**Priority:** P0 (critical path, many consumers)

---

### 5.11 services/position.service.ts

**Purpose:** DEPRECATED - Legacy service for position management.

**Issues:**
- Marked as deprecated in JSDoc
- Still actively used in presentation layer
- Direct `meteoraDlmmService` usage
- Mixes blockchain, database, and business logic

**Migration Target:** **DEPRECATE & REMOVE**

**Action Items:**
1. Audit all consumers (scenes, handlers)
2. Migrate consumers to use cases:
   - `CreatePositionUseCase`
   - `ClosePositionUseCase`
   - `ClaimFeesUseCase`
   - `RebalancePositionUseCase`
3. Mark methods as explicitly deprecated
4. Delete file after all consumers migrated

**Priority:** P0 (blocking clean architecture)

---

### 5.12 services/rebalance.service.ts

**Purpose:** Rebalancing logic for positions.

**Current Implementation:**
- Imports `meteoraDlmmService` directly
- Calls `meteoraDlmmService.analyzePositionInRange()`

**Migration Target:** **REFACTOR**

**Action Items:**
1. Add `analyzePositionInRange()` to `IDexAdapter` interface
2. Implement in `MeteoraAdapter`
3. Update rebalance service to use adapter via registry
4. Remove direct SDK import

**Priority:** P1 (important business logic)

---

## 6. Testing Requirements

### 6.1 Unit Tests Needed

- [ ] `MeteoraAdapter` - All public methods
- [ ] `MeteoraApiClient` (enhanced) - Circuit breaker, cache, retries
- [ ] `GetPriceRangeUseCase` - After refactor

### 6.2 Integration Tests Needed

- [ ] Position creation flow end-to-end (via adapter)
- [ ] Position closing flow
- [ ] Fee claiming flow
- [ ] Rebalancing flow

### 6.3 Regression Tests

- [ ] Existing position creation still works
- [ ] Portfolio loading still works
- [ ] Trending pools still load
- [ ] Deep links still work

---

## 7. Risk Assessment

| Task | Impact | Complexity | Risk Level | Mitigation |
|------|--------|------------|------------|------------|
| Remove dead code | Low | Low | Low | Code review |
| Consolidate API clients | Medium | Medium | Medium | Thorough testing |
| Internalize DLMM service | High | High | High | Feature flags, gradual rollout |
| Migrate PoolService | Medium | Medium | Medium | Integration tests |
| Deprecate PositionService | High | High | High | Audit all consumers first |

---

## 8. Timeline Estimate

### Phase 1: Cleanup (1-2 days)
- Task 1.2: Remove dead code (2 hours)
- Task 1.3: Consolidate API clients (1 day)

### Phase 2: Internalization (3-4 days)
- Task 2.1: Internalize DLMM service (2 days)
- Task 2.2: Update GetPriceRangeUseCase (1 day)

### Phase 3: Pool Service (2-3 days)
- Task 3.1: Migrate PoolService (2 days)
- Task 3.2: Deprecate MeteoraPoolService (1 day)

### Phase 4: Legacy Service (5-7 days)
- Task 4.1: Migrate position creation (3 days)
- Task 4.2: Migrate rebalance logic (2 days)
- Task 4.3: Remove PositionService (2 days)

### Phase 5: Cleanup (1-2 days)
- Task 5.1: Review types (1 day)

**Total Estimate:** 12-18 days (2.5-3.5 weeks)

---

## 9. Open Questions

1. **DAMM v1/v2 Support**: Are DAMM v1/v2 pools still actively used? If not, consider removing that code.
2. **MeteoraPoolData vs UnifiedPool**: Do we need both formats? Can we standardize on `UnifiedPool`?
3. **Position History**: Should position history methods (claim fees/rewards/deposits/withdraws) be in adapter or separate service?
4. **RPC Connection Management**: Should DLMM service own RPC connections or should they be injected?
5. **Testing Coverage**: What's current test coverage for Meteora code? (appears to be low)

---

## 10. Success Criteria

Migration complete when:
- ✅ All Meteora-related code routes through `MeteoraAdapter`
- ✅ No direct imports of `meteoraDlmmService` outside adapter layer
- ✅ No duplicate API clients (`MeteoraApiService` removed)
- ✅ All dead code removed
- ✅ `PositionService` deprecated and removed
- ✅ All tests pass (unit + integration)
- ✅ System design document alignment verified

---

## Appendix A: Command Reference

### Find all Meteora references:
```bash
grep -r "meteora" apps/bot/src/ --include="*.ts" -l
grep -r "Meteora" apps/bot/src/ --include="*.ts" -l
```

### Find direct SDK imports:
```bash
grep -r "from.*@meteora-ag/dlmm" apps/bot/src/ --include="*.ts"
```

### Find legacy service imports:
```bash
grep -r "meteoraDlmmService" apps/bot/src/ --include="*.ts"
grep -r "meteoraPoolService" apps/bot/src/ --include="*.ts"
```

### Check for circular dependencies:
```bash
npx madge --circular apps/bot/src/ --extensions ts
```

---

## Appendix B: Related Documents

- **System Design Document**: `/docs/SYSTEM_DESIGN.md` (Section 11: Multi-DEX Extensibility)
- **Product Requirements Document**: `/docs/PRD.md`
- **Adapter Interface**: `apps/bot/src/types/dex-adapter.interface.ts`
- **DEX Registry**: `apps/bot/src/services/dex-registry.service.ts`

---

**End of Migration Audit**
