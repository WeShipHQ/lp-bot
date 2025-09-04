import { JupiterTokenInfo } from "@/types/jupiter.types";
import { TokenInfo } from "@/types/token.types";

export class TokenAdapter {
  transformToken(jupToken: JupiterTokenInfo): TokenInfo {
    return {
      address: jupToken.address,
      symbol: jupToken.symbol,
      name: jupToken.name,
      decimals: jupToken.decimals,
      logoUri: jupToken.icon,
      price: jupToken.price,
      priceChange24h: jupToken.priceChange24h,
      marketCap: jupToken.marketCap,
      volume24h: jupToken.volume24h,
      liquidity: jupToken.liquidity,
      isVerified: jupToken.isVerified,
      source: "jupiter",
    };
  }
}
