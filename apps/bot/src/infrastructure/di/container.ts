import 'reflect-metadata';
import { container, Lifecycle } from 'tsyringe';

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

let baseRegistered = false;

function registerBase() {
  if (baseRegistered) return;
  baseRegistered = true;

  // Repositories (singleton)
  container.register<IPositionRepository>(DI_TOKENS.PositionRepo, {
    useFactory: () => new PositionRepository(db as any),
  });
  container.register<IUserRepository>(DI_TOKENS.UserRepo, {
    useFactory: () => new UserRepository(db as any),
  });

  // Cache service (singleton)
  container.register<ICacheService>(DI_TOKENS.Cache, { useClass: CacheService });

  // Dex registry (singleton instance)
  container.registerInstance(DI_TOKENS.DexRegistry, dexRegistry);

  // Adapters (singleton where appropriate)
  container.register(SolanaAdapter, { useClass: SolanaAdapter }, { lifecycle: Lifecycle.Singleton });
  container.register(JupiterAdapter, { useClass: JupiterAdapter }, { lifecycle: Lifecycle.Singleton });
  container.register(PrivyAdapter, { useClass: PrivyAdapter }, { lifecycle: Lifecycle.Singleton });
  container.register(MeteoraAdapter, { useClass: MeteoraAdapter }, { lifecycle: Lifecycle.Singleton });
  container.register(SarosAdapter, { useClass: SarosAdapter }, { lifecycle: Lifecycle.Singleton });

  // Transaction service (singleton)
  container.register(DI_TOKENS.TransactionService, { useClass: PrivyTransactionService });

  // Use-cases (transient)
  container.register(CreatePositionUseCase, {
    useFactory: (c) => new CreatePositionUseCase(
      c.resolve<IPositionRepository>(DI_TOKENS.PositionRepo),
      c.resolve(DI_TOKENS.DexRegistry) as any,
      c.resolve(PrivyTransactionService),
      c.resolve<ICacheService>(DI_TOKENS.Cache),
    ),
  }, { lifecycle: Lifecycle.Transient });

  container.register(ClosePositionUseCase, {
    useFactory: (c) => new ClosePositionUseCase(
      c.resolve<IPositionRepository>(DI_TOKENS.PositionRepo),
      c.resolve(DI_TOKENS.DexRegistry) as any,
      c.resolve(PrivyTransactionService),
    ),
  }, { lifecycle: Lifecycle.Transient });

  container.register(ClaimFeesUseCase, {
    useFactory: (c) => new ClaimFeesUseCase(
      c.resolve<IPositionRepository>(DI_TOKENS.PositionRepo),
      c.resolve(DI_TOKENS.DexRegistry) as any,
      c.resolve(PrivyTransactionService),
    ),
  }, { lifecycle: Lifecycle.Transient });

  container.register(GetPositionUseCase, {
    useFactory: (c) => new GetPositionUseCase(
      c.resolve<IPositionRepository>(DI_TOKENS.PositionRepo),
      c.resolve(DI_TOKENS.DexRegistry) as any,
    ),
  }, { lifecycle: Lifecycle.Transient });

  container.register(RebalancePositionUseCase, {
    useFactory: (c) => new RebalancePositionUseCase(
      c.resolve<IPositionRepository>(DI_TOKENS.PositionRepo),
      c.resolve(DI_TOKENS.DexRegistry) as any,
      c.resolve(PrivyTransactionService),
    ),
  }, { lifecycle: Lifecycle.Transient });

  container.register(GetPortfolioUseCase, {
    useFactory: (c) => new GetPortfolioUseCase(
      c.resolve<IPositionRepository>(DI_TOKENS.PositionRepo),
      c.resolve(DI_TOKENS.DexRegistry) as any,
      c.resolve<ICacheService>(DI_TOKENS.Cache),
    ),
  }, { lifecycle: Lifecycle.Transient });

  container.register(SyncPortfolioUseCase, { useClass: SyncPortfolioUseCase }, { lifecycle: Lifecycle.Transient });
  container.register(CalculateMetricsUseCase, { useClass: CalculateMetricsUseCase }, { lifecycle: Lifecycle.Transient });

  container.register(GetBalanceUseCase, { useClass: GetBalanceUseCase }, { lifecycle: Lifecycle.Transient });
  container.register(ConnectWalletUseCase, { useClass: ConnectWalletUseCase }, { lifecycle: Lifecycle.Transient });
  container.register(SendTokensUseCase, { useClass: SendTokensUseCase }, { lifecycle: Lifecycle.Transient });

  container.register(GetTrendingPoolsUseCase, { useClass: GetTrendingPoolsUseCase }, { lifecycle: Lifecycle.Transient });
  container.register(SearchPoolsUseCase, { useClass: SearchPoolsUseCase }, { lifecycle: Lifecycle.Transient });
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
    container.registerInstance(DI_TOKENS.TelegramBot, bot);
    container.register<ITelegramClient>(DI_TOKENS.TelegramClient, {
      useFactory: (c) => new TelegramClient(c.resolve(DI_TOKENS.TelegramBot) as Telegraf<BotContext>),
    });

    container.register<JobQueueService>(DI_TOKENS.JobQueue, {
      useFactory: () => new JobQueueService({ bot }),
    }, { lifecycle: Lifecycle.Singleton });

    // Notification service depends on TelegramClient and UserRepository and JobQueue
    container.register(NotificationService, {
      useFactory: (c) => new NotificationService(
        c.resolve<ITelegramClient>(DI_TOKENS.TelegramClient),
        c.resolve<IUserRepository>(DI_TOKENS.UserRepo),
        c.resolve<JobQueueService>(DI_TOKENS.JobQueue),
      ),
    }, { lifecycle: Lifecycle.Singleton });
  }

  // Register DEX adapters with the dex registry
  try {
    const meteora = container.resolve(MeteoraAdapter);
    const saros = container.resolve(SarosAdapter);
    const reg = container.resolve(DI_TOKENS.DexRegistry) as typeof dexRegistry;

    // Avoid duplicate registration in hot reload/dev
    for (const adapter of [meteora, saros]) {
      try { reg.register(adapter as any); } catch {}
    }
  } catch {}

  runtimeRegistered = true;
}

// Re-export container for convenience
export { container };
