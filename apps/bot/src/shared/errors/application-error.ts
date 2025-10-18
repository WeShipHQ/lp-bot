export class ApplicationError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly statusCode?: number
  ) {
    super(message);
    this.name = 'ApplicationError';
    Object.setPrototypeOf(this, ApplicationError.prototype);
  }
}

export class NotFoundError extends ApplicationError {
  constructor(message: string, code?: string) {
    super(message, code, 404);
    this.name = 'NotFoundError';
    Object.setPrototypeOf(this, NotFoundError.prototype);
  }
}

export class UnauthorizedError extends ApplicationError {
  constructor(message: string, code?: string) {
    super(message, code, 401);
    this.name = 'UnauthorizedError';
    Object.setPrototypeOf(this, UnauthorizedError.prototype);
  }
}

export class RateLimitError extends ApplicationError {
  constructor(message: string, code?: string) {
    super(message, code, 429);
    this.name = 'RateLimitError';
    Object.setPrototypeOf(this, RateLimitError.prototype);
  }
}

export class ForbiddenError extends ApplicationError {
  constructor(message: string, code?: string) {
    super(message, code, 403);
    this.name = 'ForbiddenError';
    Object.setPrototypeOf(this, ForbiddenError.prototype);
  }
}

export class BadRequestError extends ApplicationError {
  constructor(message: string, code?: string) {
    super(message, code, 400);
    this.name = 'BadRequestError';
    Object.setPrototypeOf(this, BadRequestError.prototype);
  }
}
