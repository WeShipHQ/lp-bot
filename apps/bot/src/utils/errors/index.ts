/**
 * Error Resilience Framework
 * 
 * Exports all error types, utilities, and helpers for error handling.
 */

// Error Types
export * from "./error-types";

// Error Metadata & Telemetry
export * from "./error-metadata";

// Error Normalizer
export * from "./error-normalizer";

// Error Telemetry
export * from "./error-telemetry";

// Re-export legacy error handler for compatibility
export { errorHandler, ErrorHandler } from "@/shared/errors/error-handler";
