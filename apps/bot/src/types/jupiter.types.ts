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
  status: 'Success' | 'Failed';
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