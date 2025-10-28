# Meteora Service Audit: pool.service.ts & position.service.ts

**Date:** 2025-01-XX  
**Scope:** Task 3.2 - Legacy Service Audit  
**Status:** Complete

---

## Executive Summary

This document provides a comprehensive audit of the legacy Meteora service files (`pool.service.ts` and `position.service.ts`) as part of the adapter-based architecture migration. The audit catalogs all exported methods, parameters, return types, side effects, and usage sites to inform migration planning.

### Key Findings

1. **pool.service.ts (369 LOC):** Active legacy service with 9 exported methods and 3 mapper functions used across 3 consumer files, but now fully overlapped by `MeteoraApiClient` + adapter capabilities.
2. **position.service.ts (29 LOC):** Entirely commented out, exports nothing, confirmed dead code ready for deletion.
3. **Adapter Coverage:** `apps/bot/src/adapters/dex/meteora/meteora-api.client.ts` already exposes DLMM + DAMM v1/v2 APIs and position endpoints, so the legacy services are redundant once consumers migrate.
4. **Primary Consumer:** `PoolService` (services/pool.service.ts) is the main consumer of `MeteoraPoolService`; once migrated it can rely directly on `MeteoraAdapter`/client.
5. **Secondary Consumer:** `PortfolioService` (services/portfolio.service.ts) uses position-related API methods that already exist in `MeteoraApiClient`.
6. **Naming & Type Debt:** `MeteoraPoolService` methods need clearer verbs (`getDlmmPool` instead of `getDlmmPoolInfo`) and `types/meteora.types.ts` contains legacy or conflicting definitions that should be consolidated.
7. **Migration Status:** All methods are DEX-specific and should migrate to the adapter layer (`MeteoraAdapter` and `MeteoraApiClient`), after which the legacy service files can be removed instead of moved.

---

## 0. Migration Decision: Remove vs. Move

### 0.1 Current State Assessment

**New Adapter Layer:** `apps/bot/src/adapters/dex/meteora/meteora-api.client.ts` (595 LOC)
- ✅ Already implements all pool fetching (DLMM, DAMM v1, DAMM v2)
- ✅ Already implements all position APIs (claim fees, rewards, deposits, withdrawals)
- ✅ Includes circuit breaker, caching, retry logic, structured logging
- ✅ Follows adapter pattern with proper error handling
- ✅ Fully typed with `MeteoraApiError` domain errors

**Legacy Services:**
- `services/meteora/pool.service.ts` (369 LOC) - API wrappers + mappers
- `services/meteora/position.service.ts` (29 LOC) - Dead code (commented out)

### 0.2 Recommendation: **DELETE, Don't Move**

**Rationale:**

1. **Complete Functional Overlap:**
   - Every method in `MeteoraPoolService` is already implemented (often better) in `MeteoraApiClient`
   - Pool fetching: `getPool()`, `getDammV1Pool()`, `getDammV2Pool()`, `getTrendingPools()`, `getAllPools()` ✅
   - Position APIs: `getPositionClaimFees()`, `getPositionClaimRewards()`, `getPositionDeposits()`, `getPositionWithdraws()` ✅
   - No unique business logic exists in the legacy services

2. **Architectural Concerns:**
   - Moving legacy services to `adapters/dex/meteora/` would pollute the adapter namespace with duplicate code
   - The adapter layer should only contain the new, properly designed implementations
   - Legacy mappers (`mapDlmmToMeteoraPoolData`, etc.) need to be replaced with `UnifiedPool` transformations, not moved

3. **Technical Debt:**
   - Legacy services use hardcoded API URLs (not config-driven)
   - Inconsistent naming: `getDlmmPoolInfo` vs. `getDlmmPool` vs. `getPool`
   - Return legacy `MeteoraPoolData` type instead of `UnifiedPool`
   - No circuit breaker, limited error handling, console logging instead of structured logs

**Migration Strategy:**

| Legacy Service | Action | Replacement |
|----------------|--------|-------------|
| `services/meteora/position.service.ts` | **DELETE immediately** | N/A (dead code) |
| `services/meteora/pool.service.ts` | **DELETE after consumer migration** | `MeteoraApiClient` + `MeteoraAdapter` |
| Mapper functions (`mapDlmmToMeteoraPoolData`, etc.) | **Replace with UnifiedPool mappers** | New mappers in `MeteoraAdapter` |
| `MeteoraPoolData` type | **Deprecate and remove** | `UnifiedPool` from core types |

### 0.3 Migration Path

```
Phase 1: Update Consumers (No File Movement)
├── PortfolioService → Use MeteoraApiClient for position APIs
└── PoolService → Use MeteoraAdapter for pool fetching

Phase 2: Add UnifiedPool Mappers to MeteoraAdapter
├── mapDlmmToUnifiedPool(dlmmPool) → UnifiedPool
├── mapDammV1ToUnifiedPool(dammV1Pool) → UnifiedPool
└── mapDammV2ToUnifiedPool(dammV2Pool) → UnifiedPool

Phase 3: Delete Legacy Files
├── Delete services/meteora/position.service.ts
├── Delete services/meteora/pool.service.ts
└── Mark MeteoraPoolData type as deprecated (remove after full migration)
```

**Key Insight:** The new adapter already provides everything we need. Moving the legacy services would be a step backward architecturally.

---

## 1. File: services/meteora/pool.service.ts

### 1.1 File Metadata

| Property | Value |
|----------|-------|
| **Path** | `apps/bot/src/services/meteora/pool.service.ts` |
| **Lines of Code** | 369 |
| **Status** | ⚠️ Active but legacy |
| **Exports** | 4 (1 class + 1 singleton + 3 mapper functions) |
| **Imports** | 14 types from 3 files |
| **Dependencies** | `http-client.util`, `meteora.types`, `portfolio.types` |

### 1.2 Class Definition

```typescript
export class MeteoraPoolService {
  private readonly dlmmApiUrl = "https://dlmm-api.meteora.ag";
  private readonly dammV1ApiUrl = "https://damm-api.meteora.ag";
  private readonly dammV2ApiUrl = "https://dammv2-api.meteora.ag";
}

export const meteoraPoolService = new MeteoraPoolService();
```

**Design Pattern:** Singleton service with hardcoded API URLs  
**Side Effects:** All methods make HTTP calls via `api.getWithRetry()`, all log via `console.log/error`

### 1.3 Method Catalog

#### Method 1: `getDlmmPoolInfo(poolAddress: string)`

**Signature:**
```typescript
async getDlmmPoolInfo(poolAddress: string): Promise<MeteoraDlmmPoolResponse>
```

**Parameters:**
- `poolAddress: string` - Solana public key of DLMM pool

**Return Type:**
- `Promise<MeteoraDlmmPoolResponse>` - Raw API response from Meteora DLMM API

**Side Effects:**
1. HTTP GET to `${this.dlmmApiUrl}/pair/${poolAddress}`
2. Logs to console: `[Meteora] Fetching DLMM pool: ${poolAddress}`
3. Errors logged: `[Meteora] Error fetching DLMM pool ${poolAddress}:`
4. Throws on error

**Application Logic:** None (pure API wrapper)

**Current Consumers:**
- **NONE** (method exists but not called directly; used internally by `getPoolInfo`)

**Classification:** DEX-specific API wrapper  
**Target Destination:** `MeteoraApiClient.getPool()` (already exists)  
**Migration Readiness:** ✅ Ready - Direct replacement available

---

#### Method 2: `getDammV1PoolInfo(poolId: string)`

**Signature:**
```typescript
async getDammV1PoolInfo(poolId: string): Promise<MeteoraDammV1PoolResponse>
```

**Parameters:**
- `poolId: string` - Solana public key of DAMM v1 pool

**Return Type:**
- `Promise<MeteoraDammV1PoolResponse>` - First element of API response array

**Side Effects:**
1. HTTP GET to `${this.dammV1ApiUrl}/pools?address=${poolId}&unknown=true&pool_type=dynamic&is_monitoring=true`
2. Logs to console: `[Meteora] Fetching DAMM v1 pool: ${poolId}`
3. Errors logged: `[Meteora] Error fetching DAMM v1 pool ${poolId}:`
4. Returns `data[0]` (first array element)
5. Throws on error

**Application Logic:** Extracts first element from array response

**Current Consumers:**
- **NONE** (method exists but not called directly; used internally by `getPoolInfo`)

**Classification:** DEX-specific API wrapper  
**Target Destination:** `MeteoraApiClient` (needs to be added)  
**Migration Readiness:** ⚠️ Blocked - `MeteoraApiClient` does not yet support DAMM v1

---

#### Method 3: `getDammV2PoolInfo(poolId: string)`

**Signature:**
```typescript
async getDammV2PoolInfo(poolId: string): Promise<MeteoraDammV2PoolResponse>
```

**Parameters:**
- `poolId: string` - Solana public key of DAMM v2 pool

**Return Type:**
- `Promise<MeteoraDammV2PoolResponse>` - Raw API response from Meteora DAMM v2 API

**Side Effects:**
1. HTTP GET to `${this.dammV2ApiUrl}/pools/${poolId}`
2. Logs to console: `[Meteora] Fetching DAMM v2 pool: ${poolId}`
3. Errors logged: `[Meteora] Error fetching DAMM v2 pool ${poolId}:`
4. Throws on error

**Application Logic:** None (pure API wrapper)

**Current Consumers:**
- **NONE** (method exists but not called directly; used internally by `getPoolInfo`)

**Classification:** DEX-specific API wrapper  
**Target Destination:** `MeteoraApiClient` (needs to be added)  
**Migration Readiness:** ⚠️ Blocked - `MeteoraApiClient` does not yet support DAMM v2

---

#### Method 4: `getPoolInfo(poolId: string, poolType: MeteoraPoolType)`

**Signature:**
```typescript
async getPoolInfo(
  poolId: string,
  poolType: MeteoraPoolType
): Promise<MeteoraPoolData>
```

**Parameters:**
- `poolId: string` - Solana public key of pool
- `poolType: MeteoraPoolType` - Enum: `"damm_v1" | "damm_v2" | "dlmm"`

**Return Type:**
- `Promise<MeteoraPoolData>` - Unified pool data format (mapped from raw API response)

**Side Effects:**
1. Calls appropriate `getDlmm/Damm*PoolInfo()` method based on `poolType`
2. Applies corresponding mapper function (`mapDlmmToMeteoraPoolData`, etc.)
3. Throws if unknown pool type

**Application Logic:**
- Router method that delegates to specific pool type fetchers
- Applies data transformation via mapper functions

**Current Consumers:**
1. **`services/pool.service.ts`** (line 138) - `PoolService.getPool()` method

**Usage Context (PoolService.getPool):**
```typescript
async getPool(poolAddress: string, poolType: MeteoraPoolType) {
  try {
    const pool = await meteoraPoolService.getPoolInfo(poolAddress, poolType);
    return pool;
  } catch (error) {
    console.error(`[Meteora] Error fetching pool ${poolAddress} with type ${poolType}:`, error);
    return null;
  }
}
```

**Classification:** Business logic (routing + transformation)  
**Target Destination:** `MeteoraAdapter.getPool()` (needs enhancement for DAMM support)  
**Migration Readiness:** ⚠️ Partially ready
- DLMM: ✅ Ready (adapter supports DLMM)
- DAMM v1/v2: ❌ Blocked (adapter does not support DAMM)

---

#### Method 5: `getPositionClaimFees(positionAddress: string)`

**Signature:**
```typescript
async getPositionClaimFees(positionAddress: string): Promise<DlmmClaimFee[]>
```

**Parameters:**
- `positionAddress: string` - Solana public key of DLMM position

**Return Type:**
- `Promise<DlmmClaimFee[]>` - Array of claimable fees from API, or `[]` on 404

**Side Effects:**
1. HTTP GET to `${this.dlmmApiUrl}/position/${positionAddress}/claim_fees`
2. Returns empty array on 404 (graceful 404 handling)
3. Throws on other errors

**Application Logic:**
- 404 handling: Returns `[]` instead of throwing
- Array validation: Returns `[]` if response is not array

**Current Consumers:**
1. **`services/portfolio.service.ts`** (line 532) - `PortfolioService.getMeteoraPortfolioData()` method

**Usage Context:**
```typescript
const [claimedFees, deposits, withdraws, rewards] = await Promise.all([
  meteoraPoolService.getPositionClaimFees(positionAddress),
  meteoraPoolService.getPositionDeposits(positionAddress),
  meteoraPoolService.getPositionWithdraws(positionAddress),
  meteoraPoolService.getPositionClaimRewards(positionAddress),
]);
```

**Classification:** DEX-specific API wrapper  
**Target Destination:** `MeteoraApiClient` (needs to be added; exists in latest `meteora-api.client.ts` in adapters/dex/meteora/)  
**Migration Readiness:** ✅ Ready (method already exists in new `MeteoraApiClient` per docs)

---

#### Method 6: `getPositionClaimRewards(positionAddress: string)`

**Signature:**
```typescript
async getPositionClaimRewards(
  positionAddress: string
): Promise<DlmmClaimReward[]>
```

**Parameters:**
- `positionAddress: string` - Solana public key of DLMM position

**Return Type:**
- `Promise<DlmmClaimReward[]>` - Array of claimable rewards from API, or `[]` on 404

**Side Effects:**
1. HTTP GET to `${this.dlmmApiUrl}/position/${positionAddress}/claim_rewards`
2. Returns empty array on 404
3. Throws on other errors

**Application Logic:** Same as `getPositionClaimFees`

**Current Consumers:**
1. **`services/portfolio.service.ts`** (line 535) - `PortfolioService.getMeteoraPortfolioData()` method

**Usage Context:** See Method 5 context (same Promise.all batch)

**Classification:** DEX-specific API wrapper  
**Target Destination:** `MeteoraApiClient` (needs to be added; exists in latest `meteora-api.client.ts`)  
**Migration Readiness:** ✅ Ready

---

#### Method 7: `getPositionDeposits(positionAddress: string)`

**Signature:**
```typescript
async getPositionDeposits(
  positionAddress: string
): Promise<DlmmDepositWithdraw[]>
```

**Parameters:**
- `positionAddress: string` - Solana public key of DLMM position

**Return Type:**
- `Promise<DlmmDepositWithdraw[]>` - Array of deposit events from API, or `[]` on 404

**Side Effects:**
1. HTTP GET to `${this.dlmmApiUrl}/position/${positionAddress}/deposits`
2. Returns empty array on 404
3. Throws on other errors

**Application Logic:** Same as `getPositionClaimFees`

**Current Consumers:**
1. **`services/portfolio.service.ts`** (line 533) - `PortfolioService.getMeteoraPortfolioData()` method

**Usage Context:** See Method 5 context (same Promise.all batch)

**Classification:** DEX-specific API wrapper  
**Target Destination:** `MeteoraApiClient` (needs to be added; exists in latest `meteora-api.client.ts`)  
**Migration Readiness:** ✅ Ready

---

#### Method 8: `getPositionWithdraws(positionAddress: string)`

**Signature:**
```typescript
async getPositionWithdraws(
  positionAddress: string
): Promise<DlmmDepositWithdraw[]>
```

**Parameters:**
- `positionAddress: string` - Solana public key of DLMM position

**Return Type:**
- `Promise<DlmmDepositWithdraw[]>` - Array of withdrawal events from API, or `[]` on 404

**Side Effects:**
1. HTTP GET to `${this.dlmmApiUrl}/position/${positionAddress}/withdraws`
2. Returns empty array on 404
3. Throws on other errors

**Application Logic:** Same as `getPositionClaimFees`

**Current Consumers:**
1. **`services/portfolio.service.ts`** (line 534) - `PortfolioService.getMeteoraPortfolioData()` method

**Usage Context:** See Method 5 context (same Promise.all batch)

**Classification:** DEX-specific API wrapper  
**Target Destination:** `MeteoraApiClient` (needs to be added; exists in latest `meteora-api.client.ts`)  
**Migration Readiness:** ✅ Ready

---

#### Method 9: `getAllDlmmPools(params: DlmmPoolsPaginationParams)`

**Signature:**
```typescript
async getAllDlmmPools(
  params: DlmmPoolsPaginationParams = {}
): Promise<MeteoraDlmmPoolsPaginationResponse>
```

**Parameters:**
- `params: DlmmPoolsPaginationParams` - Optional query parameters object with fields:
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

**Return Type:**
- `Promise<MeteoraDlmmPoolsPaginationResponse>` - Paginated pool list from API

**Side Effects:**
1. Builds complex query string from params object
2. HTTP GET to `${this.dlmmApiUrl}/pair/all_with_pagination?{query}`
3. Logs params to console: `[Meteora] Fetching all DLMM pools with params:`
4. Errors logged: `[Meteora] Error fetching all DLMM pools:`
5. Throws on error

**Application Logic:**
- Query string building: Manual URLSearchParams construction (lines 169-211)
- Array parameters: Appends multiple times for array-type params

**Current Consumers:**
1. **`services/trending.service.ts`** (line 87) - `TrendingService.getTrendingPool()` method (COMMENTED OUT)

**Usage Context:**
```typescript
// ENTIRE FILE IS COMMENTED OUT
// async getTrendingPool(currentPage: number, sortBy: TrendingPoolsSortCriteria) {
//   const sarosPools = await this.sarosPoolService.getAllDlmmPools({ ... });
//   ...
// }
```

**Classification:** DEX-specific API wrapper  
**Target Destination:** `MeteoraApiClient.getTrendingPools()` (already exists)  
**Migration Readiness:** ✅ Ready - Already implemented in `MeteoraApiClient`

**Note:** This method is not actively used. `TrendingService` is entirely commented out.

---

### 1.4 Exported Mapper Functions

#### Mapper 1: `mapDlmmToMeteoraPoolData(data: MeteoraDlmmPoolResponse)`

**Signature:**
```typescript
export function mapDlmmToMeteoraPoolData(
  data: MeteoraDlmmPoolResponse
): MeteoraPoolData
```

**Parameters:**
- `data: MeteoraDlmmPoolResponse` - Raw DLMM pool API response

**Return Type:**
- `MeteoraPoolData` - Unified pool data format (36 fields)

**Logic:**
- Maps DLMM API response to unified `MeteoraPoolData` format
- Calculates derived fields (e.g., `token_a_amount_usd`, `tvl`, `sqrt_price`)
- Extracts token symbols from pool name via `split("-")`
- Sets pool type to `3` (DLMM)
- Determines farm status: `has_farm` and `farm_active` based on `farm_apr > 0`

**Current Consumers:**
- Internal: Used by `getPoolInfo()` method (line 101)
- **No direct external consumers found**

**Classification:** Data transformation utility  
**Target Destination:** `MeteoraAdapter` (internal helper method)  
**Migration Readiness:** ✅ Ready - Move to adapter as private method

---

#### Mapper 2: `mapDammV1ToMeteoraPoolData(data: MeteoraDammV1PoolResponse)`

**Signature:**
```typescript
export function mapDammV1ToMeteoraPoolData(
  data: MeteoraDammV1PoolResponse
): MeteoraPoolData
```

**Parameters:**
- `data: MeteoraDammV1PoolResponse` - Raw DAMM v1 pool API response

**Return Type:**
- `MeteoraPoolData` - Unified pool data format

**Logic:**
- Maps DAMM v1 API response to unified format
- Extracts token symbols from `pool_name.split("-")`
- Extracts token mints from `pool_token_mints` array
- Parses numeric fields from string values
- Sets pool type to `1` (DAMM v1)
- Determines farm status from `farming_pool` and `farm_expire` fields

**Current Consumers:**
- Internal: Used by `getPoolInfo()` method (line 95)
- **No direct external consumers found**

**Classification:** Data transformation utility  
**Target Destination:** `MeteoraAdapter` (internal helper method)  
**Migration Readiness:** ✅ Ready - Move to adapter as private method

---

#### Mapper 3: `mapDammV2ToMeteoraPoolData(data: MeteoraDammV2PoolResponse["data"])`

**Signature:**
```typescript
export function mapDammV2ToMeteoraPoolData(
  data: MeteoraDammV2PoolResponse["data"]
): MeteoraPoolData
```

**Parameters:**
- `data: MeteoraDammV2PoolResponse["data"]` - Data field from DAMM v2 API response

**Return Type:**
- `MeteoraPoolData` - Unified pool data format

**Logic:**
- Direct 1:1 field mapping (DAMM v2 response already matches unified format)
- No calculations or transformations needed

**Current Consumers:**
- Internal: Used by `getPoolInfo()` method (line 97-98)
- **No direct external consumers found**

**Classification:** Data transformation utility  
**Target Destination:** `MeteoraAdapter` (internal helper method)  
**Migration Readiness:** ✅ Ready - Move to adapter as private method

---

### 1.5 Usage Analysis Summary

**Direct Consumers:**
1. **`services/pool.service.ts`** (1 method: `getPoolInfo`)
2. **`services/portfolio.service.ts`** (4 methods: position API calls)
3. **`services/trending.service.ts`** (1 method: `getAllDlmmPools` - COMMENTED OUT)

**Consumer Dependency Graph:**
```
MeteoraPoolService
├── services/pool.service.ts (1 consumer)
│   └── PoolService.getPool() → meteoraPoolService.getPoolInfo()
├── services/portfolio.service.ts (1 consumer, 4 methods)
│   └── PortfolioService.getMeteoraPortfolioData()
│       ├── meteoraPoolService.getPositionClaimFees()
│       ├── meteoraPoolService.getPositionClaimRewards()
│       ├── meteoraPoolService.getPositionDeposits()
│       └── meteoraPoolService.getPositionWithdraws()
└── services/trending.service.ts (0 active consumers - file commented out)
```

**Import Patterns:**
```typescript
// services/pool.service.ts (line 2)
import { meteoraPoolService } from "./meteora/pool.service";

// services/portfolio.service.ts (line 8)
import { meteoraPoolService } from "./meteora/pool.service";

// services/trending.service.ts (commented out)
// No active import
```

### 1.6 Naming & Type Debt Callouts

| Area | Problem | Recommendation |
|------|---------|----------------|
| Method names | `getDlmmPoolInfo`, `getDammV1PoolInfo`, `getDammV2PoolInfo` use inconsistent suffixes and vague nouns | Rename to `getDlmmPool`, `getDammV1Pool`, `getDammV2Pool` (or drop entirely once adapter handles everything). Maintain verb + noun pattern across adapters/services. |
| Mapper exports | `mapDlmmToMeteoraPoolData` etc. return legacy `MeteoraPoolData` type | Replace with `mapDlmmToUnifiedPool`, etc., returning `UnifiedPool` from core types. Keep mappers private inside `MeteoraAdapter`. |
| Singleton export | `meteoraPoolService` exported as singleton from service file | Remove after migration. Until then, rename to `MeteoraLegacyPoolService` to make legacy status explicit. |
| Types file | `types/meteora.types.ts` mixes SDK-only types, legacy DTOs, and unified pool DTOs | Split into `meteora-sdk.types.ts` (pure SDK) and move shared types to `pool.types.ts`. Deprecate `MeteoraPoolData` and adopt `UnifiedPool`. |
| Position DTOs | `MeteoraDlmmPosition` defined but unused outside legacy service | Remove after confirming no runtime dependency; use adapter outputs instead. |

---

## 2. File: services/meteora/position.service.ts

### 2.1 File Status

| Property | Value |
|----------|-------|
| **Path** | `apps/bot/src/services/meteora/position.service.ts` |
| **Lines of Code** | 29 (100% commented) |
| **Status** | ❌ Dead code |
| **Exports** | None (all commented out) |
| **Active Usage** | None (confirmed via grep) |

### 2.2 Dead Code Analysis

**Entire File Content:**
```typescript
// import { api } from "@/utils/http-client.util";
// import { MeteoraDlmmPosition } from "@/types/meteora.types";

// export class MeteoraPositionService {
//   private readonly dlmmApiUrl = "https://dlmm-api.meteora.ag";
//   private readonly dammV1ApiUrl = "https://damm-api.meteora.ag";
//   private readonly dammV2ApiUrl = "https://dammv2-api.meteora.ag";

//   async getDlmmPosition(positionAddress: string): Promise<MeteoraDlmmPosition> {
//     try {
//       console.log(`[Meteora] Fetching DLMM position: ${positionAddress}`);
//       const data = await api.getWithRetry<MeteoraDlmmPosition>(
//         `${this.dlmmApiUrl}/position/${positionAddress}`
//       );
//       return data;
//     } catch (error) {
//       console.error(
//         `[Meteora] Error fetching DLMM position ${positionAddress}:`,
//         error
//       );
//       throw error;
//     }
//   }
// }

// export const meteoraPositionService = new MeteoraPositionService();
```

**Grep Results:** No active references found (confirmed via grep for "meteoraPositionService")

**Classification:** Dead code  
**Target Destination:** Deletion  
**Migration Readiness:** ✅ Ready for immediate deletion

---

## 3. Type System Audit: types/meteora.types.ts

### 3.1 Type File Metadata

| Property | Value |
|----------|-------|
| **Path** | `apps/bot/src/types/meteora.types.ts` |
| **Lines of Code** | 258 |
| **Status** | ⚠️ Mixed (SDK types + legacy DTOs + unused types) |
| **Exports** | 17 types/interfaces |
| **Imports** | 2 external (`@meteora-ag/dlmm`, `@solana/web3.js`) |

### 3.2 Type Inventory & Classification

| # | Type/Interface | Purpose | Status | Action |
|---|----------------|---------|--------|--------|
| 1 | `MeteoraStrategyTypeKey` | Type alias for SDK `StrategyType` keys | ✅ Active (SDK wrapper) | **Keep** - Used in position creation |
| 2 | `MeteoraPoolType` | Union: `"damm_v1" \| "damm_v2" \| "dlmm"` | ✅ Active | **Keep** - Core pool type discriminator |
| 3 | `MeteoraCreatePositionStrategy` | Union: `"spot" \| "curve" \| "bid-ask"` | ✅ Active | **Keep** - User-facing strategy names |
| 4 | `CreateMeteoraPositionParams` | Extends SDK `TInitializePositionAndAddLiquidityParamsByStrategy` | ✅ Active | **Keep** - Position creation API |
| 5 | `CloseMeteoraPositionParams` | SDK position close params | ✅ Active | **Keep** - Position closing API |
| 6 | `MeteoraDlmmPool` | Detailed DLMM pool response (36 fields) | ✅ Active | **Keep** - API response type |
| 7 | `MeteoraDlmmPoolResponse` | Alias of `MeteoraDlmmPool` | ⚠️ Duplicate | **Merge** - Remove alias, use `MeteoraDlmmPool` directly |
| 8 | `MeteoraDammV1PoolResponse` | DAMM v1 pool response (29 fields) | ✅ Active | **Keep** - API response type |
| 9 | `MeteoraDammV2PoolResponse` | DAMM v2 pool response (wrapper with `data` field) | ✅ Active | **Keep** - API response type |
| 10 | `MeteoraPoolData` | **Legacy unified pool format** (36 fields) | ⚠️ Legacy | **Deprecate** - Replace with `UnifiedPool` from core types |
| 11 | `MeteoraDlmmPosition` | DLMM position with fees/rewards (10 fields) | ❌ Unused | **Remove** - Not referenced anywhere |
| 12 | `MeteoraDlmmPoolsPaginationResponse` | Paginated pools with total count | ✅ Active | **Keep** - API pagination type |
| 13 | `DlmmPoolsPaginationParams` | Query params for pagination (17 fields) | ✅ Active | **Keep** - API query type |

### 3.3 Type Conflicts & Issues

**Issue 1: Duplicate Type Alias**
```typescript
export interface MeteoraDlmmPool { /* 36 fields */ }
export interface MeteoraDlmmPoolResponse extends MeteoraDlmmPool {}
```
**Problem:** `MeteoraDlmmPoolResponse` adds no new fields; it's just an alias.  
**Recommendation:** Remove `MeteoraDlmmPoolResponse` and use `MeteoraDlmmPool` everywhere.

**Issue 2: Legacy Unified Type**
```typescript
export interface MeteoraPoolData {
  pool_address: string;
  pool_name: string;
  // ... 36 fields total
}
```
**Problem:** This pre-dates the adapter pattern and is Meteora-specific, but tries to unify DLMM/DAMM types. Now that we have `UnifiedPool` from core types (cross-DEX compatible), this is redundant.  
**Usage:**
- Legacy mapper functions (`mapDlmmToMeteoraPoolData`, etc.) return this type
- `PoolService.getPool()` returns this type
- Should be replaced by `UnifiedPool` which is DEX-agnostic

**Recommendation:** 
1. Mark `@deprecated` with migration deadline
2. Update mappers to return `UnifiedPool` instead
3. Update consumers to expect `UnifiedPool`
4. Remove type definition after full migration

**Issue 3: Unused Position Type**
```typescript
export interface MeteoraDlmmPosition {
  address: string;
  pair_address: string;
  owner: string;
  total_fee_x_claimed: number;
  // ...
}
```
**Grep Results:** Only used in commented-out `position.service.ts`  
**Recommendation:** Delete immediately (dead code).

**Issue 4: Mixed Concerns**
The file mixes:
- SDK type wrappers (`MeteoraStrategyTypeKey`, `CreateMeteoraPositionParams`)
- API response types (`MeteoraDlmmPool`, `MeteoraDammV1PoolResponse`)
- Legacy unified types (`MeteoraPoolData`)
- Position types (`MeteoraDlmmPosition`)

**Recommendation:** Split into:
```
types/
├── meteora/
│   ├── meteora-sdk.types.ts       # SDK wrappers only
│   ├── meteora-api.types.ts       # API response types (pool, position)
│   └── meteora-params.types.ts    # Query/mutation params
└── pool.types.ts                  # UnifiedPool (cross-DEX)
```

### 3.4 Type Migration Plan

**Phase 1: Deprecate Legacy Types**
```typescript
// types/meteora.types.ts

/**
 * @deprecated Use UnifiedPool from types/pool.types.ts instead.
 * This legacy type will be removed in v2.0.
 */
export interface MeteoraPoolData { /* ... */ }

/**
 * @deprecated This type is unused and will be removed.
 */
export interface MeteoraDlmmPosition { /* ... */ }

// Remove duplicate alias
// export interface MeteoraDlmmPoolResponse extends MeteoraDlmmPool {}
```

**Phase 2: Add UnifiedPool Mappers**
```typescript
// adapters/dex/meteora.adapter.ts

private mapDlmmToUnifiedPool(dlmm: MeteoraDlmmPool): UnifiedPool {
  return {
    id: dlmm.address,
    address: dlmm.address,
    name: dlmm.name,
    dex: 'meteora',
    type: 'DLMM',
    tokenA: {
      address: dlmm.mint_x,
      symbol: dlmm.name.split('-')[0],
      decimals: 0, // Fetch from token registry
    },
    tokenB: {
      address: dlmm.mint_y,
      symbol: dlmm.name.split('-')[1],
      decimals: 0,
    },
    currentPrice: dlmm.current_price,
    liquidity: dlmm.liquidity,
    tvl: String(dlmm.reserve_x_amount * dlmm.current_price + dlmm.reserve_y_amount),
    apr: dlmm.apr,
    apy: dlmm.apy,
    volume24h: dlmm.trade_volume_24h,
    fees24h: dlmm.fees_24h,
    feeTvlRatio24h: dlmm.fee_tvl_ratio.hour_24,
    isVerified: dlmm.is_verified,
    metadata: {
      binStep: dlmm.bin_step,
      farmApr: dlmm.farm_apr,
      launchpad: dlmm.launchpad,
    },
  };
}
```

**Phase 3: Split Type File**
```typescript
// types/meteora/meteora-sdk.types.ts
export type MeteoraStrategyTypeKey = keyof typeof StrategyType;
export interface CreateMeteoraPositionParams
  extends TInitializePositionAndAddLiquidityParamsByStrategy {}
export interface CloseMeteoraPositionParams {
  owner: PublicKey;
  position: LbPosition;
}

// types/meteora/meteora-api.types.ts
export interface MeteoraDlmmPool { /* ... */ }
export interface MeteoraDammV1PoolResponse { /* ... */ }
export interface MeteoraDammV2PoolResponse { /* ... */ }
export interface MeteoraDlmmPoolsPaginationResponse { /* ... */ }

// types/meteora/meteora-params.types.ts
export interface DlmmPoolsPaginationParams { /* ... */ }

// Delete types/meteora.types.ts after migration
```

### 3.5 Type Dependencies Audit

**Active Dependencies:**
| Type | Imported By (# files) | Critical? |
|------|----------------------|-----------|
| `MeteoraDlmmPool` / `MeteoraDlmmPoolResponse` | 5 files | ✅ Yes (API client, adapter, services) |
| `MeteoraDammV1PoolResponse` | 3 files | ✅ Yes (API client, legacy service) |
| `MeteoraDammV2PoolResponse` | 3 files | ✅ Yes (API client, legacy service) |
| `MeteoraPoolData` | 4 files | ⚠️ Legacy (replace with UnifiedPool) |
| `MeteoraPoolType` | 6 files | ✅ Yes (pool routing) |
| `DlmmPoolsPaginationParams` | 3 files | ✅ Yes (API client, trending) |
| `MeteoraDlmmPosition` | 1 file | ❌ No (only in commented code) |

**Recommendation:** Keep all active types, remove unused `MeteoraDlmmPosition`, deprecate `MeteoraPoolData`.

---

## 4. Categorization Matrix

### 3.1 Method Classification Table

| # | Method | Classification | Current Consumers | Target Destination | Migration Readiness |
|---|--------|---------------|-------------------|-------------------|---------------------|
| 1 | `getDlmmPoolInfo()` | DEX-specific API | None (internal only) | `MeteoraApiClient.getPool()` | ✅ Ready (duplicate exists) |
| 2 | `getDammV1PoolInfo()` | DEX-specific API | None (internal only) | `MeteoraApiClient.getDammV1Pool()` | ✅ Ready (duplicate exists) |
| 3 | `getDammV2PoolInfo()` | DEX-specific API | None (internal only) | `MeteoraApiClient.getDammV2Pool()` | ✅ Ready (duplicate exists) |
| 4 | `getPoolInfo()` | Business logic | `PoolService.getPool()` | `MeteoraAdapter.getPool()` | ⚠️ Partial (needs UnifiedPool mapper + DAMM wiring) |
| 5 | `getPositionClaimFees()` | DEX-specific API | `PortfolioService` | `MeteoraApiClient` | ✅ Ready (exists in new client) |
| 6 | `getPositionClaimRewards()` | DEX-specific API | `PortfolioService` | `MeteoraApiClient` | ✅ Ready (exists in new client) |
| 7 | `getPositionDeposits()` | DEX-specific API | `PortfolioService` | `MeteoraApiClient` | ✅ Ready (exists in new client) |
| 8 | `getPositionWithdraws()` | DEX-specific API | `PortfolioService` | `MeteoraApiClient` | ✅ Ready (exists in new client) |
| 9 | `getAllDlmmPools()` | DEX-specific API | None (commented consumer) | `MeteoraApiClient.getTrendingPools()` | ✅ Ready (duplicate exists) |

### 3.2 Mapper Function Classification

| # | Mapper Function | Classification | Current Usage | Target Destination | Migration Readiness |
|---|----------------|---------------|---------------|-------------------|---------------------|
| 1 | `mapDlmmToMeteoraPoolData()` | Data transformation | Internal only | `MeteoraAdapter` (private) | ✅ Ready |
| 2 | `mapDammV1ToMeteoraPoolData()` | Data transformation | Internal only | `MeteoraAdapter` (private) | ✅ Ready |
| 3 | `mapDammV2ToMeteoraPoolData()` | Data transformation | Internal only | `MeteoraAdapter` (private) | ✅ Ready |

---

## 4. Blocking Dependencies

### 4.1 ✅ No Blocking Dependencies - All Methods Implemented

**Status Update:** The new `MeteoraApiClient` (`apps/bot/src/adapters/dex/meteora/meteora-api.client.ts`) already implements ALL methods from the legacy service:

| Legacy Method | New Implementation | Status |
|---------------|-------------------|--------|
| `getDlmmPoolInfo()` | `MeteoraApiClient.getPool()` | ✅ Implemented (line 336) |
| `getDammV1PoolInfo()` | `MeteoraApiClient.getDammV1Pool()` | ✅ Implemented (line 416) |
| `getDammV2PoolInfo()` | `MeteoraApiClient.getDammV2Pool()` | ✅ Implemented (line 447) |
| `getAllDlmmPools()` | `MeteoraApiClient.getTrendingPools()` | ✅ Implemented (line 355) |
| `getAllPools()` | `MeteoraApiClient.getAllPools()` | ✅ Implemented (line 395) |
| `getPositionClaimFees()` | `MeteoraApiClient.getPositionClaimFees()` | ✅ Implemented (line 466) |
| `getPositionClaimRewards()` | `MeteoraApiClient.getPositionClaimRewards()` | ✅ Implemented (line 494) |
| `getPositionDeposits()` | `MeteoraApiClient.getPositionDeposits()` | ✅ Implemented (line 520) |
| `getPositionWithdraws()` | `MeteoraApiClient.getPositionWithdraws()` | ✅ Implemented (line 546) |

**Key Improvements in New Implementation:**
- Circuit breaker pattern for resilience
- Multi-tier caching (in-memory + Redis)
- Structured logging with child loggers
- Proper error handling with `MeteoraApiError`
- Request timeout support
- Configurable retry with exponential backoff
- Graceful 404 handling for position APIs

**Conclusion:** No missing methods. The migration is unblocked and can proceed immediately.

### 4.2 Type Dependencies

**Required Types (all exist in `@/types/meteora.types.ts`):**
- `MeteoraDlmmPoolResponse`
- `MeteoraDammV1PoolResponse`
- `MeteoraDammV2PoolResponse`
- `MeteoraPoolData`
- `MeteoraPoolType` (enum: `"damm_v1" | "damm_v2" | "dlmm"`)
- `DlmmPoolsPaginationParams`
- `MeteoraDlmmPoolsPaginationResponse`

**Required Types (exist in `@/types/portfolio.types.ts`):**
- `DlmmClaimFee[]`
- `DlmmClaimReward[]`
- `DlmmDepositWithdraw[]`

**Status:** ✅ All type dependencies satisfied

### 4.3 Utility Dependencies

**Required Utilities:**
- `http-client.util.ts` → `api.getWithRetry()` (exists)

**Status:** ✅ All utility dependencies satisfied

---

## 5. Migration Plan

### 5.1 Migration Strategy Overview

**Goal:** Eliminate `MeteoraPoolService` by migrating methods to adapter layer  
**Approach:** Multi-phase migration aligned with upcoming tickets

### 5.2 Migration Batches

#### Batch 1: Dead Code Removal (Immediate - P0)

**Target:** `services/meteora/position.service.ts`

**Actions:**
1. Verify no references exist (✅ Confirmed via grep)
2. Delete file
3. Remove from imports

**Prerequisites:** None  
**Estimated Effort:** 1 hour  
**Risk:** None (dead code)  
**Ticket Alignment:** Task 1.2 (Dead Code Removal) per MIGRATION_AUDIT.md

---

#### Batch 2: Position API Methods Migration (Next - P0)

**Target:** Methods 5-8 (position API methods)

**Consumer:** `PortfolioService.getMeteoraPortfolioData()`

**Actions:**
1. Confirm `MeteoraApiClient` has all 4 position methods (per meteora-api-comparison.md)
2. Update `PortfolioService` import:
   ```typescript
   // OLD
   import { meteoraPoolService } from "./meteora/pool.service";
   
   // NEW
   import { meteoraApiClient } from "@/adapters/dex/meteora";
   ```
3. Update method calls:
   ```typescript
   // OLD
   const [claimedFees, deposits, withdraws, rewards] = await Promise.all([
     meteoraPoolService.getPositionClaimFees(positionAddress),
     meteoraPoolService.getPositionDeposits(positionAddress),
     meteoraPoolService.getPositionWithdraws(positionAddress),
     meteoraPoolService.getPositionClaimRewards(positionAddress),
   ]);
   
   // NEW
   const [claimedFees, deposits, withdraws, rewards] = await Promise.all([
     meteoraApiClient.getPositionClaimFees(positionAddress),
     meteoraApiClient.getPositionDeposits(positionAddress),
     meteoraApiClient.getPositionWithdraws(positionAddress),
     meteoraApiClient.getPositionClaimRewards(positionAddress),
   ]);
   ```
4. Test `PortfolioService` with new client

**Prerequisites:**
- Verify `MeteoraApiClient` has position methods (✅ Confirmed per docs)

**Estimated Effort:** 2-4 hours  
**Risk:** Low (method signatures identical)  
**Ticket Alignment:** Task 4.1 (PositionService refactor) or separate ticket

---

#### Batch 3: Migrate Mappers to MeteoraAdapter (P1)

**Target:** Mapper functions 1-3

**Actions:**
1. Move mapper functions from `pool.service.ts` to `MeteoraAdapter` as private methods:
   ```typescript
   // In MeteoraAdapter class
   private mapDlmmToUnified(data: MeteoraDlmmPoolResponse): UnifiedPool { ... }
   private mapDammV1ToUnified(data: MeteoraDammV1PoolResponse): UnifiedPool { ... }
   private mapDammV2ToUnified(data: MeteoraDammV2PoolResponse["data"]): UnifiedPool { ... }
   ```
2. Update mapper return types from `MeteoraPoolData` to `UnifiedPool`
3. Remove exported mapper functions from `pool.service.ts`

**Prerequisites:** None (DAMM support already exists in `MeteoraApiClient`)

**Estimated Effort:** 1-2 days  
**Risk:** Low (pure refactor)  
**Ticket Alignment:** Task 3.2 (Deprecate MeteoraPoolService) per MIGRATION_AUDIT.md

---

#### Batch 4: Enhance MeteoraAdapter with DAMM Support (P1)

**Target:** Method 4 (`getPoolInfo`) business logic

**Actions:**
1. Enhance `MeteoraAdapter.getPool()` to support DAMM:
   ```typescript
   async getPool(poolId: string, poolType?: "dlmm" | "damm_v1" | "damm_v2"): Promise<UnifiedPool> {
     const type = poolType || "dlmm"; // Default to DLMM
     
     switch (type) {
       case "dlmm":
         const dlmmPool = await this.api.getPool(poolId);
         return this.mapDlmmToUnified(dlmmPool);
       case "damm_v1":
         const dammV1Pool = await this.api.getDammV1Pool(poolId);
         return this.mapDammV1ToUnified(dammV1Pool);
       case "damm_v2":
         const dammV2Pool = await this.api.getDammV2Pool(poolId);
         return this.mapDammV2ToUnified(dammV2Pool.data);
       default:
         throw new Error(`Unknown pool type: ${type}`);
     }
   }
   ```
2. Update `IDexAdapter` interface to support optional `poolType` parameter
3. Update URL parsing in `MeteoraAdapter.parsePoolUrl()` to detect DAMM URLs

**Prerequisites:**
- Batch 3 complete (mappers migrated)

**Estimated Effort:** 1-2 days  
**Risk:** Low (extends existing pattern)  
**Ticket Alignment:** Task 3.1 (Migrate PoolService Logic) per MIGRATION_AUDIT.md

---

#### Batch 5: Update PoolService Consumer (P2)

**Target:** `PoolService.getPool()` method

**Consumer:** `services/pool.service.ts` (line 136-148)

**Actions:**
1. Update `PoolService.getPool()` to use adapter:
   ```typescript
   // OLD
   async getPool(poolAddress: string, poolType: MeteoraPoolType) {
     try {
       const pool = await meteoraPoolService.getPoolInfo(poolAddress, poolType);
       return pool;
     } catch (error) {
       console.error(`[Meteora] Error fetching pool ${poolAddress} with type ${poolType}:`, error);
       return null;
     }
   }
   
   // NEW
   async getPool(poolAddress: string, poolType: MeteoraPoolType) {
     try {
       const pool = await this.meteoraAdapter.getPool(poolAddress, poolType);
       return pool;
     } catch (error) {
       console.error(`[Meteora] Error fetching pool ${poolAddress} with type ${poolType}:`, error);
       return null;
     }
   }
   ```
2. Remove `meteoraPoolService` import from `PoolService`
3. Test all pool fetching flows

**Prerequisites:**
- Batch 4 complete (adapter enhanced)

**Estimated Effort:** 1-2 hours  
**Risk:** Low (simple delegation change)  
**Ticket Alignment:** Task 3.1 (Migrate PoolService Logic) per MIGRATION_AUDIT.md

---

#### Batch 6: Delete MeteoraPoolService & Type Cleanup (P2)

**Target:** `services/meteora/pool.service.ts`

**Actions:**
1. Verify no remaining imports of `meteoraPoolService` (grep)
2. Verify no remaining imports of mapper functions (grep)
3. Delete `services/meteora/pool.service.ts`
4. Delete `services/meteora/position.service.ts`
5. Remove legacy exports from `types/meteora.types.ts` (`MeteoraPoolData`, `MeteoraDlmmPosition`, alias types)
6. Update documentation references (MIGRATION_AUDIT, system design)

**Prerequisites:**
- Batch 2 complete (PortfolioService migrated)
- Batch 5 complete (PoolService migrated)
- No other consumers found

**Estimated Effort:** 1-2 hours  
**Risk:** Low (if prerequisites met)  
**Ticket Alignment:** Task 3.2 (Deprecate MeteoraPoolService) + Type cleanup ticket

---

### 5.3 Migration Timeline (Updated with DAMM Pre-Existing)

```
Week 1: Batch 1 (Dead Code) + Batch 2 (Position API)
        └── 1-2 days total

Week 2: Batch 3 (Mappers)
        └── 1-2 days

Week 3: Batch 4 (Adapter DAMM) + Batch 5 (PoolService Update)
        └── 2-3 days total

Week 4: Batch 6 (Deletion & Type Cleanup)
        └── 1 day total

Total Estimated Time: 5-8 days (1-2 sprint weeks)
```

**Key Change:** Batch 3 (Add DAMM Support) removed since `MeteoraApiClient` already has full DAMM v1/v2 support. Migration timeline shortened by ~2-3 days.

---

## 6. Risk Assessment

### 6.1 High-Risk Items

| Risk | Impact | Likelihood | Mitigation |
|------|--------|-----------|------------|
| DAMM v1/v2 API behavior differs from DLMM | High | Medium | Test with real pools, add integration tests |
| PortfolioService breaks after position API migration | High | Low | Thorough testing, rollback plan |
| Circular dependencies introduced | Medium | Low | Follow one-way dependency rule |

### 6.2 Medium-Risk Items

| Risk | Impact | Likelihood | Mitigation |
|------|--------|-----------|------------|
| Mapper logic has edge cases | Medium | Medium | Unit test all mappers with real API responses |
| Pool type detection fails for DAMM URLs | Medium | Low | Test URL parsing thoroughly |
| Performance regression | Low | Low | Benchmark before/after |

### 6.3 Low-Risk Items

| Risk | Impact | Likelihood | Mitigation |
|------|--------|-----------|------------|
| Import path errors | Low | Low | TypeScript will catch at compile time |
| Console logs lost | Low | Medium | Use structured logging throughout |

---

## 7. Testing Strategy

### 7.1 Unit Tests Required

**For MeteoraApiClient enhancements:**
- [ ] `getDammV1Pool()` returns correct response
- [ ] `getDammV2Pool()` returns correct response
- [ ] Position API methods return empty arrays on 404
- [ ] Circuit breaker opens after 5 failures
- [ ] Cache returns stale data when circuit open

**For MeteoraAdapter enhancements:**
- [ ] `getPool()` routes to correct method based on pool type
- [ ] DAMM v1 mapper transforms correctly
- [ ] DAMM v2 mapper transforms correctly
- [ ] URL parsing detects DAMM v1 URLs
- [ ] URL parsing detects DAMM v2 URLs

### 7.2 Integration Tests Required

**For PortfolioService:**
- [ ] Portfolio fetching works with new API client
- [ ] Position history (fees, rewards, deposits, withdraws) fetches correctly
- [ ] Empty arrays handled gracefully on 404

**For PoolService:**
- [ ] DLMM pool fetching works via adapter
- [ ] DAMM v1 pool fetching works via adapter
- [ ] DAMM v2 pool fetching works via adapter
- [ ] Pool type auto-detection works

### 7.3 Manual Testing Checklist

- [ ] Browse trending pools (DLMM, DAMM v1, DAMM v2)
- [ ] View pool details for all pool types
- [ ] View portfolio with multiple position types
- [ ] Create position on DLMM pool
- [ ] Create position on DAMM pool (if supported)
- [ ] Check error handling with invalid pool addresses

---

## 8. Success Criteria

### 8.1 Technical Success Criteria

- [ ] All methods from `MeteoraPoolService` migrated to adapter/client layer
- [ ] No remaining imports of `meteoraPoolService` in codebase
- [ ] No remaining imports of mapper functions outside adapter
- [ ] `services/meteora/pool.service.ts` deleted
- [ ] `services/meteora/position.service.ts` deleted
- [ ] All unit tests passing
- [ ] All integration tests passing
- [ ] TypeScript compilation succeeds
- [ ] No circular dependencies introduced

### 8.2 Functional Success Criteria

- [ ] Portfolio fetching works identically to before migration
- [ ] Pool details display correctly for all pool types
- [ ] Trending pools list correctly for DLMM
- [ ] Error handling behavior unchanged
- [ ] Performance metrics within 10% of baseline
- [ ] No production incidents related to migration

### 8.3 Code Quality Criteria

- [ ] All new code follows adapter pattern
- [ ] All API calls go through `MeteoraApiClient`
- [ ] No direct SDK usage outside adapters
- [ ] Structured logging used (no console.log)
- [ ] JSDoc comments added to new methods
- [ ] Type safety maintained (no `any` types)

---

## 9. Rollback Plan

### 9.1 Rollback Triggers

- Critical production bug affecting portfolio display
- Data accuracy issues (incorrect position values)
- Performance degradation > 50%
- Unable to complete migration within 2 sprint weeks

### 9.2 Rollback Steps

**Batch 2 Rollback (PortfolioService):**
1. Revert `PortfolioService` to use `meteoraPoolService`
2. Restore imports
3. Deploy hotfix

**Batch 3-7 Rollback (Full Rollback):**
1. Revert all adapter changes
2. Restore `MeteoraPoolService` file
3. Revert `PoolService` changes
4. Deploy full rollback

**Rollback Decision Matrix:**
- If rollback needed in Batch 1-2: Isolated fix, 1-hour deploy
- If rollback needed in Batch 3+: Full revert, 2-4 hour deploy

---

## 10. Documentation Updates Required

### 10.1 Code Documentation

- [ ] Update `MeteoraApiClient` JSDoc comments with DAMM methods
- [ ] Update `MeteoraAdapter` JSDoc comments with DAMM support
- [ ] Add migration notes to MIGRATION_AUDIT.md
- [ ] Update meteora-api-comparison.md with completion status

### 10.2 Architecture Documentation

- [ ] Update SystemDesign.md with DAMM support details
- [ ] Update adapter interface documentation
- [ ] Add DAMM pool type to pool.types.ts documentation

### 10.3 Developer Guides

- [ ] Add "Migrating Legacy Services" guide
- [ ] Update "Adding New DEX" guide with DAMM patterns
- [ ] Add troubleshooting section for pool type issues

---

## 11. Appendix

### 11.1 Full Method Signature Reference

```typescript
// services/meteora/pool.service.ts - LEGACY (TO BE DELETED)

export class MeteoraPoolService {
  async getDlmmPoolInfo(poolAddress: string): Promise<MeteoraDlmmPoolResponse>;
  async getDammV1PoolInfo(poolId: string): Promise<MeteoraDammV1PoolResponse>;
  async getDammV2PoolInfo(poolId: string): Promise<MeteoraDammV2PoolResponse>;
  async getPoolInfo(poolId: string, poolType: MeteoraPoolType): Promise<MeteoraPoolData>;
  async getPositionClaimFees(positionAddress: string): Promise<DlmmClaimFee[]>;
  async getPositionClaimRewards(positionAddress: string): Promise<DlmmClaimReward[]>;
  async getPositionDeposits(positionAddress: string): Promise<DlmmDepositWithdraw[]>;
  async getPositionWithdraws(positionAddress: string): Promise<DlmmDepositWithdraw[]>;
  async getAllDlmmPools(params: DlmmPoolsPaginationParams): Promise<MeteoraDlmmPoolsPaginationResponse>;
}

export function mapDlmmToMeteoraPoolData(data: MeteoraDlmmPoolResponse): MeteoraPoolData;
export function mapDammV1ToMeteoraPoolData(data: MeteoraDammV1PoolResponse): MeteoraPoolData;
export function mapDammV2ToMeteoraPoolData(data: MeteoraDammV2PoolResponse["data"]): MeteoraPoolData;

export const meteoraPoolService = new MeteoraPoolService();
```

### 11.2 Consumer File Locations

```
Active Consumers:
├── apps/bot/src/services/pool.service.ts (1 method: getPoolInfo)
└── apps/bot/src/services/portfolio.service.ts (4 methods: position APIs)

Dead Consumers (commented out):
└── apps/bot/src/services/trending.service.ts (1 method: getAllDlmmPools)
```

### 11.3 Related Documentation

- **MIGRATION_AUDIT.md** - Overall migration audit with file inventory
- **meteora-api-comparison.md** - API client comparison and consolidation plan
- **SystemDesign.md** - Adapter pattern architecture documentation
- **task-2.2-completion-summary.md** - Prior task completion notes

---

## 12. Conclusion

This updated audit has comprehensively analyzed the legacy Meteora service files and clarifies the migration strategy given the current state of `MeteoraApiClient`. The key findings are:

1. **pool.service.ts** is actively used but can be **deleted** (not moved) after consumers migrate to adapter layer in 6 batches
2. **position.service.ts** is entirely dead code and ready for immediate deletion
3. **MeteoraApiClient already implements ALL methods** from legacy services, including full DAMM v1/v2 support
4. Mapper functions should become private methods in `MeteoraAdapter` returning `UnifiedPool` instead of `MeteoraPoolData`
5. `types/meteora.types.ts` contains legacy/conflicting types (`MeteoraPoolData`, `MeteoraDlmmPosition`) that should be deprecated and removed
6. **Method naming improvements needed:** `getDlmmPoolInfo` → `getDlmmPool` for consistency across adapters
7. Estimated total migration time: **5-8 days (1-2 weeks)** — shorter timeline due to pre-existing DAMM support

The migration plan aligns with the existing task structure in MIGRATION_AUDIT.md and follows the adapter pattern established in the System Design Document. The legacy services should be removed after consumer migration, not moved to the adapter directory.

**Status:** ✅ Audit Complete - Ready for Migration Ticket Creation  
**Next Steps:**
1. Review and approve updated audit document
2. Create GitHub issues for each batch (6 tickets)
3. Begin Batch 1 (Dead Code Removal) immediately
4. Schedule Batches 2-6 across upcoming sprints
5. Mark legacy types as `@deprecated` in `types/meteora.types.ts`
6. Plan type file split into SDK, API, and params files (long-term cleanup)
