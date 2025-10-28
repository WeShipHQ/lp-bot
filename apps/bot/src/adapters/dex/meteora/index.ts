/**
 * Meteora DEX Adapter Module
 * 
 * Exports the enhanced Meteora API client with full support for:
 * - DLMM, DAMM v1, and DAMM v2 pools
 * - Position fee/reward queries
 * - Resilience features (retry, circuit breaker, caching)
 * - Structured logging and error handling
 */

export {
  MeteoraApiClient,
  meteoraApiClient,
  type MeteoraApiClientConfig,
  MeteoraApiError,
} from "./meteora-api.client";
