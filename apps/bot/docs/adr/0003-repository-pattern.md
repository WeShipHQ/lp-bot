# ADR 0003: Repository Pattern for Persistence

Date: 2025-10-18

## Status
Accepted

## Context
Drizzle queries were scattered across services and presentation logic. We want to isolate persistence from application logic and keep domain independent of DB details.

## Decision
Define repository interfaces in the domain layer (e.g., IPositionRepository, IUserRepository). Provide Drizzle-backed implementations in infrastructure/database/repositories. Register them in the DI container and inject into use cases.

## Consequences
- Domain remains persistence-agnostic
- Easier to mock repositories in tests
- Centralized data access with consistent mapping between domain and persistence
