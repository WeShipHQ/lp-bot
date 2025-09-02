import * as speakeasy from 'speakeasy';
import * as QRCode from 'qrcode';

export interface TwoFactorSetup {
  secret: string;
  qrCodeUrl: string;
  backupCodes: string[];
}

export interface TwoFactorVerification {
  isValid: boolean;
  remainingAttempts?: number;
}

export class TwoFactorAuthService {
  private readonly issuer = 'WeShip LP Bot';
  private readonly algorithm = 'sha1';
  private readonly digits = 6;
  private readonly period = 30;

  /**
   * Generate a new 2FA secret and QR code for setup
   * @param userId - User ID to associate with the secret
   * @returns TwoFactorSetup object with secret, QR code, and backup codes
   */
  async generateSecret(userId: string): Promise<TwoFactorSetup> {
    try {
      // Generate a new secret
      const secret = speakeasy.generateSecret({
        name: `WeShip User ${userId}`,
        issuer: this.issuer,
        length: 32
      });

      // Generate QR code URL
      const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url!);

      // Generate backup codes (8 codes of 8 characters each)
      const backupCodes = this.generateBackupCodes(8);

      return {
        secret: secret.base32!,
        qrCodeUrl,
        backupCodes
      };
    } catch (error) {
      console.error('Error generating 2FA secret:', error);
      throw new Error('Failed to generate 2FA secret');
    }
  }

  /**
   * Verify a TOTP token against a secret
   * @param secret - The user's 2FA secret
   * @param token - The token to verify
   * @param window - Time window for verification (default: 1)
   * @returns TwoFactorVerification result
   */
  verifyToken(secret: string, token: string, window: number = 1): TwoFactorVerification {
    try {
      const verified = speakeasy.totp.verify({
        secret,
        encoding: 'base32',
        token,
        window,
        algorithm: this.algorithm,
        digits: this.digits,
        step: this.period
      });

      return {
        isValid: verified
      };
    } catch (error) {
      console.error('Error verifying 2FA token:', error);
      return {
        isValid: false
      };
    }
  }

  /**
   * Generate backup codes for account recovery
   * @param count - Number of backup codes to generate
   * @returns Array of backup codes
   */
  private generateBackupCodes(count: number): string[] {
    const codes: string[] = [];
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    
    for (let i = 0; i < count; i++) {
      let code = '';
      for (let j = 0; j < 8; j++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      codes.push(code);
    }
    
    return codes;
  }

  /**
   * Verify a backup code
   * @param backupCode - The backup code to verify
   * @param userBackupCodes - User's stored backup codes
   * @returns boolean indicating if the backup code is valid
   */
  verifyBackupCode(backupCode: string, userBackupCodes: string[]): boolean {
    const index = userBackupCodes.indexOf(backupCode.toUpperCase());
    if (index !== -1) {
      // Remove used backup code
      userBackupCodes.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Generate a new set of backup codes
   * @param count - Number of backup codes to generate
   * @returns Array of new backup codes
   */
  generateNewBackupCodes(count: number = 8): string[] {
    return this.generateBackupCodes(count);
  }

  /**
   * Get the current TOTP token for a secret (for testing purposes)
   * @param secret - The user's 2FA secret
   * @returns Current TOTP token
   */
  getCurrentToken(secret: string): string {
    return speakeasy.totp({
      secret,
      encoding: 'base32',
      algorithm: this.algorithm,
      digits: this.digits,
      step: this.period
    });
  }

  /**
   * Validate secret format
   * @param secret - The secret to validate
   * @returns boolean indicating if the secret is valid
   */
  isValidSecret(secret: string): boolean {
    try {
      // Test if the secret can generate a token
      speakeasy.totp({
        secret,
        encoding: 'base32',
        algorithm: this.algorithm,
        digits: this.digits,
        step: this.period
      });
      return true;
    } catch {
      return false;
    }
  }
}

// Export singleton instance
export const twoFactorAuthService = new TwoFactorAuthService();
