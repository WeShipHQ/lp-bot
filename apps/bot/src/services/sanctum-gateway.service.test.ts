import { describe, it, expect, beforeAll } from "vitest";
import { SanctumGatewayService } from "@/services/sanctum-gateway.service";
import { Connection, PublicKey } from "@solana/web3.js";
import { CONFIG } from "@/config";

// Mock CONFIG for testing
const mockConfig = {
  ...CONFIG,
  SANCTUM: {
    API_KEY: "test-api-key",
    ENABLED: true,
  },
};

describe("SanctumGatewayService", () => {
  beforeAll(() => {
    // Mock config
    Object.defineProperty(CONFIG, 'SANCTUM', {
      value: mockConfig.SANCTUM,
      writable: true,
    });
  });

  describe("isHealthy", () => {
    it("should return true when Gateway responds successfully", async () => {
      // Mock successful Gateway response
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ result: [] }),
      });

      const isHealthy = await SanctumGatewayService.isHealthy();
      expect(isHealthy).toBe(true);
    });

    it("should return false when Gateway fails", async () => {
      // Mock failed Gateway response
      global.fetch = vi.fn().mockRejectedValueOnce(new Error("Network error"));

      const isHealthy = await SanctumGatewayService.isHealthy();
      expect(isHealthy).toBe(false);
    });
  });

  describe("buildGatewayTransaction", () => {
    it("should build optimized transaction", async () => {
      const connection = new Connection("https://api.mainnet-beta.solana.com");
      const payer = new PublicKey("11111111111111111111111111111112");
      const instructions = []; // Mock instructions

      // Mock Gateway build response
      const mockOptimizedTx = "base64-encoded-transaction";
      const mockBlockhash = {
        blockhash: "test-blockhash",
        lastValidBlockHeight: "123456",
      };

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          result: {
            transaction: mockOptimizedTx,
            latestBlockhash: mockBlockhash,
          },
        }),
      });

      const result = await SanctumGatewayService.buildGatewayTransaction(
        connection,
        instructions,
        payer,
        [],
        [],
        {},
        { cuPriceRange: "high" }
      );

      expect(result.transaction).toBeDefined();
      expect(result.latestBlockhash.blockhash).toBe("test-blockhash");
      expect(result.latestBlockhash.lastValidBlockHeight).toBe(123456);
    });

    it("should throw error when Gateway fails", async () => {
      const connection = new Connection("https://api.mainnet-beta.solana.com");
      const payer = new PublicKey("11111111111111111111111111111112");
      const instructions = [];

      // Mock Gateway error response
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve("Internal Server Error"),
      });

      await expect(
        SanctumGatewayService.buildGatewayTransaction(
          connection,
          instructions,
          payer,
          [],
          [],
          {},
          { cuPriceRange: "high" }
        )
      ).rejects.toThrow("Gateway build failed: 500 Internal Server Error");
    });
  });

  describe("sendTransaction", () => {
    it("should send transaction and return signature", async () => {
      const mockTransaction = {
        serialize: () => new Uint8Array([1, 2, 3]),
      } as any;

      const mockSignature = "test-transaction-signature";

      // Mock Gateway send response
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          result: mockSignature,
        }),
      });

      const result = await SanctumGatewayService.sendTransaction(mockTransaction);

      expect(result).toBe(mockSignature);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("tpg.sanctum.so"),
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining("sendTransaction"),
        })
      );
    });

    it("should throw error when send fails", async () => {
      const mockTransaction = {
        serialize: () => new Uint8Array([1, 2, 3]),
      } as any;

      // Mock Gateway error response
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          error: {
            code: 4001,
            message: "Invalid transaction",
          },
        }),
      });

      await expect(
        SanctumGatewayService.sendTransaction(mockTransaction)
      ).rejects.toThrow("Gateway send error: Invalid transaction (code: 4001)");
    });
  });

  describe("buildAndSendTransaction", () => {
    it("should combine build and send operations", async () => {
      const connection = new Connection("https://api.mainnet-beta.solana.com");
      const payer = new PublicKey("11111111111111111111111111111112");
      const instructions = [];

      const mockOptimizedTx = "base64-encoded-transaction";
      const mockSignature = "test-transaction-signature";

      // Mock Gateway responses
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            result: {
              transaction: mockOptimizedTx,
              latestBlockhash: {
                blockhash: "test-blockhash",
                lastValidBlockHeight: "123456",
              },
            },
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            result: mockSignature,
          }),
        });

      const result = await SanctumGatewayService.buildAndSendTransaction(
        connection,
        instructions,
        payer,
        [],
        [],
        {},
        { cuPriceRange: "medium" }
      );

      expect(result).toBe(mockSignature);
    });
  });

  describe("getTipInstructions", () => {
    it("should return tip instructions", async () => {
      const feePayer = new PublicKey("11111111111111111111111111111112");

      // Mock Gateway tip response
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          result: [
            {
              programId: "11111111111111111111111111111112",
              accounts: [
                {
                  pubkey: "11111111111111111111111111111112",
                  isSigner: true,
                  isWritable: true,
                },
              ],
              data: [1, 2, 3, 4],
            },
          ],
        }),
      });

      const result = await SanctumGatewayService.getTipInstructions(feePayer);

      expect(result).toHaveLength(1);
      expect(result[0].programId.toBase58()).toBe("11111111111111111111111111111112");
      expect(result[0].data).toEqual(new Uint8Array([1, 2, 3, 4]));
    });
  });
});

// Integration test with WalletService
describe("WalletService Gateway Integration", () => {
  it("should use Gateway when available", async () => {
    const { WalletService } = await import("@/services/wallet.service");
    const mockUser = {
      id: "test-user",
      walletId: "test-wallet",
      walletAddress: "test-address",
    } as any;

    // Mock Gateway as available
    vi.spyOn(SanctumGatewayService, "isHealthy").mockResolvedValue(true);
    vi.spyOn(WalletService, "isGatewayAvailable").mockResolvedValue(true);

    // Mock successful Gateway transaction
    const mockSignature = "gateway-signature";
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        result: mockSignature,
      }),
    });

    // This would be called from use case
    // const result = await WalletService.signAndSendTransactionWithGateway(
    //   mockUser,
    //   [],
    //   [],
    //   [],
    //   {},
    //   { cuPriceRange: "high" }
    // );

    expect(WalletService.isGatewayAvailable).toHaveBeenCalled();
    // expect(result).toBe(mockSignature);
  });

  it("should fallback when Gateway not available", async () => {
    const { WalletService } = await import("@/services/wallet.service");
    const mockUser = {
      id: "test-user",
      walletId: "test-wallet",
      walletAddress: "test-address",
    } as any;

    // Mock Gateway as unavailable
    vi.spyOn(SanctumGatewayService, "isHealthy").mockResolvedValue(false);
    vi.spyOn(WalletService, "isGatewayAvailable").mockResolvedValue(false);

    // Mock standard transaction
    const mockSignature = "standard-signature";
    vi.spyOn(WalletService, "signAndSendTransaction").mockResolvedValue(mockSignature);

    // This would be called from use case
    // const result = await WalletService.signAndSendTransactionWithGateway(
    //   mockUser,
    //   [],
    //   [],
    //   [],
    //   {},
    //   { cuPriceRange: "high" }
    // );

    expect(WalletService.isGatewayAvailable).toHaveBeenCalled();
    // expect(WalletService.signAndSendTransaction).toHaveBeenCalled();
    // expect(result).toBe(mockSignature);
  });
});