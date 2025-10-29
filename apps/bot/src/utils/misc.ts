import { DexType } from "@/types/core.types";

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function getPoolDeeplink(
  botName: string,
  dexCode = "meteora",
  poolAddress: string
): string {
  return `https://t.me/${botName}?start=pool_${dexCode}_${poolAddress}`;
}

export function getPoolUrl(poolAddress: string, dex: DexType): string {
  if (dex === "meteora") {
    return `https://www.meteora.ag/dlmm/${poolAddress}`;
  }
  return "";
}

export function getPositionDeeplink(
  botName: string,
  dexCode = "meteora",
  positionAddress: string
): string {
  return `https://t.me/${botName}?start=pos_${dexCode}_${positionAddress}`;
}

export function parseDeepLinkParam(startParam: string) {
  console.log(`Parsing deep link parameter: "${startParam}"`);

  if (startParam.startsWith("dlmm_position_")) {
    const positionAddress = startParam.replace(/^dlmm_position_/, "");
    return {
      type: "legacy_position",
      positionAddress,
      dexCode: "meteora",
    };
  }

  if (startParam.startsWith("dlmm_pool_")) {
    const poolAddress = startParam.replace(/^dlmm_pool_/, "");
    return {
      type: "legacy_pool",
      poolAddress,
      dexCode: "meteora",
    };
  }

  // Parse format: ref_CODE or ref_CODE-action_params or direct action_params
  const parts = startParam.split("-");

  if (parts.length === 1) {
    const singlePart = parts[0];

    if (singlePart.startsWith("ca_")) {
      const tokenAddress = singlePart.replace(/^ca_/, "");
      return {
        type: "token_detail",
        referralCode: "", // No referral code
        tokenAddress,
      };
    } else if (singlePart.startsWith("pool_")) {
      // Direct pool detail: pool_<dex_code>_<pool_address>
      const poolParts = singlePart.replace(/^pool_/, "").split("_");
      if (poolParts.length >= 2) {
        const dexCode = poolParts[0];
        const poolAddress = poolParts.slice(1).join("_");
        return {
          type: "pool_detail",
          referralCode: "", // No referral code
          dexCode,
          poolAddress,
        };
      }
    } else if (singlePart.startsWith("pos_")) {
      // Direct position detail: pos_<dex_code>_<position_address>
      const posParts = singlePart.replace(/^pos_/, "").split("_");
      if (posParts.length >= 2) {
        const dexCode = posParts[0];
        const positionAddress = posParts.slice(1).join("_");
        return {
          type: "position_detail",
          referralCode: "", // No referral code
          dexCode,
          positionAddress,
        };
      }
    } else if (singlePart.startsWith("ref_")) {
      const referralCode = singlePart.replace(/^ref_/, "");
      return {
        type: "referral",
        referralCode,
      };
    }

    return {
      type: "referral",
      referralCode: singlePart,
    };
  }

  // ref_CODE-action_params
  const referralPart = parts[0];
  const actionPart = parts[1];

  let referralCode = "";
  if (referralPart.startsWith("ref_")) {
    referralCode = referralPart.replace(/^ref_/, "");
  } else {
    referralCode = referralPart;
  }

  if (actionPart.startsWith("ca_")) {
    // Token detail: ca_<token_address>
    const tokenAddress = actionPart.replace(/^ca_/, "");
    return {
      type: "token_detail",
      referralCode,
      tokenAddress,
    };
  } else if (actionPart.startsWith("pool_")) {
    // Pool detail: pool_<dex_code>_<pool_address>
    const poolParts = actionPart.replace(/^pool_/, "").split("_");
    if (poolParts.length >= 2) {
      const dexCode = poolParts[0];
      const poolAddress = poolParts.slice(1).join("_"); // In case pool address contains underscores
      return {
        type: "pool_detail",
        referralCode,
        dexCode,
        poolAddress,
      };
    }
  } else if (actionPart.startsWith("pos_")) {
    // Position detail: pos_<dex_code>_<position_address>
    const posParts = actionPart.replace(/^pos_/, "").split("_");
    if (posParts.length >= 2) {
      const dexCode = posParts[0];
      const positionAddress = posParts.slice(1).join("_"); // In case position address contains underscores
      return {
        type: "position_detail",
        referralCode,
        dexCode,
        positionAddress,
      };
    }
  }

  return {
    type: "referral",
    referralCode: startParam,
  };
}

export function link(text: string, url: string): string {
  return `[${text}](${url})`;
}

export function loading(text: string): string {
  return `⏳ ${italic(text)}`;
}

export function italic(text: string | number): string {
  const str = typeof text === "number" ? text.toString() : text;
  return `_${str}_`;
}

export function bold(text: string | number): string {
  const str = typeof text === "number" ? text.toString() : text;
  return `*${str}*`;
}

export function divider(char: string = "─", length: number = 30): string {
  return char.repeat(length);
}
