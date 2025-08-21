import { privy } from "./privy.service";
import { WalletWithMetadata } from "@privy-io/server-auth";
import { CONFIG } from "../config";

export interface UserInfo {
  id: string;
  walletAddress?: string;
  telegramUserId?: string;
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
        user = await privy.importUser({
          linkedAccounts: [{ type: "telegram", telegramUserId }],
        });

        // Log the app ID for debugging
        console.log("🔍 UserService: PRIVY_APP_ID:", CONFIG.PRIVY.PRIVY_APP_ID);

        const wallet = await privy.walletApi.createWallet({
          chainType: "solana",
          owner: { userId: user.id },
          additionalSigners: [{ signerId: CONFIG.PRIVY.PRIVY_AUTH_ID }],
        });
        
        walletAddress = wallet.address;
      } else {
        walletAddress = user.linkedAccounts.find(
          (a): a is WalletWithMetadata =>
            a.type === "wallet" && a.walletClientType === "privy"
        )?.address;
      }

      const result = {
        id: user.id,
        walletAddress,
        telegramUserId,
      };
      
      return result;
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
      if (!user) {
        return null;
      }

      const walletAddress = user.linkedAccounts.find(
        (a): a is WalletWithMetadata =>
          a.type === "wallet" && a.walletClientType === "privy"
      )?.address;

      const result = {
        id: user.id,
        walletAddress,
        telegramUserId,
      };
      
      console.log("🔍 UserService: Found user:", result);
      return result;
    } catch (error) {
      console.error("Error in getUserByTelegramId:", error);
      return null;
    }
  }
}

export const userService = new UserService();