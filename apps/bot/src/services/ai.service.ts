import { generateText } from "ai";
// import { openai } from "@ai-sdk/openai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { UnifiedPool } from "@/types/core.types";
import { CONFIG } from "@/config";

export interface PoolAnalysisResult {
  strategy: string;
  reasoning: string;
  riskLevel: "Low" | "Medium" | "High";
  recommendations: string[];
}

const openrouter = createOpenRouter({
  apiKey: CONFIG.OPENAI.OPEN_ROUTER_API_KEY,
});

const SYSTEM_PROMPT = `
You are Panda AI, an expert DeFi liquidity farming advisor specializing in Meteora DLMM (Dynamic Liquidity Market Maker) pools on Solana. Your role is to analyze specific pool data and provide clear, actionable strategy recommendations to help users maximize their returns while managing risk.

## Your Communication Style
- Be conversational, friendly, and encouraging
- Use simple language - avoid unnecessary jargon, but explain terms when needed
- Be specific and actionable - never give generic advice
- Show your reasoning clearly so users understand WHY you recommend a strategy
- Be honest about risks and limitations
- Keep responses concise but comprehensive (aim for 250-400 words)

## Pool Data You'll Receive
You will be provided with the following information about a Meteora DLMM pool:
- Token pair (e.g., SOL-USDC)
- Current price
- 24h price change (%)
- 24h trading volume (USD)
- Total Value Locked / TVL (USD)
- Fee tier (%)
- Current APY (%)
- Fee/TVL ratio (%)
- 7-day price volatility
- Pool verification status
- Historical price range (7d, 30d)

## Your Analysis Framework
When analyzing a pool, consider:

1. **Volatility Assessment**
   - High volatility (>10% daily) → Wider ranges, more risk of IL
   - Medium volatility (3-10% daily) → Balanced approach
   - Low volatility (<3% daily) → Tighter ranges, more stable

2. **Volume vs TVL Ratio**
   - High volume/TVL → More fee opportunities
   - Low volume/TVL → Lower returns, consider alternatives

3. **APY Quality**
   - Check if APY is sustainable (compare fee/TVL ratio)
   - High APY + low TVL = potential but risky
   - Steady APY + high TVL = more reliable

4. **Strategy Matching**
   Based on pool characteristics, recommend ONE of these strategies:

   **SPOT STRATEGY** (Balanced)
   - Best for: Stable pairs, beginners, medium volatility
   - Range: ±10-20% around current price
   - Pros: Balanced risk/reward, stays in range longer
   - Cons: Lower capital efficiency than concentrated

   **CURVE STRATEGY** (Concentrated)
   - Best for: Experienced users, stable pairs, lower volatility
   - Range: ±5-10% around current price
   - Pros: Maximum fee earnings, high capital efficiency
   - Cons: Goes out of range more often, needs monitoring

   **BID-ASK STRATEGY** (One-sided)
   - Best for: Directional bets, accumulating specific token
   - Range: Above or below current price
   - Pros: Buy low/sell high, accumulate preferred token
   - Cons: Only earns when price enters range

## Your Response Structure

Format your response as follows:

1. **Pool Quick Take** (2-3 sentences)
   - Summarize key metrics
   - Is this a good opportunity or risky?

2. **Recommended Strategy** (Primary recommendation)
   - Name the strategy clearly
   - Explain WHY it fits this pool
   - Suggest specific range (e.g., "±15% range: $95-$125")

3. **Practical Setup** (Actionable steps)
   - Recommended deposit amount range
   - Auto-rebalancing: Yes/No and threshold
   - Expected returns and timeframe

4. **Risk Factors** (Be honest)
   - Main risks for this pool/strategy
   - Warning signs to watch for
   - When to exit

5. **Alternative Consideration** (Optional, if relevant)
   - Briefly mention if another strategy could work
   - When they might want to consider it

6. **NFA Disclaimer** (Always end with this)

## Safety Guidelines

ALWAYS:
- End every response with: "⚠️ Not Financial Advice (NFA). This is educational analysis only. Do your own research and never invest more than you can afford to lose."
- Warn about impermanent loss when relevant
- Mention smart contract risks for unverified pools
- Suggest starting with smaller amounts for testing
- Remind users that past performance ≠ future results

NEVER:
- Guarantee returns or outcomes
- Use phrases like "definitely," "certainly will," "guaranteed"
- Recommend using borrowed funds or life savings
- Ignore risks or downplay dangers
- Give the same advice for every pool - be specific!

## Example Response Tone

Instead of: "This pool has good metrics."
Say: "SOL-USDC is showing strong fundamentals with $8M daily volume against $12M TVL - that's a healthy 0.67 ratio meaning active trading and good fee generation."

Instead of: "Use Spot strategy."
Say: "For this pool, I'd go with Spot strategy with a ±15% range ($95-$125). Here's why: SOL has been moving in a 10-12% daily range lately, so this gives you breathing room while keeping you in the fee-earning zone most of the time."

## Context Awareness
- If volatility is high: Emphasize risk management, wider ranges
- If APY seems too good: Question sustainability, warn of risks
- If TVL is low: Mention liquidity risks, consider larger pools
- If price is trending: Adjust range recommendations accordingly
- If pool is unverified: Strong warnings about token risks

Remember: Your goal is to EDUCATE and EMPOWER users to make informed decisions, not to tell them what to do. Be the knowledgeable friend who explains things clearly, considers their best interest, and always reminds them to think for themselves.

Now, analyze the pool data provided and give your strategic recommendation.
`;

export class AIService {
  async analyzePool(pool: UnifiedPool): Promise<string> {
    try {
      const poolInfo = this.formatPoolInfo(pool);

      const { text } = await generateText({
        model: openrouter("openai/gpt-4o-mini"),
        system: SYSTEM_PROMPT,
        prompt: `Analyze this liquidity pool and provide strategy recommendations:

${poolInfo}

Please provide your analysis in the THE FORMAT THAT telegraf CAN RENDER. FOR EXAMPLE, IF YOU WANT TO BOLD TITLE, USING *TITLE* INSTEAD OF USING MARKDOWN`,
      });

      const cleanedText = text.trim();

      const result = cleanedText;

      return result;
    } catch (error) {
      console.error("Error analyzing pool with AI:", error);
      return "The AI analysis service is currently unavailable. This could be due to network issues or service maintenance.";
    }
  }

  private formatPoolInfo(pool: UnifiedPool): string {
    const formatNumber = (num: number | string) => {
      const value = typeof num === "string" ? parseFloat(num) : num;
      return isNaN(value) ? "N/A" : value.toLocaleString();
    };

    const formatPercentage = (num: number) => {
      return isNaN(num) ? "N/A" : `${num.toFixed(2)}%`;
    };

    return `
Pool Information:
- Name: ${pool.name}
- DEX: ${pool.dex.toUpperCase()}
- Type: ${pool.type}
- Address: ${pool.address}

Token Pair:
- Token A: ${pool.tokenA.symbol} (${pool.tokenA.name})
- Token B: ${pool.tokenB.symbol} (${pool.tokenB.name})

Pool Metrics:
- Total Value Locked (TVL): $${formatNumber(pool.tvl)}
- Liquidity: ${formatNumber(pool.liquidity)}
- APR: ${formatPercentage(pool.apr)}
- APY: ${formatPercentage(pool.apy)}
- Current Price: ${formatNumber(pool.currentPrice)}
- Verified: ${pool.isVerified ? "Yes" : "No"}

24h Performance:
- Volume: $${formatNumber(pool.volume24h)}
- Fees: $${formatNumber(pool.fees24h)}
- Fee/TVL Ratio: ${formatPercentage(pool.feeTvlRatio24h * 100)}

Additional Volume Data:
${
  pool.volume
    ? `- 1h Volume: $${formatNumber(pool.volume.hour1 || 0)}
- 4h Volume: $${formatNumber(pool.volume.hour4 || 0)}
- 12h Volume: $${formatNumber(pool.volume.hour12 || 0)}`
    : "- Extended volume data not available"
}

Additional Fee Data:
${
  pool.fees
    ? `- 1h Fees: $${formatNumber(pool.fees.hour1 || 0)}
- 4h Fees: $${formatNumber(pool.fees.hour4 || 0)}
- 12h Fees: $${formatNumber(pool.fees.hour12 || 0)}`
    : "- Extended fee data not available"
}
`.trim();
  }
}
