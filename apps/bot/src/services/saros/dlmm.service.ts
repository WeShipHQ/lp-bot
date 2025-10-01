import {
  LiquidityBookServices,
  LiquidityShape,
  MODE,
  BASIS_POINT_MAX,
  ONE,
  SCALE_OFFSET,
  type PairInfo,
  type PositionInfo,
  BIN_ARRAY_SIZE,
} from "@saros-finance/dlmm-sdk";
import { utils } from "@coral-xyz/anchor";
import * as spl from "@solana/spl-token";

import { Keypair, PublicKey, Transaction } from "@solana/web3.js";
import { CONFIG } from "@/config";
import Decimal from "decimal.js";
import { JupiterService } from "../jupiter.service";
import { SarosPoolPosition } from "./types";

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

export class SarosDlmmService {
  private poolCache = new Map<
    string,
    { instance: LiquidityBookServices; timestamp: number }
  >();
  private binArrayCache = new Map<string, { data: any; timestamp: number }>();
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
      options: {
        rpcUrl: CONFIG.SOLANA.RPC_URL,
      },
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
    poolAddress: PublicKey,
    userPublicKey: PublicKey,
    totalXAmount: Decimal,
    totalYAmount: Decimal,
    strategy: LiquidityShape,
    rangeInterval: number
  ): Promise<{
    positionMint: Keypair;
    createPositionTx: Transaction;
    addLiquidityTx: Transaction;
  }> {
    const liquidityBookServices = new LiquidityBookServices({
      mode: MODE.MAINNET,
      options: {
        rpcUrl: CONFIG.SOLANA.RPC_URL,
      },
    });

    const payer = new PublicKey(userPublicKey);
    const pair = new PublicKey(poolAddress);

    const pairInfo: PairInfo = await liquidityBookServices.getPairAccount(pair);
    const activeBin = pairInfo.activeId;
    const relativeBinIdLeft = activeBin - rangeInterval;
    const relativeBinIdRight = activeBin + rangeInterval;

    const positionMint = Keypair.generate();

    const createPosTran = new Transaction();

    const { position } = await liquidityBookServices.createPosition({
      payer,
      relativeBinIdLeft,
      relativeBinIdRight,
      pair,
      binArrayIndex: 0,
      positionMint: positionMint.publicKey,
      transaction: createPosTran as any,
    });

    const [binArrayLowerPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("bin_array"), pair.toBuffer(), Buffer.from([0])],
      liquidityBookServices.lbProgram.programId
    );

    const [binArrayUpperPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("bin_array"), pair.toBuffer(), Buffer.from([1])],
      liquidityBookServices.lbProgram.programId
    );

    const addLidTran = new Transaction();

    await liquidityBookServices.addLiquidityIntoPosition({
      positionMint: positionMint.publicKey,
      payer,
      pair,
      transaction: addLidTran as any,
      liquidityDistribution: [],
      amountX: totalXAmount.toNumber(),
      amountY: totalYAmount.toNumber(),
      binArrayLower: binArrayLowerPda,
      binArrayUpper: binArrayUpperPda,
    });

    return {
      positionMint: positionMint,
      createPositionTx: createPosTran,
      addLiquidityTx: addLidTran,
    };
  }

  async getPositions(userWallet: string): Promise<SarosPoolPosition[]> {
    const liquidityBookServices = new LiquidityBookServices({
      mode: MODE.MAINNET,
      options: {
        rpcUrl: CONFIG.SOLANA.RPC_URL,
      },
    });

    const tokenAccounts =
      await liquidityBookServices.connection.getParsedTokenAccountsByOwner(
        new PublicKey(userWallet),
        {
          programId: spl.TOKEN_2022_PROGRAM_ID,
        }
      );

    const positionMints = tokenAccounts.value
      .filter((acc) => {
        const amount = acc.account.data.parsed.info.tokenAmount.uiAmount;
        // Only interested in NFTs or position tokens with amount > 0
        return amount && amount > 0;
      })
      .map((acc) => new PublicKey(acc.account.data.parsed.info.mint));

    const positions: PositionInfo[] = await Promise.all(
      positionMints.map(async (mint) => {
        // Derive PDA for Position account
        const [positionPda] = await PublicKey.findProgramAddressSync(
          [Buffer.from(utils.bytes.utf8.encode("position")), mint.toBuffer()],
          liquidityBookServices.lbProgram.programId
        );
        // Fetch and decode the Position account
        try {
          const accountInfo =
            await liquidityBookServices.connection.getAccountInfo(positionPda);
          if (!accountInfo) return null;
          const position =
            //@ts-ignore
            await liquidityBookServices.lbProgram.account.position.fetch(
              positionPda
            );

          return { ...position, position: positionPda.toString() };
        } catch {
          return null;
        }
      })
    );

    const validPositions = positions.filter(
      (pos): pos is PositionInfo => pos !== null
    );

    console.log(
      "validPositions",
      validPositions.map((pos) => pos.position)
    );

    const positionsByPair = validPositions.reduce(
      (acc, position) => {
        const pairKey = position.pair;
        if (!acc[pairKey]) {
          acc[pairKey] = [];
        }
        acc[pairKey].push(position);
        return acc;
      },
      {} as Record<string, PositionInfo[]>
    );

    const cacheTtl = this.CACHE_TTL;

    const poolPositions = await Promise.all(
      Object.entries(positionsByPair).map(
        async ([pairAddress, pairPositions]) => {
          let totalX = new Decimal(0);
          let totalY = new Decimal(0);

          for (const pos of pairPositions) {
            const { pair, lowerBinId: firstBinId, upperBinId } = pos;

            const binArrayIndex = Math.floor(firstBinId / BIN_ARRAY_SIZE);

            // Check cache first
            const cacheKey = `${pair}-${binArrayIndex}`;
            const now = Date.now();
            const cached = this.binArrayCache.get(cacheKey);

            let binArrayInfo;
            if (cached && now - cached.timestamp < cacheTtl) {
              binArrayInfo = cached.data;
            } else {
              try {
                binArrayInfo = await liquidityBookServices.getBinArrayInfo({
                  binArrayIndex,
                  pair: new PublicKey(pair),
                  payer: new PublicKey(userWallet),
                });

                this.binArrayCache.set(cacheKey, {
                  data: binArrayInfo,
                  timestamp: now,
                });

                await new Promise((resolve) => setTimeout(resolve, 100));
              } catch (error) {
                console.error(
                  `Error fetching bin array info for ${cacheKey}:`,
                  error
                );
                continue;
              }
            }

            const { bins, resultIndex } = binArrayInfo;
            const firstBinIndex = resultIndex * BIN_ARRAY_SIZE;

            const binIds = Array.from(
              { length: upperBinId - firstBinId + 1 },
              (_, i) => firstBinId - firstBinIndex + i
            );

            const reserveXY = binIds.map((binId: number, index: number) => {
              const liquidityShare = pos.liquidityShares[index].toString();
              const activeBin = bins[binId];

              if (activeBin) {
                const totalReserveX = +BigInt(activeBin.reserveX).toString();
                const totalReserveY = +BigInt(activeBin.reserveY).toString();
                const totalSupply = +BigInt(activeBin.totalSupply).toString();

                const reserveX =
                  totalReserveX > 0
                    ? mulDiv(
                        Number(liquidityShare),
                        Number(totalReserveX),
                        Number(totalSupply),
                        "down"
                      )
                    : 0;

                const reserveY =
                  totalReserveY > 0
                    ? mulDiv(
                        Number(liquidityShare),
                        Number(totalReserveY),
                        Number(totalSupply),
                        "down"
                      )
                    : 0;

                return {
                  reserveX: reserveX || 0,
                  reserveY: reserveY || 0,
                  totalSupply: +BigInt(activeBin.totalSupply).toString(),
                  binId: firstBinId + index,
                  binPosition: binId,
                  liquidityShare: pos.liquidityShares[index],
                };
              }

              return {
                reserveX: 0,
                reserveY: 0,
                totalSupply: "0",
                binId: firstBinId + index,
                binPosition: binId,
                liquidityShare: liquidityShare,
              };
            });

            totalX = reserveXY.reduce(
              (acc, cur) => acc.add(new Decimal(cur.reserveX)),
              totalX
            );

            totalY = reserveXY.reduce(
              (acc, cur) => acc.add(new Decimal(cur.reserveY)),
              totalY
            );
          }

          return {
            pair: pairAddress,
            postions: pairPositions,
            reserveX: totalX,
            reserveY: totalY,
          } as SarosPoolPosition;
        }
      )
    );

    return poolPositions;
  }
}

const divRem = (numerator: number, denominator: number) => {
  if (denominator === 0) {
    throw new Error("Division by zero"); // Xử lý lỗi chia cho 0
  }

  // Tính thương và phần dư
  const quotient = numerator / denominator; // Thương
  const remainder = numerator % denominator; // Phần dư

  return [quotient, remainder]; // Trả về mảng chứa thương và phần dư
};

const mulDiv = (
  x: number,
  y: number,
  denominator: number,
  rounding: "up" | "down"
) => {
  const prod = x * y;

  if (rounding === "up") {
    return Math.floor((prod + denominator - 1) / denominator);
  }

  if (rounding === "down") {
    const [quotient] = divRem(prod, denominator);
    return quotient;
  }
};
