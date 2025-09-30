import {
  formatPrice,
  formatNumber,
  formatPercentage,
  formatTokenAmountSmart,
} from "@/bot/utils/formatters";
import { bold, italic, link } from "@/bot/utils/text-formatters";
import { Position } from "@/db";
import { MeteoraDlmmPosition } from "@/types/meteora.types";
import { Pool } from "@/types/pool.types";
import { PortfolioData, PortfolioPosition } from "@/types/portfolio.types";
import { PositionPnlResult } from "@/types/position.types";
import { TokenPrice } from "@/types/token.types";
import { getPositionStartCommand } from "@/utils/link";
import { LbPair, LbPosition } from "@meteora-ag/dlmm";
import Decimal from "decimal.js";

const formatPairSymbol = (p: PortfolioPosition) =>
  `${p.token_x_info.symbol}-${p.token_y_info.symbol}`;

export class MessageService {
  private static formatPriceValue(v: number): string {
    const abs = Math.abs(v);
    if (abs > 0 && abs < 0.01) return formatPrice(v);
    if (abs < 1) return formatNumber(v, { maxDecimals: 8 });
    return formatNumber(v, { maxDecimals: 2 });
  }

  private static getFeeTvlPercent(pos: PortfolioPosition): number | undefined {
    const value =
      pos.position_fee_tvl_24h ??
      (pos.pool_fee_tvl_24h != null
        ? pos.pool_fee_tvl_24h > 1
          ? pos.pool_fee_tvl_24h / 100
          : pos.pool_fee_tvl_24h
        : undefined);
    return value ?? undefined;
  }

  private static buildTitle(
    index: number,
    pos: PortfolioPosition,
    botName?: string
  ): string {
    const text = `/${index + 1} ${formatPairSymbol(pos)}`;
    return botName
      ? `[${text}](${getPositionStartCommand(botName, pos.position_address)})`
      : text;
  }

  private static buildBasicInfo(pos: PortfolioPosition): string | undefined {
    if (pos.is_tracked_in_db == null) return undefined;
    return `**Tracked in DB:** ${pos.is_tracked_in_db ? "🟢 Yes" : "🟠 No"} ${italic(
      "(Click to add to DB)"
    )}`;
  }

  private static buildBalance(pos: PortfolioPosition): string {
    if (pos.current_x_amount != null && pos.current_y_amount != null) {
      return `**Position Balance:** ${bold(
        formatTokenAmountSmart(pos.current_x_amount)
      )} ${pos.token_x_info.symbol} / ${bold(
        formatTokenAmountSmart(pos.current_y_amount)
      )} ${pos.token_y_info.symbol} (${bold(
        formatPrice(pos.current_value_usd)
      )})`;
    }
    return `**Position Balance:** ${bold(formatPrice(pos.current_value_usd))}`;
  }

  private static buildPriceInfo(pos: PortfolioPosition): string | undefined {
    const parts: string[] = [];
    if (pos.price_min != null && pos.price_max != null) {
      const low = Math.min(pos.price_min, pos.price_max);
      const high = Math.max(pos.price_min, pos.price_max);
      if (high < 1) {
        parts.push(
          `**Price Range:** ${bold(
            MessageService.formatPriceValue(low)
          )} - ${bold(
            MessageService.formatPriceValue(high)
          )} ${pos.token_y_info.symbol}/${pos.token_x_info.symbol}`
        );
      } else {
        parts.push(
          `**Price Range:** ${bold(
            MessageService.formatPriceValue(low)
          )} - ${bold(
            MessageService.formatPriceValue(high)
          )} ${pos.token_x_info.symbol}/${pos.token_y_info.symbol}`
        );
      }
    }

    if (pos.pool_price != null && pos.pool_price > 0) {
      if (pos.pool_price < 1) {
        parts.push(
          `**Pool Price:** ${bold(
            MessageService.formatPriceValue(pos.pool_price)
          )} ${pos.token_y_info.symbol}/${pos.token_x_info.symbol}`
        );
      } else {
        parts.push(
          `**Pool Price:** ${bold(
            MessageService.formatPriceValue(pos.pool_price)
          )} ${pos.token_x_info.symbol}/${pos.token_y_info.symbol}`
        );
      }
    }

    return parts.length > 0 ? parts.join("\n") : undefined;
  }

  private static buildFeesInfo(pos: PortfolioPosition): string {
    const parts: string[] = [];
    if (pos.unclaimed_fees_x != null && pos.unclaimed_fees_y != null) {
      parts.push(
        `**Unclaimed Fees:** ${bold(
          formatTokenAmountSmart(pos.unclaimed_fees_x)
        )} ${pos.token_x_info.symbol} / ${bold(
          formatTokenAmountSmart(pos.unclaimed_fees_y)
        )} ${pos.token_y_info.symbol} (${bold(
          formatPrice(pos.total_unclaimed_fees_usd)
        )})`
      );
    } else {
      parts.push(
        `**Unclaimed Fees:** ${bold(formatPrice(pos.total_unclaimed_fees_usd))}`
      );
    }

    if (pos.claimed_fees_x != null && pos.claimed_fees_y != null) {
      parts.push(
        `**Claimed Fees:** ${bold(
          formatTokenAmountSmart(pos.claimed_fees_x)
        )} ${pos.token_x_info.symbol} / ${bold(
          formatTokenAmountSmart(pos.claimed_fees_y)
        )} ${pos.token_y_info.symbol} (${bold(
          formatPrice(pos.total_claimed_fees_usd)
        )})`
      );
    } else {
      parts.push(
        `**Claimed Fees:** ${bold(formatPrice(pos.total_claimed_fees_usd))}`
      );
    }

    return parts.join("\n");
  }

  private static buildStatusInfo(pos: PortfolioPosition): string {
    const feeTvlPercent = MessageService.getFeeTvlPercent(pos);
    const left =
      feeTvlPercent != null
        ? `**24h Fee / TVL:** ${bold(formatPercentage(feeTvlPercent))}.`
        : `**24h Fee / TVL:** ${bold("N/A")}.`;
    const right = `**In Range:** ${pos.in_range ? "🟢" : "🔴"}`;
    // 7 spaces between the two parts to visually separate
    const pnlLine = (() => {
      const usd = pos.pnl_usd;
      const pct = pos.pnl_pct;
      const usdStr = bold(formatPrice(usd));
      const pctStr =
        pct != null
          ? ` (${bold(
              formatPercentage(pct, { decimals: 2, alwaysShowSign: true })
            )})`
          : "";
      return `\n**PnL:** ${usdStr}${pctStr}`;
    })();
    return `${left}       ${right}${pnlLine}`;
  }

  private static buildPositionBlock(
    pos: PortfolioPosition,
    index: number,
    botName?: string
  ): string {
    const sections: Array<string | undefined> = [];
    sections.push(MessageService.buildTitle(index, pos, botName));
    sections.push(MessageService.buildBasicInfo(pos));

    // Merge balance and price info with a single newline between them (no extra blank line)
    const balance = MessageService.buildBalance(pos);
    const priceInfo = MessageService.buildPriceInfo(pos);
    const balanceBlock = priceInfo ? `${balance}\n${priceInfo}` : balance;
    sections.push(balanceBlock);

    // Merge fees and status into a single block (no blank line between them)
    const fees = MessageService.buildFeesInfo(pos);
    const status = MessageService.buildStatusInfo(pos);
    const feesBlock = `${fees}\n${status}`;
    sections.push(feesBlock);
    return sections.filter(Boolean).join("\n\n");
  }

  /**
   * Generate welcome message for new users
   */
  static getWelcomeMessage(walletAddress?: string, solBalance?: number, usdValue?: number, referralLink?: string): string {
    let walletInfo: string;

    if (walletAddress) {
      if (solBalance !== undefined && usdValue !== undefined) {
        walletInfo = `🏦 **Your Wallet Balance:** ${solBalance.toFixed(2)} SOL ($${usdValue.toFixed(3)})\n\n`;
      } else {
        walletInfo = `🏦 **Wallet Status:** Creating wallet...\n\n` +
          "⏳ Please wait while we set up your Solana wallet.\n" +
          "This may take a few moments.\n\n";
      }
      
      walletInfo += `**Wallet Address:** \`${walletAddress}\` (tap to copy)\n\n`;
      
      if (referralLink) {
        walletInfo += `**Your Reflink:** ${referralLink} (tap to copy)\n\n`;
      }
    } else {
      walletInfo =
        "🏦 **Wallet Status:** Creating wallet...\n\n" +
        "⏳ Please wait while we set up your Solana wallet.\n" +
        "This may take a few moments.\n\n";
    }

    return (
      `🏝️ **Welcome to Panda LP Bot: the easiest way to LP on Solana DEXes!**\n\n` +
      walletInfo +
      `Get started by depositing SOL in your wallet address.\n\n` +
      `Use /trending or enter token address in bot chat to create new positions!`
    );
  }

  /**
   * Generate wallet message with balance and price information
   */
  static getWalletMessage(
    walletAddress: string,
    solBalance: number,
    usdValue: number
  ): string {
    let message = `🏦 *Wallet SOL Balance:* ${solBalance.toFixed(3)} SOL (${formatPrice(usdValue)})\n\n`;
    message += `*Wallet Address:*\n`;
    message += `\`${walletAddress}\` (tap to copy)\n\n`;

    return message;
  }

  /**
   * Generate error message
   */
  static getErrorMessage(
    message: string = "Something went wrong. Please try again later."
  ): string {
    return `❌ ${message}`;
  }

  /**
   * Generate private chat required message
   */
  static getPrivateChatRequiredMessage(): string {
    return "❌ Please start the bot in a private chat with me.";
  }

  static getPortfolioOverviewMessage(
    data: PortfolioData,
    botName?: string
  ): string {
    const positions = data.positions ?? [];

    const totals = data.totals;

    if (positions.length === 0) {
      return (
        `\n❌ No active positions found.\n\n` +
        `Get started by:\n\n` +
        `➡️ Use /trending to see hot pools\n` +
        `➡️ Or paste a token address to create new positions`
      );
    }

    let msg = `**${bold(`Portfolio Overview`)}**\n\n`;

    // Display totals in 2 rows instead of 4
    msg += `**Total Positions:** ${bold(totals.total_positions)}    **Total Balance:** ${bold(formatPrice(totals.total_current_value_usd))}\n`;
    msg += `**Total Deposits:** ${bold(formatPrice(totals.total_deposits_usd))}    **Total Withdrawals:** ${bold(formatPrice(totals.total_withdrawals_usd))}\n`;
    msg += `**Net Deposited:** ${bold(formatPrice(totals.total_net_deposited_usd))}    **Total Unclaimed Fees:** ${bold(formatPrice(totals.total_unclaimed_fees_usd))}\n\n`;

    msg += positions
      .map((pos, i) => MessageService.buildPositionBlock(pos, i, botName))
      .join("\n\n");

    msg += `\n\n💡 Tap the inline button or type */1*, */2* ... to open details.`;

    return msg;
  }

  static getPositionDetailMessage(
    pos: PortfolioPosition,
    walletAddress?: string
  ): string {
    const pairName = formatPairSymbol(pos);
    const sx = pos.token_x_info.symbol;
    const sy = pos.token_y_info.symbol;

    const meteoraUrl = `https://www.meteora.ag/dlmm/${pos.pool_address}`;
    const meteorlensUrl = `https://meteorlens.com/pool?pool=${pos.pool_address}${walletAddress ? `&wallet=${walletAddress}` : ""}`;
    let msg = `**${bold(pairName)}** | [Meteora](${meteoraUrl}) | [Meteorlens](${meteorlensUrl})\n\n`;

    console.log("pos.net_profit_usd => ", pos.net_profit_usd);
    console.log("pos.net_profit_percentage => ", pos.net_profit_percentage);

    // Calculate and display Net Profit (PnL commented out for now)
    const netProfitFormatted =
      pos.net_profit_usd != null
        ? formatPrice(pos.net_profit_usd, { compact: true })
        : "N/A";

    const netProfitPerFormatted =
      pos.net_profit_percentage != null
        ? formatPercentage(pos.net_profit_percentage)
        : "N/A";

    msg += `**Net Profit:** ${bold(netProfitFormatted)} (${bold(netProfitPerFormatted)})\n`;

    // Deposits / Withdrawals / Net Deposited
    msg += `**Deposits:** ${bold(formatPrice(pos.total_deposits_usd))}    **Withdrawals:** ${bold(formatPrice(pos.total_withdrawals_usd))}\n`;
    const netDeposited = pos.total_deposits_usd - pos.total_withdrawals_usd;
    msg += `**Net Deposited:** ${bold(formatPrice(netDeposited))}\n\n`;

    // DB Tracking Status
    if (pos.is_tracked_in_db != null) {
      msg += `**Tracked in DB:** ${pos.is_tracked_in_db ? "🟢 Yes" : "🟠 No"} ${italic("(Click to add to DB)")}\n\n`;
    }

    // Position Balance
    if (pos.current_x_amount != null && pos.current_y_amount != null) {
      msg += `**Position Balance:** ${bold(formatTokenAmountSmart(pos.current_x_amount))} ${sx} / ${bold(formatTokenAmountSmart(pos.current_y_amount))} ${sy} (${bold(formatPrice(pos.current_value_usd))})\n\n`;
    } else {
      msg += `**Position Balance:** ${bold(formatPrice(pos.current_value_usd))}\n\n`;
    }

    // Price Range (Primary)
    if (pos.price_min != null && pos.price_max != null) {
      const low = Math.min(pos.price_min, pos.price_max);
      const high = Math.max(pos.price_min, pos.price_max);
      if (high < 1) {
        msg += `**Price Range:** ${bold(
          MessageService.formatPriceValue(low)
        )} - ${bold(MessageService.formatPriceValue(high))} ${sy}/${sx}\n`;
      } else {
        msg += `**Price Range:** ${bold(
          MessageService.formatPriceValue(low)
        )} - ${bold(MessageService.formatPriceValue(high))} ${sx}/${sy}\n`;
      }
    }

    // Price Range (Alternative)
    if (pos.price_min != null && pos.price_max != null) {
      const low = Math.min(pos.price_min, pos.price_max);
      const high = Math.max(pos.price_min, pos.price_max);
      const invLow = 1 / high;
      const invHigh = 1 / low;
      if (high < 1) {
        msg += `**Price Range (alt):** ${bold(
          formatNumber(invLow, { maxDecimals: 2 })
        )} - ${bold(formatNumber(invHigh, { maxDecimals: 2 }))} ${sx}/${sy}\n`;
      } else {
        msg += `**Price Range (alt):** ${bold(
          formatNumber(invLow, { maxDecimals: 8 })
        )} - ${bold(formatNumber(invHigh, { maxDecimals: 8 }))} ${sy}/${sx}\n`;
      }
    }

    // Pool Price (Primary)
    if (pos.pool_price != null && pos.pool_price > 0) {
      if (pos.pool_price < 1) {
        msg += `**Pool Price:** ${bold(
          MessageService.formatPriceValue(pos.pool_price)
        )} ${sy}/${sx}\n`;
      } else {
        msg += `**Pool Price:** ${bold(
          MessageService.formatPriceValue(pos.pool_price)
        )} ${sx}/${sy}\n`;
      }
    }

    // Pool Price (Alternative)
    if (pos.pool_price != null && pos.pool_price > 0) {
      const inv = 1 / pos.pool_price;
      if (pos.pool_price < 1) {
        msg += `**Pool Price (alt):** ${bold(
          formatNumber(inv, { maxDecimals: 2 })
        )} ${sx}/${sy}\n`;
      } else {
        msg += `**Pool Price (alt):** ${bold(
          formatNumber(inv, { maxDecimals: 8 })
        )} ${sy}/${sx}\n`;
      }
    }

    msg += `\n`;

    // Unclaimed Fees
    if (pos.unclaimed_fees_x != null && pos.unclaimed_fees_y != null) {
      msg += `**Unclaimed Fees:** ${bold(formatTokenAmountSmart(pos.unclaimed_fees_x))} ${sx} / ${bold(formatTokenAmountSmart(pos.unclaimed_fees_y))} ${sy} (${bold(formatPrice(pos.total_unclaimed_fees_usd))})\n`;
    } else {
      msg += `**Unclaimed Fees:** ${bold(formatPrice(pos.total_unclaimed_fees_usd))}\n`;
    }

    // Claimed Fees
    if (pos.claimed_fees_x != null && pos.claimed_fees_y != null) {
      msg += `**Claimed Fees:** ${bold(formatTokenAmountSmart(pos.claimed_fees_x))} ${sx} / ${bold(formatTokenAmountSmart(pos.claimed_fees_y))} ${sy} (${bold(formatPrice(pos.total_claimed_fees_usd))})\n`;
    } else {
      msg += `**Claimed Fees:** ${bold(formatPrice(pos.total_claimed_fees_usd))}\n`;
    }

    // Fee/TVL and In Range Status
    const feeTvlPercent =
      pos.position_fee_tvl_24h ??
      (pos.pool_fee_tvl_24h != null
        ? pos.pool_fee_tvl_24h > 1
          ? pos.pool_fee_tvl_24h / 100
          : pos.pool_fee_tvl_24h
        : undefined);

    const feeTvlPart =
      feeTvlPercent != null
        ? `**24h Fee / TVL:** ${bold(formatPercentage(feeTvlPercent))}    `
        : "";

    msg += `\n${feeTvlPart}**In Range:** ${pos.in_range ? "🟢" : "🔴"}\n`;
    if (typeof pos.pnl_usd === "number") {
      const pnlUsd = bold(formatPrice(pos.pnl_usd, { compact: true }));
      const pnlPct =
        typeof pos.pnl_pct === "number"
          ? ` (${bold(
              formatPercentage(pos.pnl_pct, {
                decimals: 2,
                alwaysShowSign: true,
              })
            )})`
          : "";
      msg += `**PnL:** ${pnlUsd}${pnlPct}\n`;
    }

    // Take Profit and Stop Loss indicators (placeholder - showing as disabled)
    msg += `**Take Profit:** 🔴    **Stop Loss:** 🔴\n\n`;

    // Created Date
    if (pos.created_at) {
      msg += `**Created Date:** ${new Date(pos.created_at).toLocaleString()}\n`;
    }

    return msg;
  }

  static getPositionDetailMessageV1(
    position: Position,
    lbPosition: LbPosition,
    lbPair: LbPair,
    poolInfo: Pool,
    tokenAPrice: TokenPrice,
    tokenBPrice: TokenPrice
  ): string {
    const meteoraUrl = link(
      "Meteora",
      `https://www.meteora.ag/dlmm/${poolInfo.address}`
    );

    let message = `*${poolInfo.name}* | ${meteoraUrl} \n\n`;

    const positionData = lbPosition.positionData;

    const { pnlUsd, pnlPercentage } = calculatePositionPnl(
      position,
      lbPosition,
      tokenAPrice,
      tokenBPrice
    );

    const totalXAmount = new Decimal(lbPosition.positionData.totalXAmount).div(
      new Decimal(10).pow(new Decimal(poolInfo.tokenA.decimals))
    );
    const totalYAmount = new Decimal(lbPosition.positionData.totalYAmount).div(
      new Decimal(10).pow(new Decimal(poolInfo.tokenB.decimals))
    );

    const tokenXUSD = totalXAmount.mul(tokenAPrice.price);
    const tokenYUSD = totalYAmount.mul(tokenBPrice.price);
    const totalUSD = tokenXUSD.add(tokenYUSD);

    const positionBinData = lbPosition.positionData.positionBinData;
    const startBin = positionBinData[0];
    const lastBin = positionBinData.slice(-1)[0];

    const startPrice = startBin.pricePerToken;
    const endPrice = lastBin.pricePerToken;
    const poolPrice = poolInfo.currentPrice;

    const claimedFeesX = new Decimal(
      positionData.totalClaimedFeeXAmount.toString()
    ).div(new Decimal(10).pow(new Decimal(poolInfo.tokenA.decimals)));
    const claimedFeesY = new Decimal(
      positionData.totalClaimedFeeYAmount.toString()
    ).div(new Decimal(10).pow(new Decimal(poolInfo.tokenB.decimals)));
    const claimedFeesUSD = claimedFeesX
      .mul(tokenAPrice.price)
      .add(claimedFeesY.mul(tokenBPrice.price));

    const unclaimedFeesX = new Decimal(positionData.feeX.toString()).div(
      new Decimal(10).pow(new Decimal(poolInfo.tokenA.decimals))
    );
    const unclaimedFeesY = new Decimal(positionData.feeY.toString()).div(
      new Decimal(10).pow(new Decimal(poolInfo.tokenB.decimals))
    );
    const unclaimedFeesXUSD = unclaimedFeesX.mul(tokenAPrice.price);
    const unclaimedFeesYUSD = unclaimedFeesY.mul(tokenBPrice.price);
    const totalUnclaimedFeesUSD = unclaimedFeesXUSD.add(unclaimedFeesYUSD);

    const activeId = Number(lbPair.activeId);
    const inRange =
      activeId >= positionData.lowerBinId &&
      activeId <= positionData.upperBinId;

    const netProfitFormatted = `Net Profit: *${formatPrice(Number(pnlUsd), { maxDecimals: 2 })} (${formatPercentage(Number(pnlPercentage))})*`;
    const positionBalanceFormatted = `Position Balance: *${formatNumber(totalXAmount.toString(), { maxDecimals: 6 })} ${poolInfo.tokenA.symbol} / ${formatNumber(totalYAmount.toString(), { maxDecimals: 6 })} ${poolInfo.tokenB.symbol} (${formatPrice(Number(totalUSD), { maxDecimals: 2 })})*`;
    const positionRangeFormatted = `Position Range: *${formatNumber(startPrice, { maxDecimals: 6 })} - ${formatNumber(endPrice, { maxDecimals: 6 })} ${poolInfo.tokenA.symbol}/${poolInfo.tokenB.symbol}*`;
    const poolPriceFormatted = `Pool Price: *${formatNumber(poolPrice, { maxDecimals: 6 })} ${poolInfo.tokenA.symbol}/${poolInfo.tokenB.symbol}*`;

    const claimedFeeFormatted = `Claimed Fees: *${formatNumber(claimedFeesX.toString(), { maxDecimals: 6 })} ${poolInfo.tokenA.symbol} / ${formatNumber(claimedFeesY.toString(), { maxDecimals: 6 })} ${poolInfo.tokenB.symbol} (${formatPrice(Number(claimedFeesUSD), { maxDecimals: 2 })})*`;
    const unclaimedFeeFormatted = `Unclaimed Fees: *${formatNumber(unclaimedFeesX.toString(), { maxDecimals: 6 })} ${poolInfo.tokenA.symbol} / ${formatNumber(unclaimedFeesY.toString(), { maxDecimals: 6 })} ${poolInfo.tokenB.symbol} (${formatPrice(Number(totalUnclaimedFeesUSD), { maxDecimals: 2 })})*`;

    const inRangeFormatted = `In Range: ${inRange ? "🟢" : "🔴"}`;

    message += `${netProfitFormatted}\n`;
    message += `${positionBalanceFormatted}\n`;
    message += `${positionRangeFormatted}\n`;
    message += `${poolPriceFormatted}\n\n`;
    message += `${claimedFeeFormatted}\n`;
    message += `${unclaimedFeeFormatted}\n`;
    message += `${inRangeFormatted}\n`;

    return message;
  }

  /**
   * Generate transfer SOL request message
   */
  static getTransferSolRequestMessage(): string {
    return "💸 *Transfer SOL*\n\nPlease enter the recipient's wallet address and the amount to transfer in the format:\n\n`address amount`\n\nExample: `GgS64xkW9JqR3VkBn4fpPi7sMqcnAzqRWTUXbBZhHpLT 0.1`\n\nOr type /cancel to cancel the transfer.";
  }

  /**
   * Generate transfer ALL SOL request message
   */
  static getTransferAllSolRequestMessage(): string {
    return "💸 *Transfer ALL SOL*\n\nPlease enter the recipient's wallet address:\n\n`address`\n\nExample: `GgS64xkW9JqR3VkBn4fpPi7sMqcnAzqRWTUXbBZhHpLT`\n\nThis will transfer your entire SOL balance (minus transaction fees).\n\nOr type /cancel to cancel the transfer.";
  }

  /**
   * Generate transfer SOL confirmation message
   */
  static getTransferConfirmationMessage(
    recipientAddress: string,
    amount: number,
    usdValue: number
  ): string {
    return (
      `🔍 *Confirm Transfer*\n\n` +
      `You are about to send *${amount} SOL* (${formatPrice(usdValue)}) to:\n` +
      `\`${recipientAddress}\`\n\n` +
      `Please confirm this transaction by clicking the button below.`
    );
  }

  /**
   * Generate transfer SOL success message
   */
  static getTransferSuccessMessage(
    recipientAddress: string,
    amount: number,
    signature: string
  ): string {
    return (
      `✅ *Transfer Successful*\n\n` +
      `Successfully sent *${amount} SOL* to:\n` +
      `\`${recipientAddress}\`\n\n` +
      `Transaction signature:\n` +
      `\`${signature}\`\n\n` +
      `View on Solscan: https://solscan.io/tx/${signature}`
    );
  }

  /**
   * Generate transfer SOL success message with amount adjustment
   */
  static getTransferSuccessWithAdjustmentMessage(
    recipientAddress: string,
    requestedAmount: number,
    actualAmount: number,
    signature: string
  ): string {
    return (
      `✅ *Transfer Successful*\n\n` +
      `You requested to send *${requestedAmount} SOL*, but the amount was adjusted to *${actualAmount} SOL* to account for transaction fees.\n\n` +
      `Successfully sent to:\n` +
      `\`${recipientAddress}\`\n\n` +
      `Transaction signature:\n` +
      `\`${signature}\`\n\n` +
      `View on Solscan: https://solscan.io/tx/${signature}`
    );
  }

  /**
   * Generate transfer SOL error message
   */
  static getTransferErrorMessage(error: string): string {
    return `❌ *Transfer Failed*\n\n${error}`;
  }

  /**
   * Generate transfer token request message
   */
  static getTransferTokenRequestMessage(): string {
    return "💸 *Transfer SPL Token*\n\nPlease enter the token address, recipient address, and amount to transfer in the format:\n\n`tokenAddress recipientAddress amount`\n\nExample: `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v GgS64xkW9JqR3VkBn4fpPi7sMqcnAzqRWTUXbBZhHpLT 10`\n\nNote: The recipient must have already interacted with this token before. They need to have a token account for this specific token.\n\nOr type /cancel to cancel the transfer.";
  }

  /**
   * Generate transfer all tokens request message
   */
  static getTransferAllTokensRequestMessage(): string {
    return "💸 *Transfer All of a Token*\n\nPlease enter the token address and recipient address in the format:\n\n`tokenAddress recipientAddress`\n\nExample: `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v GgS64xkW9JqR3VkBn4fpPi7sMqcnAzqRWTUXbBZhHpLT`\n\nThis will transfer your entire balance of the specified token.\n\nNote: The recipient must have already interacted with this token before. They need to have a token account for this specific token.\n\nOr type /cancel to cancel the transfer.";
  }

  /**
   * Generate transfer token confirmation message
   */
  static getTransferTokenConfirmationMessage(
    tokenSymbol: string,
    tokenName: string,
    recipientAddress: string,
    amount: number
  ): string {
    return (
      `🔍 *Confirm Token Transfer*\n\n` +
      `You are about to send *${amount} ${tokenSymbol}* (${tokenName}) to:\n` +
      `\`${recipientAddress}\`\n\n` +
      `Please confirm this transaction by clicking the button below.`
    );
  }

  /**
   * Generate processing transaction message
   */
  static getProcessingTransactionMessage(): string {
    return "⏳ *Processing Transaction*\n\nYour transaction is being processed. Please wait a moment...\n\n_Please do not click the confirm button again to avoid duplicate transactions._";
  }

  /**
   * Generate wallet export message
   */
  static getWalletExportMessage(
    walletAddress: string,
    privateKey: string
  ): string {
    return (
      `🔐 *Wallet Export Successful*\n\n` +
      `*Address:* \`${walletAddress}\`\n` +
      `*Private Key:* \`${privateKey}\`\n\n` +
      `⚠️ **SECURITY WARNING:**\n` +
      `• Never share your private key with anyone\n` +
      `• Store it securely offline\n` +
      `• Anyone with this key can access your wallet\n\n`
    );
  }

  /**
   * Generate transfer token success message
   */
  static getTransferTokenSuccessMessage(
    tokenSymbol: string,
    recipientAddress: string,
    amount: number,
    signature: string
  ): string {
    return (
      `*Token Transfer Successful*\n\n` +
      `Successfully sent *${amount} ${tokenSymbol}* to:\n` +
      `\`${recipientAddress}\`\n\n` +
      `Transaction signature:\n` +
      `\`${signature}\`\n\n` +
      `View on Solscan: https://solscan.io/tx/${signature}`
    );
  }

  // 2FA Messages
  static getTwoFactorMenuMessage(): string {
    return (
      "🔐 **Two-Factor Authentication**\n\n" +
      "Choose an option below to manage your 2FA settings:\n\n" +
      "• **Setup 2FA** - Enable Two-Factor Authentication\n" +
      "• **Check Status** - View your current 2FA status\n" +
      "• **Disable 2FA** - Disable 2FA (contact support required)"
    );
  }

  static getTwoFactorAlreadyEnabledMessage(): string {
    return (
      "⚠️ **Two-Factor Authentication is already enabled!**\n\n" +
      "If you want to reset your 2FA, please contact support."
    );
  }

  static getTwoFactorNotEnabledMessage(): string {
    return (
      "ℹ️ **Two-Factor Authentication is not enabled**\n\n" +
      "Use `/setup-2fa` to enable 2FA for your account."
    );
  }

  static getTwoFactorSetupMessage(): string {
    return (
      "🔐 **Two-Factor Authentication Setup**\n\n" +
      "**Step 1:** Install Authenticator App on your phone\n\n" +
      "**Step 2:** Scan this QR code with Authenticator App:\n\n" +
      "**Step 3:** Enter the 6-digit code from your authenticator app\n\n" +
      "⚠️ **Important:**\n" +
      "• Keep your phone secure\n" +
      "• Don't share your authenticator app\n" +
      "• Contact support if you lose access\n\n"
    );
  }

  static getTwoFactorReadyToVerifyMessage(): string {
    return (
      "🔐 **Ready to Verify 2FA!**\n\n" +
      "Please enter the 6-digit code from your Authenticator App app.\n\n" +
      "**Example:** `123456`\n\n" +
      "Just type the code and send it as a message."
    );
  }

  static getTwoFactorEnabledSuccessMessage(): string {
    return (
      "✅ **Two-Factor Authentication Enabled Successfully!**\n\n" +
      "🔐 Your account is now protected with 2FA\n" +
      "📱 Use Authenticator App for future logins\n\n" +
      "⚠️ **Important Reminders:**\n" +
      "• Keep your phone secure\n" +
      "• Don't share your authenticator app\n" +
      "• Contact support if you lose access"
    );
  }

  static getTwoFactorInvalidCodeMessage(): string {
    return (
      "❌ **Invalid verification code!**\n\n" +
      "Please check your Authenticator App app and try again.\n" +
      "Make sure the code is current and entered correctly."
    );
  }

  static getTwoFactorNoSetupInProgressMessage(): string {
    return (
      "❌ **No 2FA setup in progress!**\n\n" +
      "Please click the 🔐 2FA button and setup 2FA first."
    );
  }

  static getTwoFactorDisableMessage(): string {
    return (
      "⚠️ **Disable Two-Factor Authentication**\n\n" +
      "This will remove 2FA protection from your account.\n\n" +
      "**To disable 2FA, please contact support** with:\n" +
      "• Your account verification\n" +
      "• Reason for disabling 2FA\n\n" +
      "For security reasons, 2FA cannot be disabled through the bot."
    );
  }

  static getTwoFactorStatusMessage(isEnabled: boolean): string {
    const status = isEnabled ? "✅ Enabled" : "❌ Disabled";
    const statusColor = isEnabled ? "🟢" : "🔴";

    return (
      `🔐 **Two-Factor Authentication Status**\n\n` +
      `${statusColor} **Status:** ${status}\n\n` +
      `**Security Tips:**\n` +
      `• Keep your phone secure\n` +
      `• Use a secure authenticator app\n` +
      `• Don't share your 2FA codes`
    );
  }

  static getTwoFactorRequiredForExportMessage(): string {
    return (
      "🔐 **2FA Required for Wallet Export**\n\n" +
      "For security reasons, you must enable Two-Factor Authentication before exporting your private key.\n\n" +
      "Please use the command `/twoFactor` to setup 2FA first.\n\n" +
      "⚠️ **Why 2FA is required:**\n" +
      "• Protects your private key from unauthorized access\n" +
      "• Adds an extra layer of security\n" +
      "• Required for sensitive operations"
    );
  }

  static getTwoFactorVerificationRequiredMessage(): string {
    return (
      "🔐 **2FA Verification Required**\n\n" +
      "Please enter your 6-digit authentication code from Authenticator App:\n\n" +
      "⏰ The code expires in 30 seconds\n" +
      "🔄 You have 3 attempts remaining\n\n" +
      "Type `/cancel` to cancel this operation."
    );
  }

  static getTwoFactorTooManyAttemptsMessage(): string {
    return (
      "❌ **Too Many Failed Attempts**\n\n" +
      "You have exceeded the maximum number of attempts. Please try again later."
    );
  }

  static getTwoFactorInvalidCodeWithAttemptsMessage(
    remainingAttempts: number
  ): string {
    return (
      `❌ **Invalid Authentication Code**\n\n` +
      `Please check your Authenticator App app and try again.\n\n` +
      `🔄 Attempts remaining: ${remainingAttempts}\n` +
      `Type \`/cancel\` to cancel this operation.`
    );
  }

  // Export Private Key Messages
  static getFirstTimeExportWarningMessage(): string {
    return (
      "⚠️ **First Time Export Warning**\n\n" +
      "This is your first time exporting your private key. For security reasons:\n\n" +
      "• This export will be allowed without 2FA verification\n" +
      "• **All future exports will require 2FA verification**\n" +
      "• Please ensure you have 2FA enabled for future security\n\n" +
      "Do you want to proceed with the export?"
    );
  }

  static getFirstTimeExportSuccessMessage(): string {
    return (
      "✅ **Private Key Exported Successfully!**\n\n" +
      "⚠️ **Important Security Reminder:**\n" +
      "• All future exports will require 2FA verification\n" +
      "• Please enable 2FA in `/twoFactor` for better security\n" +
      "• Keep your private key secure and never share it"
    );
  }

  static getExportCancelledMessage(): string {
    return "✅ Private key export cancelled.";
  }
}

function calculatePositionPnl(
  position: Position,
  lbPosition?: LbPosition,
  priceX?: TokenPrice,
  priceY?: TokenPrice
): PositionPnlResult {
  const initialValueUsd = new Decimal(position.initialValueUSD || "0");
  const cumulativeAbsolutePnlUsd = new Decimal(
    position.cumulativeAbsolutePnlUSD || "0"
  );
  const currentSegmentInitialUsd = new Decimal(
    position.currentSegmentInitialUSD || initialValueUsd.toString()
  );

  // For closed positions, use final values
  if (position.status === "CLOSED") {
    const finalValueUsd = new Decimal(position.finalValueUSD || "0");
    const realizedPnlUsd = cumulativeAbsolutePnlUsd.toNumber();
    const realizedPnlPercentage = finalValueUsd
      .div(initialValueUsd)
      .minus(1)
      .times(100)
      .toNumber();

    return {
      pnlUsd: realizedPnlUsd,
      pnlPercentage: realizedPnlPercentage,
      unrealizedPnlUsd: 0,
      unrealizedPnlPercentage: 0,
    };
  }

  // For active positions, calculate unrealized PNL
  if (!lbPosition || !priceX || !priceY) {
    throw new Error("Current position data required for active positions");
  }

  const totalXAmount = new Decimal(lbPosition.positionData.totalXAmount).div(
    new Decimal(10).pow(new Decimal(priceX.decimals))
  );
  const totalYAmount = new Decimal(lbPosition.positionData.totalYAmount).div(
    new Decimal(10).pow(new Decimal(priceY.decimals))
  );

  const tokenXUSD = totalXAmount.mul(priceX.price);
  const tokenYUSD = totalYAmount.mul(priceY.price);
  const totalUSD = tokenXUSD.add(tokenYUSD);

  const unclaimedFeesX = new Decimal(
    lbPosition.positionData.feeX.toString()
  ).div(new Decimal(10).pow(new Decimal(priceX.decimals)));
  const unclaimedFeesY = new Decimal(
    lbPosition.positionData.feeY.toString()
  ).div(new Decimal(10).pow(new Decimal(priceY.decimals)));
  const unclaimedFeesXUSD = unclaimedFeesX.mul(priceX.price);
  const unclaimedFeesYUSD = unclaimedFeesY.mul(priceY.price);
  const totalUnclaimedFeesUSD = unclaimedFeesXUSD.add(unclaimedFeesYUSD);

  const currentValueUsd = totalUSD.add(totalUnclaimedFeesUSD);

  // Calculate unrealized PNL based on rebalancing status
  let unrealizedPnlUsd: Decimal;
  let unrealizedPnlPercentage: Decimal;

  if (position.isRebalancingEnabled) {
    // With rebalancing: Calculate segment unrealized + cumulative
    const segmentUnrealizedUsd = currentValueUsd.minus(
      currentSegmentInitialUsd
    );
    unrealizedPnlUsd = cumulativeAbsolutePnlUsd.plus(segmentUnrealizedUsd);
    unrealizedPnlPercentage = unrealizedPnlUsd
      .div(initialValueUsd)
      .minus(1)
      .times(100);
  } else {
    // Without rebalancing: Simple calculation
    const positionUnrealizedUsd = currentValueUsd.minus(initialValueUsd);
    unrealizedPnlUsd = positionUnrealizedUsd.plus(cumulativeAbsolutePnlUsd);
    unrealizedPnlPercentage = currentValueUsd
      .plus(cumulativeAbsolutePnlUsd)
      .div(initialValueUsd)
      .minus(1)
      .times(100);
  }

  return {
    pnlUsd: unrealizedPnlUsd.toNumber(),
    pnlPercentage: unrealizedPnlPercentage.toNumber(),
    unrealizedPnlUsd: unrealizedPnlUsd.toNumber(),
    unrealizedPnlPercentage: unrealizedPnlPercentage.toNumber(),
  };
}
