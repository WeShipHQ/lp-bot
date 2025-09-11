import { asc, eq, sum } from "drizzle-orm";
import { db } from ".";
import {
  NewPosition,
  NewUser,
  NewWallet,
  NewTransaction,
  NewRebalanceEvent,
  positions,
  User,
  users,
  wallets,
  Wallet,
  transactions,
  Transaction,
  rebalanceEvents,
  RebalanceEvent,
  claimHistory,
  NewClaimHistory,
  positionSnapshots,
  NewPositionSnapshot,
} from "./schema";

// users -----
export async function createUser(newUser: NewUser) {
  const [user] = await db.insert(users).values(newUser).returning();
  return user;
}

export async function findUserByTelegramId(
  telegramId: string
): Promise<User | undefined> {
  try {
    return await db.query.users.findFirst({
      where: eq(users.telegramId, telegramId),
    });
  } catch (error) {
    throw error;
  }
}

export async function findUserById(id: string): Promise<User | undefined> {
  try {
    return await db.query.users.findFirst({
      where: eq(users.id, id),
    });
  } catch (error) {
    throw error;
  }
}

export async function updateUser(id: string, updates: Partial<NewUser>) {
  const [user] = await db
    .update(users)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(users.id, id))
    .returning();
  return user;
}

export async function deleteUser(id: string) {
  await db.delete(users).where(eq(users.id, id));
}

// wallets -----
export async function createWallet(newWallet: NewWallet) {
  const [wallet] = await db.insert(wallets).values(newWallet).returning();
  return wallet;
}

export async function findWalletsByUserId(userId: string): Promise<Wallet[]> {
  try {
    return await db.query.wallets.findMany({
      where: eq(wallets.userId, userId),
      orderBy: asc(wallets.createdAt),
    });
  } catch (error) {
    throw error;
  }
}

export async function findWalletById(id: string): Promise<Wallet | undefined> {
  try {
    return await db.query.wallets.findFirst({
      where: eq(wallets.id, id),
    });
  } catch (error) {
    throw error;
  }
}

export async function findWalletByAddress(
  address: string
): Promise<Wallet | undefined> {
  try {
    return await db.query.wallets.findFirst({
      where: eq(wallets.address, address),
    });
  } catch (error) {
    throw error;
  }
}

export async function findActiveWalletByUserId(
  userId: string
): Promise<Wallet | undefined> {
  try {
    return await db.query.wallets.findFirst({
      where: eq(wallets.userId, userId) && eq(wallets.isActive, true),
    });
  } catch (error) {
    throw error;
  }
}

export async function updateWallet(id: string, updates: Partial<NewWallet>) {
  const [wallet] = await db
    .update(wallets)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(wallets.id, id))
    .returning();
  return wallet;
}

export async function deleteWallet(id: string) {
  await db.delete(wallets).where(eq(wallets.id, id));
}

// positions -----
export async function createPosition(newPosition: NewPosition) {
  const [position] = await db.insert(positions).values(newPosition).returning();
  return position;
}

export async function getPositionsByUserId(userId: string) {
  try {
    return await db.query.positions.findMany({
      where: eq(positions.userId, userId),
      orderBy: asc(positions.createdAt),
    });
  } catch (error) {
    throw error;
  }
}

export async function getPositionsById(id: string) {
  try {
    return await db.query.positions.findFirst({
      where: eq(positions.id, id),
    });
  } catch (error) {
    throw error;
  }
}

export async function getPositionsByAddress(address: string) {
  try {
    return await db.query.positions.findFirst({
      where: eq(positions.positionAddress, address),
    });
  } catch (error) {
    throw error;
  }
}

export async function updatePosition(
  id: string,
  updates: Partial<NewPosition>
) {
  const [position] = await db
    .update(positions)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(positions.id, id))
    .returning();
  return position;
}

export async function deletePosition(id: string) {
  await db.delete(positions).where(eq(positions.id, id));
}

// claimHistory -----
export async function createClaimHistory(newClaimHistory: NewClaimHistory) {
  const [createdClaimHistory] = await db
    .insert(claimHistory)
    .values(newClaimHistory)
    .returning();
  return createdClaimHistory;
}

export async function getTotalClaimedFees(positionId: string) {
  const totalClaimedFees = await db
    .select({ total: sum(claimHistory.claimedUSD) })
    .from(claimHistory)
    .where(eq(claimHistory.positionId, positionId));

  console.log("totalClaimedFees", totalClaimedFees);

  return totalClaimedFees[0].total || "0";
}

// snapshot -----
export async function createPositionSnapshot(
  newPositionSnapshot: NewPositionSnapshot
) {
  const [createdPositionSnapshot] = await db
    .insert(positionSnapshots)
    .values(newPositionSnapshot)
    .returning();
  return createdPositionSnapshot;
}

// transactions -----
export async function createTransaction(newTransaction: NewTransaction) {
  const [transaction] = await db
    .insert(transactions)
    .values(newTransaction)
    .returning();
  return transaction;
}

export async function findTransactionsByPositionId(
  positionId: string
): Promise<Transaction[]> {
  try {
    return await db.query.transactions.findMany({
      where: eq(transactions.positionId, positionId),
      orderBy: asc(transactions.createdAt),
    });
  } catch (error) {
    throw error;
  }
}

export async function findTransactionById(
  id: string
): Promise<Transaction | undefined> {
  try {
    return await db.query.transactions.findFirst({
      where: eq(transactions.id, id),
    });
  } catch (error) {
    throw error;
  }
}

export async function findTransactionByTxHash(
  txHash: string
): Promise<Transaction | undefined> {
  try {
    return await db.query.transactions.findFirst({
      where: eq(transactions.txHash, txHash),
    });
  } catch (error) {
    throw error;
  }
}

export async function updateTransaction(
  id: string,
  updates: Partial<NewTransaction>
) {
  const [transaction] = await db
    .update(transactions)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(transactions.id, id))
    .returning();
  return transaction;
}

export async function deleteTransaction(id: string) {
  await db.delete(transactions).where(eq(transactions.id, id));
}

// rebalanceEvents -----
export async function createRebalanceEvent(
  newRebalanceEvent: NewRebalanceEvent
) {
  const [rebalanceEvent] = await db
    .insert(rebalanceEvents)
    .values(newRebalanceEvent)
    .returning();
  return rebalanceEvent;
}

export async function findRebalanceEventsByPositionId(
  positionId: string
): Promise<RebalanceEvent[]> {
  try {
    return await db.query.rebalanceEvents.findMany({
      where: eq(rebalanceEvents.positionId, positionId),
      orderBy: asc(rebalanceEvents.createdAt),
    });
  } catch (error) {
    throw error;
  }
}

export async function findRebalanceEventById(
  id: string
): Promise<RebalanceEvent | undefined> {
  try {
    return await db.query.rebalanceEvents.findFirst({
      where: eq(rebalanceEvents.id, id),
    });
  } catch (error) {
    throw error;
  }
}

export async function deleteRebalanceEvent(id: string) {
  await db.delete(rebalanceEvents).where(eq(rebalanceEvents.id, id));
}
