# Meteora Service Audit: pool.service.ts & position.service.ts

**Date:** 2025-01-XX  
**Scope:** Task 3.2 - Legacy Service Audit  
**Status:** Complete

---

## Executive Summary

This document provides a comprehensive audit of the legacy Meteora service files (`pool.service.ts` and `position.service.ts`) as part of the adapter-based architecture migration. The audit catalogs all exported methods, parameters, return types, side effects, and usage sites to inform migration planning.

### Key Findings

1. **pool.service.ts (369 LOC):** Active legacy service with 9 exported methods and 3 mapper functions used across 3 consumer files
2. **position.service.ts (29 LOC):** Entirely commented out, exports nothing, confirmed dead code ready for deletion
3. **Primary Consumer:** `PoolService` (services/pool.service.ts) is the main consumer of MeteoraPoolService
4. **Secondary Consumer:** `PortfolioService` (services/portfolio.service.ts) uses position-related API methods
5. **Tertiary Consumer:** Commented-out `TrendingService` references `getAllDlmmPools` (dead code)
6. **Migration Status:** All methods are DEX-specific and should migrate to `MeteoraAdapter` or `MeteoraApiClient`

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

## 3. Categorization Matrix

### 3.1 Method Classification Table

| # | Method | Classification | Current Consumers | Target Destination | Migration Readiness |
|---|--------|---------------|-------------------|-------------------|---------------------|
| 1 | `getDlmmPoolInfo()` | DEX-specific API | None (internal only) | `MeteoraApiClient.getPool()` | ✅ Ready (duplicate exists) |
| 2 | `getDammV1PoolInfo()` | DEX-specific API | None (internal only) | `MeteoraApiClient.getDammV1Pool()` | ⚠️ Blocked (not in client) |
| 3 | `getDammV2PoolInfo()` | DEX-specific API | None (internal only) | `MeteoraApiClient.getDammV2Pool()` | ⚠️ Blocked (not in client) |
| 4 | `getPoolInfo()` | Business logic | `PoolService.getPool()` | `MeteoraAdapter.getPool()` | ⚠️ Partial (DLMM ready, DAMM blocked) |
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

### 4.1 Missing Implementations in MeteoraApiClient

| Missing Method | Required For | Priority | Estimated Effort |
|----------------|--------------|----------|------------------|
| `getDammV1Pool(poolId: string)` | DAMM v1 support | P1 | 2-3 days |
| `getDammV2Pool(poolId: string)` | DAMM v2 support | P1 | 2-3 days |

**Note:** Position-related methods (`getPositionClaimFees`, etc.) already exist in the latest `MeteoraApiClient` per comparison document.

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

#### Batch 3: Add DAMM Support to MeteoraApiClient (P1)

**Target:** Methods 2-3 (DAMM v1/v2 pool fetchers)

**Actions:**
1. Add `getDammV1Pool()` to `MeteoraApiClient`:
   ```typescript
   async getDammV1Pool(poolId: string): Promise<MeteoraDammV1PoolResponse> {
     const url = `${this.dammV1ApiUrl}/pools?address=${poolId}&unknown=true&pool_type=dynamic&is_monitoring=true`;
     const data = await api.getWithRetry<MeteoraDammV1PoolResponse[]>(url, this.retries);
     return data[0];
   }
   ```
2. Add `getDammV2Pool()` to `MeteoraApiClient`:
   ```typescript
   async getDammV2Pool(poolId: string): Promise<MeteoraDammV2PoolResponse> {
     const data = await api.getWithRetry<MeteoraDammV2PoolResponse>(
       `${this.dammV2ApiUrl}/pools/${poolId}`,
       this.retries
     );
     return data;
   }
   ```
3. Add DAMM API URLs to `MeteoraApiClient` constructor (read from `getDexConfig()`)
4. Add circuit breaker support (per Task 2.1 in meteora-api-comparison.md)
5. Test DAMM pool fetching

**Prerequisites:** None  
**Estimated Effort:** 2-3 days (includes circuit breaker + caching)  
**Risk:** Medium (new functionality, needs testing)  
**Ticket Alignment:** Task 2.1 (Enhance MeteoraApiClient) per meteora-api-comparison.md

---

#### Batch 4: Migrate Mappers to MeteoraAdapter (P1)

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

**Prerequisites:**
- Batch 3 complete (DAMM support in client)

**Estimated Effort:** 1-2 days  
**Risk:** Low (pure refactor)  
**Ticket Alignment:** Task 3.2 (Deprecate MeteoraPoolService) per MIGRATION_AUDIT.md

---

#### Batch 5: Enhance MeteoraAdapter with DAMM Support (P1)

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
- Batch 3 complete (DAMM in client)
- Batch 4 complete (mappers migrated)

**Estimated Effort:** 1-2 days  
**Risk:** Low (extends existing pattern)  
**Ticket Alignment:** Task 3.1 (Migrate PoolService Logic) per MIGRATION_AUDIT.md

---

#### Batch 6: Update PoolService Consumer (P2)

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
- Batch 5 complete (adapter enhanced)

**Estimated Effort:** 1-2 hours  
**Risk:** Low (simple delegation change)  
**Ticket Alignment:** Task 3.1 (Migrate PoolService Logic) per MIGRATION_AUDIT.md

---

#### Batch 7: Delete MeteoraPoolService (P2)

**Target:** `services/meteora/pool.service.ts`

**Actions:**
1. Verify no remaining imports of `meteoraPoolService` (grep)
2. Verify no remaining imports of mapper functions (grep)
3. Delete file
4. Remove from documentation references

**Prerequisites:**
- Batch 2 complete (PortfolioService migrated)
- Batch 6 complete (PoolService migrated)
- No other consumers found

**Estimated Effort:** 1 hour  
**Risk:** Low (if prerequisites met)  
**Ticket Alignment:** Task 3.2 (Deprecate MeteoraPoolService) per MIGRATION_AUDIT.md

---

### 5.3 Migration Timeline

```
Week 1: Batch 1 (Dead Code) + Batch 2 (Position API)
        └── 1-2 days total

Week 2: Batch 3 (DAMM Support in Client)
        └── 2-3 days

Week 3: Batch 4 (Mappers) + Batch 5 (Adapter DAMM)
        └── 2-4 days total

Week 4: Batch 6 (PoolService Update) + Batch 7 (Deletion)
        └── 1 day total

Total Estimated Time: 6-10 days (1.5-2 sprint weeks)
```

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

This audit has comprehensively analyzed the legacy Meteora service files and provides a clear migration path forward. The key findings are:

1. **pool.service.ts** is actively used but can be cleanly migrated to the adapter layer in 7 batches
2. **position.service.ts** is entirely dead code and ready for immediate deletion
3. Position API methods already exist in the new `MeteoraApiClient` (ready for migration)
4. DAMM v1/v2 support needs to be added to `MeteoraApiClient` before full migration
5. Mapper functions should become private methods in `MeteoraAdapter`
6. Estimated total migration time: 6-10 days (1.5-2 weeks)

The migration plan aligns with the existing task structure in MIGRATION_AUDIT.md and follows the adapter pattern established in the System Design Document.

**Status:** ✅ Audit Complete - Ready for Migration Ticket Creation  
**Next Steps:**
1. Review and approve audit document
2. Create GitHub issues for each batch (7 tickets)
3. Begin Batch 1 (Dead Code Removal) immediately
4. Schedule Batches 2-7 across upcoming sprints
