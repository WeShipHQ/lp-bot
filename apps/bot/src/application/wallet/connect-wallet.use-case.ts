import { IUserRepository } from "@/domain/user/user.repository";
import { User } from "@/domain/user/user.entity";
import { privy } from "@/services/privy.service";
import { CONFIG } from "@/config";

export interface ConnectWalletResult {
  walletId: string;
  walletAddress: string;
  userId: string;
}

/**
 * Connects/creates a Privy wallet for a Telegram user and syncs to DB
 */
export class ConnectWalletUseCase {
  constructor(private readonly userRepository: IUserRepository) {}

  /**
   * Authenticate with Privy (privyToken is reserved for future validation),
   * get or create a wallet, and upsert user in database
   */
  async execute(telegramId: string, privyToken?: string, username?: string): Promise<ConnectWalletResult> {
    // In this codebase, we rely on server-side Privy and Telegram linkage
    // privyToken can be validated here in future if needed

    // Find existing Privy user linked by telegram
    let privyUser = await privy.getUserByTelegramUserId(telegramId);

    let walletId: string;
    let walletAddress: string;

    if (!privyUser) {
      // Create on Privy
      const wallet = await privy.walletApi.createWallet({
        chainType: "solana",
        ownerId: CONFIG.PRIVY.PRIVY_AUTH_ID,
        additionalSigners: [{ signerId: CONFIG.PRIVY.PRIVY_AUTH_ID }],
      });

      privyUser = await privy.importUser({
        linkedAccounts: [{ type: "telegram", telegramUserId: telegramId }],
        customMetadata: { walletId: wallet.id, walletAddress: wallet.address },
      });

      walletId = wallet.id;
      walletAddress = wallet.address;
    } else {
      walletId = (privyUser.customMetadata?.walletId as string) || "";
      walletAddress = (privyUser.customMetadata?.walletAddress as string) || "";

      // If user exists but metadata is missing, try to create a wallet
      if (!walletId || !walletAddress) {
        const wallet = await privy.walletApi.createWallet({
          chainType: "solana",
          ownerId: CONFIG.PRIVY.PRIVY_AUTH_ID,
          additionalSigners: [{ signerId: CONFIG.PRIVY.PRIVY_AUTH_ID }],
        });
        await privy.setCustomMetadata(privyUser.id, {
          ...(privyUser.customMetadata || {}),
          walletId: wallet.id,
          walletAddress: wallet.address,
        });
        walletId = wallet.id;
        walletAddress = wallet.address;
      }
    }

    // Upsert user in DB
    const existing = await this.userRepository.findByTelegramId(telegramId);
    if (!existing) {
      const user = User.create({
        telegramId,
        username,
        walletAddress,
        walletId,
      });
      await this.userRepository.save(user);
      return { walletId, walletAddress, userId: user.id };
    } else {
      // Update wallet info if changed
      if (existing.walletAddress !== walletAddress || existing.walletId !== walletId) {
        const updated = User.reconstitute({
          id: existing.id,
          telegramId: existing.telegramId,
          walletId,
          walletAddress,
          username: existing.getUsername(),
          preferences: existing.getPreferences(),
          createdAt: existing.createdAt,
          updatedAt: new Date(),
        });
        await this.userRepository.update(updated);
      }
      return { walletId, walletAddress, userId: existing.id };
    }
  }
}
