import { Context } from "telegraf";
import { FastifyInstance } from "fastify";
import { inputDetectionService } from "../../services/input-detection.service";
import { jupiterService } from "../../services/jupiter.service";
import { meteoraService } from "../../services/meteora.service";
import {
  formatTokenDisplayData,
  formatErrorMessage,
  formatLoadingMessage,
  formatPoolInfo,
} from "../utils/formatters";
import { TokenDisplayData } from "../../types/token.types";

/**
 * Handle token address or Meteora pool URL inputs
 * @param ctx - Telegram context
 * @param server - Fastify server instance
 */
export async function handleTokenInput(ctx: Context, server: FastifyInstance) {
  const messageText =
    ctx.message && "text" in ctx.message ? ctx.message.text : "";

  if (!messageText) {
    return;
  }

  const detection = inputDetectionService.detectInput(messageText);

  console.log("detection", detection);

  if (!detection) {
    return;
  }

  try {
    const loadingMessage = formatLoadingMessage(detection.type);
    const sentMessage = await ctx.reply(loadingMessage);

    await new Promise((resolve) => setTimeout(resolve, 2000));

    let responseMessage: string;

    switch (detection.type) {
      case "address":
        responseMessage = await handleTokenAddress(detection.value, server);
        break;

      case "meteora_damm_v1":
      case "meteora_damm_v2":
      case "meteora_dlmm":
        responseMessage = await handleMeteoraPool(detection, server);
        break;

      default:
        responseMessage = formatErrorMessage(
          messageText,
          `Unsupported input type: ${detection.type}`
        );
    }

    // Edit the loading message with the result
    await ctx.telegram.editMessageText(
      ctx.chat?.id,
      sentMessage.message_id,
      undefined,
      responseMessage,
      { parse_mode: "Markdown" }
    );
  } catch (error) {
    server.log.error("Error handling token input:", error);

    const errorMessage = formatErrorMessage(
      messageText,
      "Failed to fetch token/pool information. Please try again later."
    );

    await ctx.reply(errorMessage, { parse_mode: "Markdown" });
  }
}

/**
 * Handle token address input
 * @param tokenAddress - Solana token address
 * @param server - Fastify server instance
 * @returns Formatted token information message
 */
async function handleTokenAddress(
  tokenAddress: string,
  server: FastifyInstance
): Promise<string> {
  try {
    server.log.info(`Fetching token info for address: ${tokenAddress}`);

    const tokenInfo = await jupiterService.getTokenInfo(tokenAddress);

    if (!tokenInfo) {
      return formatErrorMessage(
        tokenAddress,
        "Token not found or invalid address"
      );
    }

    const displayData: TokenDisplayData = {
      token: tokenInfo,
    };

    return formatTokenDisplayData(displayData);
  } catch (error) {
    server.log.error(`Error fetching token info for ${tokenAddress}:`, error);
    return formatErrorMessage(
      tokenAddress,
      "Failed to fetch token information"
    );
  }
}

/**
 * Handle Meteora pool URL input
 * @param detection - Input detection result
 * @param server - Fastify server instance
 * @returns Formatted pool information message
 */
async function handleMeteoraPool(
  detection: any,
  server: FastifyInstance
): Promise<string> {
  try {
    server.log.info(
      `Fetching pool info for ${detection.type}: ${detection.value}`
    );

    const poolType = inputDetectionService.getMeteoraPoolType(
      detection.originalInput
    );

    if (!poolType) {
      return formatErrorMessage(
        detection.originalInput,
        "Invalid Meteora pool URL"
      );
    }

    const poolData = await meteoraService.getPoolInfo(
      detection.value,
      poolType
    );

    if (!poolData) {
      return formatErrorMessage(
        detection.originalInput,
        "Pool not found or invalid pool ID"
      );
    }

    return formatPoolInfo(poolData);
  } catch (error) {
    console.error(error);
    server.log.error(`Error fetching pool info for ${detection.value}:`, error);
    return formatErrorMessage(
      detection.originalInput,
      "Failed to fetch pool information"
    );
  }
}
