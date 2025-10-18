# ADR 0001: Adopt Clean Architecture

Date: 2025-10-18

## Status
Accepted

## Context
The bot evolved rapidly and the service layer accumulated responsibilities spanning DB access, blockchain calls, formatting, and orchestration. This made it hard to test, extend, and swap integrations (DEXes, RPCs, wallets).

## Decision
Adopt Clean Architecture with clear layers:
- presentation (Telegram): handlers, commands, scenes
- application: use cases coordinating domain + infra
- domain: entities, value objects, repository interfaces
- infrastructure: DB, cache, jobs, messaging, etc.
- adapters: external/system boundaries (DEXes, Solana, Jupiter, Privy)

Introduce dependency inversion via repository interfaces and a DI container (tsyringe). Presentation resolves use cases; use cases depend on abstractions.

## Consequences
- Improved testability (use cases/domains can be tested without IO)
- Easier to swap adapters and add DEX integrations
- Clearer separation of concerns and ownership
- Initial migration cost; need to mark legacy services deprecated
