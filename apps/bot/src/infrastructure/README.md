# Infrastructure Layer

## Overview

The Infrastructure Layer contains concrete implementations of infrastructure concerns, including database access, caching, job queues, and external service integrations. This layer implements interfaces defined in the domain layer and provides the technical foundation for the application.

## Architecture Principles

1. **Implements Domain Interfaces**: All repositories implement interfaces from the domain layer
2. **Technology-Specific**: Contains framework and library-specific code (Drizzle, Redis, BullMQ)
3. **No Business Logic**: Pure infrastructure concerns only
4. **Dependency Direction**: Depends on domain layer, not vice versa
5. **Testable**: Implementations can be mocked or replaced

## Structure

```
infrastructure/
├── database/           # Database access layer (Drizzle ORM)
│   ├── repositories/  # Repository implementations
│   │   ├── position.repository.ts
│   │   ├── user.repository.ts
│   │   └── index.ts
│   ├── index.ts
│   └── README.md
├── cache/             # Caching layer (Redis) [TODO]
├── jobs/              # Job queue (BullMQ) [TODO]
├── logging/           # Logging infrastructure [TODO]
└── index.ts
```

## Implemented Components

### Database Layer ✅

**Location:** `database/`

**Purpose:** Provides data persistence and retrieval using Drizzle ORM and PostgreSQL.

**Implemented Repositories:**
- **PositionRepository** - Manages position entity persistence
- **UserRepository** - Manages user entity persistence

**Features:**
- Type-safe queries using Drizzle ORM
- Clean domain/persistence mapping
- Proper value object handling
- Efficient query patterns

See [Database README](./database/README.md) for detailed documentation.

## Future Components

### Cache Layer (TODO)

**Purpose:** Provide fast in-memory caching using Redis.

**Planned Components:**
- `CacheService` - Main caching service
- `cache-keys.ts` - Cache key patterns
- Cache invalidation strategies

**Use Cases:**
- Portfolio data caching (5-minute TTL)
- Token price caching (1-minute TTL)
- Trending pools caching (10-minute TTL)
- User session data

### Job Queue Layer (TODO)

**Purpose:** Background job processing using BullMQ.

**Planned Components:**
- `JobQueueService` - Job queue management
- `workers/` - Worker implementations
  - Position monitor worker
  - Rebalance worker
  - Notification worker
  - Portfolio sync worker

**Use Cases:**
- Position monitoring
- Automatic rebalancing
- Notification delivery
- Price alerts
- Portfolio synchronization

### Logging Layer (TODO)

**Purpose:** Structured logging infrastructure.

**Planned Components:**
- `logger.ts` - Centralized logger
- Log formatting
- Log levels
- Contextual logging

## Usage

### Database Repositories

```typescript
import { db } from '@/db';
import { PositionRepository, UserRepository } from '@/infrastructure/database';

// Initialize repositories
const positionRepo = new PositionRepository(db);
const userRepo = new UserRepository(db);

// Use in application layer
class CreatePositionUseCase {
  constructor(
    private readonly positionRepo: IPositionRepository,
    private readonly userRepo: IUserRepository
  ) {}
  
  async execute(params: CreatePositionParams) {
    const user = await this.userRepo.findByTelegramId(params.telegramId);
    // ... business logic
    await this.positionRepo.save(position);
  }
}
```

## Testing

Each infrastructure component should have:

1. **Unit Tests** - Test with mocked dependencies
2. **Integration Tests** - Test with real infrastructure (test database, test Redis, etc.)

Example integration test:
```typescript
describe('PositionRepository Integration', () => {
  let testDb: PostgresJsDatabase;
  let repo: PositionRepository;

  beforeAll(async () => {
    testDb = await setupTestDatabase();
    repo = new PositionRepository(testDb);
  });

  afterAll(async () => {
    await cleanupTestDatabase(testDb);
  });

  it('should save and retrieve position', async () => {
    const position = Position.create({ /* ... */ });
    await repo.save(position);
    
    const retrieved = await repo.findById(position.id);
    expect(retrieved).toBeDefined();
    expect(retrieved?.id).toBe(position.id);
  });
});
```

## Best Practices

1. **Dependency Injection**: Always inject infrastructure dependencies
2. **Interface Programming**: Program against interfaces, not implementations
3. **Error Handling**: Wrap external errors in infrastructure-specific errors
4. **Logging**: Log infrastructure operations for debugging
5. **Configuration**: Use environment variables for infrastructure configuration
6. **Connection Management**: Properly handle connection lifecycle
7. **Transactions**: Support transaction contexts where needed
8. **Retry Logic**: Implement retry logic for transient failures
9. **Circuit Breakers**: Use circuit breakers for external services
10. **Monitoring**: Add metrics and monitoring for infrastructure operations

## Environment Configuration

Infrastructure components require configuration through environment variables:

```env
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/meteora_bot

# Redis (future)
REDIS_URL=redis://localhost:6379

# External Services
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
JUPITER_API_URL=https://quote-api.jup.ag/v6
METEORA_API_URL=https://app.meteora.ag/dlmm-api
```

## Performance Considerations

1. **Database Queries**
   - Use indexes for frequently queried columns
   - Batch queries when possible
   - Use pagination for large result sets
   - Optimize N+1 query problems

2. **Caching** (when implemented)
   - Choose appropriate TTLs
   - Implement cache warming strategies
   - Handle cache invalidation properly
   - Monitor cache hit rates

3. **Job Queues** (when implemented)
   - Set appropriate priorities
   - Implement retry strategies
   - Monitor queue sizes
   - Handle failed jobs

## Security Considerations

1. **Database**
   - Use connection pooling
   - Implement query parameterization (Drizzle handles this)
   - Encrypt sensitive data at rest
   - Use read-only connections where appropriate

2. **Secrets Management**
   - Never commit secrets to code
   - Use environment variables
   - Rotate credentials regularly

3. **External Services**
   - Validate all external data
   - Implement rate limiting
   - Handle failures gracefully
   - Use circuit breakers

## Dependencies

```json
{
  "drizzle-orm": "^0.44.4",
  "postgres-js": "^3.4.5",
  "redis": "^4.7.0",
  "bullmq": "^5.0.0",
  "pino": "^8.16.0"
}
```

## Contributing

When adding new infrastructure components:

1. Define interface in domain layer first
2. Implement in infrastructure layer
3. Add comprehensive tests
4. Document in this README
5. Update environment configuration examples
6. Consider monitoring and logging

## Status

- ✅ Database Layer (Repositories)
- 🔄 Cache Layer (Planned)
- 🔄 Job Queue Layer (Planned)
- 🔄 Logging Layer (Planned)

---

**Last Updated:** October 18, 2025  
**Phase:** 2.1 Complete  
**Next:** Phase 2.2 - Application Layer Use Cases
