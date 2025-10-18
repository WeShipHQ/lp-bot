import { ApplicationError, BadRequestError, ForbiddenError, NotFoundError, RateLimitError, UnauthorizedError } from './application-error';
import { InfrastructureError, ExternalApiError, CacheError, BlockchainError, TransactionError, DatabaseError } from './infrastructure-error';
import { DomainError, ValidationError as DomainValidationError, InsufficientBalanceError } from '@/domain/shared/errors/domain-error';

export class ErrorHandler {
  handle(error: unknown, context?: Record<string, any>): { userMessage: string; logLevel: 'debug' | 'info' | 'warn' | 'error' } {
    // Map known application errors
    if (error instanceof NotFoundError) {
      return { userMessage: `❌ ${error.message}`, logLevel: 'info' };
    }
    if (error instanceof BadRequestError) {
      return { userMessage: `❌ ${error.message}`, logLevel: 'info' };
    }
    if (error instanceof UnauthorizedError) {
      return { userMessage: '❌ You are not authorized to perform this action.', logLevel: 'warn' };
    }
    if (error instanceof ForbiddenError) {
      return { userMessage: '❌ Access denied for this operation.', logLevel: 'warn' };
    }
    if (error instanceof RateLimitError) {
      return { userMessage: '⚠️ Too many requests. Please slow down and try again later.', logLevel: 'warn' };
    }

    // Map domain errors
    if (error instanceof DomainValidationError) {
      return { userMessage: `❌ ${error.message}`, logLevel: 'info' };
    }
    if (error instanceof InsufficientBalanceError) {
      return { userMessage: '❌ Insufficient balance to perform this action.', logLevel: 'info' };
    }
    if (error instanceof DomainError) {
      return { userMessage: `❌ ${error.message}`, logLevel: 'warn' };
    }

    // Map infrastructure errors
    if (error instanceof ExternalApiError) {
      return { userMessage: '⚠️ External service is currently unavailable. Please try again later.', logLevel: 'warn' };
    }
    if (error instanceof CacheError) {
      return { userMessage: '⚠️ Temporary caching issue. Please try again.', logLevel: 'debug' };
    }
    if (error instanceof BlockchainError) {
      return { userMessage: '⚠️ Network issue with Solana RPC. Please try again shortly.', logLevel: 'warn' };
    }
    if (error instanceof TransactionError) {
      return { userMessage: '❌ Transaction failed. Please try again or contact support.', logLevel: 'error' };
    }
    if (error instanceof DatabaseError) {
      return { userMessage: '⚠️ Temporary database issue. Please try again later.', logLevel: 'error' };
    }

    // Fallback for unknown errors
    const msg = (error as any)?.message || 'Something went wrong. Please try again later.';
    return { userMessage: `❌ ${msg}`, logLevel: 'error' };
  }
}

export const errorHandler = new ErrorHandler();
