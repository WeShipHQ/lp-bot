import { IUserRepository } from "@/domain/user/user.repository";
import { User } from "@/domain/user/user.entity";
import { UserDomainService } from "@/domain/user/user.service";
import { privy } from "@/services/privy.service";
import { CONFIG } from "@/config";

export interface ConnectWalletResult {
  walletId: string;
  walletAddress: string;
  userId: string;
  privyUserId: string;
}

export class ConnectWalletUseCase {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly userDomainService: UserDomainService
  ) {}

  async execute(
    telegramId: string,
    _privyToken?: string,
    username?: string,
    referralCode?: string
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
      const user = await this.userDomainService.createUserWithReferral(
        {
          telegramId,
          privyUserId: privyUser.id,
          username: trimmedUsername,
          walletAddress,
          walletId,
        },
        referralCode
      );

      return {
        walletId,
        walletAddress,
        userId: user.id,
        privyUserId: privyUser.id,
      };
    }

    let shouldPersist = false;
    let domainUser = existing;

    if (
      existing.walletAddress !== walletAddress ||
      existing.walletId !== walletId
    ) {
      domainUser = User.reconstitute({
        id: existing.id,
        telegramId: existing.telegramId,
        privyUserId: existing.privyUserId,
        walletId,
        walletAddress,
        username: existing.getUsername(),
        preferences: existing.getPreferences(),
        createdAt: existing.createdAt,
        updatedAt: new Date(),
      });
      shouldPersist = true;
    }

    if (trimmedUsername && trimmedUsername !== domainUser.getUsername()) {
      domainUser.updateUsername(trimmedUsername);
      shouldPersist = true;
    }

    if (shouldPersist) {
      await this.userRepository.update(domainUser);
    }

    return {
      walletId,
      walletAddress,
      userId: domainUser.id,
      privyUserId: privyUser.id,
    };
  }
}
