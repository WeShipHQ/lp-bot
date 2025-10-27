export const CacheKeys = {
  portfolioKey: (userId: string) => `portfolio:${userId}`,
  positionKey: (positionId: string) => `position:${positionId}`,
  poolKey: (dex: string, poolId: string) => `pool:${dex}:${poolId}`,
  trendingPoolsKey: (dex: string, sortBy: string, page: number) => `trending:${dex}:${sortBy}:${page}`,
  tokenPriceKey: (address: string) => `price:${address}`,
  walletBalanceKey: (address: string) => `wallet:${address}:balance`,
  tokenBalanceKey: (wallet: string, mint: string) => `wallet:${wallet}:token:${mint}:balance`,
  userById: (userId: string) => `user:${userId}`,
  userByTelegramId: (telegramId: string) => `user:telegram:${telegramId}`,
  userByWalletAddress: (address: string) => `user:wallet:${address}`,
  userByWalletId: (walletId: string) => `user:wallet-id:${walletId}`,
};

export const CachePatterns = {
  portfolioPattern: (userId: string) => `portfolio:${userId}*`,
  positionPattern: (positionId: string) => `position:${positionId}*`,
  trendingPattern: (dex: string) => `trending:${dex}:*`,
  userPattern: () => "user:*",
};
