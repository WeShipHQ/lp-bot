# User Domain Alignment & Enhancement Tasks

## Executive Summary

This document outlines the comprehensive review findings and actionable tasks required to align the user domain implementation with clean architecture principles. The review identified inconsistencies between the user entity and user schema, places where the schema object is used instead of the entity, and opportunities for improvement in the user domain.

---

## Key Findings

### 1. **Schema vs Entity Misalignment**

**Current Issues:**
- **Missing Notification Fields in Schema**: The `User` entity has `notificationsEnabled`, `priceAlertsEnabled`, and `rebalanceAlertsEnabled` preferences, but these fields are NOT present in the database schema (`users` table in `schema.ts`). This causes a disconnect when mapping between persistence and domain layers.
- **Type Inconsistencies**: The repository's `toDomain` method handles `slippagePercentage` as a string (`row.slippagePercentage?.toString() || "3.00"`), but the entity stores it as a number. This creates type confusion.
- **Missing Referral Fields**: The schema has `referralCode` and `referredBy` fields (lines not shown, but used in `referral.service.ts`), but these are not reflected in the entity.
- **Decimal Precision Issues**: Schema uses `decimal` types, but entity/repository convert to `number`, which could cause precision loss for financial data like `rebalanceThreshold`.

**Recommendations:**
- Add missing notification preference columns to the database schema.
- Add referral tracking fields (`referralCode`, `referredBy`) to the `User` entity.
- Ensure consistent type handling between schema (decimal strings) and entity (numbers) with proper conversion utilities.
- Document which fields are database-persisted vs. computed/derived.

---

### 2. **Direct Schema Usage Instead of Entity**

**Files Using Schema Objects Directly:**

1. **`/db/queries.ts`** (Lines 31-69): Exports functions like `createUser`, `findUserByTelegramId`, `updateUser` that return schema types (`User` from schema).
2. **`/services/user-sync.service.ts`** (Lines 1-97): Directly queries and manipulates the `users` schema table without going through the repository or entity.
3. **`/services/referral.service.ts`** (Lines 1-274): Directly queries `users` table for referral-related operations.
4. **`/services/fee-earning.service.ts`**: Likely uses schema directly (not fully reviewed).
5. **`/services/job-queue.service.ts`**: Legacy commented-out code references schema `users` type.
6. **`/services/rebalance.service.ts`**: Commented-out code shows direct schema usage.
7. **`/presentation/middleware/auth.ts`** (Lines 29, 37): Calls `findUserById` (schema query) AND uses repository, attaching BOTH `ctx.user` (schema) and `ctx.eUser` (entity) to context—this is redundant.
8. **`/types/bot.types.ts`** (Lines 1-2, 36-37): Imports both schema `User` and entity `User`, causing naming collision. The `BotContext` has both `user: User` (schema) and `eUser: UserEntity` (entity).

**Recommendations:**
- **Deprecate or remove direct schema queries** from `/db/queries.ts` for user operations. All user access should go through `IUserRepository`.
- **Refactor `user-sync.service.ts`** to use the repository pattern.
- **Refactor `referral.service.ts`** to accept `User` entity or use repository for user lookups.
- **Eliminate dual context properties**: `BotContext` should only have `eUser` (entity). Remove `ctx.user` (schema).
- **Update all command handlers** to use `ctx.eUser` exclusively.

---

### 3. **Repository Implementation Issues**

**Current Issues in `UserRepository`:**
- **Hard-coded Default Values**: The `toDomain` method hard-codes notification defaults (`notificationsEnabled: true`) because these fields don't exist in the database. This is a workaround, not a solution.
- **Type Coercion Inconsistencies**: `slippagePercentage` is converted to string in `toDomain` but expected as number in entity.
- **Missing Error Handling**: No try-catch or logging around database operations.
- **No Caching**: High-frequency user lookups could benefit from in-memory caching (e.g., Redis or simple LRU cache).
- **Update Method Only Partial**: The `update` method manually lists all updateable fields, which is error-prone when new fields are added.

**Recommendations:**
- Add comprehensive error handling with logging.
- Implement caching layer for frequently accessed user data (consider Redis integration).
- Refactor `update` method to dynamically map all changed fields from entity.
- Add validation before persistence (e.g., validate wallet address format).
- Add unit tests for repository mapping logic.

---

### 4. **Commands Using Schema Instead of Entity**

**Commands to Refactor:**

1. **`/presentation/commands/start.ts`**
   - Uses `ctx.user` (schema) on line 35-39.
   - Should use `ctx.eUser` (entity) instead.

2. **`/presentation/commands/portfolio.ts`**
   - Uses `ctx.user.id` and `ctx.user.walletAddress` (lines 28, 31).
   - Should use `ctx.eUser`.

3. **`/presentation/commands/referral.ts`**
   - Uses `ctx.user` extensively (lines 31, 62, 68, 109).
   - Should use `ctx.eUser`.

4. **`/presentation/commands/wallet.ts`**
   - Handlers in `/handlers/wallet/` likely use `ctx.user`.
   - Need to review and refactor.

5. **`/presentation/commands/settings.ts`**
   - Uses `ctx.eUser` correctly (good example!).

6. **`/presentation/handlers/settings.ts`**
   - Uses `ctx.eUser` correctly throughout.

7. **`/presentation/scenes/create-position.scene.ts`**
   - Uses `ctx.user` (needs review).

8. **`/presentation/scenes/position-detail.scene.ts`**
   - Uses `ctx.user` (needs review).

**Recommendations:**
- Standardize on `ctx.eUser` across ALL commands and handlers.
- Remove `ctx.user` from `BotContext` interface entirely (breaking change).
- Update middleware to only attach `ctx.eUser`.

---

### 5. **Missing User Domain Elements**

**Missing Types File:**
- No centralized `types.ts` file in `/domain/user/`.
- Types like `RebalanceStrategy`, `UserPreferences`, `CreateUserData` are scattered in `user.entity.ts`.

**Missing Constants File:**
- No centralized `constants.ts` file in `/domain/user/`.
- Hard-coded values like default bin range (`10`), rebalance threshold (`20`), slippage (`3.0`), etc.
- Constants like `MIN_TELEGRAM_ID`, `MAX_TELEGRAM_ID` in `user.validators.ts` should be exported.

**Recommendations:**
- Create `/domain/user/types.ts` and move all user-related interfaces/types there.
- Create `/domain/user/constants.ts` for all default values and limits.
- Export constants from validators for reuse.

---

### 6. **Missing User-Related Enhancements**

**Validation:**
- Entity methods like `updateUsername`, `setRebalanceThreshold` have inline validation.
- Consider extracting validation to a dedicated `UserValidator` class for better separation of concerns.

**Security:**
- Wallet addresses and IDs are stored as plain text in the entity.
- No mention of encryption for sensitive fields (handled at persistence layer, but entity should be aware).
- Consider adding a method like `user.canAccessWallet()` or `user.verifyOwnership()`.

**Scalability:**
- No mention of user session management or concurrent access control.
- Repository lacks optimistic locking for concurrent updates.

**Integration with Other Domains:**
- User entity has no direct relationship with Position domain (no methods like `user.getPositions()`).
- Consider adding domain events (e.g., `UserPreferencesUpdated`) for cross-domain communication.

**Testing:**
- No unit tests visible for `User` entity or `UserRepository`.
- Need comprehensive test coverage.

---

## Detailed Enhancement Suggestions

### Enhancement 1: Align Schema with Entity

**Problem:** Notification preferences exist in entity but not in database schema.

**Solution:**
1. Add new columns to `users` table:
   ```sql
   ALTER TABLE users ADD COLUMN notifications_enabled BOOLEAN NOT NULL DEFAULT true;
   ALTER TABLE users ADD COLUMN price_alerts_enabled BOOLEAN NOT NULL DEFAULT true;
   ALTER TABLE users ADD COLUMN rebalance_alerts_enabled BOOLEAN NOT NULL DEFAULT true;
   ```

2. Create Drizzle migration to add these columns.

3. Update `users` table definition in `schema.ts` to include:
   ```typescript
   notificationsEnabled: boolean("notifications_enabled").notNull().default(true),
   priceAlertsEnabled: boolean("price_alerts_enabled").notNull().default(true),
   rebalanceAlertsEnabled: boolean("rebalance_alerts_enabled").notNull().default(true),
   ```

4. Update `UserRepository.toDomain()` to map these columns instead of hard-coding.

5. Update `UserRepository.toPersistence()` to include these fields.

**Effort:** 2 hours

---

### Enhancement 2: Add Referral Fields to User Entity

**Problem:** Referral tracking is done at schema level, not entity level.

**Solution:**
1. Add referral fields to `User` entity:
   ```typescript
   private referralCode: string | null;
   private referredBy: string | null;
   ```

2. Add getter methods:
   ```typescript
   getReferralCode(): string | null
   getReferredBy(): string | null
   ```

3. Add method to set referral code:
   ```typescript
   setReferralCode(code: string): void
   ```

4. Update `CreateUserData` interface to include optional referral fields.

5. Update repository mapping to handle these fields.

**Effort:** 3 hours

---

### Enhancement 3: Centralize User Types

**Problem:** Types scattered across entity file; no central types file.

**Solution:**
1. Create `/domain/user/types.ts`.

2. Move these types/interfaces to `types.ts`:
   - `RebalanceStrategy`
   - `UserPreferences`
   - `CreateUserData`

3. Add new types for clarity:
   ```typescript
   export type UserId = string;
   export type TelegramId = string;
   export type WalletAddress = string;
   export type NotificationType = 'price' | 'rebalance' | 'general' | 'position';
   ```

4. Update imports across codebase.

5. Export from `/domain/user/index.ts`.

**Effort:** 2 hours

---

### Enhancement 4: Centralize User Constants

**Problem:** Hard-coded values throughout codebase; no central constants file.

**Solution:**
1. Create `/domain/user/constants.ts`.

2. Move constants from various places:
   ```typescript
   // Default user preferences
   export const DEFAULT_AUTO_REBALANCE_ENABLED = true;
   export const DEFAULT_REBALANCE_THRESHOLD = 20;
   export const DEFAULT_REBALANCE_STRATEGY = 'STANDARD';
   export const DEFAULT_REBALANCE_SCHEDULE = '15m';
   export const DEFAULT_BIN_RANGE = 10;
   export const DEFAULT_BALANCED_POSITION_BIN_RANGE = 10;
   export const DEFAULT_STOP_LOSS_PERCENTAGE = 25;
   export const DEFAULT_TAKE_PROFIT_PERCENTAGE = 25;
   export const DEFAULT_AUTO_CONVERT_TO_SOL = true;
   export const DEFAULT_SLIPPAGE_PERCENTAGE = 3.0;
   export const DEFAULT_NOTIFICATIONS_ENABLED = true;
   export const DEFAULT_PRICE_ALERTS_ENABLED = true;
   export const DEFAULT_REBALANCE_ALERTS_ENABLED = true;

   // Validation constants
   export const MIN_TELEGRAM_ID = 1;
   export const MAX_TELEGRAM_ID = 9999999999;
   export const MIN_REBALANCE_THRESHOLD = 0;
   export const MAX_REBALANCE_THRESHOLD = 100;
   export const MIN_BIN_RANGE = 5;
   export const MAX_BIN_RANGE = 100;
   export const MIN_STOP_LOSS_PERCENTAGE = 1;
   export const MAX_STOP_LOSS_PERCENTAGE = 100;
   export const MIN_TAKE_PROFIT_PERCENTAGE = 1;
   export const MAX_TAKE_PROFIT_PERCENTAGE = 100;
   export const MIN_SLIPPAGE_PERCENTAGE = 0.1;
   export const MAX_SLIPPAGE_PERCENTAGE = 10;
   export const MAX_USERNAME_LENGTH = 32;
   ```

3. Update entity, validators, and repository to use these constants.

4. Export from `/domain/user/index.ts`.

**Effort:** 2 hours

---

### Enhancement 5: Refactor UserSyncService to Use Repository

**Problem:** `UserSyncService` directly manipulates schema, bypassing repository pattern.

**Solution:**
1. Inject `IUserRepository` into `UserSyncService` constructor.

2. Refactor `syncUser` method:
   - Use `repository.findByTelegramId()`
   - Use `User.create()` for new users
   - Use `repository.save()` or `repository.update()`

3. Refactor `getUserByTelegramId` to use repository.

4. Refactor `getUserById` to use repository.

5. Refactor `getUserByTelegramIdOrCreate` to use repository.

6. Add proper error handling and logging.

**Effort:** 4 hours

---

### Enhancement 6: Refactor ReferralService to Use Repository

**Problem:** `ReferralService` directly queries `users` table.

**Solution:**
1. Inject `IUserRepository` into `ReferralService` constructor.

2. Replace all `db.query.users.findFirst()` calls with `repository.findByTelegramId()` or `repository.findById()`.

3. Replace all `db.update(users).set()` calls with entity updates followed by `repository.update()`.

4. Update methods to work with `User` entity instead of schema type.

**Effort:** 5 hours

---

### Enhancement 7: Remove Dual User Properties from BotContext

**Problem:** `BotContext` has both `user` (schema) and `eUser` (entity), causing confusion and duplication.

**Solution:**
1. Update `BotContext` interface in `/types/bot.types.ts`:
   - Remove `user: User` (schema import)
   - Keep only `eUser: UserEntity`
   - Rename `eUser` to `user` for simplicity

2. Update `/presentation/middleware/auth.ts`:
   - Remove `ctx.user = dbUser;` assignment
   - Remove `findUserById()` call (redundant)
   - Keep only `ctx.user = user;` (entity)

3. Update ALL commands and handlers to use `ctx.user` (entity).

4. Remove schema `User` import from `/types/bot.types.ts`.

**Effort:** 6 hours (requires updates across many files)

---

### Enhancement 8: Add Error Handling to Repository

**Problem:** Repository methods lack comprehensive error handling.

**Solution:**
1. Wrap all database operations in try-catch blocks.

2. Use logger to log errors with context.

3. Throw domain-specific errors (e.g., `UserNotFoundException`, `UserPersistenceError`).

4. Add error types in `/domain/shared/errors.ts`:
   ```typescript
   export class UserNotFoundException extends Error
   export class UserPersistenceError extends Error
   ```

**Effort:** 3 hours

---

### Enhancement 9: Add Caching to Repository

**Problem:** High-frequency user lookups cause database load.

**Solution:**
1. Create a caching wrapper for `UserRepository`:
   ```typescript
   class CachedUserRepository implements IUserRepository
   ```

2. Use LRU cache or Redis for caching:
   - Cache key: `user:{id}` or `user:telegram:{telegramId}`
   - TTL: 5 minutes

3. Invalidate cache on `save()` and `update()`.

4. Make caching configurable via DI container.

**Effort:** 5 hours

---

### Enhancement 10: Add Domain Events for User Changes

**Problem:** No way to notify other domains when user preferences change.

**Solution:**
1. Create event types in `/domain/user/events.ts`:
   ```typescript
   export class UserCreatedEvent
   export class UserPreferencesUpdatedEvent
   export class UserNotificationSettingsChangedEvent
   ```

2. Add event dispatcher to entity:
   ```typescript
   private events: DomainEvent[] = []
   getEvents(): DomainEvent[]
   clearEvents(): void
   ```

3. Emit events in entity methods:
   - `User.create()` → `UserCreatedEvent`
   - `updatePreferences()` → `UserPreferencesUpdatedEvent`

4. Repository publishes events after persistence.

**Effort:** 6 hours

---

### Enhancement 11: Add Unit Tests for User Entity

**Problem:** No visible tests for user domain.

**Solution:**
1. Create `/domain/user/__tests__/user.entity.spec.ts`.

2. Test entity creation:
   - Valid data
   - Invalid data (validation errors)
   - Default preferences

3. Test preference updates:
   - `updatePreferences()`
   - `enableAutoRebalance()`, `disableAutoRebalance()`
   - `setRebalanceThreshold()` with valid/invalid values

4. Test notification methods:
   - `hasNotificationEnabled()`
   - `enableNotifications()`, `disableNotifications()`

5. Test validation methods:
   - `validateTelegramId()`
   - `validateWalletAddress()`

**Effort:** 4 hours

---

### Enhancement 12: Add Unit Tests for UserRepository

**Problem:** No visible tests for repository.

**Solution:**
1. Create `/infrastructure/database/repositories/__tests__/user.repository.spec.ts`.

2. Test CRUD operations:
   - `save()` - new user
   - `findById()` - existing/non-existing
   - `findByTelegramId()` - existing/non-existing
   - `update()` - successful update
   - `delete()` - successful deletion

3. Test mapping logic:
   - `toDomain()` - correct entity reconstruction
   - `toPersistence()` - correct schema mapping

4. Mock database using `vitest` or similar.

**Effort:** 5 hours

---

### Enhancement 13: Improve Validation in Entity

**Problem:** Validation logic inline in entity methods; no dedicated validator class.

**Solution:**
1. Create `/domain/user/user.validator.class.ts`.

2. Extract validation logic from entity to validator:
   ```typescript
   class UserValidator {
     validateRebalanceThreshold(threshold: number): void
     validateBinRange(binRange: number): void
     validateStopLossPercentage(percentage: number | null): void
     // ... etc
   }
   ```

3. Use validator in entity methods:
   ```typescript
   setRebalanceThreshold(threshold: number): void {
     UserValidator.validateRebalanceThreshold(threshold);
     this.preferences.rebalanceThreshold = threshold;
     this.updatedAt = new Date();
   }
   ```

4. Keep existing validator functions in `user.validators.ts` for basic field validation.

**Effort:** 4 hours

---

### Enhancement 14: Add Optimistic Locking to Repository

**Problem:** Concurrent updates could cause data loss.

**Solution:**
1. Add `version` field to `User` entity and schema.

2. Update repository `update()` method to:
   - Include version check in WHERE clause
   - Increment version on update
   - Throw `OptimisticLockError` if version mismatch

3. Add retry logic in application layer for optimistic lock failures.

**Effort:** 4 hours

---

### Enhancement 15: Add User Domain Service

**Problem:** Some user operations might require coordination (e.g., user creation with referral).

**Solution:**
1. Create `/domain/user/user.service.ts`.

2. Add domain logic that doesn't fit in entity:
   ```typescript
   class UserDomainService {
     createUserWithReferral(userData: CreateUserData, referralCode?: string): User
     validateUniqueWalletAddress(address: string): Promise<boolean>
   }
   ```

3. Inject repository into service.

4. Use service in application use cases.

**Effort:** 3 hours

---

## Actionable Task List

### **Phase 1: Schema & Database Alignment (Highest Priority)**

**Estimated Total: 7 hours**

- [ ] **Task 1.1**: Create Drizzle migration to add notification preference columns to `users` table
  - **File**: Create new migration file in `/db/migrations/`
  - **Effort**: 1 hour
  - **Owner**: Backend Developer

- [ ] **Task 1.2**: Update `users` table definition in `schema.ts` to include notification fields
  - **File**: `/db/schema.ts` (lines 89-132)
  - **Effort**: 30 minutes
  - **Owner**: Backend Developer

- [ ] **Task 1.3**: Add referral fields (`referralCode`, `referredBy`) to `users` table schema
  - **File**: `/db/schema.ts`
  - **Effort**: 30 minutes
  - **Owner**: Backend Developer

- [ ] **Task 1.4**: Run migration on development database and test
  - **Effort**: 1 hour
  - **Owner**: Backend Developer

- [ ] **Task 1.5**: Update `UserRepository.toDomain()` to map notification fields from database
  - **File**: `/infrastructure/database/repositories/user.repository.ts` (lines 116-156)
  - **Effort**: 1 hour
  - **Owner**: Backend Developer

- [ ] **Task 1.6**: Update `UserRepository.toPersistence()` to include notification and referral fields
  - **File**: `/infrastructure/database/repositories/user.repository.ts` (lines 162-194)
  - **Effort**: 1 hour
  - **Owner**: Backend Developer

- [ ] **Task 1.7**: Fix type inconsistency for `slippagePercentage` (string vs number)
  - **Files**: `/domain/user/user.entity.ts`, `/infrastructure/database/repositories/user.repository.ts`
  - **Effort**: 2 hours
  - **Owner**: Backend Developer

---

### **Phase 2: User Types & Constants Centralization**

**Estimated Total: 4 hours**

- [ ] **Task 2.1**: Create `/domain/user/types.ts` file
  - **New File**: `/domain/user/types.ts`
  - **Effort**: 30 minutes
  - **Owner**: Backend Developer

- [ ] **Task 2.2**: Move `RebalanceStrategy`, `UserPreferences`, `CreateUserData` to `types.ts`
  - **Files**: Move from `/domain/user/user.entity.ts` to `/domain/user/types.ts`
  - **Effort**: 1 hour
  - **Owner**: Backend Developer

- [ ] **Task 2.3**: Create `/domain/user/constants.ts` file with all user-related constants
  - **New File**: `/domain/user/constants.ts`
  - **Effort**: 1 hour
  - **Owner**: Backend Developer

- [ ] **Task 2.4**: Update `user.entity.ts` to use constants from `constants.ts`
  - **File**: `/domain/user/user.entity.ts` (lines 53-76)
  - **Effort**: 1 hour
  - **Owner**: Backend Developer

- [ ] **Task 2.5**: Update `user.validators.ts` to use constants from `constants.ts`
  - **File**: `/domain/user/user.validators.ts`
  - **Effort**: 30 minutes
  - **Owner**: Backend Developer

- [ ] **Task 2.6**: Update `/domain/user/index.ts` exports to include types and constants
  - **File**: `/domain/user/index.ts`
  - **Effort**: 15 minutes
  - **Owner**: Backend Developer

---

### **Phase 3: Add Referral Support to User Entity**

**Estimated Total: 3 hours**

- [ ] **Task 3.1**: Add referral fields to `User` entity class
  - **File**: `/domain/user/user.entity.ts`
  - **Effort**: 1 hour
  - **Owner**: Backend Developer

- [ ] **Task 3.2**: Add referral getter and setter methods to `User` entity
  - **File**: `/domain/user/user.entity.ts`
  - **Effort**: 1 hour
  - **Owner**: Backend Developer

- [ ] **Task 3.3**: Update `CreateUserData` interface to include optional referral fields
  - **File**: `/domain/user/types.ts` (after Task 2.2)
  - **Effort**: 30 minutes
  - **Owner**: Backend Developer

- [ ] **Task 3.4**: Update repository to map referral fields
  - **File**: `/infrastructure/database/repositories/user.repository.ts`
  - **Effort**: 30 minutes
  - **Owner**: Backend Developer

---

### **Phase 4: Repository Enhancements**

**Estimated Total: 12 hours**

- [ ] **Task 4.1**: Add comprehensive error handling to all repository methods
  - **File**: `/infrastructure/database/repositories/user.repository.ts`
  - **Effort**: 3 hours
  - **Owner**: Backend Developer

- [ ] **Task 4.2**: Create custom error classes for user domain
  - **New Classes**: `UserNotFoundException`, `UserPersistenceError` in `/domain/shared/errors.ts`
  - **Effort**: 1 hour
  - **Owner**: Backend Developer

- [ ] **Task 4.3**: Add logging to repository methods using Pino logger
  - **File**: `/infrastructure/database/repositories/user.repository.ts`
  - **Effort**: 2 hours
  - **Owner**: Backend Developer

- [ ] **Task 4.4**: Implement caching layer for UserRepository (optional but recommended)
  - **New File**: `/infrastructure/database/repositories/cached-user.repository.ts`
  - **Effort**: 5 hours
  - **Owner**: Backend Developer

- [ ] **Task 4.5**: Add validation before persistence in repository
  - **File**: `/infrastructure/database/repositories/user.repository.ts`
  - **Effort**: 1 hour
  - **Owner**: Backend Developer

---

### **Phase 5: Remove Direct Schema Usage**

**Estimated Total: 10 hours**

- [ ] **Task 5.1**: Deprecate user-related functions in `/db/queries.ts`
  - **File**: `/db/queries.ts` (lines 30-69)
  - **Effort**: 1 hour
  - **Action**: Add `@deprecated` comments, log warnings
  - **Owner**: Backend Developer

- [ ] **Task 5.2**: Refactor `UserSyncService` to use `IUserRepository` instead of direct schema access
  - **File**: `/services/user-sync.service.ts`
  - **Effort**: 4 hours
  - **Owner**: Backend Developer

- [ ] **Task 5.3**: Refactor `ReferralService` to use `IUserRepository` for user lookups
  - **File**: `/services/referral.service.ts`
  - **Effort**: 5 hours
  - **Owner**: Backend Developer

---

### **Phase 6: Update BotContext to Use Only Entity**

**Estimated Total: 8 hours**

- [ ] **Task 6.1**: Update `BotContext` interface to remove `user` (schema) property
  - **File**: `/types/bot.types.ts` (line 36)
  - **Effort**: 30 minutes
  - **Owner**: Backend Developer

- [ ] **Task 6.2**: Rename `eUser` to `user` in `BotContext` interface
  - **File**: `/types/bot.types.ts` (line 37)
  - **Effort**: 30 minutes
  - **Owner**: Backend Developer

- [ ] **Task 6.3**: Update auth middleware to only attach entity user
  - **File**: `/presentation/middleware/auth.ts` (lines 29-38)
  - **Effort**: 1 hour
  - **Owner**: Backend Developer

- [ ] **Task 6.4**: Update `/presentation/commands/start.ts` to use `ctx.user` (entity)
  - **File**: `/presentation/commands/start.ts` (lines 35-39, 68)
  - **Effort**: 1 hour
  - **Owner**: Backend Developer

- [ ] **Task 6.5**: Update `/presentation/commands/portfolio.ts` to use `ctx.user` (entity)
  - **File**: `/presentation/commands/portfolio.ts` (lines 28, 31)
  - **Effort**: 1 hour
  - **Owner**: Backend Developer

- [ ] **Task 6.6**: Update `/presentation/commands/referral.ts` to use `ctx.user` (entity)
  - **File**: `/presentation/commands/referral.ts` (lines 31, 62, 68, 109)
  - **Effort**: 1 hour
  - **Owner**: Backend Developer

- [ ] **Task 6.7**: Review and update `/presentation/commands/wallet.ts` handlers
  - **Files**: `/presentation/handlers/wallet/*.ts`
  - **Effort**: 2 hours
  - **Owner**: Backend Developer

- [ ] **Task 6.8**: Review and update scene files to use `ctx.user` (entity)
  - **Files**: `/presentation/scenes/create-position.scene.ts`, `/presentation/scenes/position-detail.scene.ts`
  - **Effort**: 1 hour
  - **Owner**: Backend Developer

---

### **Phase 7: Validation Improvements**

**Estimated Total: 5 hours**

- [ ] **Task 7.1**: Create `UserValidator` class for complex validation logic
  - **New File**: `/domain/user/user.validator.class.ts`
  - **Effort**: 2 hours
  - **Owner**: Backend Developer

- [ ] **Task 7.2**: Extract validation logic from entity methods to validator class
  - **Files**: `/domain/user/user.entity.ts`, `/domain/user/user.validator.class.ts`
  - **Effort**: 2 hours
  - **Owner**: Backend Developer

- [ ] **Task 7.3**: Update entity methods to use validator class
  - **File**: `/domain/user/user.entity.ts`
  - **Effort**: 1 hour
  - **Owner**: Backend Developer

---

### **Phase 8: Testing (Critical)**

**Estimated Total: 9 hours**

- [ ] **Task 8.1**: Create unit tests for `User` entity
  - **New File**: `/domain/user/__tests__/user.entity.spec.ts`
  - **Effort**: 4 hours
  - **Owner**: Backend Developer

- [ ] **Task 8.2**: Create unit tests for `UserRepository`
  - **New File**: `/infrastructure/database/repositories/__tests__/user.repository.spec.ts`
  - **Effort**: 5 hours
  - **Owner**: Backend Developer

---

### **Phase 9: Advanced Features (Optional)**

**Estimated Total: 13 hours**

- [ ] **Task 9.1**: Add domain events support to User entity
  - **New File**: `/domain/user/events.ts`
  - **Effort**: 3 hours
  - **Owner**: Backend Developer

- [ ] **Task 9.2**: Update entity methods to emit domain events
  - **File**: `/domain/user/user.entity.ts`
  - **Effort**: 2 hours
  - **Owner**: Backend Developer

- [ ] **Task 9.3**: Update repository to publish domain events after persistence
  - **File**: `/infrastructure/database/repositories/user.repository.ts`
  - **Effort**: 2 hours
  - **Owner**: Backend Developer

- [ ] **Task 9.4**: Add optimistic locking support (version field)
  - **Files**: `/domain/user/user.entity.ts`, `/db/schema.ts`, `/infrastructure/database/repositories/user.repository.ts`
  - **Effort**: 4 hours
  - **Owner**: Backend Developer

- [ ] **Task 9.5**: Create `UserDomainService` for complex operations
  - **New File**: `/domain/user/user.service.ts`
  - **Effort**: 2 hours
  - **Owner**: Backend Developer

---

### **Phase 10: Documentation & Cleanup**

**Estimated Total: 4 hours**

- [ ] **Task 10.1**: Add JSDoc comments to all User entity methods
  - **File**: `/domain/user/user.entity.ts`
  - **Effort**: 1 hour
  - **Owner**: Backend Developer

- [ ] **Task 10.2**: Add JSDoc comments to UserRepository methods
  - **File**: `/infrastructure/database/repositories/user.repository.ts`
  - **Effort**: 1 hour
  - **Owner**: Backend Developer

- [ ] **Task 10.3**: Create architecture documentation for user domain
  - **New File**: `/domain/user/README.md`
  - **Effort**: 1 hour
  - **Owner**: Backend Developer

- [ ] **Task 10.4**: Remove deprecated code and clean up imports
  - **Files**: Various
  - **Effort**: 1 hour
  - **Owner**: Backend Developer

---

## Total Estimated Effort

| Phase | Effort | Priority |
|-------|--------|----------|
| Phase 1: Schema & Database Alignment | 7 hours | Critical |
| Phase 2: Types & Constants Centralization | 4 hours | High |
| Phase 3: Add Referral Support | 3 hours | Medium |
| Phase 4: Repository Enhancements | 12 hours | High |
| Phase 5: Remove Direct Schema Usage | 10 hours | High |
| Phase 6: Update BotContext | 8 hours | Critical |
| Phase 7: Validation Improvements | 5 hours | Medium |
| Phase 8: Testing | 9 hours | Critical |
| Phase 9: Advanced Features | 13 hours | Low |
| Phase 10: Documentation & Cleanup | 4 hours | Medium |
| **TOTAL** | **75 hours** | |

---

## Priority Recommendations

### **Sprint 1 (Critical - Do First)**
- Phase 1: Schema & Database Alignment
- Phase 6: Update BotContext to Use Only Entity
- Phase 8: Testing (at least Task 8.1)

### **Sprint 2 (High Priority)**
- Phase 2: Types & Constants Centralization
- Phase 4: Repository Enhancements (Tasks 4.1-4.3)
- Phase 5: Remove Direct Schema Usage

### **Sprint 3 (Medium Priority)**
- Phase 3: Add Referral Support
- Phase 7: Validation Improvements
- Phase 10: Documentation & Cleanup

### **Sprint 4 (Optional/Future)**
- Phase 4: Repository Enhancements (Task 4.4 - Caching)
- Phase 9: Advanced Features

---

## Breaking Changes Warning

The following tasks introduce **BREAKING CHANGES** and require careful coordination:

1. **Task 6.1-6.2**: Removing `ctx.user` from `BotContext` will break all code that uses it.
2. **Task 1.1-1.3**: Database schema changes require migration and may need data backfill.
3. **Task 5.2-5.3**: Refactoring services will change their APIs.

**Mitigation Strategy:**
- Use feature flags to gradually roll out changes.
- Maintain backward compatibility temporarily with deprecation warnings.
- Coordinate with team on deployment timing.
- Ensure comprehensive testing before merging.

---

## Additional Recommendations

### **Security Enhancements**
1. Add rate limiting to user creation/updates to prevent abuse.
2. Add audit logging for sensitive user preference changes.
3. Consider adding user IP address tracking for security monitoring.
4. Implement user account locking mechanism for suspicious activity.

### **Performance Optimization**
1. Implement database connection pooling tuning for user queries.
2. Add database indexes on frequently queried columns (telegramId, walletAddress).
3. Consider read replicas for user lookups if load is high.

### **Monitoring & Observability**
1. Add metrics for user creation rate, update frequency.
2. Add alerts for failed user operations.
3. Track user preference change patterns for analytics.

---

## Conclusion

This comprehensive plan addresses all identified issues with the user domain implementation. Following this plan will result in:

- ✅ Full alignment between schema and entity
- ✅ Consistent use of domain entities across the codebase
- ✅ Improved repository implementation with error handling and caching
- ✅ Centralized types and constants
- ✅ Better validation and security
- ✅ Comprehensive test coverage
- ✅ Cleaner, more maintainable code following clean architecture principles

**Recommended Approach**: Tackle phases in order of priority, starting with critical items in Sprint 1. Each phase builds on the previous, so sequential completion is advised.

**Estimated Timeline**: 
- With 1 dedicated developer: ~2.5 weeks (75 hours)
- With 2 developers working in parallel: ~1.5 weeks
- Recommended pace: Complete 1-2 phases per week to maintain code quality

---

**Document Version**: 1.0  
**Date**: December 2024  
**Status**: Ready for Implementation
