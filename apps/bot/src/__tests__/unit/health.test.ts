import { describe, it, expect, vi } from "vitest";
import { FastifyInstance } from "fastify";
import { registerHealthPlugin } from "../../plugins/health";

describe("Health Plugin", () => {
  it("should register health endpoints", async () => {
    // Mock FastifyInstance
    const mockApp = {
      get: vi.fn(),
    } as unknown as FastifyInstance;

    await registerHealthPlugin(mockApp);

    expect(mockApp.get).toHaveBeenCalledWith("/health", expect.any(Function));
    expect(mockApp.get).toHaveBeenCalledWith("/ready", expect.any(Function));
  });
});
