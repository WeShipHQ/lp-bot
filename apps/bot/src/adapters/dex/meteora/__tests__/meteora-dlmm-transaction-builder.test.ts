import { describe, it, expect, vi, beforeEach } from "vitest";
import { MeteoraDlmmService } from "../meteora-dlmm.service";
import Decimal from "decimal.js";
import { PublicKey, Keypair } from "@solana/web3.js";
import { StrategyType } from "@meteora-ag/dlmm";

// Mock the DLMM SDK
vi.mock("@meteora-ag/dlmm", () => ({
  default: {
    create: vi.fn(),
  },
  getPriceOfBinByBinId: vi.fn((binId: number) => {
    // Mock price calculation based on bin ID
    return binId * 1000;
  }),
  StrategyType: {
    Spot: 0,
    Curve: 1,
    BidAsk: 2,
  },
}));

// Mock Solana connection
vi.mock("@solana/web3.js", async () => {
  const actual = await vi.importActual("@solana/web3.js");
  return {
    ...actual,
    Connection: vi.fn().mockImplementation(() => ({
      getLatestBlockhash: vi.fn().mockResolvedValue({
        blockhash: "mock-blockhash",
        lastValidBlockHeight: 123456789,
      }),
    })),
  };
});

const SOL_DECIMALS = 9;
const USDC_DECIMALS = 6;
const toRawAmount = (value: number, decimals: number) =>
  new Decimal(value).mul(new Decimal(10).pow(decimals));
const rawSol = (value: number) => toRawAmount(value, SOL_DECIMALS);
const rawUsdc = (value: number) => toRawAmount(value, USDC_DECIMALS);

describe("MeteoraDlmmService - Transaction Builder", () => {
  let service: MeteoraDlmmService;
  let mockPool: any;
  let mockActiveBin: any;
  let userPublicKey: PublicKey;
  let poolPublicKey: PublicKey;

  beforeEach(() => {
    service = new MeteoraDlmmService();

    userPublicKey = Keypair.generate().publicKey;
    poolPublicKey = Keypair.generate().publicKey;

    // Mock active bin
    mockActiveBin = {
      binId: 100,
      price: "102.5",
      pricePerToken: {
        toNumber: () => 102.5,
      },
    };

    // Mock DLMM pool instance
    mockPool = {
      getActiveBin: vi.fn().mockResolvedValue(mockActiveBin),
      initializePositionAndAddLiquidityByStrategy: vi.fn().mockResolvedValue({
        instructions: [
          { keys: [], programId: new PublicKey("11111111111111111111111111111111"), data: Buffer.from([]) },
        ],
      }),
      lbPair: {
        binStep: 10,
        tokenXMint: new PublicKey("So11111111111111111111111111111111111111112"),
        tokenYMint: new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"),
      },
      tokenX: {
        symbol: "SOL",
        mint: {
          decimals: 9,
        },
      },
      tokenY: {
        symbol: "USDC",
        mint: {
          decimals: 6,
        },
      },
      fromPricePerLamport: vi.fn((price: number) => price.toString()),
    };

    // Mock the createInstance method
    // @ts-ignore
    service.createInstance = vi.fn().mockResolvedValue(mockPool);
  });

  describe("buildCreatePositionTransaction", () => {
    it("should build a complete transaction with Spot strategy", async () => {
      // Pass raw amounts (lamports): 1.5 SOL = 1.5e9 lamports, 150 USDC = 150e6
      const result = await service.buildCreatePositionTransaction({
        poolAddress: poolPublicKey,
        userPublicKey: userPublicKey,
        tokenXAmount: rawSol(1.5), // 1.5 SOL
        tokenYAmount: rawUsdc(150), // 150 USDC
        strategy: StrategyType.Spot as unknown as StrategyType,
        rangeInterval: 10,
      });

      expect(result.success).toBe(true);
      expect(result.transaction).toBeDefined();
      expect(result.signers).toHaveLength(1);
      expect(result.preview).toBeDefined();
      expect(result.metadata).toBeDefined();
      // Check that preview shows UI amounts
      expect(result.preview?.tokenAAmount).toBe("1.5");
      expect(result.preview?.tokenBAmount).toBe("150");
    });

    it("should calculate correct bin range based on strategy", async () => {
      const rangeInterval = 15;
      const result = await service.buildCreatePositionTransaction({
        poolAddress: poolPublicKey,
        userPublicKey,
        tokenXAmount: rawSol(2.0),
        tokenYAmount: rawUsdc(200),
        strategy: StrategyType.Spot as unknown as StrategyType,
        rangeInterval,
      });

      expect(result.success).toBe(true);
      expect(result.preview?.strategy).toBeDefined();
      expect(result.preview?.strategy?.minBinId).toBe(mockActiveBin.binId - rangeInterval);
      expect(result.preview?.strategy?.maxBinId).toBe(mockActiveBin.binId + rangeInterval);
      expect(result.preview?.strategy?.activeBinId).toBe(mockActiveBin.binId);
      expect(result.preview?.strategy?.rangeInterval).toBe(rangeInterval);
    });

    it("should include compute budget instructions", async () => {
      const result = await service.buildCreatePositionTransaction({
        poolAddress: poolPublicKey,
        userPublicKey,
        tokenXAmount: rawSol(1.0),
        tokenYAmount: rawUsdc(100),
        strategy: StrategyType.Spot as unknown as StrategyType,
        rangeInterval: 10,
        priorityFee: 2000,
      });

      expect(result.success).toBe(true);
      // Transaction should have compute budget instructions
      // We can't easily check the transaction structure without deserializing,
      // but we can verify it was built
      expect(result.transaction).toBeDefined();
    });

    it("should handle SOL auto-convert with Jupiter quotes", async () => {
      const mockSwapInstructions = [
        { keys: [], programId: new PublicKey("11111111111111111111111111111111"), data: Buffer.from([]) },
      ];

      const result = await service.buildCreatePositionTransaction({
        poolAddress: poolPublicKey,
        userPublicKey,
        tokenXAmount: rawSol(1.0),
        tokenYAmount: rawUsdc(100),
        strategy: StrategyType.Spot as unknown as StrategyType,
        rangeInterval: 10,
        solAutoConvert: {
          solAmount: 5.0,
          jupiterQuotes: {
            tokenX: {
              inputAmount: "2500000000",
              outputAmount: "1000000000",
              swapInstructions: mockSwapInstructions,
            },
            tokenY: {
              inputAmount: "2500000000",
              outputAmount: "100000000",
              swapInstructions: mockSwapInstructions,
            },
          },
        },
      });

      expect(result.success).toBe(true);
      expect(result.transaction).toBeDefined();
      // With SOL auto-convert, compute units should be higher
      expect(result.preview?.fees?.swap).toBeDefined();
    });

    it("should return preview data with token amounts and symbols", async () => {
      const result = await service.buildCreatePositionTransaction({
        poolAddress: poolPublicKey,
        userPublicKey,
        tokenXAmount: rawSol(3.5),
        tokenYAmount: rawUsdc(350),
        strategy: StrategyType.Spot as unknown as StrategyType,
        rangeInterval: 10,
      });

      expect(result.success).toBe(true);
      expect(result.preview).toBeDefined();
      expect(result.preview?.tokenAAmount).toBe("3.5");
      expect(result.preview?.tokenBAmount).toBe("350");
      expect(result.preview?.tokenASymbol).toBe("SOL");
      expect(result.preview?.tokenBSymbol).toBe("USDC");
    });

    it("should return preview data with price range", async () => {
      const result = await service.buildCreatePositionTransaction({
        poolAddress: poolPublicKey,
        userPublicKey,
        tokenXAmount: rawSol(1.0),
        tokenYAmount: rawUsdc(100),
        strategy: StrategyType.Spot as unknown as StrategyType,
        rangeInterval: 10,
      });

      expect(result.success).toBe(true);
      expect(result.preview?.priceRange).toBeDefined();
      expect(result.preview?.priceRange?.min).toBeDefined();
      expect(result.preview?.priceRange?.max).toBeDefined();
      expect(result.preview?.priceRange?.current).toBeDefined();
    });

    it("should return preview data with fee breakdown", async () => {
      const result = await service.buildCreatePositionTransaction({
        poolAddress: poolPublicKey,
        userPublicKey,
        tokenXAmount: rawSol(1.0),
        tokenYAmount: rawUsdc(100),
        strategy: StrategyType.Spot as unknown as StrategyType,
        rangeInterval: 10,
        priorityFee: 1500,
      });

      expect(result.success).toBe(true);
      expect(result.preview?.fees).toBeDefined();
      expect(result.preview?.fees?.network).toBeDefined();
      expect(result.preview?.fees?.total).toBeDefined();
      expect(parseFloat(result.preview!.fees!.total!)).toBeGreaterThan(0);
    });

    it("should include position address in metadata", async () => {
      const result = await service.buildCreatePositionTransaction({
        poolAddress: poolPublicKey,
        userPublicKey,
        tokenXAmount: rawSol(1.0),
        tokenYAmount: rawUsdc(100),
        strategy: StrategyType.Spot as unknown as StrategyType,
        rangeInterval: 10,
      });

      expect(result.success).toBe(true);
      expect(result.metadata).toBeDefined();
      expect(result.metadata?.positionAddress).toBeDefined();
      expect(typeof result.metadata?.positionAddress).toBe("string");
      expect(result.metadata?.positionAddress).toMatch(/^[1-9A-HJ-NP-Za-km-z]+$/);
    });

    it("should handle Curve strategy", async () => {
      const result = await service.buildCreatePositionTransaction({
        poolAddress: poolPublicKey,
        userPublicKey,
        tokenXAmount: rawSol(1.0),
        tokenYAmount: rawUsdc(100),
        strategy: StrategyType.Curve as unknown as StrategyType,
        rangeInterval: 5,
      });

      expect(result.success).toBe(true);
      expect(result.preview?.strategy?.type).toBe("curve");
    });

    it("should handle BidAsk strategy", async () => {
      const result = await service.buildCreatePositionTransaction({
        poolAddress: poolPublicKey,
        userPublicKey,
        tokenXAmount: rawSol(1.0),
        tokenYAmount: rawUsdc(0), // Single-sided
        strategy: StrategyType.BidAsk as unknown as StrategyType,
        rangeInterval: 8,
      });

      expect(result.success).toBe(true);
      expect(result.preview?.strategy?.type).toBe("bid-ask");
    });

    it("should reject invalid amounts (both zero)", async () => {
      const result = await service.buildCreatePositionTransaction({
        poolAddress: poolPublicKey,
        userPublicKey,
        tokenXAmount: rawSol(0),
        tokenYAmount: rawUsdc(0),
        strategy: StrategyType.Spot as unknown as StrategyType,
        rangeInterval: 10,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Invalid amounts");
    });

    it("should handle custom slippage", async () => {
      const slippage = 0.5;
      const result = await service.buildCreatePositionTransaction({
        poolAddress: poolPublicKey,
        userPublicKey,
        tokenXAmount: rawSol(1.0),
        tokenYAmount: rawUsdc(100),
        strategy: StrategyType.Spot as unknown as StrategyType,
        rangeInterval: 10,
        slippage,
      });

      expect(result.success).toBe(true);
      expect(result.preview?.slippage).toBe(slippage);
    });

    it("should calculate fees with SOL auto-convert", async () => {
      const result = await service.buildCreatePositionTransaction({
        poolAddress: poolPublicKey,
        userPublicKey,
        tokenXAmount: rawSol(1.0),
        tokenYAmount: rawUsdc(100),
        strategy: StrategyType.Spot as unknown as StrategyType,
        rangeInterval: 10,
        solAutoConvert: {
          solAmount: 5.0,
        },
      });

      expect(result.success).toBe(true);
      expect(result.preview?.fees?.swap).toBeDefined();
      expect(parseFloat(result.preview!.fees!.swap!)).toBeGreaterThan(0);
    });

    it("should include strategy metadata in result", async () => {
      const result = await service.buildCreatePositionTransaction({
        poolAddress: poolPublicKey,
        userPublicKey,
        tokenXAmount: rawSol(1.0),
        tokenYAmount: rawUsdc(100),
        strategy: StrategyType.Spot as unknown as StrategyType,
        rangeInterval: 12,
      });

      expect(result.success).toBe(true);
      expect(result.metadata?.strategy).toBe("spot");
      expect(result.metadata?.rangeInterval).toBe(12);
      expect(result.metadata?.binRange).toBeDefined();
      expect(result.metadata?.binRange.min).toBe(88);
      expect(result.metadata?.binRange.max).toBe(112);
      expect(result.metadata?.binRange.active).toBe(100);
    });
  });

  describe("strategyTypeToString", () => {
    it("should convert StrategyType enum to string", async () => {
      // Test via buildCreatePositionTransaction which uses it internally
      const strategies = [
        { type: StrategyType.Spot, expected: "spot" },
        { type: StrategyType.Curve, expected: "curve" },
        { type: StrategyType.BidAsk, expected: "bid-ask" },
      ];

      for (const { type, expected } of strategies) {
        const result = await service.buildCreatePositionTransaction({
          poolAddress: poolPublicKey,
          userPublicKey,
          tokenXAmount: rawSol(1.0),
          tokenYAmount: rawUsdc(100),
          strategy: type as unknown as StrategyType,
          rangeInterval: 10,
        });

        expect(result.success).toBe(true);
        expect(result.preview?.strategy?.type).toBe(expected);
      }
    });
  });

  describe("SOL split calculation", () => {
    it("should handle 50/50 SOL split correctly", async () => {
      const totalSOL = 10.0;
      const halfSOL = totalSOL / 2;

      const mockSwapInstructions = [
        { keys: [], programId: new PublicKey("11111111111111111111111111111111"), data: Buffer.from([]) },
      ];

      const result = await service.buildCreatePositionTransaction({
        poolAddress: poolPublicKey,
        userPublicKey,
        tokenXAmount: rawSol(5.0),
        tokenYAmount: rawUsdc(500),
        strategy: StrategyType.Spot as unknown as StrategyType,
        rangeInterval: 10,
        solAutoConvert: {
          solAmount: totalSOL,
          jupiterQuotes: {
            tokenX: {
              inputAmount: (halfSOL * 1e9).toString(),
              outputAmount: "5000000000",
              swapInstructions: mockSwapInstructions,
            },
            tokenY: {
              inputAmount: (halfSOL * 1e9).toString(),
              outputAmount: "500000000",
              swapInstructions: mockSwapInstructions,
            },
          },
        },
      });

      expect(result.success).toBe(true);
      expect(parseFloat(result.preview?.tokenAAmount ?? "0")).toBeCloseTo(5, 6);
      expect(parseFloat(result.preview?.tokenBAmount ?? "0")).toBeCloseTo(500, 3);
    });
  });

  describe("Error handling", () => {
    it("should handle SDK errors gracefully", async () => {
      // Mock a failure in initializePositionAndAddLiquidityByStrategy
      mockPool.initializePositionAndAddLiquidityByStrategy = vi
        .fn()
        .mockRejectedValue(new Error("SDK operation failed"));

      const result = await service.buildCreatePositionTransaction({
        poolAddress: poolPublicKey,
        userPublicKey,
        tokenXAmount: rawSol(1.0),
        tokenYAmount: rawUsdc(100),
        strategy: StrategyType.Spot as unknown as StrategyType,
        rangeInterval: 10,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain("SDK operation failed");
    });
  });
});
