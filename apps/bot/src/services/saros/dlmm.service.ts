import {
  BIN_STEP_CONFIGS,
  LiquidityBookServices,
  LiquidityShape,
  MODE,
  BASIS_POINT_MAX,
  ONE,
  SCALE_OFFSET,
  getMaxPosition,
  createUniformDistribution,
  getMaxBinArray,
  getBinRange,
  findPosition,
  convertBalanceToWei,
  type PairInfo,
} from "@saros-finance/dlmm-sdk";
// import {
//   LiquidityShape,
//   PositionInfo,
//   RemoveLiquidityType,
// } from "@saros-finance/dlmm-sdk/types/services";
// import {
//   createUniformDistribution,
//   findPosition,
//   getBinRange,
//   getMaxBinArray,
//   getMaxPosition,
// } from "@saros-finance/dlmm-sdk/utils";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import BN from "bn.js";
import { CONFIG } from "@/config";
import Decimal from "decimal.js";
import { JupiterService } from "../jupiter.service";
import { Token } from "@/types/token.types";

const getBase = (binStep: number) => {
  const quotient = binStep << SCALE_OFFSET;
  if (quotient < 0) return null;

  const basisPointMaxBigInt = BASIS_POINT_MAX;

  //@ts-ignore
  if (basisPointMaxBigInt === 0) return null;
  const fraction = quotient / basisPointMaxBigInt;

  const oneBigInt = ONE;
  const result = oneBigInt + fraction;

  return result;
};

const getPriceFromId = (
  bin_step: number,
  bin_id: number,
  baseTokenDecimal: number,
  quoteTokenDecimal: number
) => {
  const base = getBase(bin_step) as number;
  const exponent = bin_id - 8_388_608;
  const decimalPow = Math.pow(10, baseTokenDecimal - quoteTokenDecimal);

  return Math.pow(base, exponent) * decimalPow;
};

const getIdFromPrice = (
  price: number,
  binStep: number,
  baseTokenDecimal: number,
  quoteTokenDecimal: number
): number => {
  if (price <= 0) throw new Error("Giá phải lớn hơn 0");
  if (binStep <= 0 || binStep > BASIS_POINT_MAX)
    throw new Error("Bin step invalid");

  const decimalPow = Math.pow(10, quoteTokenDecimal - baseTokenDecimal);

  const base = 1 + binStep / BASIS_POINT_MAX;
  const exponent = Math.log(price * decimalPow) / Math.log(base);
  const binId = Math.round(exponent + 8_388_608);

  return binId;
};

const convertBalanceToWei = (strValue: number, iDecimal: number = 9) => {
  if (strValue === 0) return 0;

  try {
    const multiplyNum = new Decimal(Math.pow(10, iDecimal));
    const convertValue = new Decimal(Number(strValue));
    const result = multiplyNum.mul(convertValue);

    return result;
  } catch {
    return new Decimal(0);
  }
};

export class SarosDlmmService {
  private poolCache = new Map<
    string,
    { instance: LiquidityBookServices; timestamp: number }
  >();
  private readonly CACHE_TTL = 30000; // 30 seconds

  private readonly jupiterService = new JupiterService();

  private async createInstance(
    poolAddress: string | PublicKey
  ): Promise<LiquidityBookServices> {
    const poolKey =
      typeof poolAddress === "string" ? poolAddress : poolAddress.toBase58();
    const now = Date.now();

    const cached = this.poolCache.get(poolKey);
    if (cached && now - cached.timestamp < this.CACHE_TTL) {
      return cached.instance;
    }

    const liquidityBookServices = new LiquidityBookServices({
      mode: MODE.MAINNET,
    });

    // Cache the instance
    this.poolCache.set(poolKey, {
      instance: liquidityBookServices,
      timestamp: now,
    });

    return liquidityBookServices;
  }

  async getPriceRange(
    poolAddress: string,
    rangeInterval: number
  ): Promise<{
    fromPrice: string;
    toPrice: string;
  }> {
    const liquidityBookServices = await this.createInstance(poolAddress);
    const pairInfo = (await liquidityBookServices.getPairAccount(
      new PublicKey(poolAddress)
    )) as PairInfo;

    const { tokenX, tokenY } = await this.jupiterService.getTokenPairInfo(
      pairInfo.tokenMintX.toBase58(),
      pairInfo.tokenMintY.toBase58()
    );

    const activeBin = pairInfo.activeId;
    const fromBinId = activeBin - rangeInterval;
    const toBinId = activeBin + rangeInterval;

    const fromPriceLamport = await getPriceFromId(
      pairInfo.binStep,
      fromBinId,
      tokenX.decimals,
      tokenY.decimals
    );

    const toPriceLamport = await getPriceFromId(
      pairInfo.binStep,
      toBinId,
      tokenX.decimals,
      tokenY.decimals
    );

    // const fromPrice = dlmmPool.fromPricePerLamport(Number(fromPriceLamport));
    // const toPrice = dlmmPool.fromPricePerLamport(Number(toPriceLamport));

    return {
      fromPrice: new Decimal(fromPriceLamport).toFixed(),
      toPrice: new Decimal(toPriceLamport).toFixed(),
    };
  }

  async createPositionIx(
    positionAddress: PublicKey,
    poolAddress: PublicKey,
    userPublicKey: PublicKey,
    // tokenX: Token,
    // tokenY: Token,
    totalXAmount: Decimal,
    totalYAmount: Decimal,
    strategy: LiquidityShape,
    rangeInterval: number
  ): Promise<{
    instructions: TransactionInstruction[];
  }> {
    const liquidityBookServices = await this.createInstance(poolAddress);

    const positions = await liquidityBookServices.getUserPositions({
      payer: userPublicKey,
      pair: poolAddress,
    });

    console.log("pos", positions.length);

    const pairInfo: PairInfo =
      await liquidityBookServices.getPairAccount(poolAddress);
    const activeBin = pairInfo.activeId as number;
    const binRange = [activeBin - rangeInterval, activeBin + rangeInterval] as [
      number,
      number,
    ];

    const maxPositionList = getMaxPosition(
      [binRange[0], binRange[1]],
      activeBin
    );

    const maxLiqDistribution = createUniformDistribution({
      shape: strategy,
      binRange,
    });

    const binArrayList = getMaxBinArray(binRange, activeBin);

    const allTxs: Transaction[] = [];
    const txsCreatePosition: Transaction[] = [];

    const initialTransaction: any = new Transaction();

    await Promise.all(
      binArrayList.map(async (item) => {
        await liquidityBookServices.getBinArray({
          binArrayIndex: item.binArrayLowerIndex,
          pair: poolAddress,
          payer: userPublicKey,
          transaction: initialTransaction,
        });

        await liquidityBookServices.getBinArray({
          binArrayIndex: item.binArrayUpperIndex,
          pair: poolAddress,
          payer: userPublicKey,
          transaction: initialTransaction,
        });
      })
    );

    await Promise.all(
      [pairInfo.tokenMintX, pairInfo.tokenMintY].map(async (token) => {
        await liquidityBookServices.getPairVaultInfo({
          payer: userPublicKey,
          transaction: initialTransaction,
          tokenAddress: token,
          pair: poolAddress,
        });
        await liquidityBookServices.getUserVaultInfo({
          payer: userPublicKey,
          tokenAddress: token,
          transaction: initialTransaction,
        });
      })
    );

    const connection = liquidityBookServices.connection;

    const { blockhash, lastValidBlockHeight } =
      await connection.getLatestBlockhash();

    let currentBlockhash = blockhash;
    let currentLastValidBlockHeight = lastValidBlockHeight;

    if (initialTransaction.instructions.length > 0) {
      initialTransaction.recentBlockhash = currentBlockhash;
      initialTransaction.feePayer = userPublicKey;
      allTxs.push(initialTransaction);
    }

    const maxLiquidityDistributions = await Promise.all(
      maxPositionList.map(async (item) => {
        const {
          range: relativeBinRange,
          binLower,
          binUpper,
        } = getBinRange(item, activeBin);
        const currentPosition = positions.find(findPosition(item, activeBin));

        const findStartIndex = maxLiqDistribution.findIndex(
          (item) => item.relativeBinId === relativeBinRange[0]
        );
        const startIndex = findStartIndex === -1 ? 0 : findStartIndex;

        const findEndIndex = maxLiqDistribution.findIndex(
          (item) => item.relativeBinId === relativeBinRange[1]
        );
        const endIndex =
          findEndIndex === -1 ? maxLiqDistribution.length : findEndIndex + 1;

        const liquidityDistribution = maxLiqDistribution.slice(
          startIndex,
          endIndex
        );

        const binArray = binArrayList.find(
          (item) =>
            item.binArrayLowerIndex * 256 <= binLower &&
            (item.binArrayUpperIndex + 1) * 256 > binUpper
        )!;

        const binArrayLower = await liquidityBookServices.getBinArray({
          binArrayIndex: binArray.binArrayLowerIndex,
          pair: poolAddress,
          payer: userPublicKey,
        });
        const binArrayUpper = await liquidityBookServices.getBinArray({
          binArrayIndex: binArray.binArrayUpperIndex,
          pair: poolAddress,
          payer: userPublicKey,
        });

        if (!currentPosition) {
          const transaction: any = new Transaction();

          const positionMint = Keypair.generate();

          const { position } = await liquidityBookServices.createPosition({
            pair: poolAddress,
            payer: userPublicKey,
            relativeBinIdLeft: relativeBinRange[0],
            relativeBinIdRight: relativeBinRange[1],
            binArrayIndex: binArray.binArrayLowerIndex,
            positionMint: positionMint.publicKey,
            transaction,
          });
          transaction.feePayer = userPublicKey;
          transaction.recentBlockhash = currentBlockhash;

          transaction.sign(positionMint);

          txsCreatePosition.push(transaction);
          allTxs.push(transaction);

          return {
            positionMint: positionMint.publicKey.toString(),
            position,
            liquidityDistribution,
            binArrayLower: binArrayLower.toString(),
            binArrayUpper: binArrayUpper.toString(),
          };
        }

        return {
          positionMint: currentPosition.positionMint,
          liquidityDistribution,
          binArrayLower: binArrayLower.toString(),
          binArrayUpper: binArrayUpper.toString(),
        };
      })
    );

    const txsAddLiquidity = await Promise.all(
      maxLiquidityDistributions.map(async (item) => {
        const {
          binArrayLower,
          binArrayUpper,
          liquidityDistribution,
          positionMint,
        } = item;

        const transaction: any = new Transaction();

        await liquidityBookServices.addLiquidityIntoPosition({
          amountX: Number(convertBalanceToWei(10, tokenX.decimals)),
          amountY: Number(convertBalanceToWei(10, tokenY.decimals)),
          binArrayLower: new PublicKey(binArrayLower),
          binArrayUpper: new PublicKey(binArrayUpper),
          liquidityDistribution,
          pair: poolAddress,
          positionMint: new PublicKey(positionMint),
          payer: userPublicKey,
          transaction,
        });

        transaction.recentBlockhash = currentBlockhash;
        transaction.feePayer = userPublicKey;

        allTxs.push(transaction);
        return transaction;
      })
    );

    return {
      instructions: [], //createPositionTx.instructions,
    };
  }
}
