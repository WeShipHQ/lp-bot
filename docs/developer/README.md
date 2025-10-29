# Developer Guides

This directory contains comprehensive guides for developers working on the Meteora Liquidity Bot, with special focus on the new flow state machine architecture, DEX adapters, and LP strategies.

## 📚 Documentation Index

### Architecture & Core Concepts
- **[Flow State Machine Guide](./flow-state-machine-guide.md)** - Complete guide to the flow state machine architecture
- **[Adding DEX Adapters](./adding-dex-adapters.md)** - Step-by-step guide to integrate new DEX protocols
- **[Adding LP Strategies](./adding-lp-strategies.md)** - Guide to implementing new liquidity provision strategies
- **[Transaction Safety](./transaction-safety.md)** - Understanding transaction guarantees and idempotency

### Operational Guides
- **[Monitoring & Observability](./monitoring-guide.md)** - How to monitor the bot in production
- **[Troubleshooting Manual](./troubleshooting.md)** - Common issues and their resolutions
- **[Queue Management](./queue-management.md)** - Managing BullMQ queues and workers
- **[Log Interpretation](./log-interpretation.md)** - Understanding bot logs and traces

### Development Workflows
- **[Local Development Setup](./local-dev-setup.md)** - Setting up your development environment
- **[Testing Guidelines](./testing-guidelines.md)** - Writing and running tests
- **[Deployment Guide](./deployment.md)** - Deploying the bot to production

## 🎯 Quick Start for New Contributors

### Understanding the Architecture

The bot follows a layered architecture with clear separation of concerns:

```
┌─────────────────────────────────────────────────────────────┐
│                    Presentation Layer                        │
│              (Telegraf Scenes & Handlers)                    │
├─────────────────────────────────────────────────────────────┤
│                    Application Layer                         │
│              (Use Cases & Business Logic)                    │
├─────────────────────────────────────────────────────────────┤
│                   Infrastructure Layer                       │
│         (Services, Adapters, Workers, Jobs)                  │
├─────────────────────────────────────────────────────────────┤
│                    Persistence Layer                         │
│            (Database, Cache, State Management)               │
└─────────────────────────────────────────────────────────────┘
```

### Key Concepts

1. **Flow State Machine**: All transaction flows (CREATE, CLAIM, CLOSE, REBALANCE) are managed by explicit state machines with:
   - Idempotency guarantees
   - Recovery checkpoints
   - Automatic cleanup
   - Error tracking

2. **DEX Adapters**: Protocol-specific implementations that expose a unified interface for:
   - Pool management
   - Position creation/closing
   - Fee claiming
   - Portfolio aggregation

3. **LP Strategies**: Abstracted strategy implementations (Spot, Curve, Bid-Ask) that:
   - Calculate optimal token distributions
   - Define price ranges
   - Manage rebalancing logic

## 🔄 Common Development Tasks

### Adding a New Feature
1. Read the relevant PRD section in `apps/bot/docs/PRD.md`
2. Check the System Design in `apps/bot/docs/SystemDesign.md`
3. Review existing ADRs in `apps/bot/docs/adrs/`
4. Implement following the layered architecture
5. Add tests (unit + integration)
6. Update documentation

### Fixing a Bug
1. Check the [Troubleshooting Manual](./troubleshooting.md) for known issues
2. Review logs using the [Log Interpretation Guide](./log-interpretation.md)
3. Write a failing test that reproduces the bug
4. Fix the issue
5. Ensure all tests pass
6. Update troubleshooting docs if needed

### Integrating a New DEX
1. Follow the [Adding DEX Adapters](./adding-dex-adapters.md) guide
2. Implement the `IDexAdapter` interface
3. Add tests for the adapter
4. Register in the DEX registry
5. Update UI components
6. Deploy with feature flag

## 📖 Documentation Standards

When contributing documentation:

1. **Be explicit**: Include code examples and step-by-step instructions
2. **Be complete**: Cover error cases and edge scenarios
3. **Be current**: Update docs alongside code changes
4. **Be visual**: Use diagrams and flowcharts where helpful
5. **Be practical**: Focus on real-world usage patterns

## 🔍 Finding Your Way Around

### Need to understand a transaction flow?
→ Start with `apps/bot/docs/positions/` for position-related flows
→ Check `docs/developer/flow-state-machine-guide.md` for state machine details

### Want to add a new DEX?
→ Read `docs/developer/adding-dex-adapters.md`
→ Review existing adapters in `apps/bot/src/services/{dex-name}/`

### Debugging a production issue?
→ Check `docs/developer/troubleshooting.md`
→ Review `docs/developer/log-interpretation.md`
→ Monitor queues using `docs/developer/queue-management.md`

### Need to understand the database schema?
→ Review `apps/bot/src/db/schema.ts`
→ Check migration files in `apps/bot/src/db/migrations/`

## 🚨 Critical Concepts

### Transaction Safety
All blockchain transactions use the flow state machine to ensure:
- **Idempotency**: Duplicate requests don't create duplicate positions
- **Recovery**: Failed transactions can be resumed from checkpoints
- **Atomicity**: Multi-step operations are tracked as single flows
- **Observability**: All state transitions are logged and traceable

See [Transaction Safety Guide](./transaction-safety.md) for details.

### Error Handling
The bot uses classified errors with specific handling strategies:
- **User errors**: Friendly messages returned immediately
- **Transient errors**: Automatic retry with exponential backoff
- **Blockchain errors**: Parse and surface actionable information
- **System errors**: Log, alert, and provide fallback behavior

See ADR-001 for error classification details.

### Job Queue Architecture
Background processing uses BullMQ with:
- **Priority queues**: Critical jobs processed first
- **Concurrency controls**: Per-worker concurrency limits
- **Retry strategies**: Exponential backoff with max attempts
- **Dead letter queues**: Failed jobs moved for manual review

See [Queue Management Guide](./queue-management.md) for details.

## 📞 Getting Help

- **Architecture questions**: Review System Design doc
- **Implementation questions**: Check existing code patterns
- **Production issues**: See Troubleshooting Manual
- **Testing questions**: Review Testing Guidelines

## 🎓 Learning Path for New Developers

### Week 1: Understanding the Foundation
1. Read PRD and System Design documents
2. Set up local development environment
3. Run the bot locally and explore features
4. Review the layered architecture
5. Understand the database schema

### Week 2: Core Concepts
1. Study the flow state machine implementation
2. Review existing DEX adapters
3. Understand LP strategy abstractions
4. Explore the job queue system
5. Review error handling patterns

### Week 3: Making Changes
1. Pick a small bug or feature
2. Write tests first (TDD approach)
3. Implement the change
4. Update documentation
5. Submit PR for review

### Week 4: Advanced Topics
1. Understand transaction safety guarantees
2. Review monitoring and observability setup
3. Study production troubleshooting scenarios
4. Learn compensation and recovery mechanisms
5. Explore performance optimization techniques

## 📝 Contributing to Documentation

We welcome documentation improvements! When contributing:

1. Keep consistency with existing structure
2. Include practical examples and code snippets
3. Add diagrams using Mermaid syntax
4. Test all code examples
5. Update the index files
6. Add cross-references to related docs

## 🔗 External Resources

- **Solana Web3.js**: https://solana-labs.github.io/solana-web3.js/
- **Telegraf**: https://telegraf.js.org/
- **BullMQ**: https://docs.bullmq.io/
- **Drizzle ORM**: https://orm.drizzle.team/
- **Saros DLMM SDK**: https://www.npmjs.com/package/@saros-finance/dlmm-sdk
- **Meteora DLMM SDK**: https://github.com/MeteoraAg/dlmm-sdk

---

**Last Updated**: January 2025  
**Version**: 2.0 (Flow State Machine Architecture)
