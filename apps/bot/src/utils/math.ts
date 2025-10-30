import BN from "bn.js";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import Decimal from "decimal.js";

export function solToLamports(amount: number): number {
  if (isNaN(amount)) return Number(0);
  return Number(amount * LAMPORTS_PER_SOL);
}

export function lamportsToSol(lamports: number | BN | bigint): number {
  if (typeof lamports === "number") {
    return Math.abs(lamports) / LAMPORTS_PER_SOL;
  }
  if (typeof lamports === "bigint") {
    return Math.abs(Number(lamports)) / LAMPORTS_PER_SOL;
  }

  let signMultiplier = 1;
  if (lamports.isNeg()) {
    signMultiplier = -1;
  }

  const absLamports = lamports.abs();
  const lamportsString = absLamports.toString(10).padStart(10, "0");
  const splitIndex = lamportsString.length - 9;
  const solString =
    lamportsString.slice(0, splitIndex) +
    "." +
    lamportsString.slice(splitIndex);
  return signMultiplier * parseFloat(solString);
}

// export function lamportsToUi(
//   lamports: bigint | number | string,
//   decimals: number
// ): string {
//   const amount = new Decimal(lamports.toString());
//   const divisor = new Decimal(10).pow(decimals);
//   return amount.div(divisor).toFixed(decimals);
// }

// export function uiToLamports(
//   uiAmount: string | number,
//   decimals: number
// ): bigint {
//   const amount = new Decimal(uiAmount.toString());
//   const multiplier = new Decimal(10).pow(decimals);
//   return BigInt(amount.mul(multiplier).toFixed(0));
// }
