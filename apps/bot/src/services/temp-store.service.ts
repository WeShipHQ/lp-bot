// Simple in-memory store for temporary 2FA data
// In production, use Redis or database

interface Temp2FAData {
  secret: string;
  backupCodes: string[];
  timestamp: number;
}

class TempStoreService {
  private store: Map<string, Temp2FAData> = new Map();
  private readonly EXPIRY_TIME = 10 * 60 * 1000; // 10 minutes

  /**
   * Store temporary 2FA data for a user
   */
  setTemp2FAData(userId: string, secret: string, backupCodes: string[]): void {
    this.store.set(userId, {
      secret,
      backupCodes,
      timestamp: Date.now()
    });
  }

  /**
   * Get temporary 2FA data for a user
   */
  getTemp2FAData(userId: string): { secret: string; backupCodes: string[] } | null {
    const data = this.store.get(userId);
    
    if (!data) {
      return null;
    }

    // Check if data has expired
    if (Date.now() - data.timestamp > this.EXPIRY_TIME) {
      this.store.delete(userId);
      return null;
    }

    return {
      secret: data.secret,
      backupCodes: data.backupCodes
    };
  }

  /**
   * Remove temporary 2FA data for a user
   */
  removeTemp2FAData(userId: string): void {
    this.store.delete(userId);
  }

  /**
   * Clean up expired data
   */
  cleanup(): void {
    const now = Date.now();
    for (const [userId, data] of Array.from(this.store.entries())) {
      if (now - data.timestamp > this.EXPIRY_TIME) {
        this.store.delete(userId);
      }
    }
  }
}

// Export singleton instance
export const tempStoreService = new TempStoreService();

// Clean up expired data every 5 minutes
setInterval(() => {
  tempStoreService.cleanup();
}, 5 * 60 * 1000);
