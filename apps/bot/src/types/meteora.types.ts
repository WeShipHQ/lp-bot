import type {
  LbPosition,
  TInitializePositionAndAddLiquidityParamsByStrategy,
} from "@meteora-ag/dlmm";
import type { PublicKey } from "@solana/web3.js";

export interface CreateMeteoraPositionParams
  extends TInitializePositionAndAddLiquidityParamsByStrategy {}

export interface CloseMeteoraPositionParams {
  owner: PublicKey;
  position: LbPosition;
}
