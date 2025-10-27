import { IUserRepository } from "@/domain/user/user.repository";
import { User } from "@/domain/user/user.entity";
import { privy } from "@/services/privy.service";
import { CONFIG } from "@/config";
import { OptimisticLockError } from "@/shared/errors";

export interface ConnectWalletResult {
  walletId: string;
  walletAddress: string;
  userId: string;
  privyUserId: string;
}

const MAX_OPTIMISTIC_RETRIES = 3;

export class ConnectWalletUseCase {
  constructor(private readonly userRepository: IUserRepository) {}

  async execute(
    telegramId: string,
    _privyToken?: string,
    username?: string
  ): Promise<ConnectWalletResult> {
    let privyUser = await privy.getUserByTelegramUserId(telegramId);

    const trimmedUsername = username?.trim();

    if (!privyUser) {
      privyUser = await privy.importUser({
        linkedAccounts: [{ type: "telegram", telegramUserId: telegramId }],
        customMetadata: {
          telegramUserId: telegramId,
          ...(trimmedUsername ? { telegramUsername: trimmedUsername } : {}),
        },
      });
    }

    const metadata: Record<string, string | number | boolean> = {
      ...(privyUser.customMetadata || {}),
    };

    let walletId =
      typeof metadata.walletId === "string"
        ? (metadata.walletId as string)
        : "";
    let walletAddress =
      typeof metadata.walletAddress === "string"
        ? (metadata.walletAddress as string)
        : "";

    let metadataNeedsUpdate = false;

    if (!walletId || !walletAddress) {
      const wallet = await privy.walletApi.createWallet({
        chainType: "solana",
        // owner: {
        //   userId: privyUser.id,
        // },
        ownerId: CONFIG.PRIVY.PRIVY_AUTH_ID,
        additionalSigners: [{ signerId: CONFIG.PRIVY.PRIVY_AUTH_ID }],
      });

      walletId = wallet.id;
      walletAddress = wallet.address;
      metadata.walletId = walletId;
      metadata.walletAddress = walletAddress;
      metadataNeedsUpdate = true;
    }

    if (metadata.telegramUserId !== telegramId) {
      metadata.telegramUserId = telegramId;
      metadataNeedsUpdate = true;
    }

    if (trimmedUsername && metadata.telegramUsername !== trimmedUsername) {
      metadata.telegramUsername = trimmedUsername;
      metadataNeedsUpdate = true;
    }

    if (metadataNeedsUpdate) {
      await privy.setCustomMetadata(privyUser.id, metadata);
    }

    if (!walletId || !walletAddress) {
      throw new Error("Failed to provision Privy wallet for user");
    }

    const existing = await this.userRepository.findByTelegramId(telegramId);

    if (!existing) {
      const user = User.create({
        telegramId,
        privyUserId: privyUser.id,
        username: trimmedUsername,
        walletAddress,
        walletId,
      });
      await this.userRepository.save(user);

      return {
        walletId,
        walletAddress,
        userId: user.id,
        privyUserId: privyUser.id,
      };
    }

    for (let attempt = 0; attempt < MAX_OPTIMISTIC_RETRIES; attempt++) {
      const latestUser =
        attempt === 0
          ? existing
          : await this.userRepository.findByTelegramId(telegramId);

      if (!latestUser) {
        throw new Error("User not found");
      }

      let shouldPersist = false;
      let domainUser = latestUser;

      if (
        latestUser.walletAddress !== walletAddress ||
        latestUser.walletId !== walletId
      ) {
        domainUser = User.reconstitute({
          id: latestUser.id,
          telegramId: latestUser.telegramId,
          privyUserId: latestUser.privyUserId,
          walletId,
          walletAddress,
          username: latestUser.getUsername(),
          referralCode: latestUser.getReferralCode() ?? undefined,
          referredBy: latestUser.getReferredBy() ?? undefined,
          preferences: latestUser.getPreferences(),
          createdAt: latestUser.createdAt,
          updatedAt: new Date(),
          version: latestUser.getVersion(),
        });
        shouldPersist = true;
      }

      if (trimmedUsername && trimmedUsername !== domainUser.getUsername()) {
        domainUser.updateUsername(trimmedUsername);
        shouldPersist = true;
      }

      if (!shouldPersist) {
        return {
          walletId: domainUser.walletId,
          walletAddress: domainUser.walletAddress,
          userId: domainUser.id,
          privyUserId: privyUser.id,
        };
      }

      try {
        await this.userRepository.update(domainUser);

        return {
          walletId: domainUser.walletId,
          walletAddress: domainUser.walletAddress,
          userId: domainUser.id,
          privyUserId: privyUser.id,
        };
      } catch (error) {
        if (error instanceof OptimisticLockError && attempt < MAX_OPTIMISTIC_RETRIES - 1) {
          continue;
        }
        throw error;
      }
    }

    throw new OptimisticLockError(
      "Failed to update user after multiple attempts"
    );
  }
}
