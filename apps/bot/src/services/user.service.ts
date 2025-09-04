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

      const walletAddress = user.customMetadata.walletAddress as string;
      const twoFactorEnabled = user.customMetadata.twoFactorEnabled as boolean || false;
      const twoFactorSecret = user.customMetadata.twoFactorSecret as string;
      const hasExportedPrivateKey = user.customMetadata.hasExportedPrivateKey as boolean || false;

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
  async markPrivateKeyExported(userId: string): Promise<boolean> {
    try {
      // Get current user data to preserve existing metadata
      const currentUser = await privy.getUser(userId);
      const currentMetadata = currentUser.customMetadata || {};
      
      // Merge with existing metadata to preserve wallet info
      const updatedMetadata = {
        ...currentMetadata,
        hasExportedPrivateKey: true
      };
      
      await privy.setCustomMetadata(userId, updatedMetadata);
      return true;
    } catch (error) {
      console.error("Error marking private key as exported:", error);
      return false;
    }
  }
}

export const userService = new UserService();