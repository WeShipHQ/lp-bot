import { privy } from "./privy.service";
export interface UserInfo {
  id: string;
  walletAddress?: string;
  telegramUserId?: string;
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