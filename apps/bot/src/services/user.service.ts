import { privy } from "./privy.service";
import { WalletWithMetadata } from "@privy-io/server-auth";
import { CONFIG } from "../config";

export interface UserInfo {
  id: string;
  walletAddress?: string;
}

export class UserService {
  /**
   * Get or create user by Telegram ID
   */
  async getOrCreateUser(telegramUserId: string): Promise<UserInfo> {
    try {
      // Check if user exists in Privy
      let user = await privy.getUserByTelegramUserId(telegramUserId);
      let walletAddress: string | undefined;

      if (!user) {
        // Import new user
        user = await privy.importUser({
          linkedAccounts: [{ type: "telegram", telegramUserId }],
        });

        // Create Solana wallet
        const wallet = await privy.walletApi.createWallet({
          chainType: "solana",
          owner: { userId: user.id },
          additionalSigners: [{ signerId: CONFIG.PRIVY.PRIVI_SIGNERS_ID }],
        });
        walletAddress = wallet.address;
      } else {
        // Find existing Privy wallet
        walletAddress = user.linkedAccounts.find(
          (a): a is WalletWithMetadata =>
            a.type === "wallet" && a.walletClientType === "privy"
        )?.address;
      }

      return {
        id: user.id,
        walletAddress,
      };
    } catch (error) {
      console.error("Error in getOrCreateUser:", error);
      throw new Error("Failed to get or create user");
    }
  }

  /**
   * Get user by Telegram ID
   */
  async getUserByTelegramId(telegramUserId: string): Promise<UserInfo | null> {
    try {
      const user = await privy.getUserByTelegramUserId(telegramUserId);
      if (!user) return null;

      const walletAddress = user.linkedAccounts.find(
        (a): a is WalletWithMetadata =>
          a.type === "wallet" && a.walletClientType === "privy"
      )?.address;

      return {
        id: user.id,
        walletAddress,
      };
    } catch (error) {
      console.error("Error in getUserByTelegramId:", error);
      return null;
    }
  }

  /**
   * Create new user with Telegram ID
   */
  async createUser(telegramUserId: string): Promise<UserInfo> {
    try {
      const user = await privy.importUser({
        linkedAccounts: [{ type: "telegram", telegramUserId }],
      });

      const wallet = await privy.walletApi.createWallet({
        chainType: "solana",
        owner: { userId: user.id },
        additionalSigners: [{ signerId: CONFIG.PRIVY.PRIVI_SIGNERS_ID }],
      });

      return {
        id: user.id,
        walletAddress: wallet.address,
      };
    } catch (error) {
      console.error("Error in createUser:", error);
      throw new Error("Failed to create user");
    }
  }
}

export const userService = new UserService();
