export class DomainError extends Error {
  constructor(
    message: string,
    public readonly code?: string
  ) {
    super(message);
    this.name = 'DomainError';
    Object.setPrototypeOf(this, DomainError.prototype);
  }
}

export class ValidationError extends DomainError {
  constructor(message: string, code?: string) {
    super(message, code);
    this.name = 'ValidationError';
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

export class InvalidStateError extends DomainError {
  constructor(message: string, code?: string) {
    super(message, code);
    this.name = 'InvalidStateError';
    Object.setPrototypeOf(this, InvalidStateError.prototype);
  }
}

export class InvalidAmountError extends DomainError {
  constructor(message: string, code?: string) {
    super(message, code);
    this.name = 'InvalidAmountError';
    Object.setPrototypeOf(this, InvalidAmountError.prototype);
  }
}

export class InsufficientBalanceError extends DomainError {
  constructor(message: string, code?: string) {
    super(message, code);
    this.name = 'InsufficientBalanceError';
    Object.setPrototypeOf(this, InsufficientBalanceError.prototype);
  }
}
