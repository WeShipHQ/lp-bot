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
      console.log("🔍 UserService: Getting/creating user for Telegram ID:", telegramUserId);
      
      // Check if user exists in Privy
      let user = await privy.getUserByTelegramUserId(telegramUserId);
      let walletAddress: string | undefined;

      if (!user) {
        console.log("🔍 UserService: User not found, creating new user");
        // Import new user
        user = await privy.importUser({
          linkedAccounts: [{ type: "telegram", telegramUserId }],
        });
        console.log("🔍 UserService: New user created with ID:", user.id);

        // Create Solana wallet
        const wallet = await privy.walletApi.createWallet({
          chainType: "solana",
          owner: { userId: user.id },
          additionalSigners: [{ signerId: CONFIG.PRIVY.PRIVI_SIGNERS_ID }],
        });
        walletAddress = wallet.address;
        console.log("🔍 UserService: Wallet created with address:", walletAddress);
      } else {
        console.log("🔍 UserService: Existing user found with ID:", user.id);
        // Find existing Privy wallet
        walletAddress = user.linkedAccounts.find(
          (a): a is WalletWithMetadata =>
            a.type === "wallet" && a.walletClientType === "privy"
        )?.address;
        console.log("🔍 UserService: Existing wallet address:", walletAddress);
      }

      const result = {
        id: user.id,
        walletAddress,
        telegramUserId,
      };
      
      console.log("🔍 UserService: Returning user info:", result);
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
      console.log("🔍 UserService: Getting user by Telegram ID:", telegramUserId);
      
      const user = await privy.getUserByTelegramUserId(telegramUserId);
      if (!user) {
        console.log("🔍 UserService: No user found for Telegram ID:", telegramUserId);
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

  /**
   * Create new user with Telegram ID
   */
  async createUser(telegramUserId: string): Promise<UserInfo> {
    try {
      console.log("🔍 UserService: Creating new user for Telegram ID:", telegramUserId);
      
      const user = await privy.importUser({
        linkedAccounts: [{ type: "telegram", telegramUserId }],
      });

      const wallet = await privy.walletApi.createWallet({
        chainType: "solana",
        owner: { userId: user.id },
        additionalSigners: [{ signerId: CONFIG.PRIVY.PRIVI_SIGNERS_ID }],
      });

      const result = {
        id: user.id,
        walletAddress: wallet.address,
        telegramUserId,
      };
      
      console.log("🔍 UserService: New user created:", result);
      return result;
    } catch (error) {
      console.error("Error in createUser:", error);
      throw new Error("Failed to create user");
    }
  }

  /**
   * Get user by Privy user ID
   */
  async getUserById(userId: string): Promise<UserInfo | null> {
    try {
      console.log("🔍 UserService: Getting user by ID:", userId);
      
      const user = await privy.getUser(userId);
      if (!user) {
        console.log("🔍 UserService: No user found for ID:", userId);
        return null;
      }

      const walletAddress = user.linkedAccounts.find(
        (a): a is WalletWithMetadata =>
          a.type === "wallet" && a.walletClientType === "privy"
      )?.address;

      const telegramAccount = user.linkedAccounts.find(
        (a) => a.type === "telegram"
      );

      const result = {
        id: user.id,
        walletAddress,
        telegramUserId: telegramAccount?.telegramUserId,
      };
      
      console.log("🔍 UserService: Found user by ID:", result);
      return result;
    } catch (error) {
      console.error("Error in getUserById:", error);
      return null;
    }
  }
}

export const userService = new UserService();
