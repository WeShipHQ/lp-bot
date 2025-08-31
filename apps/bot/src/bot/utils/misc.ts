import { OPEN_POSITION_FEE } from "../config/constants";

export function calculateRecommendedAmount(positionAmount: number): number {
  const openPositionFee = positionAmount * (OPEN_POSITION_FEE / 100);
  const transactionFees = 0.006; // Estimated Solana tx fees
  const accountCreationFees = 0.006; // Estimated account creation fees
  const slippageBuffer = positionAmount * 0.02; // 2% buffer

  return (
    positionAmount +
    openPositionFee +
    transactionFees +
    accountCreationFees +
    slippageBuffer
  );
}
