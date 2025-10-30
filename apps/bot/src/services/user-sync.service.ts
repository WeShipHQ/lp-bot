import { db } from "@/db";
import { User } from "@/domain/user/user.entity";
import { IUserRepository } from "@/domain/user/user.repository";
import { UserRepository } from "@/infrastructure/database/repositories/user.repository";
import { logger } from "@/utils/logger";

export interface UserData {
  id: string;
  telegramId: string;
  privyUserId?: string;
  username?: string;
  walletAddress?: string;
  walletId?: string;
}

export class UserSyncService {
  constructor(private readonly userRepository: IUserRepository) {}

  async syncUser(userData: UserData): Promise<User | null> {
    try {
      const existingUser = await this.userRepository.findByTelegramId(
        userData.telegramId
      );
      const normalizedUsername = userData.username?.trim() || undefined;

      if (existingUser) {
        let userToUpdate = existingUser;
        let shouldPersist = false;

        const walletId = userData.walletId ?? existingUser.walletId;
        const walletAddress =
          userData.walletAddress ?? existingUser.walletAddress;

        if (
          (userData.walletId && userData.walletId !== existingUser.walletId) ||
          (userData.walletAddress &&
            userData.walletAddress !== existingUser.walletAddress)
        ) {
          userToUpdate = this.reconstituteUser(existingUser, {
            walletId,
            walletAddress,
          });
          shouldPersist = true;
        }

        if (
          normalizedUsername &&
          normalizedUsername !== userToUpdate.getUsername()
        ) {
          try {
            userToUpdate.updateUsername(normalizedUsername);
            shouldPersist = true;
          } catch (error) {
            logger.warn(
              {
                err: error,
                telegramId: userData.telegramId,
              },
              "Failed to update username during user sync"
            );
          }
        }

        if (shouldPersist) {
          await this.userRepository.update(userToUpdate);
          logger.debug(
            { telegramId: userData.telegramId },
            "Updated existing user during sync"
          );
        } else {
          logger.debug(
            { telegramId: userData.telegramId },
            "No changes detected while syncing user"
          );
        }

        return userToUpdate;
      }

      if (
        !userData.privyUserId ||
        !userData.walletId ||
        !userData.walletAddress
      ) {
        logger.warn(
          { telegramId: userData.telegramId },
          "Unable to create user during sync due to missing wallet or Privy identifiers"
        );
        return null;
      }

      const newUser = User.create({
        telegramId: userData.telegramId,
        privyUserId: userData.privyUserId,
        walletId: userData.walletId,
        walletAddress: userData.walletAddress,
        username: normalizedUsername,
      });

      await this.userRepository.save(newUser);
      logger.info(
        { telegramId: userData.telegramId, userId: newUser.id },
        "Created new user during sync"
      );

      return newUser;
    } catch (error) {
      logger.error(
        { err: error, telegramId: userData.telegramId },
        "Error syncing user"
      );
      return null;
    }
  }

  async getUserByTelegramId(telegramId: string): Promise<User | null> {
    try {
      return await this.userRepository.findByTelegramId(telegramId);
    } catch (error) {
      logger.error(
        { err: error, telegramId },
        "Error fetching user by Telegram ID"
      );
      return null;
    }
  }

  async getUserById(id: string): Promise<User | null> {
    try {
      return await this.userRepository.findById(id);
    } catch (error) {
      logger.error({ err: error, userId: id }, "Error fetching user by ID");
      return null;
    }
  }

  async getUserByTelegramIdOrCreate(userData: UserData): Promise<User | null> {
    try {
      const existingUser = await this.userRepository.findByTelegramId(
        userData.telegramId
      );
      if (existingUser) {
        return existingUser;
      }

      const createdUser = await this.syncUser(userData);
      if (!createdUser) {
        logger.warn(
          { telegramId: userData.telegramId },
          "User sync did not return a user after creation attempt"
        );
      }

      return createdUser;
    } catch (error) {
      logger.error(
        { err: error, telegramId: userData.telegramId },
        "Error getting or creating user"
      );
      return null;
    }
  }

  private reconstituteUser(
    user: User,
    overrides: { walletId: string; walletAddress: string }
  ): User {
    return User.reconstitute({
      id: user.id,
      telegramId: user.telegramId,
      privyUserId: user.privyUserId,
      walletId: overrides.walletId,
      walletAddress: overrides.walletAddress,
      username: user.getUsername() ?? undefined,
      preferences: user.getPreferences(),
      createdAt: user.createdAt,
      updatedAt: new Date(),
    });
  }
}

const defaultUserRepository = new UserRepository(db);

export const userSyncService = new UserSyncService(defaultUserRepository);
