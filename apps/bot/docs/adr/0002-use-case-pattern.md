# ADR 0002: Use Case Pattern for Application Layer

Date: 2025-10-18

## Status
Accepted

## Context
Previously, the bot exposed service methods directly from presentation. Orchestration, validation, caching, and side effects were mixed with transport concerns. We need a consistent unit of behavior for business flows.

## Decision
Define one class per use case with a single public execute() method. Use cases:
- Are pure application logic
- Accept validated commands/params
- Orchestrate domain + adapters + infrastructure
- Return DTO-like results

## Consequences
- Presentation can remain thin and stable
- Business rules live in one place per flow
- Easier to compose, test, and reuse
