import { privy } from "./privy.service";
export interface UserInfo {
  id: string;
  walletAddress?: string;
  telegramUserId?: string;
  twoFactorEnabled?: boolean;
  twoFactorSecret?: string;
  hasExportedPrivateKey?: boolean;
}

export class UserService {
  /**
   * Get user by Telegram ID
   */
  async getUserByTelegramId(telegramUserId: string): Promise<UserInfo | null> {
    try {
      const user = await privy.getUserByTelegramUserId(telegramUserId);
      if (!user) {
        return null;
      }

      const metadata = (user.customMetadata || {}) as Record<string, unknown>;
      const walletAddress =
        typeof metadata.walletAddress === "string"
          ? (metadata.walletAddress as string)
          : undefined;
      const twoFactorEnabled = Boolean(metadata.twoFactorEnabled);
      const twoFactorSecret =
        typeof metadata.twoFactorSecret === "string"
          ? (metadata.twoFactorSecret as string)
          : undefined;
      const hasExportedPrivateKey = Boolean(metadata.hasExportedPrivateKey);

      const result = {
        id: user.id,
        walletAddress,
        telegramUserId,
        twoFactorEnabled,
        twoFactorSecret,
        hasExportedPrivateKey,
      };
      
      return result;
    } catch (error) {
      console.error("Error in getUserByTelegramId:", error);
      return null;
    }
  }

  /**
   * Update user's 2FA settings
   */
  async updateTwoFactorSettings(
    userId: string, 
    twoFactorEnabled: boolean, 
    twoFactorSecret?: string
  ): Promise<boolean> {
    try {
      // Get current user data to preserve existing metadata
      const currentUser = await privy.getUser(userId);
      const currentMetadata = currentUser.customMetadata || {};
      
      // Merge with existing metadata to preserve wallet info
      const customMetadata: Record<string, string | number | boolean> = {
        ...currentMetadata,
        twoFactorEnabled
      };

      if (twoFactorSecret) {
        customMetadata.twoFactorSecret = twoFactorSecret;
      }

      await privy.setCustomMetadata(userId, customMetadata);
      return true;
    } catch (error) {
      console.error("Error updating 2FA settings:", error);
      return false;
    }
  }

  /**
   * Mark user as having exported private key
   */
  async markPrivateKeyExported(params: {
    privyUserId?: string;
    telegramId?: string;
  }): Promise<boolean> {
    try {
      let privyUserId = params.privyUserId;
      let currentUser;

      if (privyUserId) {
        currentUser = await privy.getUser(privyUserId);
      } else if (params.telegramId) {
        currentUser = await privy.getUserByTelegramUserId(params.telegramId);
        privyUserId = currentUser?.id;
      } else {
        throw new Error("Missing Privy identifier");
      }

      if (!currentUser || !privyUserId) {
        throw new Error("Privy user not found");
      }

      const currentMetadata = currentUser.customMetadata || {};
      if (currentMetadata.hasExportedPrivateKey === true) {
        return true;
      }

      await privy.setCustomMetadata(privyUserId, {
        ...currentMetadata,
        hasExportedPrivateKey: true,
      });

      return true;
    } catch (error) {
      console.error("Error marking private key as exported:", error);
      return false;
    }
  }
}

export const userService = new UserService();