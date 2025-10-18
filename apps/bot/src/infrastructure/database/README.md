# Infrastructure Layer - Database Repositories

## Overview

This directory contains the concrete implementations of repository interfaces defined in the domain layer. These repositories handle the persistence and retrieval of domain entities using Drizzle ORM.

## Architecture

The repository pattern provides a clean separation between the domain layer and data access concerns:

```
Domain Layer (Interface)  →  Infrastructure Layer (Implementation)
  IPositionRepository     →      PositionRepository
  IUserRepository         →      UserRepository
```

## Implemented Repositories

### PositionRepository

**Location:** `repositories/position.repository.ts`

**Purpose:** Manages persistence of Position entities.

**Key Features:**
- Full CRUD operations for positions
- Query by user, status, pool address
- Proper domain-to-persistence mapping
- Handles token amounts and value objects correctly

**Methods:**
- `findById(id: string): Promise<Position | null>`
- `findByPositionAddress(positionAddress: string): Promise<Position | null>`
- `findByUser(userId: string): Promise<Position[]>`
- `findActiveByUser(userId: string): Promise<Position[]>`
- `findByUserAndStatus(userId: string, status: PositionStatus): Promise<Position[]>`
- `findByPoolAddress(poolAddress: string): Promise<Position[]>`
- `save(position: Position): Promise<void>`
- `update(position: Position): Promise<void>`
- `delete(id: string): Promise<void>`
- `count(userId?: string): Promise<number>`
- `countActive(userId?: string): Promise<number>`

**Mapping Details:**
- Converts between domain value objects (Money, TokenAmount, Range) and database primitives
- Token amounts stored as UI amounts (decimal strings) in database
- Status and types properly converted between domain enums and database enums

### UserRepository

**Location:** `repositories/user.repository.ts`

**Purpose:** Manages persistence of User entities.

**Key Features:**
- User lookup by various identifiers (id, telegram ID, wallet address, wallet ID)
- User preferences management
- Clean domain-to-persistence mapping

**Methods:**
- `findById(id: string): Promise<User | null>`
- `findByTelegramId(telegramId: string): Promise<User | null>`
- `findByWalletAddress(address: string): Promise<User | null>`
- `findByWalletId(walletId: string): Promise<User | null>`
- `save(user: User): Promise<void>`
- `update(user: User): Promise<void>`
- `delete(id: string): Promise<void>`
- `exists(telegramId: string): Promise<boolean>`

**Mapping Details:**
- User preferences stored in database columns (autoRebalanceEnabled, rebalanceThreshold, etc.)
- Notification preferences use default values (can be extended with additional columns)
- Proper handling of optional fields (username)

## Usage Example

```typescript
import { db } from '@/db';
import { PositionRepository, UserRepository } from '@/infrastructure/database';

// Initialize repositories with database instance
const positionRepo = new PositionRepository(db);
const userRepo = new UserRepository(db);

// Find user by telegram ID
const user = await userRepo.findByTelegramId('123456789');

// Find all active positions for user
if (user) {
  const positions = await positionRepo.findActiveByUser(user.id);
  console.log(`User has ${positions.length} active positions`);
}

// Save a new position
const position = Position.create({
  userId: user.id,
  positionAddress: 'abc123...',
  poolAddress: 'pool456...',
  dex: 'meteora',
  strategyType: 'DLMM',
  tokenX: { address: '...', symbol: 'SOL', decimals: 9 },
  tokenY: { address: '...', symbol: 'USDC', decimals: 6 },
  initialValueUsd: 1000,
  initialTokenXAmount: '10',
  initialTokenYAmount: '1000',
  initialTokenXPriceUsd: 100,
  initialTokenYPriceUsd: 1,
});

await positionRepo.save(position);
```

## Design Decisions

### 1. Token Amount Storage
We store token amounts as UI amounts (decimal strings) rather than raw amounts (bigint). This aligns with the domain entity's `reconstitute` method which expects UI amounts as strings.

**Rationale:**
- Database `decimal(28, 9)` type is perfect for storing precise decimal values
- Easier to read and debug in database queries
- Domain entity handles conversion to internal TokenAmount value objects

### 2. Value Object Mapping
Domain entities use rich value objects (Money, TokenAmount, Range), but database stores primitives. The repositories handle this mapping in `toDomain()` and `toPersistence()` methods.

**Rationale:**
- Keeps domain layer pure (no database concerns)
- Database schema optimized for queries and storage
- Clear separation of concerns

### 3. Private Mapping Methods
Both `toDomain()` and `toPersistence()` are private methods within each repository.

**Rationale:**
- Encapsulation - mapping logic is implementation detail
- Reusability - used by multiple repository methods
- Testability - can be extracted if needed

## Database Schema Alignment

The repositories are designed to work with the following database tables:

- **positions** table (see `src/db/schema.ts`)
- **users** table (see `src/db/schema.ts`)

## Next Steps

To use these repositories in the application layer:

1. **Inject repositories into use cases:**
   ```typescript
   class CreatePositionUseCase {
     constructor(
       private readonly positionRepo: IPositionRepository,
       private readonly userRepo: IUserRepository
     ) {}
   }
   ```

2. **Use dependency injection at the application entry point:**
   ```typescript
   const positionRepo = new PositionRepository(db);
   const createPositionUseCase = new CreatePositionUseCase(positionRepo, ...);
   ```

3. **Implement remaining repositories as needed:**
   - PoolRepository (if caching pools)
   - WalletRepository (if needed separately from users)
   - TransactionRepository

## Testing

Repositories should be tested with:
1. **Unit tests:** Mock the database instance
2. **Integration tests:** Use a test database

Example test structure:
```typescript
describe('PositionRepository', () => {
  let repo: PositionRepository;
  let testDb: PostgresJsDatabase;

  beforeEach(() => {
    testDb = createTestDatabase();
    repo = new PositionRepository(testDb);
  });

  it('should save and retrieve a position', async () => {
    const position = Position.create({ /* ... */ });
    await repo.save(position);
    
    const retrieved = await repo.findById(position.id);
    expect(retrieved).toBeDefined();
    expect(retrieved?.id).toBe(position.id);
  });
});
```

## Notes

- Repositories work with Drizzle ORM and PostgreSQL
- All queries use Drizzle's query builder for type safety
- Indexes should be added to the database schema for frequently queried columns
- Consider adding soft delete support if needed
- Transaction support can be added by accepting a transaction context

## References

- [Drizzle ORM Documentation](https://orm.drizzle.team/)
- [Domain Layer Entities](/src/domain)
- [Database Schema](/src/db/schema.ts)
- [Repository Pattern](https://martinfowler.com/eaaCatalog/repository.html)
