export class InfrastructureError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'InfrastructureError';
    Object.setPrototypeOf(this, InfrastructureError.prototype);
  }
}

export class DatabaseError extends InfrastructureError {
  constructor(message: string, code?: string, cause?: Error) {
    super(message, code, cause);
    this.name = 'DatabaseError';
    Object.setPrototypeOf(this, DatabaseError.prototype);
  }
}

export class ExternalApiError extends InfrastructureError {
  constructor(
    message: string,
    public readonly apiName?: string,
    code?: string,
    cause?: Error
  ) {
    super(message, code, cause);
    this.name = 'ExternalApiError';
    Object.setPrototypeOf(this, ExternalApiError.prototype);
  }
}

export class CacheError extends InfrastructureError {
  constructor(message: string, code?: string, cause?: Error) {
    super(message, code, cause);
    this.name = 'CacheError';
    Object.setPrototypeOf(this, CacheError.prototype);
  }
}

export class BlockchainError extends InfrastructureError {
  constructor(message: string, code?: string, cause?: Error) {
    super(message, code, cause);
    this.name = 'BlockchainError';
    Object.setPrototypeOf(this, BlockchainError.prototype);
  }
}

export class TransactionError extends InfrastructureError {
  constructor(
    message: string,
    public readonly signature?: string,
    code?: string,
    cause?: Error
  ) {
    super(message, code, cause);
    this.name = 'TransactionError';
    Object.setPrototypeOf(this, TransactionError.prototype);
  }
}

export class OptimisticLockError extends InfrastructureError {
  constructor(message: string, code = 'OPTIMISTIC_LOCK_FAILED', cause?: Error) {
    super(message, code, cause);
    this.name = 'OptimisticLockError';
    Object.setPrototypeOf(this, OptimisticLockError.prototype);
  }
}
