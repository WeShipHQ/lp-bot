```
npm i @meteora-ag/dlmm @coral-xyz/anchor @solana/web3.js
```

```ts
import DLMM from '@meteora-ag/dlmm'

const USDC_USDT_POOL = new PublicKey('ARwi1S4DaiTG5DX7S4M4ZsrXqpMD1MrTmbu9ue2tpmEq') // You can get your desired pool address from the API https://dlmm-api.meteora.ag/pair/all
const dlmmPool = await DLMM.create(connection, USDC_USDT_POOL);

// If you need to create multiple, can consider using `createMultiple`
const dlmmPool = await DLMM.createMultiple(connection, [USDC_USDT_POOL, ...]);

```

- Get Active Bin

```ts
const activeBin = await dlmmPool.getActiveBin();
const activeBinPriceLamport = activeBin.price;
const activeBinPricePerToken = dlmmPool.fromPricePerLamport(
  Number(activeBin.price)
);
```

```ts
const TOTAL_RANGE_INTERVAL = 10; // 10 bins on each side of the active bin
const minBinId = activeBin.binId - TOTAL_RANGE_INTERVAL;
const maxBinId = activeBin.binId + TOTAL_RANGE_INTERVAL;

const totalXAmount = new BN(100 * 10 ** baseMint.decimals);
const totalYAmount = autoFillYByStrategy(
  activeBin.binId,
  dlmmPool.lbPair.binStep,
  totalXAmount,
  activeBin.xAmount,
  activeBin.yAmount,
  minBinId,
  maxBinId,
  StrategyType.Spot // can be StrategyType.Spot, StrategyType.BidAsk, StrategyType.Curve
);

```



export enum StrategyType {
  Spot,
  Curve,
  BidAsk,
}

function toWeightSpotBalanced(
  minBinId: number,
  maxBinId: number
): {
  binId: number;
  weight: number;
}[] {
  let distributions = [];
  for (let i = minBinId; i <= maxBinId; i++) {
    distributions.push({
      binId: i,
      weight: 1,
    });
  }
  return distributions;
}



export function autoFillYByStrategy(
  activeId: number,
  binStep: number,
  amountX: BN,
  amountXInActiveBin: BN,
  amountYInActiveBin: BN,
  minBinId: number,
  maxBinId: number,
  strategyType: StrategyType
): BN {
  switch (strategyType) {
    case StrategyType.Spot: {
      let weights = toWeightSpotBalanced(minBinId, maxBinId);
      return autoFillYByWeight(
        activeId,
        binStep,
        amountX,
        amountXInActiveBin,
        amountYInActiveBin,
        weights
      );
    }
    case StrategyType.Curve: {
      let weights = toWeightCurve(minBinId, maxBinId, activeId);
      return autoFillYByWeight(
        activeId,
        binStep,
        amountX,
        amountXInActiveBin,
        amountYInActiveBin,
        weights
      );
    }
    case StrategyType.BidAsk: {
      let weights = toWeightBidAsk(minBinId, maxBinId, activeId);
      return autoFillYByWeight(
        activeId,
        binStep,
        amountX,
        amountXInActiveBin,
        amountYInActiveBin,
        weights
      );
    }
  }
}


// weightToAmounts.ts
import { BN } from "@coral-xyz/anchor";
import { Mint } from "@solana/spl-token";
import Decimal from "decimal.js";
import { Clock } from "../types";
import {
  calculateTransferFeeExcludedAmount,
  calculateTransferFeeIncludedAmount,
} from "./token_2022";
import { getPriceOfBinByBinId } from "./weight";

/**
 * Distribute totalAmount to all bid side bins according to given distributions.
 * @param activeId active bin id
 * @param totalAmount total amount of token Y to be distributed
 * @param distributions weight distribution of each bin
 * @param mintY mint of token Y, get from DLMM instance
 * @param clock clock of the program, for calculating transfer fee, get from DLMM instance
 * @returns array of {binId, amount} where amount is the amount of token Y in each bin
 */
export function toAmountBidSide(
  activeId: number,
  totalAmount: BN,
  distributions: { binId: number; weight: number }[],
  mintY: Mint,
  clock: Clock
): {
  binId: number;
  amount: BN;
}[] {
  totalAmount = calculateTransferFeeExcludedAmount(
    totalAmount,
    mintY,
    clock.epoch.toNumber()
  ).amount;

  // get sum of weight
  const totalWeight = distributions.reduce(function (sum, el) {
    return el.binId > activeId ? sum : sum.add(el.weight); // skip all ask side
  }, new Decimal(0));

  if (totalWeight.cmp(new Decimal(0)) != 1) {
    throw Error("Invalid parameteres");
  }
  return distributions.map((bin) => {
    if (bin.binId > activeId) {
      return {
        binId: bin.binId,
        amount: new BN(0),
      };
    } else {
      return {
        binId: bin.binId,
        amount: new BN(
          new Decimal(totalAmount.toString())
            .mul(new Decimal(bin.weight).div(totalWeight))
            .floor()
            .toString()
        ),
      };
    }
  });
}

/**
 * Distribute totalAmount to all ask side bins according to given distributions.
 * @param activeId active bin id
 * @param totalAmount total amount of token Y to be distributed
 * @param distributions weight distribution of each bin
 * @param mintX mint of token X, get from DLMM instance
 * @param clock clock of the program, for calculating transfer fee, get from DLMM instance
 * @returns array of {binId, amount} where amount is the amount of token X in each bin
 */
export function toAmountAskSide(
  activeId: number,
  binStep: number,
  totalAmount: BN,
  distributions: { binId: number; weight: number }[],
  mintX: Mint,
  clock: Clock
): {
  binId: number;
  amount: BN;
}[] {
  totalAmount = calculateTransferFeeExcludedAmount(
    totalAmount,
    mintX,
    clock.epoch.toNumber()
  ).amount;

  // get sum of weight
  const totalWeight: Decimal = distributions.reduce(function (sum, el) {
    if (el.binId < activeId) {
      return sum;
    } else {
      const price = getPriceOfBinByBinId(el.binId, binStep);
      const weightPerPrice = new Decimal(el.weight).div(price);
      return sum.add(weightPerPrice);
    }
  }, new Decimal(0));

  if (totalWeight.cmp(new Decimal(0)) != 1) {
    throw Error("Invalid parameteres");
  }

  return distributions.map((bin) => {
    if (bin.binId < activeId) {
      return {
        binId: bin.binId,
        amount: new BN(0),
      };
    } else {
      const price = getPriceOfBinByBinId(bin.binId, binStep);
      const weightPerPrice = new Decimal(bin.weight).div(price);
      return {
        binId: bin.binId,
        amount: new BN(
          new Decimal(totalAmount.toString())
            .mul(weightPerPrice)
            .div(totalWeight)
            .floor()
            .toString()
        ),
      };
    }
  });
}

/**
 * Distributes the given amounts of tokens X and Y to both bid and ask side bins
 * based on the provided weight distributions.
 *
 * @param activeId - The id of the active bin.
 * @param binStep - The step interval between bin ids.
 * @param amountX - Total amount of token X to distribute.
 * @param amountY - Total amount of token Y to distribute.
 * @param amountXInActiveBin - Amount of token X already in the active bin.
 * @param amountYInActiveBin - Amount of token Y already in the active bin.
 * @param distributions - Array of bins with their respective weight distributions.
 * @param mintX - Mint information for token X. Get from DLMM instance.
 * @param mintY - Mint information for token Y. Get from DLMM instance.
 * @param clock - Clock instance. Get from DLMM instance.
 * @returns An array of objects containing binId, amountX, and amountY for each bin.
 */

export function toAmountBothSide(
  activeId: number,
  binStep: number,
  amountX: BN,
  amountY: BN,
  amountXInActiveBin: BN,
  amountYInActiveBin: BN,
  distributions: { binId: number; weight: number }[],
  mintX: Mint,
  mintY: Mint,
  clock: Clock
): {
  binId: number;
  amountX: BN;
  amountY: BN;
}[] {
  // only bid side
  if (activeId > distributions[distributions.length - 1].binId) {
    let amounts = toAmountBidSide(
      activeId,
      amountY,
      distributions,
      mintY,
      clock
    );
    return amounts.map((bin) => {
      return {
        binId: bin.binId,
        amountX: new BN(0),
        amountY: bin.amount,
      };
    });
  }
  // only ask side
  if (activeId < distributions[0].binId) {
    let amounts = toAmountAskSide(
      activeId,
      binStep,
      amountX,
      distributions,
      mintX,
      clock
    );
    return amounts.map((bin) => {
      return {
        binId: bin.binId,
        amountX: bin.amount,
        amountY: new BN(0),
      };
    });
  }

  amountX = calculateTransferFeeIncludedAmount(
    amountX,
    mintX,
    clock.epoch.toNumber()
  ).amount;

  amountY = calculateTransferFeeIncludedAmount(
    amountY,
    mintY,
    clock.epoch.toNumber()
  ).amount;

  const activeBins = distributions.filter((element) => {
    return element.binId === activeId;
  });

  if (activeBins.length === 1) {
    const p0 = getPriceOfBinByBinId(activeId, binStep);
    let wx0 = new Decimal(0);
    let wy0 = new Decimal(0);
    const activeBin = activeBins[0];
    if (amountXInActiveBin.isZero() && amountYInActiveBin.isZero()) {
      wx0 = new Decimal(activeBin.weight).div(p0.mul(new Decimal(2)));
      wy0 = new Decimal(activeBin.weight).div(new Decimal(2));
    } else {
      let amountXInActiveBinDec = new Decimal(amountXInActiveBin.toString());
      let amountYInActiveBinDec = new Decimal(amountYInActiveBin.toString());

      if (!amountXInActiveBin.isZero()) {
        wx0 = new Decimal(activeBin.weight).div(
          p0.add(amountYInActiveBinDec.div(amountXInActiveBinDec))
        );
      }
      if (!amountYInActiveBin.isZero()) {
        wy0 = new Decimal(activeBin.weight).div(
          new Decimal(1).add(
            p0.mul(amountXInActiveBinDec).div(amountYInActiveBinDec)
          )
        );
      }
    }

    let totalWeightX = wx0;
    let totalWeightY = wy0;
    distributions.forEach((element) => {
      if (element.binId < activeId) {
        totalWeightY = totalWeightY.add(new Decimal(element.weight));
      }
      if (element.binId > activeId) {
        let price = getPriceOfBinByBinId(element.binId, binStep);
        let weighPerPrice = new Decimal(element.weight).div(price);
        totalWeightX = totalWeightX.add(weighPerPrice);
      }
    });
    const kx = new Decimal(amountX.toString()).div(totalWeightX);
    const ky = new Decimal(amountY.toString()).div(totalWeightY);
    let k = kx.lessThan(ky) ? kx : ky;
    return distributions.map((bin) => {
      if (bin.binId < activeId) {
        const amount = k.mul(new Decimal(bin.weight));
        return {
          binId: bin.binId,
          amountX: new BN(0),
          amountY: new BN(amount.floor().toString()),
        };
      }
      if (bin.binId > activeId) {
        const price = getPriceOfBinByBinId(bin.binId, binStep);
        const weighPerPrice = new Decimal(bin.weight).div(price);
        const amount = k.mul(weighPerPrice);
        return {
          binId: bin.binId,
          amountX: new BN(amount.floor().toString()),
          amountY: new BN(0),
        };
      }

      const amountXActiveBin = k.mul(wx0);
      const amountYActiveBin = k.mul(wy0);
      return {
        binId: bin.binId,
        amountX: new BN(amountXActiveBin.floor().toString()),
        amountY: new BN(amountYActiveBin.floor().toString()),
      };
    });
  } else {
    let totalWeightX = new Decimal(0);
    let totalWeightY = new Decimal(0);
    distributions.forEach((element) => {
      if (element.binId < activeId) {
        totalWeightY = totalWeightY.add(new Decimal(element.weight));
      } else {
        let price = getPriceOfBinByBinId(element.binId, binStep);
        let weighPerPrice = new Decimal(element.weight).div(price);
        totalWeightX = totalWeightX.add(weighPerPrice);
      }
    });

    let kx = new Decimal(amountX.toString()).div(totalWeightX);
    let ky = new Decimal(amountY.toString()).div(totalWeightY);
    let k = kx.lessThan(ky) ? kx : ky;

    return distributions.map((bin) => {
      if (bin.binId < activeId) {
        const amount = k.mul(new Decimal(bin.weight));
        return {
          binId: bin.binId,
          amountX: new BN(0),
          amountY: new BN(amount.floor().toString()),
        };
      } else {
        let price = getPriceOfBinByBinId(bin.binId, binStep);
        let weighPerPrice = new Decimal(bin.weight).div(price);
        const amount = k.mul(weighPerPrice);
        return {
          binId: bin.binId,
          amountX: new BN(amount.floor().toString()),
          amountY: new BN(0),
        };
      }
    });
  }
}

export function autoFillYByWeight(
  activeId: number,
  binStep: number,
  amountX: BN,
  amountXInActiveBin: BN,
  amountYInActiveBin: BN,
  distributions: { binId: number; weight: number }[]
): BN {
  const activeBins = distributions.filter((element) => {
    return element.binId === activeId;
  });

  if (activeBins.length === 1) {
    const p0 = getPriceOfBinByBinId(activeId, binStep);
    let wx0 = new Decimal(0);
    let wy0 = new Decimal(0);
    const activeBin = activeBins[0];
    if (amountXInActiveBin.isZero() && amountYInActiveBin.isZero()) {
      wx0 = new Decimal(activeBin.weight).div(p0.mul(new Decimal(2)));
      wy0 = new Decimal(activeBin.weight).div(new Decimal(2));
    } else {
      let amountXInActiveBinDec = new Decimal(amountXInActiveBin.toString());
      let amountYInActiveBinDec = new Decimal(amountYInActiveBin.toString());

      if (!amountXInActiveBin.isZero()) {
        wx0 = new Decimal(activeBin.weight).div(
          p0.add(amountYInActiveBinDec.div(amountXInActiveBinDec))
        );
      }
      if (!amountYInActiveBin.isZero()) {
        wy0 = new Decimal(activeBin.weight).div(
          new Decimal(1).add(
            p0.mul(amountXInActiveBinDec).div(amountYInActiveBinDec)
          )
        );
      }
    }

    let totalWeightX = wx0;
    let totalWeightY = wy0;
    distributions.forEach((element) => {
      if (element.binId < activeId) {
        totalWeightY = totalWeightY.add(new Decimal(element.weight));
      }
      if (element.binId > activeId) {
        const price = getPriceOfBinByBinId(element.binId, binStep);
        const weighPerPrice = new Decimal(element.weight).div(price);
        totalWeightX = totalWeightX.add(weighPerPrice);
      }
    });
    const kx = totalWeightX.isZero()
      ? new Decimal(1)
      : new Decimal(amountX.toString()).div(totalWeightX);
    const amountY = kx.mul(totalWeightY);
    return new BN(amountY.floor().toString());
  } else {
    let totalWeightX = new Decimal(0);
    let totalWeightY = new Decimal(0);
    distributions.forEach((element) => {
      if (element.binId < activeId) {
        totalWeightY = totalWeightY.add(new Decimal(element.weight));
      } else {
        const price = getPriceOfBinByBinId(element.binId, binStep);
        const weighPerPrice = new Decimal(element.weight).div(price);
        totalWeightX = totalWeightX.add(weighPerPrice);
      }
    });
    const kx = totalWeightX.isZero()
      ? new Decimal(1)
      : new Decimal(amountX.toString()).div(totalWeightX);
    const amountY = kx.mul(totalWeightY);
    return new BN(amountY.floor().toString());
  }
}

export function autoFillXByWeight(
  activeId: number,
  binStep: number,
  amountY: BN,
  amountXInActiveBin: BN,
  amountYInActiveBin: BN,
  distributions: { binId: number; weight: number }[]
): BN {
  const activeBins = distributions.filter((element) => {
    return element.binId === activeId;
  });

  if (activeBins.length === 1) {
    const p0 = getPriceOfBinByBinId(activeId, binStep);
    let wx0 = new Decimal(0);
    let wy0 = new Decimal(0);
    const activeBin = activeBins[0];
    if (amountXInActiveBin.isZero() && amountYInActiveBin.isZero()) {
      wx0 = new Decimal(activeBin.weight).div(p0.mul(new Decimal(2)));
      wy0 = new Decimal(activeBin.weight).div(new Decimal(2));
    } else {
      let amountXInActiveBinDec = new Decimal(amountXInActiveBin.toString());
      let amountYInActiveBinDec = new Decimal(amountYInActiveBin.toString());

      if (!amountXInActiveBin.isZero()) {
        wx0 = new Decimal(activeBin.weight).div(
          p0.add(amountYInActiveBinDec.div(amountXInActiveBinDec))
        );
      }
      if (!amountYInActiveBin.isZero()) {
        wy0 = new Decimal(activeBin.weight).div(
          new Decimal(1).add(
            p0.mul(amountXInActiveBinDec).div(amountYInActiveBinDec)
          )
        );
      }
    }

    let totalWeightX = wx0;
    let totalWeightY = wy0;
    distributions.forEach((element) => {
      if (element.binId < activeId) {
        totalWeightY = totalWeightY.add(new Decimal(element.weight));
      }
      if (element.binId > activeId) {
        const price = getPriceOfBinByBinId(element.binId, binStep);
        const weighPerPrice = new Decimal(element.weight).div(price);
        totalWeightX = totalWeightX.add(weighPerPrice);
      }
    });
    const ky = totalWeightY.isZero()
      ? new Decimal(1)
      : new Decimal(amountY.toString()).div(totalWeightY);
    const amountX = ky.mul(totalWeightX);
    return new BN(amountX.floor().toString());
  } else {
    let totalWeightX = new Decimal(0);
    let totalWeightY = new Decimal(0);
    distributions.forEach((element) => {
      if (element.binId < activeId) {
        totalWeightY = totalWeightY.add(new Decimal(element.weight));
      } else {
        const price = getPriceOfBinByBinId(element.binId, binStep);
        const weighPerPrice = new Decimal(element.weight).div(price);
        totalWeightX = totalWeightX.add(weighPerPrice);
      }
    });
    const ky = totalWeightY.isZero()
      ? new Decimal(1)
      : new Decimal(amountY.toString()).div(totalWeightY);
    const amountX = ky.mul(totalWeightX);
    return new BN(amountX.floor().toString());
  }
}

export const BASIS_POINT_MAX = 10000;

export interface Clock {
  slot: BN;
  epochStartTimestamp: BN;
  epoch: BN;
  leaderScheduleEpoch: BN;
  unixTimestamp: BN;
}

import { BN } from "@coral-xyz/anchor";
import gaussian, { Gaussian } from "gaussian";
import { BASIS_POINT_MAX } from "../constants";
import Decimal from "decimal.js";
import {
  toAmountAskSide,
  toAmountBidSide,
  toAmountBothSide,
} from "./weightToAmounts";
import { Mint } from "@solana/spl-token";
import { Clock } from "../types";

export function getPriceOfBinByBinId(binId: number, binStep: number): Decimal {
  const binStepNum = new Decimal(binStep).div(new Decimal(BASIS_POINT_MAX));
  return new Decimal(1).add(new Decimal(binStepNum)).pow(new Decimal(binId));
}

/// Build a gaussian distribution from the bins, with active bin as the mean.
function buildGaussianFromBins(activeBin: number, binIds: number[]) {
  const smallestBin = Math.min(...binIds);
  const largestBin = Math.max(...binIds);

  // Define the Gaussian distribution. The mean will be active bin when active bin is within the bin ids. Else, use left or right most bin id as the mean.
  let mean = 0;
  const isAroundActiveBin = binIds.find((bid) => bid == activeBin);
  // The liquidity will be distributed surrounding active bin
  if (isAroundActiveBin) {
    mean = activeBin;
  }
  // The liquidity will be distributed to the right side of the active bin.
  else if (activeBin < smallestBin) {
    mean = smallestBin;
  }
  // The liquidity will be distributed to the left side of the active bin.
  else {
    mean = largestBin;
  }

  const TWO_STANDARD_DEVIATION = 4;
  const stdDev = (largestBin - smallestBin) / TWO_STANDARD_DEVIATION;
  const variance = Math.max(stdDev ** 2, 1);

  return gaussian(mean, variance);
}

/// Find the probability of the bin id over the gaussian. The probability ranged from 0 - 1 and will be used as liquidity allocation for that particular bin.
function generateBinLiquidityAllocation(
  gaussian: Gaussian,
  binIds: number[],
  invert: boolean
) {
  const allocations = binIds.map((bid) =>
    invert ? 1 / gaussian.pdf(bid) : gaussian.pdf(bid)
  );
  const totalAllocations = allocations.reduce((acc, v) => acc + v, 0);
  // Gaussian impossible to cover 100%, normalized it to have total of 100%
  return allocations.map((a) => a / totalAllocations);
}

/// Convert liquidity allocation from 0..1 to 0..10000 bps unit. The sum of allocations must be 1. Return BPS and the loss after conversion.
function computeAllocationBps(allocations: number[]): {
  bpsAllocations: BN[];
  pLoss: BN;
} {
  let totalAllocation = new BN(0);
  const bpsAllocations: BN[] = [];

  for (const allocation of allocations) {
    const allocBps = new BN(allocation * 10000);
    bpsAllocations.push(allocBps);
    totalAllocation = totalAllocation.add(allocBps);
  }

  const pLoss = new BN(10000).sub(totalAllocation);
  return {
    bpsAllocations,
    pLoss,
  };
}
/** private */

export function toWeightDistribution(
  amountX: BN,
  amountY: BN,
  distributions: {
    binId: number;
    xAmountBpsOfTotal: BN;
    yAmountBpsOfTotal: BN;
  }[],
  binStep: number
): { binId: number; weight: number }[] {
  // get all quote amount
  let totalQuote = new BN(0);
  const precision = 1_000_000_000_000;
  const quoteDistributions = distributions.map((bin) => {
    const price = new BN(
      getPriceOfBinByBinId(bin.binId, binStep).mul(precision).floor().toString()
    );
    const quoteValue = amountX
      .mul(new BN(bin.xAmountBpsOfTotal))
      .mul(new BN(price))
      .div(new BN(BASIS_POINT_MAX))
      .div(new BN(precision));
    const quoteAmount = quoteValue.add(
      amountY.mul(new BN(bin.yAmountBpsOfTotal)).div(new BN(BASIS_POINT_MAX))
    );
    totalQuote = totalQuote.add(quoteAmount);
    return {
      binId: bin.binId,
      quoteAmount,
    };
  });

  if (totalQuote.eq(new BN(0))) {
    return [];
  }

  const distributionWeights = quoteDistributions
    .map((bin) => {
      const weight = Math.floor(
        bin.quoteAmount.mul(new BN(65535)).div(totalQuote).toNumber()
      );
      return {
        binId: bin.binId,
        weight,
      };
    })
    .filter((item) => item.weight > 0);

  return distributionWeights;
}

export function calculateSpotDistribution(
  activeBin: number,
  binIds: number[]
): { binId: number; xAmountBpsOfTotal: BN; yAmountBpsOfTotal: BN }[] {
  if (!binIds.includes(activeBin)) {
    const { div: dist, mod: rem } = new BN(10_000).divmod(
      new BN(binIds.length)
    );
    const loss = rem.isZero() ? new BN(0) : new BN(1);

    const distributions =
      binIds[0] < activeBin
        ? binIds.map((binId) => ({
            binId,
            xAmountBpsOfTotal: new BN(0),
            yAmountBpsOfTotal: dist,
          }))
        : binIds.map((binId) => ({
            binId,
            xAmountBpsOfTotal: dist,
            yAmountBpsOfTotal: new BN(0),
          }));

    // Add the loss to the left most bin
    if (binIds[0] < activeBin) {
      distributions[0].yAmountBpsOfTotal.add(loss);
    }
    // Add the loss to the right most bin
    else {
      distributions[binIds.length - 1].xAmountBpsOfTotal.add(loss);
    }

    return distributions;
  }

  const binYCount = binIds.filter((binId) => binId < activeBin).length;
  const binXCount = binIds.filter((binId) => binId > activeBin).length;

  const totalYBinCapacity = binYCount + 0.5;
  const totalXBinCapacity = binXCount + 0.5;

  const yBinBps = new BN(10_000 / totalYBinCapacity);
  const yActiveBinBps = new BN(10_000).sub(yBinBps.mul(new BN(binYCount)));

  const xBinBps = new BN(10_000 / totalXBinCapacity);
  const xActiveBinBps = new BN(10_000).sub(xBinBps.mul(new BN(binXCount)));

  return binIds.map((binId) => {
    const isYBin = binId < activeBin;
    const isXBin = binId > activeBin;
    const isActiveBin = binId === activeBin;

    if (isYBin) {
      return {
        binId,
        xAmountBpsOfTotal: new BN(0),
        yAmountBpsOfTotal: yBinBps,
      };
    }

    if (isXBin) {
      return {
        binId,
        xAmountBpsOfTotal: xBinBps,
        yAmountBpsOfTotal: new BN(0),
      };
    }

    if (isActiveBin) {
      return {
        binId,
        xAmountBpsOfTotal: xActiveBinBps,
        yAmountBpsOfTotal: yActiveBinBps,
      };
    }
  });
}

export function calculateBidAskDistribution(
  activeBin: number,
  binIds: number[]
): {
  binId: number;
  xAmountBpsOfTotal: BN;
  yAmountBpsOfTotal: BN;
}[] {
  const smallestBin = Math.min(...binIds);
  const largestBin = Math.max(...binIds);

  const rightOnly = activeBin < smallestBin;
  const leftOnly = activeBin > largestBin;

  const gaussian = buildGaussianFromBins(activeBin, binIds);
  const allocations = generateBinLiquidityAllocation(gaussian, binIds, true);

  // To the right of active bin, liquidity distribution consists of only token X.
  if (rightOnly) {
    const { bpsAllocations, pLoss } = computeAllocationBps(allocations);
    const binDistributions = binIds.map((bid, idx) => ({
      binId: bid,
      xAmountBpsOfTotal: bpsAllocations[idx],
      yAmountBpsOfTotal: new BN(0),
    }));
    const idx = binDistributions.length - 1;
    binDistributions[idx].xAmountBpsOfTotal =
      binDistributions[idx].xAmountBpsOfTotal.add(pLoss);
    return binDistributions;
  }

  // To the left of active bin, liquidity distribution consists of only token Y.
  if (leftOnly) {
    const { bpsAllocations, pLoss } = computeAllocationBps(allocations);
    const binDistributions = binIds.map((bid, idx) => ({
      binId: bid,
      xAmountBpsOfTotal: new BN(0),
      yAmountBpsOfTotal: bpsAllocations[idx],
    }));
    binDistributions[0].yAmountBpsOfTotal =
      binDistributions[0].yAmountBpsOfTotal.add(pLoss);
    return binDistributions;
  }

  // Find total X, and Y bps allocations for normalization.
  const [totalXAllocation, totalYAllocation] = allocations.reduce(
    ([xAcc, yAcc], allocation, idx) => {
      const binId = binIds[idx];
      if (binId > activeBin) {
        return [xAcc + allocation, yAcc];
      } else if (binId < activeBin) {
        return [xAcc, yAcc + allocation];
      } else {
        const half = allocation / 2;
        return [xAcc + half, yAcc + half];
      }
    },
    [0, 0]
  );

  // Normalize and convert to BPS
  const [normXAllocations, normYAllocations] = allocations.reduce<[BN[], BN[]]>(
    ([xAllocations, yAllocations], allocation, idx) => {
      const binId = binIds[idx];
      if (binId > activeBin) {
        const distX = new BN((allocation * 10000) / totalXAllocation);
        xAllocations.push(distX);
      }
      if (binId < activeBin) {
        const distY = new BN((allocation * 10000) / totalYAllocation);
        yAllocations.push(distY);
      }
      if (binId == activeBin) {
        const half = allocation / 2;
        const distX = new BN((half * 10000) / totalXAllocation);
        const distY = new BN((half * 10000) / totalYAllocation);
        xAllocations.push(distX);
        yAllocations.push(distY);
      }
      return [xAllocations, yAllocations];
    },
    [[], []]
  );

  const totalXNormAllocations = normXAllocations.reduce(
    (acc, v) => acc.add(v),
    new BN(0)
  );
  const totalYNormAllocations = normYAllocations.reduce(
    (acc, v) => acc.add(v),
    new BN(0)
  );

  const xPLoss = new BN(10000).sub(totalXNormAllocations);
  const yPLoss = new BN(10000).sub(totalYNormAllocations);

  const distributions = binIds.map((binId) => {
    if (binId === activeBin) {
      return {
        binId,
        xAmountBpsOfTotal: normXAllocations.shift(),
        yAmountBpsOfTotal: normYAllocations.shift(),
      };
    }

    if (binId > activeBin) {
      return {
        binId,
        xAmountBpsOfTotal: normXAllocations.shift(),
        yAmountBpsOfTotal: new BN(0),
      };
    }

    if (binId < activeBin) {
      return {
        binId,
        xAmountBpsOfTotal: new BN(0),
        yAmountBpsOfTotal: normYAllocations.shift(),
      };
    }
  });

  if (!yPLoss.isZero()) {
    distributions[0].yAmountBpsOfTotal =
      distributions[0].yAmountBpsOfTotal.add(yPLoss);
  }

  if (!xPLoss.isZero()) {
    const last = distributions.length - 1;
    distributions[last].xAmountBpsOfTotal =
      distributions[last].xAmountBpsOfTotal.add(xPLoss);
  }

  return distributions;
}

export function calculateNormalDistribution(
  activeBin: number,
  binIds: number[]
): {
  binId: number;
  xAmountBpsOfTotal: BN;
  yAmountBpsOfTotal: BN;
}[] {
  const smallestBin = Math.min(...binIds);
  const largestBin = Math.max(...binIds);

  const rightOnly = activeBin < smallestBin;
  const leftOnly = activeBin > largestBin;

  const gaussian = buildGaussianFromBins(activeBin, binIds);
  const allocations = generateBinLiquidityAllocation(gaussian, binIds, false);

  // To the right of active bin, liquidity distribution consists of only token X.
  if (rightOnly) {
    const { bpsAllocations, pLoss } = computeAllocationBps(allocations);
    const binDistributions = binIds.map((bid, idx) => ({
      binId: bid,
      xAmountBpsOfTotal: bpsAllocations[idx],
      yAmountBpsOfTotal: new BN(0),
    }));
    // When contains only X token, bin closest to active bin will be index 0.
    // Add back the precision loss
    binDistributions[0].xAmountBpsOfTotal =
      binDistributions[0].xAmountBpsOfTotal.add(pLoss);
    return binDistributions;
  }

  // To the left of active bin, liquidity distribution consists of only token Y.
  if (leftOnly) {
    const { bpsAllocations, pLoss } = computeAllocationBps(allocations);
    const binDistributions = binIds.map((bid, idx) => ({
      binId: bid,
      xAmountBpsOfTotal: new BN(0),
      yAmountBpsOfTotal: bpsAllocations[idx],
    }));
    // When contains only Y token, bin closest to active bin will be last index.
    // Add back the precision loss
    const idx = binDistributions.length - 1;
    binDistributions[idx].yAmountBpsOfTotal =
      binDistributions[idx].yAmountBpsOfTotal.add(pLoss);
    return binDistributions;
  }

  // The liquidity distribution consists of token X and Y. Allocations from gaussian only says how much liquidity percentage per bin over the full bin range.
  // Normalize liquidity allocation percentage into X - 100%, Y - 100%.

  // Find total X, and Y bps allocations for normalization.
  const [totalXAllocation, totalYAllocation] = allocations.reduce(
    ([xAcc, yAcc], allocation, idx) => {
      const binId = binIds[idx];
      if (binId > activeBin) {
        return [xAcc + allocation, yAcc];
      } else if (binId < activeBin) {
        return [xAcc, yAcc + allocation];
      } else {
        const half = allocation / 2;
        return [xAcc + half, yAcc + half];
      }
    },
    [0, 0]
  );

  // Normalize and convert to BPS
  const [normXAllocations, normYAllocations] = allocations.reduce(
    ([xAllocations, yAllocations], allocation, idx) => {
      const binId = binIds[idx];
      if (binId > activeBin) {
        const distX = new BN((allocation * 10000) / totalXAllocation);
        xAllocations.push(distX);
      }
      if (binId < activeBin) {
        const distY = new BN((allocation * 10000) / totalYAllocation);
        yAllocations.push(distY);
      }
      return [xAllocations, yAllocations];
    },
    [[], []]
  );

  const normXActiveBinAllocation = normXAllocations.reduce(
    (maxBps, bps) => maxBps.sub(bps),
    new BN(10_000)
  );
  const normYActiveBinAllocation = normYAllocations.reduce(
    (maxBps, bps) => maxBps.sub(bps),
    new BN(10_000)
  );

  return binIds.map((binId) => {
    if (binId === activeBin) {
      return {
        binId,
        xAmountBpsOfTotal: normXActiveBinAllocation,
        yAmountBpsOfTotal: normYActiveBinAllocation,
      };
    }

    if (binId > activeBin) {
      return {
        binId,
        xAmountBpsOfTotal: normXAllocations.shift(),
        yAmountBpsOfTotal: new BN(0),
      };
    }

    if (binId < activeBin) {
      return {
        binId,
        xAmountBpsOfTotal: new BN(0),
        yAmountBpsOfTotal: normYAllocations.shift(),
      };
    }
  });
}

/**
 * Converts a weight distribution into token amounts for one side (either bid or ask).
 *
 * @param amount - The total amount of liquidity to distribute.
 * @param distributions - The array of weight distributions for each bin.
 * @param binStep - The step interval between bin ids.
 * @param activeId - The id of the active bin.
 * @param depositForY - Flag indicating if the deposit is for token Y (bid side).
 * @param mint - Mint information for the token. Mint Y if depositForY is true, else Mint X. Get from DLMM instance.
 * @param clock - Clock instance for the current epoch. Get from DLMM instance.
 * @returns An array of objects containing binId and amount for each bin.
 */

export function fromWeightDistributionToAmountOneSide(
  amount: BN,
  distributions: { binId: number; weight: number }[],
  binStep: number,
  activeId: number,
  depositForY: boolean,
  mint: Mint,
  clock: Clock
): { binId: number; amount: BN }[] {
  if (depositForY) {
    return toAmountBidSide(activeId, amount, distributions, mint, clock);
  } else {
    return toAmountAskSide(
      activeId,
      binStep,
      amount,
      distributions,
      mint,
      clock
    );
  }
}

/**
 * Converts a weight distribution into token amounts for both bid and ask sides.
 *
 * @param amountX - The total amount of token X to distribute.
 * @param amountY - The total amount of token Y to distribute.
 * @param distributions - The array of weight distributions for each bin.
 * @param binStep - The step interval between bin ids.
 * @param activeId - The id of the active bin.
 * @param amountXInActiveBin - The amount of token X in the active bin.
 * @param amountYInActiveBin - The amount of token Y in the active bin.
 * @param mintX - Mint information for token X. Get from DLMM instance.
 * @param mintY - Mint information for token Y. Get from DLMM instance.
 * @param clock - Clock instance for the current epoch. Get from DLMM instance.
 * @returns An array of objects containing binId, amountX, and amountY for each bin.
 */
export function fromWeightDistributionToAmount(
  amountX: BN,
  amountY: BN,
  distributions: { binId: number; weight: number }[],
  binStep: number,
  activeId: number,
  amountXInActiveBin: BN,
  amountYInActiveBin: BN,
  mintX: Mint,
  mintY: Mint,
  clock: Clock
): { binId: number; amountX: BN; amountY: BN }[] {
  // sort distribution
  var distributions = distributions.sort((n1, n2) => {
    return n1.binId - n2.binId;
  });

  if (distributions.length == 0) {
    return [];
  }

  // only bid side
  if (activeId > distributions[distributions.length - 1].binId) {
    let amounts = toAmountBidSide(
      activeId,
      amountY,
      distributions,
      mintY,
      clock
    );
    return amounts.map((bin) => {
      return {
        binId: bin.binId,
        amountX: new BN(0),
        amountY: new BN(bin.amount.toString()),
      };
    });
  }

  // only ask side
  if (activeId < distributions[0].binId) {
    let amounts = toAmountAskSide(
      activeId,
      binStep,
      amountX,
      distributions,
      mintX,
      clock
    );
    return amounts.map((bin) => {
      return {
        binId: bin.binId,
        amountX: new BN(bin.amount.toString()),
        amountY: new BN(0),
      };
    });
  }
  return toAmountBothSide(
    activeId,
    binStep,
    amountX,
    amountY,
    amountXInActiveBin,
    amountYInActiveBin,
    distributions,
    mintX,
    mintY,
    clock
  );
}
