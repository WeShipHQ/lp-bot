// import { db } from "@/db";
// import { users, referrals, points } from "@/db/schema";
// import { eq, sql } from "drizzle-orm";
// import { referralService } from "./referral.service";

// export class FeeEarningService {
//   async distributeReferralFees(
//     userId: string,
//     feeAmount: number,
//     description?: string
//   ): Promise<boolean> {
//     try {
//       const user = await db.query.users.findFirst({
//         where: eq(users.id, userId),
//         columns: { referredBy: true },
//       });

//       if (!user?.referredBy) {
//         return false;
//       }

//       const referral = await db.query.referrals.findFirst({
//         where: eq(referrals.referredId, userId),
//       });

//       if (!referral) {
//         return false;
//       }

//       const referralFee = feeAmount * 0.1;
//       const referralPoints = Math.floor(referralFee * 100); 
//       await db
//         .update(referrals)
//         .set({
//           feesEarned: sql`${referrals.feesEarned} + ${referralFee}`,
//           pointsEarned: sql`${referrals.pointsEarned} + ${referralPoints}`,
//           updatedAt: new Date(),
//         })
//         .where(eq(referrals.id, referral.id));

//       await referralService.awardPoints(
//         referral.referrerId,
//         referralPoints,
//         "FEE_EARNING",
//         `Referral fee earning: ${description || "Fee collection"}`,
//         referral.id
//       );

//       return true;
//     } catch (error) {
//       console.error("Error distributing referral fees:", error);
//       return false;
//     }
//   }


//   async getUserReferralFees(userId: string): Promise<number> {
//     try {
//       const result = await db
//         .select({
//           totalFees: sql<number>`coalesce(sum(${referrals.feesEarned})::numeric, 0)`,
//         })
//         .from(referrals)
//         .where(eq(referrals.referrerId, userId));

//       return Number(result[0]?.totalFees) || 0;
//     } catch (error) {
//       console.error("Error getting user referral fees:", error);
//       return 0;
//     }
//   }

//   async getReferralEarningsSummary(userId: string) {
//     try {
//       const result = await db
//         .select({
//           totalReferrals: sql<number>`count(*)::int`,
//           totalFeesEarned: sql<number>`coalesce(sum(${referrals.feesEarned})::numeric, 0)`,
//           totalPointsEarned: sql<number>`coalesce(sum(${referrals.pointsEarned})::int, 0)`,
//         })
//         .from(referrals)
//         .where(eq(referrals.referrerId, userId));

//       return {
//         totalReferrals: result[0]?.totalReferrals || 0,
//         totalFeesEarned: Number(result[0]?.totalFeesEarned) || 0,
//         totalPointsEarned: result[0]?.totalPointsEarned || 0,
//       };
//     } catch (error) {
//       console.error("Error getting referral earnings summary:", error);
//       return {
//         totalReferrals: 0,
//         totalFeesEarned: 0,
//         totalPointsEarned: 0,
//       };
//     }
//   }
// }

// export const feeEarningService = new FeeEarningService();
