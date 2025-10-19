# Developer Onboarding Guide

Welcome to the Meteora Liquidity Bot codebase. This document provides a quick overview of the architecture, how to work with use cases and adapters, and how to run/test locally.

## Architecture Overview

The bot follows a Clean Architecture style with the following layers:

- presentation: Telegram commands, scenes, keyboards, and handlers (framework-dependent)
- application: Use cases coordinating domain and infrastructure (pure business logic)
- domain: Entities, value objects, and repository interfaces (framework-agnostic)
- infrastructure: Implementations for databases, caching, messaging, job queues, and external adapters
- adapters: Integrations for DEXes/blockchain/external APIs (Meteora, Saros, Solana, Jupiter, Privy)
- shared: Cross-cutting constants/types/errors

A dependency inversion rule applies: presentation -> application -> domain, and both application/domain depend on abstractions, not concrete implementations.

## Dependency Injection

We use tsyringe for DI. The container is defined at src/infrastructure/di/container.ts and initialized in the Telegraf plugin. reflect-metadata is imported in the app entrypoint.

Key registrations:
- Repositories: IPositionRepository, IUserRepository (singleton)
- Services: CacheService, NotificationService, JobQueueService, TelegramClient (singleton)
- Adapters: SolanaAdapter, JupiterAdapter, PrivyAdapter, MeteoraAdapter, SarosAdapter (singleton)
- Use cases: Position/Portfolio/Wallet/Trending (transient)

Resolve dependencies in presentation code:

```ts
import { container } from 'tsyringe';
import { GetPortfolioUseCase } from '@/application/portfolio/get-portfolio.use-case';

const uc = container.resolve(GetPortfolioUseCase);
const portfolio = await uc.execute(ctx.user.id);
```

## Adding a New Use Case

1. Create a file under src/application/<feature>/<name>.use-case.ts
2. Depend on domain repository interfaces and adapters via constructor
3. Register the use case in the DI container with transient lifecycle
4. Use it in presentation by resolving from container

Example skeleton:

```ts
export class FooBarUseCase {
  constructor(private readonly repo: IFooRepo) {}
  async execute(cmd: { id: string }) { return this.repo.get(cmd.id); }
}
```

In container:

```ts
container.register(FooBarUseCase, { useClass: FooBarUseCase }, { lifecycle: Lifecycle.Transient });
```

## Adding a New DEX Adapter

1. Implement IDexAdapter in src/adapters/dex/<dex>.adapter.ts
2. Register the adapter as a singleton in the container
3. In initializeContainer, register it with the dexRegistry to make it available to use cases

```ts
container.register(MyDexAdapter, { useClass: MyDexAdapter }, { lifecycle: Lifecycle.Singleton });
reg.register(container.resolve(MyDexAdapter));
```

## Running Locally

- Copy .env.example to .env and set env vars
- pnpm install
- pnpm db:generate && pnpm db:migrate && pnpm db:seed
- pnpm dev

## Testing

- pnpm test (unit)
- pnpm test:coverage

## Notes

- Avoid new-ing repositories/services in presentation; resolve use cases via DI
- Legacy services under src/services are marked @deprecated and will be removed
