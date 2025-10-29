/**
 * FlowRepository Tests
 */

import { describe, it, expect, beforeEach } from "vitest";

vi.mock("@/db", () => {
  const records = new Map<string, any>();

  const db = {
    insert: vi.fn(() => ({
      values: vi.fn(async (data: any) => {
        records.set(data.id, { ...data });
        return [data];
      }),
    })),
    update: vi.fn(() => ({
      set: (values: any) => ({
        where: async (condition: any) => {
          const record = records.get(condition.value);
          if (record) {
            Object.assign(record, values);
          }
          return [record];
        },
      }),
    })),
    query: {
      pendingTransactions: {
        findFirst: vi.fn(async ({ where }: any = {}) => {
          if (!where) {
            return records.values().next().value ?? null;
          }

          const value = where.value;
          if (where.column === "id") {
            return records.get(value) ?? null;
          }

          if (where.column === "idempotencyKey") {
            return Array.from(records.values()).find((record) => record.idempotencyKey === value) ?? null;
          }

          return null;
        }),
      },
    },
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(async () => Array.from(records.values())),
      })),
    })),
  };

  const pendingTransactions = {
    id: "id",
    idempotencyKey: "idempotencyKey",
  } as any;

  return { db, pendingTransactions, __records: records };
});

vi.mock("drizzle-orm", () => ({
  eq: (column: any, value: any) => ({ column, value }),
}));

import { FlowRepository } from "../flow-state-machine";
import { FlowType, CreatePositionState } from "../flow-types";

let repository: FlowRepository;
let records: Map<string, any>;

beforeEach(async () => {
  repository = new FlowRepository();
  const dbModule = await import("@/db");
  records = dbModule.__records;
  records.clear();
});

describe("FlowRepository", () => {
  const baseParams = () => ({
    userId: "user-1",
    walletAddress: "wallet-1",
    flowType: FlowType.CREATE_POSITION,
    intent: "pool-1",
    metadata: {
      initialState: CreatePositionState.VALIDATING,
      checkpointData: {
        poolAddress: "pool-1",
      },
    },
  });

  it("creates a new flow record", async () => {
    const flow = await repository.create(baseParams());

    expect(flow).toBeDefined();
    expect(flow.flowStatus).toBe("PENDING");
    expect(records.size).toBe(1);
  });

  it("retrieves flow by id", async () => {
    const flow = await repository.create(baseParams());
    const found = await repository.findById(flow.id);

    expect(found).not.toBeNull();
    expect(found!.id).toBe(flow.id);
  });

  it("retrieves flow by idempotency key", async () => {
    const flow = await repository.create(baseParams());
    const found = await repository.findByIdempotencyKey(flow.idempotencyKey);

    expect(found).not.toBeNull();
    expect(found!.id).toBe(flow.id);
  });

  it("updates flow record", async () => {
    const flow = await repository.create(baseParams());
    flow.signature = "signature-123";
    flow.status = "PROCESSING" as any;
    flow.currentState = CreatePositionState.BUILDING_TX;
    await repository.update(flow);

    const updated = await repository.findById(flow.id);
    expect(updated).toBeDefined();
    expect(updated!.signature).toBe("signature-123");
    expect(updated!.currentState).toBe(CreatePositionState.BUILDING_TX);
    expect(updated!.status).toBe("PROCESSING");
  });

  it("marks flow as completed", async () => {
    const flow = await repository.create(baseParams());
    await repository.markCompleted(flow.id);

    const updated = await repository.findById(flow.id);
    expect(updated).toBeDefined();
    expect(updated!.status).toBe("COMPLETED");
  });

  it("marks flow as failed", async () => {
    const flow = await repository.create(baseParams());
    await repository.markFailed(flow.id, "failure");

    const updated = await repository.findById(flow.id);
    expect(updated).toBeDefined();
    expect(updated!.status).toBe("FAILED");
  });

  it("marks flow as compensating", async () => {
    const flow = await repository.create(baseParams());
    await repository.markCompensating(flow.id);

    const updated = await repository.findById(flow.id);
    expect(updated).toBeDefined();
    expect(updated!.status).toBe("COMPENSATING");
  });
});
