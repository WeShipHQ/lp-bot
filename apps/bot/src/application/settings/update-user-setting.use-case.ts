import { GasPriority, RebalanceSchedule } from "@/presentation/constants/settings.constants";
import { privy } from "@/services/privy.service";
import { solanaService } from "@/services/solana.service";

export class UpdateUserSettingUseCase {
  private async getPrivyUserIdByTelegram(telegramId: string): Promise<string> {
    const user = await privy.getUserByTelegramUserId(telegramId);
    if (!user) throw new Error("User not found");
    return user.id;
  }

  async setVaultAddress(telegramId: string, address: string): Promise<void> {
    if (!solanaService.validateAddress(address)) {
      throw new Error("Invalid Solana address");
    }
    const privyId = await this.getPrivyUserIdByTelegram(telegramId);
    const current = await privy.getUser(privyId);
    const metadata = current.customMetadata || {};
    await privy.setCustomMetadata(privyId, { ...metadata, vaultAddress: address });
  }

  async setGasPriority(telegramId: string, level: GasPriority): Promise<void> {
    const privyId = await this.getPrivyUserIdByTelegram(telegramId);
    const current = await privy.getUser(privyId);
    const metadata = current.customMetadata || {};
    await privy.setCustomMetadata(privyId, { ...metadata, gasPriority: level });
  }

  async setRebalancingSchedule(telegramId: string, schedule: RebalanceSchedule | string): Promise<void> {
    const privyId = await this.getPrivyUserIdByTelegram(telegramId);
    const current = await privy.getUser(privyId);
    const metadata = current.customMetadata || {};
    await privy.setCustomMetadata(privyId, { ...metadata, rebalanceSchedule: schedule });
  }
}
