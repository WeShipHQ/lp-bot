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
import { getTokenInfoKeyboard } from "../keyboards";

export async function handleTokenInput(ctx: Context, server: FastifyInstance) {
  const messageText =
    ctx.message && "text" in ctx.message ? ctx.message.text : "";

  if (!messageText) {
    return;
  }

  const detection = inputDetectionService.detectInput(messageText);

  if (!detection) {
    return;
  }

  try {
    const loadingMessage = formatLoadingMessage(detection.type);
    const sentMessage = await ctx.reply(loadingMessage);

    let responseMessage: string;
    let type: "token" | "pool" | "unknown" = "unknown";
    let poolType: "damm_v1" | "damm_v2" | "dlmm" | undefined;

    switch (detection.type) {
      case "address":
        responseMessage = await handleTokenAddress(detection.value, server);
        type = "token";
        break;

      case "meteora_damm_v1":
      case "meteora_damm_v2":
      case "meteora_dlmm":
        responseMessage = await handleMeteoraPool(detection, server);
        type = "pool";
        // ✅ Extract and preserve the pool type
        poolType =
          inputDetectionService.getMeteoraPoolType(detection.originalInput) ||
          undefined;
        break;

      default:
        responseMessage = formatErrorMessage(
          messageText,
          `Unsupported input type: ${detection.type}`
        );
    }

    await ctx.telegram.editMessageText(
      ctx.chat?.id,
      sentMessage.message_id,
      undefined,
      responseMessage,
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: getTokenInfoKeyboard(detection.value, type, poolType)
            .inline_keyboard,
        },
      }
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
    console.error(error);
    server.log.error(`Error fetching token info for ${tokenAddress}:`, error);
    return formatErrorMessage(
      tokenAddress,
      "Failed to fetch token information"
    );
  }
}

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
