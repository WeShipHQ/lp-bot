import { GasPriority, RebalanceSchedule } from "@/presentation/constants/settings.constants";
import { privy } from "@/services/privy.service";

export interface UserSettings {
  vaultAddress?: string | null;
  gasPriority: GasPriority;
  rebalancingSchedule: RebalanceSchedule | string;
}

export class GetUserSettingsUseCase {
  async execute(telegramId: string): Promise<UserSettings> {
    const user = await privy.getUserByTelegramUserId(telegramId);
    const meta = (user?.customMetadata || {}) as Record<string, any>;

    const vaultAddress = (meta.vaultAddress as string) || null;
    const gasPriority = (meta.gasPriority as GasPriority) || "medium";
    const rebalancingSchedule = (meta.rebalanceSchedule as RebalanceSchedule | string) || "1h";

    return { vaultAddress, gasPriority, rebalancingSchedule };
  }
}
