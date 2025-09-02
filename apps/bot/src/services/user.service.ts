import { privy } from "./privy.service";
export interface UserInfo {
  id: string;
  walletAddress?: string;
  telegramUserId?: string;
  twoFactorEnabled?: boolean;
  twoFactorSecret?: string;
  backupCodes?: string[];
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
      const backupCodesString = user.customMetadata.backupCodes as string;
      const backupCodes = backupCodesString ? JSON.parse(backupCodesString) : [];

      const result = {
        id: user.id,
        walletAddress,
        telegramUserId,
        twoFactorEnabled,
        twoFactorSecret,
        backupCodes,
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
    twoFactorSecret?: string, 
    backupCodes?: string[]
  ): Promise<boolean> {
    try {
      const customMetadata: any = {
        twoFactorEnabled
      };

      if (twoFactorSecret) {
        customMetadata.twoFactorSecret = twoFactorSecret;
      }

      if (backupCodes) {
        customMetadata.backupCodes = JSON.stringify(backupCodes);
      }

      await privy.setCustomMetadata(userId, customMetadata);
      return true;
    } catch (error) {
      console.error("Error updating 2FA settings:", error);
      return false;
    }
  }
}

export const userService = new UserService();