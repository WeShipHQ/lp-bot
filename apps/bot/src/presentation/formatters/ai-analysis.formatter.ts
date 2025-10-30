import { PoolAnalysisResult } from '@/services/ai.service';
import { bold, italic } from '@/utils/telegram';

export class AIAnalysisFormatter {
  static formatAnalysis(analysis: PoolAnalysisResult): string {
    const riskEmoji = this.getRiskEmoji(analysis.riskLevel);
    
    return [
      `🐼 ${bold('Panda AI Analysis')}\n`,
      `${bold('Strategy:')} ${analysis.strategy}\n`,
      `${bold('Risk Level:')} ${riskEmoji} ${analysis.riskLevel}\n`,
      `${bold('Analysis:')}`,
      `${italic(analysis.reasoning)}\n`,
      `${bold('Recommendations:')}`,
      ...analysis.recommendations.map((rec, index) => `${index + 1}. ${rec}`),
      `\n${italic('⚠️ This is AI-generated advice. Always do your own research and consider your risk tolerance.')}`
    ].join('\n');
  }

  private static getRiskEmoji(riskLevel: string): string {
    switch (riskLevel) {
      case 'Low':
        return '🟢';
      case 'Medium':
        return '🟡';
      case 'High':
        return '🔴';
      default:
        return '⚪';
    }
  }
}