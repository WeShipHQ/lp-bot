import { Token } from "./token.types";

export type PositionStatus = "active" | "closed" | "rebalancing";

export interface Position {
  id: string;
  poolId: string;
  dex: string;
  userAddress: string;
  liquidity: string;
  tokenX: Token;
  tokenY: Token;
  feesEarned: string;
  pnl: {
    absolute: string;
    percentage: number;
  };
  status: PositionStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface DisplayPosition {
  address: string;
  pair_address: string;
  owner: string;
  total_fee_x_claimed: number;
  total_fee_y_claimed: number;
  total_reward_x_claimed: number;
  total_reward_y_claimed: number;
  total_fee_usd_claimed: number;
  total_reward_usd_claimed: number;
  fee_apy_24h: number;
  fee_apr_24h: number;
  daily_fee_yield: number;
}

export interface PositionPnlResult {
  pnlUsd: number;
  pnlPercentage: number;
  unrealizedPnlUsd: number;
  unrealizedPnlPercentage: number;
}

// ublicKey: PublicKey [PublicKey(338RGSh4boMSv41d1ibq46cexUXTmMD9TKyUhxrcqJJm)] {
//     _bn: <BN: 1e42ec6824c2d17c50f2ebcffe5df8f80c8faba9bdc81c804a0561bda0cfd67a>
//   },
//   positionData: {
//     totalXAmount: '1283670',
//     totalYAmount: '62301944',
//     positionBinData: [
//       [Object], [Object], [Object], [Object],
//       [Object], [Object], [Object], [Object],
//       [Object], [Object], [Object], [Object],
//       [Object], [Object], [Object], [Object],
//       [Object], [Object], [Object], [Object],
//       [Object], [Object], [Object], [Object],
//       [Object], [Object], [Object], [Object],
//       [Object], [Object], [Object], [Object],
//       [Object], [Object], [Object], [Object],
//       [Object], [Object], [Object], [Object],
//       [Object]
//     ],
//     lastUpdatedAt: <BN: 68b5bbab>,
//     lowerBinId: 6571,
//     upperBinId: 6611,
//     feeX: <BN: 9d>,
//     feeY: <BN: 1b52>,
//     rewardOne: <BN: 0>,
//     rewardTwo: <BN: 0>,
//     feeOwner: PublicKey [PublicKey(11111111111111111111111111111111)] {
//       _bn: <BN: 0>
//     },
//     totalClaimedFeeXAmount: <BN: 0>,
//     totalClaimedFeeYAmount: <BN: 0>,
//     totalXAmountExcludeTransferFee: <BN: 139656>,
//     totalYAmountExcludeTransferFee: <BN: 3b6a6f8>,
//     rewardOneExcludeTransferFee: <BN: 0>,
//     rewardTwoExcludeTransferFee: <BN: 0>,
//     feeXExcludeTransferFee: <BN: 9d>,
//     feeYExcludeTransferFee: <BN: 1b52>,
//     owner: PublicKey [PublicKey(E3RztXBJ44We3qTi5fNix95EMizSkNKjGr212625ogKe)] {
//       _bn: <BN: c1c75b69213075d53ea0ba91ace998ed0e0e06769f4215c7de13f27b026a2185>
//     }
//   },
//   version: 1
// }
// positionData {
//   address: '338RGSh4boMSv41d1ibq46cexUXTmMD9TKyUhxrcqJJm',
//   pair_address: '7q1BaMsFikgMJBMmmzF4nD9mxE6agFASnxGGq58LVd43',
//   owner: 'E3RztXBJ44We3qTi5fNix95EMizSkNKjGr212625ogKe',
//   total_fee_x_claimed: 0,
//   total_fee_y_claimed: 0,
//   total_reward_x_claimed: 0,
//   total_reward_y_claimed: 0,
//   total_fee_usd_claimed: 0,
//   total_reward_usd_claimed: 0,
//   fee_apy_24h: 0,
//   fee_apr_24h: 0,
//   daily_fee_yield: 0
// }
// [2025-09-01 22:55:27.482 +0700] INFO: Bot command completed in 3297ms

// lp {
//   parameters: {
//     baseFactor: 4000,
//     filterPeriod: 30,
//     decayPeriod: 600,
//     reductionFactor: 5000,
//     variableFeeControl: 120000,
//     maxVolatilityAccumulator: 300000,
//     minBinId: -87358,
//     maxBinId: 87358,
//     protocolShare: 500,
//     baseFeePowerFactor: 0,
//     padding: [ 0, 0, 0, 0, 0 ]
//   },
//   vParameters: {
//     volatilityAccumulator: 10156,
//     volatilityReference: 156,
//     indexReference: 6594,
//     padding: [ 0, 0, 0, 0 ],
//     lastUpdateTimestamp: <BN: 68b5c5f8>,
//     padding1: [
//       0, 0, 0, 0,
//       0, 0, 0, 0
//     ]
//   },
//   bumpSeed: [ 255 ],
//   binStepSeed: [ 5, 0 ],
//   pairType: 0,
//   activeId: 6595,
//   binStep: 5,
//   status: 0,
//   requireBaseFactorSeed: 1,
//   baseFactorSeed: [ 160, 15 ],
//   activationType: 0,
//   creatorPoolOnOffControl: 0,
//   tokenXMint: PublicKey [PublicKey(27G8MtK7VtTcCHkpASjSDdkWWYfoqT6ggEuKidVJidD4)] {
//     _bn: <BN: 1076469c1041d9e9b39fc2ede11333973b3e95732a4439207193a61cc4108d43>
//   },
//   tokenYMint: PublicKey [PublicKey(So11111111111111111111111111111111111111112)] {
//     _bn: <BN: 69b8857feab8184fb687f634618c035dac439dc1aeb3b5598a0f00000000001>
//   },
//   reserveX: PublicKey [PublicKey(6vJPQRrkoFJWGhJ6vZhMWHRj7xfg3ubzwngtsuqHFLR7)] {
//     _bn: <BN: 57f1e0510707fc5b2f123e36e3456efcf8ce2d02de872f58aa83badb7bae5b52>
//   },
//   reserveY: PublicKey [PublicKey(78XLAWgqi2DGx61fHnieLZfT8SGq15WNK2t3ivx9XFSs)] {
//     _bn: <BN: 5b137b5fc0488e020eb64e6ce5731386f807a90bd323c9ffa52511e8a2bdaa24>
//   },
//   protocolFee: { amountX: <BN: 23bb93c7>, amountY: <BN: ae182194> },
//   padding1: [
//     254, 243,  32,  68,  82, 194, 200, 243,
//     117, 117, 216, 167, 227,  11, 209,  74,
//     125, 113,  42, 233, 251, 241, 169,  47,
//       7, 132, 249,  43,  47,  99,  97, 250
//   ],
//   rewardInfos: [
//     {
//       mint: [PublicKey [PublicKey(11111111111111111111111111111111)]],
//       vault: [PublicKey [PublicKey(11111111111111111111111111111111)]],
//       funder: [PublicKey [PublicKey(11111111111111111111111111111111)]],
//       rewardDuration: <BN: 0>,
//       rewardDurationEnd: <BN: 0>,
//       rewardRate: <BN: 0>,
//       lastUpdateTime: <BN: 0>,
//       cumulativeSecondsWithEmptyLiquidityReward: <BN: 0>
//     },
//     {
//       mint: [PublicKey [PublicKey(11111111111111111111111111111111)]],
//       vault: [PublicKey [PublicKey(11111111111111111111111111111111)]],
//       funder: [PublicKey [PublicKey(11111111111111111111111111111111)]],
//       rewardDuration: <BN: 0>,
//       rewardDurationEnd: <BN: 0>,
//       rewardRate: <BN: 0>,
//       lastUpdateTime: <BN: 0>,
//       cumulativeSecondsWithEmptyLiquidityReward: <BN: 0>
//     }
//   ],
//   oracle: PublicKey [PublicKey(91YKtyb1gX4s9Vbu3m8XCX2AnR5sM6xr8ZgafN8BY4FB)] {
//     _bn: <BN: 7700ea64cc78812f5aa7d503560d85f10c73e29485b5735985854f5aa22ac0ba>
//   },
//   binArrayBitmap: [
//     <BN: 0>, <BN: 0>,
//     <BN: 0>, <BN: 0>,
//     <BN: 0>, <BN: 0>,
//     <BN: 0>, <BN: 0>,
//     <BN: 0>, <BN: 3fffb80000>,
//     <BN: 0>, <BN: 0>,
//     <BN: 0>, <BN: 0>,
//     <BN: 0>, <BN: 0>
//   ],
//   lastUpdatedAt: <BN: 676a7662>,
//   padding2: [
//     0, 0, 0, 0, 0, 0, 0, 0, 0,
//     0, 0, 0, 0, 0, 0, 0, 0, 0,
//     0, 0, 0, 0, 0, 0, 0, 0, 0,
//     0, 0, 0, 0, 0
//   ],
//   preActivationSwapAddress: PublicKey [PublicKey(11111111111111111111111111111111)] {
//     _bn: <BN: 0>
//   },
//   baseKey: PublicKey [PublicKey(11111111111111111111111111111111)] {
//     _bn: <BN: 0>
//   },
//   activationPoint: <BN: 0>,
//   preActivationDuration: <BN: 0>,
//   padding3: [
//     0, 0, 0, 0,
//     0, 0, 0, 0
//   ],
//   padding4: <BN: 0>,
//   creator: PublicKey [PublicKey(6tZKhke81q3qTaU1JAPwAK66Wuw8JP6RykRMxFT5vFMK)] {
//     _bn: <BN: 577f9a5f3b1b769504ab23e0decbdf884ea420b00d8145a94b94b24848f9565a>
//   },
//   tokenMintXProgramFlag: 0,
//   tokenMintYProgramFlag: 0,
//   reserved: [
//     0, 0, 0, 0, 0, 0, 0,
//     0, 0, 0, 0, 0, 0, 0,
//     0, 0, 0, 0, 0, 0, 0,
//     0
//   ]
// }
