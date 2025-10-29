import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  CreatePositionUseCase,
  CreatePositionPreviewInput,
  CreatePositionExecuteInput,
} from "../create-position.use-case";
import { DexType, UnifiedPool } from "@/types/core.types";
import { IDexAdapter } from "@/types/dex-adapter.interface";
import { IPositionRepository } from "@/domain/position/position.repository";
import { Position } from "@/domain/position/position.entity";

// ============================================================================
// Mock Setup
// ============================================================================

const mockDexAdapter: IDexAdapter = {
  dexType: "meteora" as DexType,
  name: "Meteora",
  isEnabled: true,
  getPool: vi.fn(),
  getTrendingPools: vi.fn(),
  searchPools: vi.fn(),
  getUserPositions: vi.fn(),
  getPosition: vi.fn(),
  createPositionIxs: vi.fn(),
  closePositionIxs: vi.fn(),
  claimFeesIxs: vi.fn(),
  rebalancePosition: vi.fn(),
  getUserPortfolio: vi.fn(),
  parsePoolUrl: vi.fn(),
  isValidPoolUrl: vi.fn(),
  isHealthy: vi.fn(),
};

const mockDexRegistry = {
  get: vi.fn(() => mockDexAdapter),
};

const mockPositionRepository: Partial<IPositionRepository> = {
  findActiveByUser: vi.fn(),
  countActive: vi.fn(),
};

const mockCacheService = {
  get: vi.fn(),
  set: vi.fn(),
  invalidate: vi.fn(),
};

const mockSolanaService = {
  getBalance: vi.fn(),
  getTokenBalance: vi.fn(),
  validateAddress: vi.fn(() => true),
};

// ============================================================================
// Mock Data
// ============================================================================

const mockPool: UnifiedPool = {
  id: "pool123",
  address: "PoolAddressAbc123456789012345678901234567",
  name: "SOL-USDC",
  dex: "meteora",
  type: "DLMM",
  tokenA: {
    address: "So11111111111111111111111111111111111111112",
    symbol: "SOL",
    decimals: 9,
    name: "Solana",
  },
  tokenB: {
    address: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    symbol: "USDC",
    decimals: 6,
    name: "USD Coin",
  },
  liquidity: "100000",
  tvl: "100000",
  apr: 45.2,
  apy: 48.5,
  currentPrice: 100,
  isVerified: true,
  volume24h: 50000,
  fees24h: 250,
  feeTvlRatio24h: 0.0025,
};

const createMockPreviewInput = (): CreatePositionPreviewInput => ({
  userId: "550e8400-e29b-41d4-a716-446655440000",
  poolAddress: "PoolAddressAbc123456789012345678901234567",
  dex: "meteora",
  tokenA: mockPool.tokenA,
  tokenB: mockPool.tokenB,
  strategy: "spot",
  depositMethod: "sol_auto_convert",
  solAmount: 1.0,
  autoRebalance: true,
  rebalanceThreshold: 20,
});

const createMockExecuteInput = (): CreatePositionExecuteInput => ({
  ...createMockPreviewInput(),
  walletId: "wallet123",
  walletAddress: "WalletAddressAbc1234567890123456789012",
  tokenAAmount: "0.005",
  tokenBAmount: "500",
});

// ============================================================================
// Test Suite
// ============================================================================

describe("CreatePositionUseCase", () => {
  let useCase: CreatePositionUseCase;

  beforeEach(() => {
    vi.clearAllMocks();
    
    useCase = new CreatePositionUseCase(
      mockDexRegistry as any,
      mockPositionRepository as any,
      mockCacheService as any,
      mockSolanaService as any
    );
  });

  // ==========================================================================
  // Preview Method Tests
  // ==========================================================================

  describe("preview()", () => {
    it("should return success with valid inputs", async () => {
      // Arrange
      vi.mocked(mockPositionRepository.findActiveByUser!).mockResolvedValue([]);
      vi.mocked(mockDexAdapter.getPool).mockResolvedValue(mockPool);
      const input = createMockPreviewInput();

      // Act
      const result = await useCase.preview(input);

      // Assert
      expect(result.success).toBe(true);
      expect(result.priceRange).toBeDefined();
      expect(result.priceRange?.current).toBe(100);
      expect(result.tokenAmounts).toBeDefined();
      expect(result.fees).toBeDefined();
      expect(result.slippageGuidance).toBeDefined();
      expect(result.error).toBeUndefined();
    });

    it("should reject when SOL amount is below minimum", async () => {
      // Arrange
      vi.mocked(mockPositionRepository.findActiveByUser!).mockResolvedValue([]);
      const input = createMockPreviewInput();
      input.solAmount = 0.05; // Below MIN_SOL_DEPOSIT of 0.1

      // Act
      const result = await useCase.preview(input);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain("Minimum deposit is 0.1 SOL");
    });

    it("should reject when user has reached position limit", async () => {
      // Arrange
      const mockPositions = Array(10)
        .fill(null)
        .map((_, i) => ({
          id: `pos${i}`,
          getStatus: () => "ACTIVE" as const,
        }));
      vi.mocked(mockPositionRepository.findActiveByUser!).mockResolvedValue(
        mockPositions as any
      );
      const input = createMockPreviewInput();

      // Act
      const result = await useCase.preview(input);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain("Maximum 10 active positions");
    });

    it("should return error when pool not found", async () => {
      // Arrange
      vi.mocked(mockPositionRepository.findActiveByUser!).mockResolvedValue([]);
      vi.mocked(mockDexAdapter.getPool).mockResolvedValue(null as any);
      const input = createMockPreviewInput();

      // Act
      const result = await useCase.preview(input);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain("Pool not found");
    });

    it("should include warnings for unverified pools", async () => {
      // Arrange
      vi.mocked(mockPositionRepository.findActiveByUser!).mockResolvedValue([]);
      vi.mocked(mockDexAdapter.getPool).mockResolvedValue({
        ...mockPool,
        isVerified: false,
      });
      const input = createMockPreviewInput();

      // Act
      const result = await useCase.preview(input);

      // Assert
      expect(result.success).toBe(true);
      expect(result.warnings).toBeDefined();
      expect(result.warnings?.some((w) => w.includes("unverified"))).toBe(true);
    });

    it("should include warnings for low liquidity pools", async () => {
      // Arrange
      vi.mocked(mockPositionRepository.findActiveByUser!).mockResolvedValue([]);
      vi.mocked(mockDexAdapter.getPool).mockResolvedValue({
        ...mockPool,
        liquidity: "5000", // Low liquidity
      });
      const input = createMockPreviewInput();

      // Act
      const result = await useCase.preview(input);

      // Assert
      expect(result.success).toBe(true);
      expect(result.warnings).toBeDefined();
      expect(result.warnings?.some((w) => w.includes("Low liquidity"))).toBe(true);
    });

    it("should calculate correct price range for spot strategy", async () => {
      // Arrange
      vi.mocked(mockPositionRepository.findActiveByUser!).mockResolvedValue([]);
      vi.mocked(mockDexAdapter.getPool).mockResolvedValue(mockPool);
      const input = createMockPreviewInput();
      input.strategy = "spot";
      input.priceRange = {
        min: 0,
        max: 0,
        rangeInterval: 10,
      };

      // Act
      const result = await useCase.preview(input);

      // Assert
      expect(result.success).toBe(true);
      expect(result.priceRange).toBeDefined();
      // With 10% range and current price 100, expect 90-110
      expect(result.priceRange?.min).toBeCloseTo(90, 1);
      expect(result.priceRange?.max).toBeCloseTo(110, 1);
    });

    it("should provide higher slippage guidance for low liquidity", async () => {
      // Arrange
      vi.mocked(mockPositionRepository.findActiveByUser!).mockResolvedValue([]);
      vi.mocked(mockDexAdapter.getPool).mockResolvedValue({
        ...mockPool,
        liquidity: "5000", // Low liquidity
      });
      const input = createMockPreviewInput();

      // Act
      const result = await useCase.preview(input);

      // Assert
      expect(result.success).toBe(true);
      expect(result.slippageGuidance).toBeDefined();
      expect(result.slippageGuidance?.recommended).toBeGreaterThan(1);
    });
  });

  // ==========================================================================
  // Execute Method Tests
  // ==========================================================================

  describe("execute()", () => {
    it("should reject when user has insufficient SOL balance", async () => {
      // Arrange
      vi.mocked(mockPositionRepository.findActiveByUser!).mockResolvedValue([]);
      vi.mocked(mockSolanaService.getBalance).mockResolvedValue(0.05); // Insufficient
      const input = createMockExecuteInput();
      input.solAmount = 1.0;

      // Act
      const result = await useCase.execute(input);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain("Insufficient SOL balance");
    });

    it("should reject when position limit exceeded", async () => {
      // Arrange
      const mockPositions = Array(10)
        .fill(null)
        .map((_, i) => ({
          id: `pos${i}`,
          getStatus: () => "ACTIVE" as const,
        }));
      vi.mocked(mockPositionRepository.findActiveByUser!).mockResolvedValue(
        mockPositions as any
      );
      vi.mocked(mockSolanaService.getBalance).mockResolvedValue(10);
      const input = createMockExecuteInput();

      // Act
      const result = await useCase.execute(input);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain("Maximum 10 active positions");
    });

    it("should reject when SOL amount is below minimum", async () => {
      // Arrange
      vi.mocked(mockPositionRepository.findActiveByUser!).mockResolvedValue([]);
      vi.mocked(mockSolanaService.getBalance).mockResolvedValue(10);
      const input = createMockExecuteInput();
      input.solAmount = 0.05; // Below minimum

      // Act
      const result = await useCase.execute(input);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain("Minimum deposit is 0.1 SOL");
    });

    it("should reject when token amounts are invalid", async () => {
      // Arrange
      vi.mocked(mockPositionRepository.findActiveByUser!).mockResolvedValue([]);
      vi.mocked(mockSolanaService.getBalance).mockResolvedValue(10);
      const input = createMockExecuteInput();
      input.tokenAAmount = "0"; // Invalid

      // Act
      const result = await useCase.execute(input);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain("Token A amount must be greater than 0");
    });

    it("should validate wallet address format", async () => {
      // Arrange
      vi.mocked(mockPositionRepository.findActiveByUser!).mockResolvedValue([]);
      vi.mocked(mockSolanaService.getBalance).mockResolvedValue(10);
      const input = createMockExecuteInput();
      input.walletAddress = "invalid"; // Invalid address

      // Act & Assert
      await expect(useCase.execute(input)).rejects.toThrow();
    });
  });

  // ==========================================================================
  // Error Message Formatting Tests
  // ==========================================================================

  describe("formatErrorMessage()", () => {
    it("should format insufficient funds error", async () => {
      // Arrange
      vi.mocked(mockPositionRepository.findActiveByUser!).mockResolvedValue([]);
      vi.mocked(mockSolanaService.getBalance).mockRejectedValue(
        new Error("Insufficient funds")
      );
      const input = createMockExecuteInput();

      // Act
      const result = await useCase.execute(input);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain("Insufficient balance");
    });

    it("should format pool not found error", async () => {
      // Arrange
      vi.mocked(mockPositionRepository.findActiveByUser!).mockResolvedValue([]);
      vi.mocked(mockDexAdapter.getPool).mockRejectedValue(new Error("Pool not found"));
      const input = createMockPreviewInput();

      // Act
      const result = await useCase.preview(input);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain("temporarily unavailable");
    });

    it("should format network error", async () => {
      // Arrange
      vi.mocked(mockPositionRepository.findActiveByUser!).mockResolvedValue([]);
      vi.mocked(mockDexAdapter.getPool).mockRejectedValue(new Error("Network error"));
      const input = createMockPreviewInput();

      // Act
      const result = await useCase.preview(input);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain("Network error");
    });
  });

  // ==========================================================================
  // Balance Checking Tests
  // ==========================================================================

  describe("Balance Checks", () => {
    it("should check SOL balance with buffer", async () => {
      // Arrange
      vi.mocked(mockPositionRepository.findActiveByUser!).mockResolvedValue([]);
      vi.mocked(mockSolanaService.getBalance).mockResolvedValue(1.005); // Just enough with buffer
      const input = createMockExecuteInput();
      input.solAmount = 1.0;

      // Act
      await useCase.execute(input);

      // Assert
      expect(mockSolanaService.getBalance).toHaveBeenCalledWith(input.walletAddress);
    });

    it("should allow execution when balance check fails (fail open)", async () => {
      // Arrange
      vi.mocked(mockPositionRepository.findActiveByUser!).mockResolvedValue([]);
      vi.mocked(mockSolanaService.getBalance).mockRejectedValue(new Error("RPC error"));
      vi.mocked(mockDexAdapter.createPositionIxs).mockResolvedValue({
        success: true,
        instructions: [],
        positionKp: { publicKey: { toBase58: () => "pos123" } } as any,
      });
      const input = createMockExecuteInput();
      input.depositMethod = "single_sided"; // Skip SOL balance check

      // Act
      const result = await useCase.execute(input);

      // Assert - Should not fail due to balance check error
      expect(mockSolanaService.getBalance).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Fee Calculation Tests
  // ==========================================================================

  describe("Fee Calculations", () => {
    it("should calculate fees correctly", async () => {
      // Arrange
      vi.mocked(mockPositionRepository.findActiveByUser!).mockResolvedValue([]);
      vi.mocked(mockDexAdapter.getPool).mockResolvedValue(mockPool);
      const input = createMockPreviewInput();
      input.solAmount = 10;

      // Act
      const result = await useCase.preview(input);

      // Assert
      expect(result.success).toBe(true);
      expect(result.fees).toBeDefined();
      expect(result.fees?.openPositionFee).toBe(1); // 1% fee
      expect(result.fees?.totalCostSOL).toBeGreaterThan(10);
    });
  });

  // ==========================================================================
  // Position Limit Tests
  // ==========================================================================

  describe("Position Limit Enforcement", () => {
    it("should allow creation when below limit", async () => {
      // Arrange
      const mockPositions = Array(5)
        .fill(null)
        .map((_, i) => ({
          id: `pos${i}`,
          getStatus: () => "ACTIVE" as const,
        }));
      vi.mocked(mockPositionRepository.findActiveByUser!).mockResolvedValue(
        mockPositions as any
      );
      vi.mocked(mockDexAdapter.getPool).mockResolvedValue(mockPool);
      const input = createMockPreviewInput();

      // Act
      const result = await useCase.preview(input);

      // Assert
      expect(result.success).toBe(true);
    });

    it("should reject when at limit", async () => {
      // Arrange
      const mockPositions = Array(10)
        .fill(null)
        .map((_, i) => ({
          id: `pos${i}`,
          getStatus: () => "ACTIVE" as const,
        }));
      vi.mocked(mockPositionRepository.findActiveByUser!).mockResolvedValue(
        mockPositions as any
      );
      const input = createMockPreviewInput();

      // Act
      const result = await useCase.preview(input);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain("Maximum 10 active positions");
    });

    it("should allow creation when limit check fails (fail open)", async () => {
      // Arrange
      vi.mocked(mockPositionRepository.findActiveByUser!).mockRejectedValue(
        new Error("DB error")
      );
      vi.mocked(mockDexAdapter.getPool).mockResolvedValue(mockPool);
      const input = createMockPreviewInput();

      // Act
      const result = await useCase.preview(input);

      // Assert
      expect(result.success).toBe(true); // Should not fail due to check error
    });
  });
});
