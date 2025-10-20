import 'reflect-metadata';
import { Container } from 'inversify';

// Domain repositories
import { IPositionRepository } from '@/domain/position/position.repository';
import { IUserRepository } from '@/domain/user/user.repository';

// Infrastructure implementations
import { PositionRepository } from '@/infrastructure/database/repositories/position.repository';
import { UserRepository } from '@/infrastructure/database/repositories/user.repository';
import { CacheService, ICacheService } from '@/infrastructure/cache/cache.service';
import { NotificationService } from '@/infrastructure/messaging/notification.service';
import { TelegramClient, ITelegramClient } from '@/infrastructure/messaging/telegram-client';
import { JobQueueService } from '@/infrastructure/jobs/job-queue.service';

// Application use-cases
import { CreatePositionUseCase } from '@/application/position/create-position.use-case';
import { ClosePositionUseCase } from '@/application/position/close-position.use-case';
import { ClaimFeesUseCase } from '@/application/position/claim-fees.use-case';
import { GetPositionUseCase } from '@/application/position/get-position.use-case';
import { RebalancePositionUseCase } from '@/application/position/rebalance-position.use-case';

import { GetPortfolioUseCase } from '@/application/portfolio/get-portfolio.use-case';
import { SyncPortfolioUseCase } from '@/application/portfolio/sync-portfolio.use-case';
import { CalculateMetricsUseCase } from '@/application/portfolio/calculate-metrics.use-case';

import { GetBalanceUseCase } from '@/application/wallet/get-balance.use-case';
import { ConnectWalletUseCase } from '@/application/wallet/connect-wallet.use-case';
import { SendTokensUseCase } from '@/application/wallet/send-tokens.use-case';

import { GetTrendingPoolsUseCase } from '@/application/trending/get-trending-pools.use-case';
import { SearchPoolsUseCase } from '@/application/trending/search-pools.use-case';

// Adapters
import { SolanaAdapter } from '@/adapters/blockchain/solana.adapter';
import { JupiterAdapter } from '@/adapters/external-api/jupiter.adapter';
import { PrivyAdapter } from '@/adapters/external-api/privy.adapter';
import { MeteoraAdapter } from '@/adapters/dex/meteora.adapter';
import { SarosAdapter } from '@/services/saros/saros.adapter';

// Other services
import { PrivyTransactionService } from '@/services/transaction.service';
import { dexRegistry } from '@/services/dex-registry.service';

// DB
import { db } from '@/db';

// Bot types
import type { Telegraf } from 'telegraf';
import type { BotContext } from '@/types/bot.types';

/**
 * Central DI tokens for interfaces and non-class deps
 */
export const DI_TOKENS = {
  PositionRepo: Symbol('IPositionRepository'),
  UserRepo: Symbol('IUserRepository'),
  Cache: Symbol('ICacheService'),
  DexRegistry: Symbol('DexRegistry'),
  TelegramBot: Symbol('TelegramBot'),
  TelegramClient: Symbol('TelegramClient'),
  JobQueue: Symbol('JobQueueService'),
  TransactionService: Symbol('ITransactionService'),
} as const;

// Create Inversify container
const container = new Container({ defaultScope: 'Transient', skipBaseClassChecks: true });

let baseRegistered = false;

function registerBase() {
  if (baseRegistered) return;
  baseRegistered = true;

  // Repositories (singleton)
  container.bind<IPositionRepository>(DI_TOKENS.PositionRepo)
    .toDynamicValue(() => new PositionRepository(db as any))
    .inSingletonScope();

  container.bind<IUserRepository>(DI_TOKENS.UserRepo)
    .toDynamicValue(() => new UserRepository(db as any))
    .inSingletonScope();

  // Cache service (singleton)
  container.bind<ICacheService>(DI_TOKENS.Cache)
    .toDynamicValue(() => new CacheService())
    .inSingletonScope();

  // Dex registry (singleton instance)
  container.bind(DI_TOKENS.DexRegistry).toConstantValue(dexRegistry);

  // Adapters (singleton where appropriate)
  container.bind(SolanaAdapter).toDynamicValue(() => new SolanaAdapter()).inSingletonScope();
  container.bind(JupiterAdapter).toDynamicValue(() => new JupiterAdapter()).inSingletonScope();
  container.bind(PrivyAdapter).toDynamicValue(() => new PrivyAdapter()).inSingletonScope();
  container.bind(MeteoraAdapter).toDynamicValue(() => new MeteoraAdapter()).inSingletonScope();
  container.bind(SarosAdapter).toDynamicValue(() => new SarosAdapter()).inSingletonScope();

  // Transaction service (singleton)
  container.bind(DI_TOKENS.TransactionService)
    .toDynamicValue(() => new PrivyTransactionService())
    .inSingletonScope();

  // Use-cases (transient by default)
  container.bind(CreatePositionUseCase).toDynamicValue((c) =>
    new CreatePositionUseCase(
      c.container.get<IPositionRepository>(DI_TOKENS.PositionRepo),
      c.container.get<typeof dexRegistry>(DI_TOKENS.DexRegistry),
      c.container.get(DI_TOKENS.TransactionService) as any,
      c.container.get<ICacheService>(DI_TOKENS.Cache),
    )
  );

  container.bind(ClosePositionUseCase).toDynamicValue((c) =>
    new ClosePositionUseCase(
      c.container.get<IPositionRepository>(DI_TOKENS.PositionRepo),
      c.container.get<typeof dexRegistry>(DI_TOKENS.DexRegistry),
      c.container.get(DI_TOKENS.TransactionService) as any,
      c.container.get<ICacheService>(DI_TOKENS.Cache),
    )
  );

  container.bind(ClaimFeesUseCase).toDynamicValue((c) =>
    new ClaimFeesUseCase(
      c.container.get<IPositionRepository>(DI_TOKENS.PositionRepo),
      c.container.get<typeof dexRegistry>(DI_TOKENS.DexRegistry),
      c.container.get(DI_TOKENS.TransactionService) as any,
      c.container.get<ICacheService>(DI_TOKENS.Cache),
    )
  );

  container.bind(GetPositionUseCase).toDynamicValue((c) =>
    new GetPositionUseCase(
      c.container.get<IPositionRepository>(DI_TOKENS.PositionRepo),
      c.container.get<typeof dexRegistry>(DI_TOKENS.DexRegistry),
    )
  );

  container.bind(RebalancePositionUseCase).toDynamicValue((c) =>
    new RebalancePositionUseCase(
      c.container.get<IPositionRepository>(DI_TOKENS.PositionRepo),
      c.container.get<typeof dexRegistry>(DI_TOKENS.DexRegistry),
      c.container.get(DI_TOKENS.TransactionService) as any,
    )
  );

  container.bind(GetPortfolioUseCase).toDynamicValue((c) =>
    new GetPortfolioUseCase(
      c.container.get<IPositionRepository>(DI_TOKENS.PositionRepo),
      c.container.get<typeof dexRegistry>(DI_TOKENS.DexRegistry),
      c.container.get<ICacheService>(DI_TOKENS.Cache),
    )
  );

  container.bind(SyncPortfolioUseCase).toDynamicValue((c) =>
    new SyncPortfolioUseCase(
      c.container.get<IPositionRepository>(DI_TOKENS.PositionRepo),
      c.container.get<typeof dexRegistry>(DI_TOKENS.DexRegistry),
      c.container.get<ICacheService>(DI_TOKENS.Cache),
    )
  );

  container.bind(CalculateMetricsUseCase).toDynamicValue(() => new CalculateMetricsUseCase());

  container.bind(GetBalanceUseCase).toDynamicValue(() => new GetBalanceUseCase());

  container.bind(ConnectWalletUseCase).toDynamicValue((c) =>
    new ConnectWalletUseCase(c.container.get<IUserRepository>(DI_TOKENS.UserRepo))
  );

  container.bind(SendTokensUseCase).toDynamicValue((c) =>
    new SendTokensUseCase(c.container.get<IUserRepository>(DI_TOKENS.UserRepo))
  );

  container.bind(GetTrendingPoolsUseCase).toDynamicValue(() => new GetTrendingPoolsUseCase());
  container.bind(SearchPoolsUseCase).toDynamicValue(() => new SearchPoolsUseCase());
}

let runtimeRegistered = false;

/**
 * Initialize runtime-bound registrations like Telegram client, JobQueue service,
 * and register DEX adapters with the registry.
 */
export function initializeContainer(bot?: Telegraf<BotContext>) {
  registerBase();
  if (runtimeRegistered) return;

  if (bot) {
    container.bind(DI_TOKENS.TelegramBot).toConstantValue(bot);

    container.bind<ITelegramClient>(DI_TOKENS.TelegramClient)
      .toDynamicValue((c) => new TelegramClient(c.container.get(DI_TOKENS.TelegramBot) as Telegraf<BotContext>))
      .inSingletonScope();

    container.bind<JobQueueService>(DI_TOKENS.JobQueue)
      .toDynamicValue(() => new JobQueueService({ bot }))
      .inSingletonScope();

    // Notification service depends on TelegramClient and UserRepository and JobQueue
    container.bind(NotificationService)
      .toDynamicValue((c) => new NotificationService(
        c.container.get<ITelegramClient>(DI_TOKENS.TelegramClient),
        c.container.get<IUserRepository>(DI_TOKENS.UserRepo),
        c.container.get<JobQueueService>(DI_TOKENS.JobQueue),
      ))
      .inSingletonScope();
  }

  // Register DEX adapters with the dex registry based on configuration
  try {
    const reg = container.get(DI_TOKENS.DexRegistry) as typeof dexRegistry;
    const { getEnabledDexTypes } = require("@/config/dex.config");
    const enabled = getEnabledDexTypes();

    const adapters: any[] = [];
    if (enabled.includes("meteora")) adapters.push(container.get(MeteoraAdapter));
    if (enabled.includes("saros")) adapters.push(container.get(SarosAdapter));

    for (const adapter of adapters) {
      try { reg.register(adapter as any); } catch {}
    }
  } catch {}

  runtimeRegistered = true;
}

// Re-export container for convenience
export { container };
