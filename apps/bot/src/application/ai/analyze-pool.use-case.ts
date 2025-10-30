import { UnifiedPool } from "@/types/core.types";
import { AIService, PoolAnalysisResult } from "@/services/ai.service";

export interface AnalyzePoolInput {
  pool: UnifiedPool;
}

export class AnalyzePoolUseCase {
  constructor(private readonly aiService: AIService) {}

  async execute(input: AnalyzePoolInput): Promise<string> {
    const { pool } = input;

    if (!pool) {
      throw new Error("Pool data is required for analysis");
    }

    return await this.aiService.analyzePool(pool);
  }
}
