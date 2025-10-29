/**
 * Test Setup and Configuration
 * 
 * Global test setup for flow orchestration tests.
 */

import { beforeAll, afterAll, afterEach } from "vitest";

// Mock logger to suppress console output during tests
import { vi } from "vitest";

beforeAll(() => {
  // Mock logger
  vi.mock("@/utils/logger", () => ({
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
  }));
});

afterEach(() => {
  // Clear all mocks after each test
  vi.clearAllMocks();
});

afterAll(() => {
  // Cleanup
  vi.restoreAllMocks();
});
