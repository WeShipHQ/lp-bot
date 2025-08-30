import { api } from "@/bot/utils/http-client.util";
import { MeteoraDlmmPosition } from "@/types/meteora.types";

export class MeteoraPositionService {
  private readonly dlmmApiUrl = "https://dlmm-api.meteora.ag";
  private readonly dammV1ApiUrl = "https://damm-api.meteora.ag";
  private readonly dammV2ApiUrl = "https://dammv2-api.meteora.ag";

  /**
   * Fetch position information
   * @param positionAddress - Position address
   * @returns Promise<MeteoraDlmmPosition>
   */
  async getDlmmPosition(positionAddress: string): Promise<MeteoraDlmmPosition> {
    try {
      console.log(`[Meteora] Fetching DLMM position: ${positionAddress}`);

      const data = await api.getWithRetry<MeteoraDlmmPosition>(
        `${this.dlmmApiUrl}/position/${positionAddress}`
      );

      return data;
    } catch (error) {
      console.error(
        `[Meteora] Error fetching DLMM position ${positionAddress}:`,
        error
      );
      throw error;
    }
  }
}

export const meteoraPositionService = new MeteoraPositionService();
