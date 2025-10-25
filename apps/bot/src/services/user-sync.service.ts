import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

export interface UserData {
  id: string;
  telegramId: string;
  username?: string;
  walletAddress?: string;
  walletId?: string;
}

export class UserSyncService {
  async syncUser(userData: UserData): Promise<boolean> {
    try {
      const existingUser = await db.query.users.findFirst({
        where: eq(users.telegramId, userData.telegramId),
      });

      if (existingUser) {
        await db
          .update(users)
          .set({
            username: userData.username || existingUser.username,
            walletAddress: userData.walletAddress || existingUser.walletAddress,
          })
          .where(eq(users.id, existingUser.id));

        console.log(`Updated existing user: ${userData.telegramId}`);
        return true;
      } else {
        const [newUser] = await db
          .insert(users)
          // @ts-expect-error
          .values({
            id: randomUUID(),
            telegramId: userData.telegramId,
            username: userData.username,
            walletAddress: userData.walletAddress,
            autoRebalanceEnabled: true,
            rebalanceThreshold: "5.00",
          })
          .returning();

        console.log(
          `Created new user in local DB: ${userData.telegramId} with local ID: ${newUser.id}`
        );
        return true;
      }
    } catch (error) {
      console.error("Error syncing user:", error);
      return false;
    }
  }

  async getUserByTelegramId(telegramId: string) {
    try {
      return await db.query.users.findFirst({
        where: eq(users.telegramId, telegramId),
      });
    } catch (error) {
      console.error("Error getting user by Telegram ID:", error);
      return null;
    }
  }

  async getUserById(id: string) {
    try {
      return await db.query.users.findFirst({
        where: eq(users.id, id),
      });
    } catch (error) {
      console.error("Error getting user by ID:", error);
      return null;
    }
  }

  async getUserByTelegramIdOrCreate(userData: UserData) {
    try {
      let user = await this.getUserByTelegramId(userData.telegramId);

      if (!user) {
        await this.syncUser(userData);
        user = await this.getUserByTelegramId(userData.telegramId);
      }

      return user;
    } catch (error) {
      console.error("Error getting or creating user:", error);
      return null;
    }
  }
}

export const userSyncService = new UserSyncService();
