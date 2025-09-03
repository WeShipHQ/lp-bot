import { db } from "@/db";
import { users, referrals, points } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { nanoid } from "nanoid";

export interface ReferralStats {
  totalReferrals: number;
  totalFeesEarned: number;
  totalPointsEarned: number;
}

export interface ReferralInfo {
  referralCode: string;
  referralLink: string;
  stats: ReferralStats;
}

export class ReferralService {

  private generateReferralCode(): string {
    return nanoid(8).toUpperCase();
  }


  async getOrCreateReferralCode(telegramId: string): Promise<string> {
    const user = await db.query.users.findFirst({
      where: eq(users.telegramId, telegramId),
      columns: { referralCode: true },
    });

    if (user?.referralCode) {
      return user.referralCode;
    }

    let referralCode = "";
    let isUnique = false;

    while (!isUnique) {
      referralCode = this.generateReferralCode();
      const existingUser = await db.query.users.findFirst({
        where: eq(users.referralCode, referralCode),
      });

      if (!existingUser) {
        isUnique = true;
      }
    }

    await db
      .update(users)
      .set({ referralCode })
      .where(eq(users.telegramId, telegramId));

    return referralCode;
  }

  
  async processReferral(
    referralCode: string,
    newUserTelegramId: string
  ): Promise<boolean> {
    try {
      console.log(
        `Processing referral: code=${referralCode}, newUser=${newUserTelegramId}`
      );

      const referrer = await db.query.users.findFirst({
        where: eq(users.referralCode, referralCode),
      });

      if (!referrer) {
        console.log(`Referrer not found for code: ${referralCode}`);
        return false;
      }

      console.log(
        `Found referrer: ${referrer.telegramId} (${referrer.username})`
      );

      const existingReferral = await db.query.referrals.findFirst({
        where: eq(referrals.referredId, newUserTelegramId),
      });

      if (existingReferral) {
        console.log(`User ${newUserTelegramId} already referred`);
        return false;
      }

      const [newReferral] = await db
        .insert(referrals)
        .values({
          referrerId: referrer.telegramId, 
          referredId: newUserTelegramId,
          referralCode,
          status: "ACTIVE",
        })
        .returning();

      console.log(`Created referral record: ${newReferral.id}`);

      await db
        .update(users)
        .set({ referredBy: referralCode })
        .where(eq(users.telegramId, newUserTelegramId));

      console.log(`Updated new user's referredBy field`);

      await db.insert(points).values({
        userId: referrer.telegramId, 
        amount: 100,
        type: "REFERRAL_BONUS",
        description: `Referral bonus for user ${newUserTelegramId}`,
        referralId: newReferral.id,
      });

      console.log(`Awarded 100 points to referrer ${referrer.telegramId}`);

      await db.insert(points).values({
        userId: newUserTelegramId,
        amount: 50,
        type: "ACTIVITY_REWARD",
        description: "Welcome bonus for using referral code",
        referralId: newReferral.id,
      });

      console.log(`Awarded 50 points to new user ${newUserTelegramId}`);

      console.log(`Referral processed successfully!`);
      return true;
    } catch (error) {
      console.error("Error processing referral:", error);
      return false;
    }
  }

  async getReferralStats(telegramId: string): Promise<ReferralStats> {
    try {
      const result = await db
        .select({
          totalReferrals: sql<number>`count(*)::int`,
          totalFeesEarned: sql<number>`coalesce(sum(${referrals.feesEarned})::numeric, 0)`,
          totalPointsEarned: sql<number>`coalesce(sum(${referrals.pointsEarned})::int, 0)`,
        })
        .from(referrals)
        .where(eq(referrals.referrerId, telegramId));

      return {
        totalReferrals: result[0]?.totalReferrals || 0,
        totalFeesEarned: Number(result[0]?.totalFeesEarned) || 0,
        totalPointsEarned: result[0]?.totalPointsEarned || 0,
      };
    } catch (error) {
      console.error("Error getting referral stats:", error);
      return {
        totalReferrals: 0,
        totalFeesEarned: 0,
        totalPointsEarned: 0,
      };
    }
  }


  async getUserPoints(telegramId: string): Promise<number> {
    try {
      const result = await db
        .select({
          totalPoints: sql<number>`coalesce(sum(${points.amount})::int, 0)`,
        })
        .from(points)
        .where(eq(points.userId, telegramId));

      return result[0]?.totalPoints || 0;
    } catch (error) {
      console.error("Error getting user points:", error);
      return 0;
    }
  }

 
  async getReferralInfo(telegramId: string): Promise<ReferralInfo | null> {
    try {
      const referralCode = await this.getOrCreateReferralCode(telegramId);
      const stats = await this.getReferralStats(telegramId);
      const totalPoints = await this.getUserPoints(telegramId);

      const botUsername = process.env.BOT_USERNAME || "your_bot_username";

      return {
        referralCode,
        referralLink: `https://t.me/${botUsername}?start=${referralCode}`,
        stats: {
          ...stats,
          totalPointsEarned: totalPoints,
        },
      };
    } catch (error) {
      console.error("Error getting referral info:", error);
      return null;
    }
  }


  async awardPoints(
    telegramId: string,
    amount: number,
    type: "REFERRAL_BONUS" | "FEE_EARNING" | "ACTIVITY_REWARD",
    description?: string,
    referralId?: string
  ): Promise<boolean> {
    try {
      await db.insert(points).values({
        userId: telegramId,
        amount,
        type,
        description,
        referralId,
      });
      return true;
    } catch (error) {
      console.error("Error awarding points:", error);
      return false;
    }
  }

  
  async getReferralHistory(telegramId: string) {
    try {
      const userReferrals = await db.query.referrals.findMany({
        where: eq(referrals.referrerId, telegramId),
        with: {
          referred: {
            columns: {
              username: true,
              telegramId: true,
              createdAt: true,
            },
          },
        },
        orderBy: (referrals, { desc }) => [desc(referrals.createdAt)],
      });

      return userReferrals;
    } catch (error) {
      console.error("Error getting referral history:", error);
      return [];
    }
  }

  async getReferralSummary(telegramId: string) {
    try {
      const [referralStats, totalPoints] = await Promise.all([
        this.getReferralStats(telegramId),
        this.getUserPoints(telegramId),
      ]);

      return {
        ...referralStats,
        totalPointsEarned: totalPoints,
        estimatedValue: (totalPoints * 0.01).toFixed(2), 
      };
    } catch (error) {
      console.error("Error getting referral summary:", error);
      return {
        totalReferrals: 0,
        totalFeesEarned: 0,
        totalPointsEarned: 0,
        estimatedValue: "0.00",
      };
    }
  }
}

export const referralService = new ReferralService();
