# Adding DEX Adapters Guide

## Table of Contents
- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Integration Checklist](#integration-checklist)
- [Step-by-Step Implementation](#step-by-step-implementation)
- [Testing Your Adapter](#testing-your-adapter)
- [Deployment & Rollout](#deployment--rollout)
- [Example: Orca Integration](#example-orca-integration)
- [Troubleshooting](#troubleshooting)

## Overview

This guide walks you through adding support for a new DEX protocol to the Meteora Liquidity Bot. The bot uses an adapter pattern that provides a unified interface across different DEX protocols, making it straightforward to add new integrations while maintaining consistency.

### What You'll Build

A DEX adapter that implements:
- Pool discovery and trending lists
- Position creation and management
- Fee claiming and position closing
- Portfolio aggregation
- Price and liquidity data fetching

### Estimated Timeline

| Complexity | Timeline | Examples |
|------------|----------|----------|
| **Low** (Standard AMM) | 2-3 weeks | Raydium Standard Pool |
| **Medium** (DLMM/Concentrated) | 4-6 weeks | Meteora, Saros, Orca Whirlpools |
| **High** (Order Book/Novel) | 8-12 weeks | Phoenix, Drift |

## Prerequisites

### Required Knowledge
- ✅ TypeScript and async/await patterns
- ✅ Solana blockchain basics (accounts, transactions, instructions)
- ✅ The target DEX's SDK or on-chain program
- ✅ Basic understanding of liquidity pools and AMMs

### Tools & Resources
- Target DEX's SDK (if available)
- DEX documentation and API endpoints
- Solana program IDL (if using Anchor)
- Test wallets with funded positions on devnet

### Codebase Familiarity
Read these before starting:
- [System Design](../apps/bot/docs/SystemDesign.md#multi-dex-extensibility)
- [Existing DEX Adapters](../apps/bot/src/services/)
- [Flow State Machine Guide](./flow-state-machine-guide.md)

## Integration Checklist

### Phase 1: Research & Planning
- [ ] Review DEX documentation and SDK
- [ ] Identify pool types supported (DLMM, CPMM, etc.)
- [ ] Map DEX concepts to unified data models
- [ ] Determine if API endpoints exist for pool data
- [ ] Test SDK locally with sample pool addresses
- [ ] Document any DEX-specific quirks or limitations

### Phase 2: Core Implementation
- [ ] Create adapter directory structure
- [ ] Implement `IDexAdapter` interface
- [ ] Add DEX-specific service classes
- [ ] Transform DEX data models to unified models
- [ ] Implement transaction builders
- [ ] Add error handling and retries

### Phase 3: Testing
- [ ] Write unit tests for adapter
- [ ] Write integration tests with real pool data
- [ ] Test position creation on devnet
- [ ] Test fee claiming and position closing
- [ ] Verify portfolio aggregation
- [ ] Load test with multiple pools

### Phase 4: UI Integration
- [ ] Add DEX logo and branding
- [ ] Update pool selection UIs
- [ ] Add DEX filter options
- [ ] Update trending pools display
- [ ] Add DEX-specific help text

### Phase 5: Deployment
- [ ] Deploy to staging environment
- [ ] Test with real users on devnet
- [ ] Deploy to production with feature flag
- [ ] Monitor for errors and issues
- [ ] Gradually roll out to all users
- [ ] Update documentation

## Step-by-Step Implementation

### Step 1: Create Directory Structure

Create a new directory for your DEX:

```bash
cd apps/bot/src/services/
mkdir orca
cd orca
```

Create these files:

```
orca/
├── orca.adapter.ts          # Main adapter implementation
├── orca.service.ts           # Core DEX interaction logic
├── orca.types.ts             # DEX-specific type definitions
├── orca.transformers.ts      # Data transformation utilities
├── orca.errors.ts            # DEX-specific error classes
└── __tests__/
    ├── orca.adapter.test.ts
    └── orca.service.test.ts
```

### Step 2: Define DEX-Specific Types

```typescript
// orca.types.ts
import { PublicKey } from '@solana/web3.js';

/**
 * Orca pool data structure from their API/SDK
 */
export interface OrcaWhirlpool {
  address: PublicKey;
  whirlpoolsConfig: PublicKey;
  tokenMintA: PublicKey;
  tokenMintB: PublicKey;
  tokenVaultA: PublicKey;
  tokenVaultB: PublicKey;
  tickSpacing: number;
  tickCurrentIndex: number;
  sqrtPrice: bigint;
  liquidity: bigint;
  feeRate: number;
  protocolFeeRate: number;
  // ... other Orca-specific fields
}

/**
 * Orca position data structure
 */
export interface OrcaPosition {
  positionAddress: PublicKey;
  whirlpool: PublicKey;
  positionMint: PublicKey;
  liquidity: bigint;
  tickLowerIndex: number;
  tickUpperIndex: number;
  feeOwedA: bigint;
  feeOwedB: bigint;
  // ... other position fields
}

/**
 * Configuration for Orca adapter
 */
export interface OrcaAdapterConfig {
  rpcUrl: string;
  apiBaseUrl?: string;
  priorityFeeMultiplier?: number;
}
```

### Step 3: Create Core Service

```typescript
// orca.service.ts
import { Connection, PublicKey } from '@solana/web3.js';
import { WhirlpoolContext, buildWhirlpoolClient } from '@orca-so/whirlpools-sdk';
import { OrcaWhirlpool, OrcaPosition } from './orca.types';

/**
 * Core service for interacting with Orca protocol
 */
export class OrcaService {
  private connection: Connection;
  private whirlpoolClient: ReturnType<typeof buildWhirlpoolClient>;
  
  constructor(connection: Connection) {
    this.connection = connection;
    
    // Initialize Orca SDK client
    const context = WhirlpoolContext.withProvider(
      {
        connection,
        // Add wallet adapter if needed
      },
      ORCA_WHIRLPOOL_PROGRAM_ID
    );
    
    this.whirlpoolClient = buildWhirlpoolClient(context);
  }
  
  /**
   * Fetch a single whirlpool by address
   */
  async getPool(poolAddress: string): Promise<OrcaWhirlpool> {
    const pubkey = new PublicKey(poolAddress);
    const pool = await this.whirlpoolClient.getPool(pubkey);
    
    if (!pool) {
      throw new Error(`Orca pool not found: ${poolAddress}`);
    }
    
    return pool.getData();
  }
  
  /**
   * Fetch all whirlpools (with pagination if needed)
   */
  async getAllPools(): Promise<OrcaWhirlpool[]> {
    // Option 1: Use SDK if available
    const pools = await this.whirlpoolClient.listPools();
    
    // Option 2: Use API endpoint if available
    // const response = await fetch('https://api.orca.so/v1/whirlpools');
    // const pools = await response.json();
    
    return pools;
  }
  
  /**
   * Fetch user positions for a given whirlpool
   */
  async getUserPositions(
    userAddress: string,
    poolAddress?: string
  ): Promise<OrcaPosition[]> {
    const userPubkey = new PublicKey(userAddress);
    
    if (poolAddress) {
      // Get positions for specific pool
      const poolPubkey = new PublicKey(poolAddress);
      return this.whirlpoolClient.getUserPositions(userPubkey, poolPubkey);
    } else {
      // Get all user positions
      return this.whirlpoolClient.getUserPositions(userPubkey);
    }
  }
  
  /**
   * Build instructions for creating a position
   */
  async buildCreatePositionInstructions(params: {
    userAddress: string;
    poolAddress: string;
    tickLowerIndex: number;
    tickUpperIndex: number;
    liquidityAmount: bigint;
  }) {
    const { userAddress, poolAddress, tickLowerIndex, tickUpperIndex, liquidityAmount } = params;
    
    const userPubkey = new PublicKey(userAddress);
    const poolPubkey = new PublicKey(poolAddress);
    
    // Use Orca SDK to build instructions
    const instructions = await this.whirlpoolClient.openPositionInstructions({
      owner: userPubkey,
      whirlpool: poolPubkey,
      tickLowerIndex,
      tickUpperIndex,
      liquidityAmount,
    });
    
    return instructions;
  }
  
  /**
   * Build instructions for claiming fees
   */
  async buildClaimFeesInstructions(params: {
    userAddress: string;
    positionAddress: string;
  }) {
    const { userAddress, positionAddress } = params;
    
    const userPubkey = new PublicKey(userAddress);
    const positionPubkey = new PublicKey(positionAddress);
    
    const instructions = await this.whirlpoolClient.collectFeesInstructions({
      owner: userPubkey,
      position: positionPubkey,
    });
    
    return instructions;
  }
  
  /**
   * Build instructions for closing a position
   */
  async buildClosePositionInstructions(params: {
    userAddress: string;
    positionAddress: string;
  }) {
    const { userAddress, positionAddress } = params;
    
    const userPubkey = new PublicKey(userAddress);
    const positionPubkey = new PublicKey(positionAddress);
    
    const instructions = await this.whirlpoolClient.closePositionInstructions({
      owner: userPubkey,
      position: positionPubkey,
    });
    
    return instructions;
  }
}
```

### Step 4: Create Data Transformers

```typescript
// orca.transformers.ts
import { UnifiedPool, UnifiedPosition, Token } from '@/types/dex.types';
import { OrcaWhirlpool, OrcaPosition } from './orca.types';

/**
 * Transform Orca pool to unified format
 */
export function transformOrcaPoolToUnified(
  orcaPool: OrcaWhirlpool,
  tokenAMetadata: Token,
  tokenBMetadata: Token
): UnifiedPool {
  // Calculate price from sqrtPrice
  const price = calculatePriceFromSqrtPrice(orcaPool.sqrtPrice);
  
  // Calculate TVL from liquidity
  const tvl = calculateTVL(orcaPool.liquidity, price, tokenAMetadata, tokenBMetadata);
  
  // Calculate APR from fee rate and volume
  const apr = calculateAPR(orcaPool.feeRate, tvl, orcaPool.volume24h);
  
  return {
    id: orcaPool.address.toString(),
    address: orcaPool.address.toString(),
    name: `${tokenAMetadata.symbol}-${tokenBMetadata.symbol}`,
    dex: 'orca',
    type: 'CONCENTRATED', // Whirlpools are concentrated liquidity
    
    tokenA: tokenAMetadata,
    tokenB: tokenBMetadata,
    
    currentPrice: price,
    liquidity: orcaPool.liquidity.toString(),
    tvl: tvl.toString(),
    apr: apr,
    apy: calculateAPY(apr), // Convert APR to APY
    
    volume24h: orcaPool.volume24h,
    fees24h: orcaPool.fees24h,
    feeTvlRatio24h: orcaPool.fees24h / tvl,
    
    isVerified: tokenAMetadata.isVerified && tokenBMetadata.isVerified,
    
    // Store Orca-specific data for reference
    metadata: {
      tickSpacing: orcaPool.tickSpacing,
      feeRate: orcaPool.feeRate,
      protocolFeeRate: orcaPool.protocolFeeRate,
    },
  };
}

/**
 * Transform Orca position to unified format
 */
export function transformOrcaPositionToUnified(
  orcaPosition: OrcaPosition,
  pool: UnifiedPool,
  currentPrice: number
): UnifiedPosition {
  // Calculate token amounts from liquidity and tick range
  const { tokenAAmount, tokenBAmount } = calculateTokenAmountsFromLiquidity(
    orcaPosition.liquidity,
    orcaPosition.tickLowerIndex,
    orcaPosition.tickUpperIndex,
    currentPrice
  );
  
  // Calculate USD values
  const tokenAValueUsd = parseFloat(tokenAAmount) * pool.tokenA.priceUsd;
  const tokenBValueUsd = parseFloat(tokenBAmount) * pool.tokenB.priceUsd;
  const currentValueUsd = tokenAValueUsd + tokenBValueUsd;
  
  // Calculate fee values
  const feeAValueUsd = parseFloat(orcaPosition.feeOwedA.toString()) * pool.tokenA.priceUsd;
  const feeBValueUsd = parseFloat(orcaPosition.feeOwedB.toString()) * pool.tokenB.priceUsd;
  const unclaimedFeesUsd = feeAValueUsd + feeBValueUsd;
  
  // Check if position is in range
  const inRange = isPositionInRange(
    currentPrice,
    orcaPosition.tickLowerIndex,
    orcaPosition.tickUpperIndex
  );
  
  return {
    id: orcaPosition.positionAddress.toString(),
    address: orcaPosition.positionAddress.toString(),
    poolAddress: pool.address,
    dex: 'orca',
    type: 'CONCENTRATED',
    
    tokenA: pool.tokenA,
    tokenB: pool.tokenB,
    
    tokenAAmount: tokenAAmount,
    tokenBAmount: tokenBAmount,
    
    currentValueUsd: currentValueUsd,
    initialValueUsd: 0, // This needs to be fetched from our database
    
    unclaimedFeesUsd: unclaimedFeesUsd,
    claimedFeesUsd: 0, // This needs to be fetched from our database
    
    pnlUsd: 0, // Will be calculated by position service
    pnlPercentage: 0,
    
    inRange: inRange,
    isActive: orcaPosition.liquidity > 0n,
    
    createdAt: new Date(), // This needs to be fetched from our database
    updatedAt: new Date(),
    
    metadata: {
      tickLowerIndex: orcaPosition.tickLowerIndex,
      tickUpperIndex: orcaPosition.tickUpperIndex,
      liquidity: orcaPosition.liquidity.toString(),
    },
  };
}

// Helper functions
function calculatePriceFromSqrtPrice(sqrtPrice: bigint): number {
  // Orca uses sqrtPrice in Q64.64 fixed-point format
  const Q64 = 2n ** 64n;
  const price = (sqrtPrice * sqrtPrice) / Q64;
  return Number(price) / Number(Q64);
}

function calculateTVL(
  liquidity: bigint,
  price: number,
  tokenA: Token,
  tokenB: Token
): number {
  // Simplified TVL calculation
  // In reality, you'd need more context about the pool's tick range
  const liquidityUsd = Number(liquidity) * price;
  return liquidityUsd;
}

function calculateAPR(
  feeRate: number,
  tvl: number,
  volume24h: number
): number {
  if (tvl === 0) return 0;
  const dailyFees = volume24h * feeRate;
  const dailyYield = dailyFees / tvl;
  return dailyYield * 365 * 100; // Convert to annual percentage
}

function calculateAPY(apr: number): number {
  // APY = (1 + APR/365)^365 - 1
  return (Math.pow(1 + apr / 100 / 365, 365) - 1) * 100;
}

function calculateTokenAmountsFromLiquidity(
  liquidity: bigint,
  tickLower: number,
  tickUpper: number,
  currentPrice: number
): { tokenAAmount: string; tokenBAmount: string } {
  // This is a complex calculation based on concentrated liquidity math
  // Use Orca SDK utilities if available
  // Simplified version:
  return {
    tokenAAmount: (Number(liquidity) / currentPrice).toFixed(9),
    tokenBAmount: (Number(liquidity) * currentPrice).toFixed(9),
  };
}

function isPositionInRange(
  currentPrice: number,
  tickLower: number,
  tickUpper: number
): boolean {
  // Convert ticks to prices
  const priceLower = Math.pow(1.0001, tickLower);
  const priceUpper = Math.pow(1.0001, tickUpper);
  
  return currentPrice >= priceLower && currentPrice <= priceUpper;
}
```

### Step 5: Implement the Adapter

```typescript
// orca.adapter.ts
import { Connection, PublicKey, TransactionInstruction } from '@solana/web3.js';
import { IDexAdapter } from '@/types/dex-adapter.interface';
import {
  UnifiedPool,
  UnifiedPosition,
  PaginatedTrendingPools,
  TrendingParams,
  CreatePositionParams,
  TransactionResult,
  DexType,
  UrlParseResult,
} from '@/types/dex.types';
import { OrcaService } from './orca.service';
import {
  transformOrcaPoolToUnified,
  transformOrcaPositionToUnified,
} from './orca.transformers';
import { logger } from '@/utils/logger';

/**
 * Orca DEX Adapter
 * 
 * Integrates Orca Whirlpools (concentrated liquidity) with the unified DEX interface.
 */
export class OrcaAdapter implements IDexAdapter {
  readonly dexType: DexType = 'orca';
  readonly name: string = 'Orca';
  readonly isEnabled: boolean = true;
  
  private orcaService: OrcaService;
  private connection: Connection;
  
  constructor(connection: Connection) {
    this.connection = connection;
    this.orcaService = new OrcaService(connection);
  }
  
  /**
   * Get a single pool by address
   */
  async getPool(poolId: string): Promise<UnifiedPool> {
    try {
      logger.info({ poolId, dex: 'orca' }, 'Fetching Orca pool');
      
      const orcaPool = await this.orcaService.getPool(poolId);
      
      // Fetch token metadata
      const [tokenAMetadata, tokenBMetadata] = await Promise.all([
        this.getTokenMetadata(orcaPool.tokenMintA.toString()),
        this.getTokenMetadata(orcaPool.tokenMintB.toString()),
      ]);
      
      const unifiedPool = transformOrcaPoolToUnified(
        orcaPool,
        tokenAMetadata,
        tokenBMetadata
      );
      
      logger.info({ poolId, dex: 'orca' }, 'Successfully fetched Orca pool');
      return unifiedPool;
    } catch (error) {
      logger.error({ error, poolId, dex: 'orca' }, 'Failed to fetch Orca pool');
      throw error;
    }
  }
  
  /**
   * Get trending pools with pagination
   */
  async getTrendingPools(params?: TrendingParams): Promise<PaginatedTrendingPools> {
    try {
      const page = params?.page || 1;
      const limit = params?.limit || 10;
      const sortBy = params?.sortBy || 'tvl';
      
      logger.info({ page, limit, sortBy, dex: 'orca' }, 'Fetching trending Orca pools');
      
      // Fetch all pools
      const allPools = await this.orcaService.getAllPools();
      
      // Transform to unified format
      const unifiedPools = await Promise.all(
        allPools.map(async (orcaPool) => {
          const [tokenAMetadata, tokenBMetadata] = await Promise.all([
            this.getTokenMetadata(orcaPool.tokenMintA.toString()),
            this.getTokenMetadata(orcaPool.tokenMintB.toString()),
          ]);
          
          return transformOrcaPoolToUnified(orcaPool, tokenAMetadata, tokenBMetadata);
        })
      );
      
      // Sort pools
      const sortedPools = this.sortPools(unifiedPools, sortBy);
      
      // Paginate
      const startIndex = (page - 1) * limit;
      const endIndex = startIndex + limit;
      const paginatedPools = sortedPools.slice(startIndex, endIndex);
      
      const totalPages = Math.ceil(sortedPools.length / limit);
      
      logger.info(
        { page, limit, total: sortedPools.length, dex: 'orca' },
        'Successfully fetched trending Orca pools'
      );
      
      return {
        pools: paginatedPools,
        currentPage: page,
        totalPages,
        sortBy,
      };
    } catch (error) {
      logger.error({ error, dex: 'orca' }, 'Failed to fetch trending Orca pools');
      throw error;
    }
  }
  
  /**
   * Search pools by token address or symbol
   */
  async searchPools(query: string): Promise<UnifiedPool[]> {
    try {
      logger.info({ query, dex: 'orca' }, 'Searching Orca pools');
      
      const allPools = await this.orcaService.getAllPools();
      
      // Filter pools that contain the query token
      const matchingPools = allPools.filter((pool) => {
        const tokenAAddress = pool.tokenMintA.toString().toLowerCase();
        const tokenBAddress = pool.tokenMintB.toString().toLowerCase();
        const queryLower = query.toLowerCase();
        
        return tokenAAddress.includes(queryLower) || tokenBAddress.includes(queryLower);
      });
      
      // Transform to unified format
      const unifiedPools = await Promise.all(
        matchingPools.map(async (orcaPool) => {
          const [tokenAMetadata, tokenBMetadata] = await Promise.all([
            this.getTokenMetadata(orcaPool.tokenMintA.toString()),
            this.getTokenMetadata(orcaPool.tokenMintB.toString()),
          ]);
          
          return transformOrcaPoolToUnified(orcaPool, tokenAMetadata, tokenBMetadata);
        })
      );
      
      logger.info(
        { query, matches: unifiedPools.length, dex: 'orca' },
        'Successfully searched Orca pools'
      );
      
      return unifiedPools;
    } catch (error) {
      logger.error({ error, query, dex: 'orca' }, 'Failed to search Orca pools');
      throw error;
    }
  }
  
  /**
   * Get user positions
   */
  async getUserPositions(userAddress: string): Promise<UnifiedPosition[]> {
    try {
      logger.info({ userAddress, dex: 'orca' }, 'Fetching Orca user positions');
      
      const orcaPositions = await this.orcaService.getUserPositions(userAddress);
      
      // Transform each position
      const unifiedPositions = await Promise.all(
        orcaPositions.map(async (orcaPosition) => {
          // Fetch pool data for the position
          const pool = await this.getPool(orcaPosition.whirlpool.toString());
          
          return transformOrcaPositionToUnified(
            orcaPosition,
            pool,
            pool.currentPrice
          );
        })
      );
      
      logger.info(
        { userAddress, count: unifiedPositions.length, dex: 'orca' },
        'Successfully fetched Orca user positions'
      );
      
      return unifiedPositions;
    } catch (error) {
      logger.error({ error, userAddress, dex: 'orca' }, 'Failed to fetch Orca user positions');
      throw error;
    }
  }
  
  /**
   * Get a single position
   */
  async getPosition(positionAddress: string): Promise<UnifiedPosition> {
    try {
      logger.info({ positionAddress, dex: 'orca' }, 'Fetching Orca position');
      
      // Fetch position data
      // Note: This depends on Orca SDK API
      const orcaPosition = await this.orcaService.getPosition(positionAddress);
      
      // Fetch pool data
      const pool = await this.getPool(orcaPosition.whirlpool.toString());
      
      const unifiedPosition = transformOrcaPositionToUnified(
        orcaPosition,
        pool,
        pool.currentPrice
      );
      
      logger.info({ positionAddress, dex: 'orca' }, 'Successfully fetched Orca position');
      return unifiedPosition;
    } catch (error) {
      logger.error({ error, positionAddress, dex: 'orca' }, 'Failed to fetch Orca position');
      throw error;
    }
  }
  
  /**
   * Create a new position
   */
  async createPosition(params: CreatePositionParams): Promise<TransactionResult> {
    try {
      logger.info({ params, dex: 'orca' }, 'Creating Orca position');
      
      // Calculate tick range based on strategy
      const { tickLowerIndex, tickUpperIndex } = this.calculateTickRange(
        params.strategy,
        params.pool,
        params.priceRange
      );
      
      // Calculate liquidity amount
      const liquidityAmount = this.calculateLiquidityAmount(
        params.tokenAAmount,
        params.tokenBAmount,
        tickLowerIndex,
        tickUpperIndex
      );
      
      // Build instructions
      const instructions = await this.orcaService.buildCreatePositionInstructions({
        userAddress: params.userAddress,
        poolAddress: params.poolAddress,
        tickLowerIndex,
        tickUpperIndex,
        liquidityAmount,
      });
      
      logger.info({ params, dex: 'orca' }, 'Successfully built Orca position creation instructions');
      
      return {
        success: true,
        instructions: instructions.instructions,
        positionAddress: instructions.positionMint.toString(),
      };
    } catch (error) {
      logger.error({ error, params, dex: 'orca' }, 'Failed to create Orca position');
      throw error;
    }
  }
  
  /**
   * Close a position
   */
  async closePosition(positionAddress: string): Promise<TransactionResult> {
    try {
      logger.info({ positionAddress, dex: 'orca' }, 'Closing Orca position');
      
      // Build close instructions
      const instructions = await this.orcaService.buildClosePositionInstructions({
        userAddress: this.getUserAddress(), // Get from context
        positionAddress,
      });
      
      logger.info({ positionAddress, dex: 'orca' }, 'Successfully built Orca position close instructions');
      
      return {
        success: true,
        instructions: instructions.instructions,
      };
    } catch (error) {
      logger.error({ error, positionAddress, dex: 'orca' }, 'Failed to close Orca position');
      throw error;
    }
  }
  
  /**
   * Claim fees from a position
   */
  async claimFees(positionAddress: string): Promise<TransactionResult> {
    try {
      logger.info({ positionAddress, dex: 'orca' }, 'Claiming fees from Orca position');
      
      // Build claim instructions
      const instructions = await this.orcaService.buildClaimFeesInstructions({
        userAddress: this.getUserAddress(), // Get from context
        positionAddress,
      });
      
      logger.info({ positionAddress, dex: 'orca' }, 'Successfully built Orca fee claim instructions');
      
      return {
        success: true,
        instructions: instructions.instructions,
      };
    } catch (error) {
      logger.error({ error, positionAddress, dex: 'orca' }, 'Failed to claim fees from Orca position');
      throw error;
    }
  }
  
  /**
   * Rebalance a position (close old + create new)
   */
  async rebalancePosition(
    positionAddress: string,
    params: RebalanceParams
  ): Promise<TransactionResult> {
    try {
      logger.info({ positionAddress, params, dex: 'orca' }, 'Rebalancing Orca position');
      
      // This is typically a two-step process:
      // 1. Close old position
      // 2. Create new position with updated range
      // The flow state machine will coordinate these steps
      
      // For now, just return success
      // The actual implementation will be in the rebalance flow
      
      return {
        success: true,
        message: 'Rebalancing initiated',
      };
    } catch (error) {
      logger.error({ error, positionAddress, params, dex: 'orca' }, 'Failed to rebalance Orca position');
      throw error;
    }
  }
  
  /**
   * Get user's portfolio aggregated across all positions
   */
  async getUserPortfolio(userAddress: string): Promise<UnifiedPortfolio> {
    try {
      logger.info({ userAddress, dex: 'orca' }, 'Fetching Orca user portfolio');
      
      const positions = await this.getUserPositions(userAddress);
      
      const totalValueUsd = positions.reduce((sum, pos) => sum + pos.currentValueUsd, 0);
      const totalPnlUsd = positions.reduce((sum, pos) => sum + pos.pnlUsd, 0);
      const totalFeesUsd = positions.reduce(
        (sum, pos) => sum + pos.unclaimedFeesUsd + pos.claimedFeesUsd,
        0
      );
      
      logger.info(
        { userAddress, positionCount: positions.length, totalValueUsd, dex: 'orca' },
        'Successfully fetched Orca user portfolio'
      );
      
      return {
        userAddress,
        positions,
        totalValueUsd,
        totalPnlUsd,
        totalFeesUsd,
        dexBreakdown: {
          orca: {
            positions: positions.length,
            valueUsd: totalValueUsd,
            pnlUsd: totalPnlUsd,
          },
        },
      };
    } catch (error) {
      logger.error({ error, userAddress, dex: 'orca' }, 'Failed to fetch Orca user portfolio');
      throw error;
    }
  }
  
  /**
   * Parse Orca pool URL
   */
  parsePoolUrl(url: string): UrlParseResult | null {
    // Example URL: https://www.orca.so/pools?pool=SOL-USDC
    const orcaUrlPattern = /https?:\/\/(?:www\.)?orca\.so\/pools\?pool=([A-Za-z0-9-]+)/;
    const match = url.match(orcaUrlPattern);
    
    if (match && match[1]) {
      return {
        dex: 'orca',
        poolId: match[1],
        valid: true,
      };
    }
    
    return null;
  }
  
  /**
   * Check if URL is valid Orca URL
   */
  isValidPoolUrl(url: string): boolean {
    return this.parsePoolUrl(url) !== null;
  }
  
  /**
   * Health check for Orca integration
   */
  async isHealthy(): Promise<boolean> {
    try {
      // Try fetching a known pool or calling a simple API
      const response = await fetch('https://api.orca.so/health');
      return response.ok;
    } catch (error) {
      logger.error({ error, dex: 'orca' }, 'Orca health check failed');
      return false;
    }
  }
  
  // Private helper methods
  
  private sortPools(pools: UnifiedPool[], sortBy: string): UnifiedPool[] {
    switch (sortBy) {
      case 'tvl':
        return pools.sort((a, b) => parseFloat(b.tvl) - parseFloat(a.tvl));
      case 'volume':
        return pools.sort((a, b) => (b.volume24h || 0) - (a.volume24h || 0));
      case 'apy':
        return pools.sort((a, b) => b.apy - a.apy);
      case 'feeTvlRatio':
        return pools.sort((a, b) => (b.feeTvlRatio24h || 0) - (a.feeTvlRatio24h || 0));
      default:
        return pools;
    }
  }
  
  private async getTokenMetadata(mintAddress: string): Promise<Token> {
    // Fetch token metadata from your token service or cache
    // This is a simplified version
    return {
      address: mintAddress,
      symbol: 'TOKEN',
      name: 'Token Name',
      decimals: 9,
      priceUsd: 0,
      isVerified: false,
    };
  }
  
  private calculateTickRange(
    strategy: string,
    pool: UnifiedPool,
    priceRange?: { lower: number; upper: number }
  ): { tickLowerIndex: number; tickUpperIndex: number } {
    // Calculate tick range based on strategy
    // This is simplified; actual implementation depends on strategy details
    
    if (priceRange) {
      return {
        tickLowerIndex: this.priceToTick(priceRange.lower),
        tickUpperIndex: this.priceToTick(priceRange.upper),
      };
    }
    
    // Default: 10% range around current price
    const currentPrice = pool.currentPrice;
    return {
      tickLowerIndex: this.priceToTick(currentPrice * 0.9),
      tickUpperIndex: this.priceToTick(currentPrice * 1.1),
    };
  }
  
  private priceToTick(price: number): number {
    // Convert price to tick index
    // Tick = log(price) / log(1.0001)
    return Math.floor(Math.log(price) / Math.log(1.0001));
  }
  
  private calculateLiquidityAmount(
    tokenAAmount: string,
    tokenBAmount: string,
    tickLowerIndex: number,
    tickUpperIndex: number
  ): bigint {
    // Calculate liquidity from token amounts and tick range
    // This is a complex calculation based on concentrated liquidity math
    // Use Orca SDK utilities if available
    
    // Simplified version:
    const avgAmount = (parseFloat(tokenAAmount) + parseFloat(tokenBAmount)) / 2;
    return BigInt(Math.floor(avgAmount * 1e9));
  }
  
  private getUserAddress(): string {
    // Get user address from context
    // This would typically be passed in params or retrieved from session
    throw new Error('User address not available in context');
  }
}
```

### Step 6: Register Adapter

```typescript
// apps/bot/src/services/dex-registry.service.ts

import { OrcaAdapter } from './orca/orca.adapter';

export class DexRegistry {
  // ... existing code ...
  
  initialize(connection: Connection) {
    // Register existing adapters
    this.register(new MeteoraAdapter(connection));
    this.register(new SarosAdapter(connection));
    
    // Register new Orca adapter
    this.register(new OrcaAdapter(connection));
    
    logger.info('DEX adapters registered successfully');
  }
}
```

### Step 7: Update Configuration

```typescript
// apps/bot/src/config/dex.config.ts

export const DEX_CONFIG = {
  meteora: {
    name: 'Meteora',
    enabled: true,
    apiUrl: 'https://dlmm-api.meteora.ag',
    poolTypes: ['DLMM', 'DAMM'],
  },
  saros: {
    name: 'Saros',
    enabled: true,
    apiUrl: 'https://api.saros.finance',
    poolTypes: ['DLMM'],
  },
  orca: {
    name: 'Orca',
    enabled: true,
    apiUrl: 'https://api.orca.so',
    poolTypes: ['CONCENTRATED', 'STANDARD'],
  },
};
```

## Testing Your Adapter

### Unit Tests

```typescript
// orca/__tests__/orca.adapter.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Connection } from '@solana/web3.js';
import { OrcaAdapter } from '../orca.adapter';

describe('OrcaAdapter', () => {
  let adapter: OrcaAdapter;
  let mockConnection: Connection;
  
  beforeEach(() => {
    mockConnection = new Connection('https://api.devnet.solana.com');
    adapter = new OrcaAdapter(mockConnection);
  });
  
  describe('getPool', () => {
    it('should fetch and transform Orca pool data', async () => {
      const poolAddress = 'KNOWN_ORCA_POOL_ADDRESS';
      const pool = await adapter.getPool(poolAddress);
      
      expect(pool).toBeDefined();
      expect(pool.dex).toBe('orca');
      expect(pool.address).toBe(poolAddress);
      expect(pool.type).toBe('CONCENTRATED');
    });
    
    it('should throw error for invalid pool address', async () => {
      await expect(adapter.getPool('invalid')).rejects.toThrow();
    });
  });
  
  describe('getUserPositions', () => {
    it('should fetch user positions', async () => {
      const userAddress = 'KNOWN_USER_ADDRESS';
      const positions = await adapter.getUserPositions(userAddress);
      
      expect(Array.isArray(positions)).toBe(true);
      positions.forEach(pos => {
        expect(pos.dex).toBe('orca');
        expect(pos.type).toBe('CONCENTRATED');
      });
    });
  });
  
  describe('parsePoolUrl', () => {
    it('should parse valid Orca URL', () => {
      const url = 'https://www.orca.so/pools?pool=SOL-USDC';
      const result = adapter.parsePoolUrl(url);
      
      expect(result).not.toBeNull();
      expect(result!.dex).toBe('orca');
      expect(result!.poolId).toBe('SOL-USDC');
      expect(result!.valid).toBe(true);
    });
    
    it('should return null for invalid URL', () => {
      const url = 'https://invalid.com/pool';
      const result = adapter.parsePoolUrl(url);
      
      expect(result).toBeNull();
    });
  });
});
```

### Integration Tests

```typescript
// orca/__tests__/orca.integration.test.ts
import { describe, it, expect } from 'vitest';
import { Connection, Keypair } from '@solana/web3.js';
import { OrcaAdapter } from '../orca.adapter';

describe('Orca Integration Tests', () => {
  const connection = new Connection('https://api.devnet.solana.com');
  const adapter = new OrcaAdapter(connection);
  
  it('should create position on devnet', async () => {
    const testWallet = Keypair.generate();
    
    // Fund wallet on devnet
    await fundDevnetWallet(testWallet.publicKey);
    
    // Create position
    const result = await adapter.createPosition({
      userAddress: testWallet.publicKey.toString(),
      poolAddress: 'KNOWN_DEVNET_POOL',
      tokenAAmount: '1000000000',
      tokenBAmount: '1000000000',
      strategy: 'SPOT',
    });
    
    expect(result.success).toBe(true);
    expect(result.positionAddress).toBeDefined();
    expect(result.instructions).toBeDefined();
  });
  
  it('should claim fees from position', async () => {
    const testWallet = Keypair.generate();
    const positionAddress = 'KNOWN_POSITION_WITH_FEES';
    
    const result = await adapter.claimFees(positionAddress);
    
    expect(result.success).toBe(true);
    expect(result.instructions).toBeDefined();
  });
});
```

## Deployment & Rollout

### Step 1: Deploy to Staging

```bash
# Set feature flag to disabled initially
export FEATURE_ORCA_ENABLED=false

# Deploy to staging
pnpm deploy:staging
```

### Step 2: Enable for Testing

```typescript
// apps/bot/src/config/features.ts
export const FEATURES = {
  orca: {
    enabled: process.env.FEATURE_ORCA_ENABLED === 'true',
    allowedUsers: [
      'test-user-1',
      'test-user-2',
      // Add test user IDs
    ],
  },
};
```

### Step 3: Test with Real Users

- Invite beta testers
- Monitor logs and errors
- Collect feedback
- Fix issues

### Step 4: Gradual Rollout

```typescript
// apps/bot/src/config/features.ts
export const FEATURES = {
  orca: {
    enabled: true,
    rolloutPercentage: 10, // Start with 10% of users
  },
};
```

### Step 5: Full Release

Once stable:
```bash
export FEATURE_ORCA_ENABLED=true
pnpm deploy:production
```

## Example: Orca Integration

This guide used Orca as an example throughout. Here's a complete checklist specific to Orca:

### Orca-Specific Considerations

- ✅ Use `@orca-so/whirlpools-sdk` for Whirlpools
- ✅ Use `@orca-so/common-sdk` for shared utilities
- ✅ Handle both concentrated (Whirlpools) and standard pools
- ✅ Convert sqrtPrice to human-readable prices
- ✅ Calculate token amounts from liquidity and tick range
- ✅ Handle tick spacing (varies by pool)
- ✅ Parse position NFTs correctly
- ✅ Handle fee tier selection
- ✅ Support both single-sided and balanced deposits

### Orca Resources

- SDK Documentation: https://orca-so.github.io/whirlpools/
- API Documentation: https://docs.orca.so/
- Pool Explorer: https://www.orca.so/pools
- Discord: https://discord.gg/orca

## Troubleshooting

### Common Issues

**Issue: "Pool not found"**
- Verify pool address is correct
- Check if pool exists on current network (devnet vs mainnet)
- Ensure SDK is initialized correctly

**Issue: "Insufficient liquidity"**
- Check token amounts are correct
- Verify tick range is valid
- Ensure wallet has sufficient balance

**Issue: "Transaction failed"**
- Check simulation logs
- Verify all accounts are provided
- Check priority fees are set correctly

**Issue: "Position not found"**
- Verify position address
- Check if position has been closed
- Ensure correct owner is provided

### Debugging Tips

1. **Enable verbose logging:**
```typescript
logger.level = 'debug';
```

2. **Test on devnet first:**
```typescript
const connection = new Connection('https://api.devnet.solana.com');
```

3. **Use simulation before submitting:**
```typescript
const simulation = await connection.simulateTransaction(tx);
console.log(simulation);
```

4. **Check adapter health:**
```typescript
const isHealthy = await adapter.isHealthy();
console.log('Adapter healthy:', isHealthy);
```

## Next Steps

After implementing your adapter:

1. ✅ Add UI components for DEX-specific features
2. ✅ Update documentation with DEX-specific guides
3. ✅ Add monitoring and alerts
4. ✅ Create user-facing help text
5. ✅ Add DEX logo and branding
6. ✅ Submit PR for review
7. ✅ Monitor production metrics

## Reference

- [IDexAdapter Interface](../apps/bot/src/types/dex-adapter.interface.ts)
- [Unified Data Models](../apps/bot/src/types/dex.types.ts)
- [Existing Adapters](../apps/bot/src/services/)
- [System Design](../apps/bot/docs/SystemDesign.md#multi-dex-extensibility)

---

**Last Updated**: January 2025  
**Version**: 2.0
