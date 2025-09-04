export interface JupiterTokenStats {
  priceChange: number;
  liquidityChange: number;
  volumeChange: number;
  buyVolume: number;
  sellVolume: number;
  buyOrganicVolume: number;
  sellOrganicVolume: number;
  numBuys: number;
  numSells: number;
  numTraders: number;
  numOrganicBuyers: number;
  numNetBuyers: number;
}

export interface JupiterTokenAudit {
  mintAuthorityDisabled: boolean;
  freezeAuthorityDisabled: boolean;
  topHoldersPercentage: number;
}

export interface JupiterTokenFirstPool {
  id: string;
  createdAt: string;
}

export interface JupiterToken {
  id: string;
  name: string;
  symbol: string;
  icon: string;
  decimals: number;
  circSupply: number;
  totalSupply: number;
  tokenProgram: string;
  firstPool: JupiterTokenFirstPool;
  holderCount: number;
  audit: JupiterTokenAudit;
  organicScore: number;
  organicScoreLabel: string;
  isVerified: boolean;
  cexes: Array<string>;
  tags: Array<string>;
  fdv: number;
  mcap: number;
  usdPrice: number;
  priceBlockId: number;
  liquidity: number;
  stats5m: JupiterTokenStats;
  stats1h: JupiterTokenStats;
  stats6h: JupiterTokenStats;
  stats24h: JupiterTokenStats;
  ctLikes: number;
  smartCtLikes: number;
  updatedAt: string;
}

export type JupiterTokenSearchResponse = Array<JupiterToken>;

export interface JupiterTokenInfo {
  address: string;
  name: string;
  symbol: string;
  icon?: string;
  decimals: number;
  price: number;
  priceChange24h: number;
  marketCap: number;
  volume24h: number;
  liquidity: number;
  isVerified: boolean;
  source: "jupiter" | "meteora";
}

export interface JupiterOrderRequest {
  inputMint: string;
  outputMint: string;
  amount: string;
  taker?: string;
  referralAccount?: string;
  referralFee?: number;
}

export interface SwapInfo {
  ammKey: string;
  label: string;
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  feeAmount: string;
  feeMint: string;
}

export interface RoutePlan {
  swapInfo: SwapInfo;
  percent: number;
  bps: number;
}

export interface JupiterOrderResponse {
  mode: string;
  swapType: string;
  router: string;
  requestId: string;
  inAmount: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: string;
  slippageBps: number;
  priceImpactPct: string;
  routePlan: RoutePlan[];
  inputMint: string;
  outputMint: string;
  feeMint: string;
  feeBps: number;
  taker: string;
  gasless: boolean;
  transaction: string;
}

export interface JupiterExecuteRequest {
  signedTransaction: string;
  requestId: string;
}

export interface SwapEvent {
  inputMint: string;
  inputAmount: string;
  outputMint: string;
  outputAmount: string;
}

export interface JupiterExecuteResponse {
  status: "Success" | "Failed";
  signature: string;
  slot?: string;
  code: number;
  inputAmountResult?: string;
  outputAmountResult?: string;
  swapEvents?: SwapEvent[];
  error?: string;
}

export interface SwapParams {
  inputMint: string;
  outputMint: string;
  amount: string;
  taker: string;
  referralAccount?: string;
  referralFee?: number;
}

export interface SwapResult {
  success: boolean;
  signature?: string;
  error?: string;
  inputAmount?: string;
  outputAmount?: string;
  swapEvents?: SwapEvent[];
}

export type JupiterPricesResponse = Record<
  string,
  {
    usdPrice: number;
    blockId: number;
    decimals: number;
    priceChange24h: number;
  }
>;
