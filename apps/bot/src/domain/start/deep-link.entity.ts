import { DomainError, ValidationError } from '../shared/errors';

export type DeepLinkType = 
  | 'legacy_position' 
  | 'legacy_pool' 
  | 'token_detail' 
  | 'pool_detail' 
  | 'position_detail' 
  | 'referral';

export type DexCode = 'meteora' | 'saros' | 'orca' | 'raydium';

export interface DeepLinkData {
  type: DeepLinkType;
  referralCode?: string;
  tokenAddress?: string;
  poolAddress?: string;
  positionAddress?: string;
  dexCode?: DexCode;
}

export class DeepLinkParseError extends DomainError {
  constructor(message: string, public readonly param: string) {
    super(message, 'DEEP_LINK_PARSE_ERROR');
    this.name = 'DeepLinkParseError';
  }
}

export class InvalidDexCodeError extends ValidationError {
  constructor(dexCode: string) {
    super(`Invalid DEX code: ${dexCode}. Supported DEX codes: meteora, saros, orca, raydium`, 'INVALID_DEX_CODE');
    this.name = 'InvalidDexCodeError';
  }
}

export class DeepLink {
  private constructor(
    public readonly type: DeepLinkType,
    public readonly referralCode?: string,
    public readonly tokenAddress?: string,
    public readonly poolAddress?: string,
    public readonly positionAddress?: string,
    public readonly dexCode?: DexCode
  ) {}

  static parse(startParam: string): DeepLink {
    if (!startParam || startParam.trim() === '') {
      throw new DeepLinkParseError('Start parameter cannot be empty', startParam);
    }

    console.log(`Parsing deep link parameter: "${startParam}"`);

    // Handle legacy formats
    if (startParam.startsWith("dlmm_position_")) {
      const positionAddress = startParam.replace(/^dlmm_position_/, "");
      return new DeepLink('legacy_position', undefined, undefined, undefined, positionAddress, 'meteora');
    }

    if (startParam.startsWith("dlmm_pool_")) {
      const poolAddress = startParam.replace(/^dlmm_pool_/, "");
      return new DeepLink('legacy_pool', undefined, undefined, poolAddress, undefined, 'meteora');
    }

    // Parse format: ref_CODE or ref_CODE-action_params or direct action_params
    const parts = startParam.split("-");

    if (parts.length === 1) {
      return DeepLink.parseSinglePart(parts[0]);
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

    return DeepLink.parseActionPart(actionPart, referralCode);
  }

  private static parseSinglePart(singlePart: string): DeepLink {
    if (singlePart.startsWith("ca_")) {
      const tokenAddress = singlePart.replace(/^ca_/, "");
      return new DeepLink('token_detail', "", tokenAddress);
    } 
    
    if (singlePart.startsWith("pool_")) {
      const poolParts = singlePart.replace(/^pool_/, "").split("_");
      if (poolParts.length >= 2) {
        const dexCode = DeepLink.validateDexCode(poolParts[0]);
        const poolAddress = poolParts.slice(1).join("_");
        return new DeepLink('pool_detail', "", undefined, poolAddress, undefined, dexCode);
      }
    } 
    
    if (singlePart.startsWith("pos_")) {
      const posParts = singlePart.replace(/^pos_/, "").split("_");
      if (posParts.length >= 2) {
        const dexCode = DeepLink.validateDexCode(posParts[0]);
        const positionAddress = posParts.slice(1).join("_");
        return new DeepLink('position_detail', "", undefined, undefined, positionAddress, dexCode);
      }
    } 
    
    if (singlePart.startsWith("ref_")) {
      const referralCode = singlePart.replace(/^ref_/, "");
      return new DeepLink('referral', referralCode);
    }

    // Default to referral
    return new DeepLink('referral', singlePart);
  }

  private static parseActionPart(actionPart: string, referralCode: string): DeepLink {
    if (actionPart.startsWith("ca_")) {
      const tokenAddress = actionPart.replace(/^ca_/, "");
      return new DeepLink('token_detail', referralCode, tokenAddress);
    } 
    
    if (actionPart.startsWith("pool_")) {
      const poolParts = actionPart.replace(/^pool_/, "").split("_");
      if (poolParts.length >= 2) {
        const dexCode = DeepLink.validateDexCode(poolParts[0]);
        const poolAddress = poolParts.slice(1).join("_");
        return new DeepLink('pool_detail', referralCode, undefined, poolAddress, undefined, dexCode);
      }
    } 
    
    if (actionPart.startsWith("pos_")) {
      const posParts = actionPart.replace(/^pos_/, "").split("_");
      if (posParts.length >= 2) {
        const dexCode = DeepLink.validateDexCode(posParts[0]);
        const positionAddress = posParts.slice(1).join("_");
        return new DeepLink('position_detail', referralCode, undefined, undefined, positionAddress, dexCode);
      }
    }

    // Default to referral
    return new DeepLink('referral', referralCode);
  }

  private static validateDexCode(dexCode: string): DexCode {
    const validDexCodes: DexCode[] = ['meteora', 'saros', 'orca', 'raydium'];
    if (!validDexCodes.includes(dexCode as DexCode)) {
      throw new InvalidDexCodeError(dexCode);
    }
    return dexCode as DexCode;
  }

  isLegacyPosition(): boolean {
    return this.type === 'legacy_position';
  }

  isLegacyPool(): boolean {
    return this.type === 'legacy_pool';
  }

  isTokenDetail(): boolean {
    return this.type === 'token_detail';
  }

  isPoolDetail(): boolean {
    return this.type === 'pool_detail';
  }

  isPositionDetail(): boolean {
    return this.type === 'position_detail';
  }

  isReferral(): boolean {
    return this.type === 'referral';
  }

  isSupportedDex(): boolean {
    if (!this.dexCode) return false;
    return this.dexCode === 'meteora' || this.dexCode === 'saros';
  }

  hasReferralCode(): boolean {
    return !!this.referralCode && this.referralCode.trim() !== '';
  }

  toData(): DeepLinkData {
    return {
      type: this.type,
      referralCode: this.referralCode,
      tokenAddress: this.tokenAddress,
      poolAddress: this.poolAddress,
      positionAddress: this.positionAddress,
      dexCode: this.dexCode
    };
  }
}