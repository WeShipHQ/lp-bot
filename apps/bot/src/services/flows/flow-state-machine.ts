/**
 * Flow State Machine
 * 
 * Generic state machine module that orchestrates flow execution for
 * CREATE, CLAIM, CLOSE, and REBALANCE operations. This enables
 * resumable, restartable flows with explicit states and checkpoints.
 */

import { db, pendingTransactions } from "@/db";
import {
  FlowContext,
  FlowEvent,
  FlowResult,
  FlowState,
  FlowType,
  generateIdempotencyKey,
  IdempotencyKeyParams,
} from "./flow-types";
import { eq } from "drizzle-orm";
import { logger } from "@/utils/logger";
import { v4 as uuidv4 } from "uuid";

type FlowStatus = "PENDING" | "PROCESSING" | "AWAITING" | "WAITING_CONFIRMATION" | "COMPLETED" | "FAILED" | "COMPENSATING";

interface FlowCheckpoint {
  currentState: FlowState;
  currentStep?: string;
  timestamps: {
    startedAt: string;
    lastTransitionAt: string;
    completedAt?: string;
  };
  retryCount: number;
  maxRetries: number;
  signatures: string[];
  currentSignature?: string;
  checkpointData?: Record<string, any>;
  errors: {
    state: FlowState;
    event: FlowEvent;
    error: string;
    errorCode?: string;
    timestamp: string;
    retryable: boolean;
  }[];
  lastError?: {
    state: FlowState;
    event: FlowEvent;
    error: string;
    errorCode?: string;
    timestamp: string;
    retryable: boolean;
  };
  pendingActions?: string[];
}

type FlowStepHandler = (context: FlowContext) => Promise<FlowResult>;

interface FlowStep {
  name: string;
  state: FlowState;
  handler: FlowStepHandler;
  compensation?: FlowStepHandler;
  asyncWait?: boolean; // If true, step transitions to waiting state and expects external event
}

interface FlowDefinition {
  flowType: FlowType;
  steps: FlowStep[];
  maxRetries?: number;
  timeoutMs?: number;
}

interface FlowStartParams {
  userId: string;
  walletAddress: string;
  walletId?: string;
  flowType: FlowType;
  metadata: Record<string, any>;
  intent: string;
  maxRetries?: number;
  timeoutMs?: number;
}

interface FlowRepositoryEntry {
  id: string;
  flowType: FlowType;
  signature: string;
  userId: string;
  walletAddress: string;
  walletId?: string;
  idempotencyKey: string;
  currentState: FlowState;
  status: FlowStatus;
  checkpoint: FlowCheckpoint;
  metadata: Record<string, any>;
  timeoutMs?: number;
  flowStartedAt?: string;
  flowLastTransitionAt?: string;
  flowExpiresAt?: string | null;
}

export class FlowRepository {
  async findById(flowId: string): Promise<FlowRepositoryEntry | null> {
    const record = await db.query.pendingTransactions.findFirst({
      where: eq(pendingTransactions.id, flowId),
    });

    if (!record) return null;

    return {
      id: record.id,
      flowType: record.operationType as FlowType,
      signature: record.signature,
      userId: record.userId,
      walletAddress: record.metadata?.walletAddress ?? "",
      walletId: record.metadata?.walletId,
      idempotencyKey: record.idempotencyKey ?? "",
      currentState: record.flowState as FlowState,
      status: (record.flowStatus as FlowStatus) ?? "PENDING",
      checkpoint: (record.flowCheckpoint as FlowCheckpoint) ?? {
        currentState: record.flowState as FlowState,
        timestamps: {
          startedAt: record.createdAt ?? new Date().toISOString(),
          lastTransitionAt: record.updatedAt ?? new Date().toISOString(),
          completedAt: record.flowCompletedAt ?? undefined,
        },
        retryCount: record.retryCount ?? 0,
        maxRetries: record.maxRetries ?? 3,
        signatures: record.metadata?.signatures ?? [],
        checkpointData: record.flowCheckpoint?.checkpointData ?? {},
        errors: record.metadata?.errors ?? [],
        lastError: record.metadata?.lastError,
      },
      metadata: (record.metadata as Record<string, any>) ?? {},
      timeoutMs: record.flowTimeoutMs ?? undefined,
      flowStartedAt: record.flowStartedAt ?? undefined,
      flowLastTransitionAt: record.flowLastTransitionAt ?? undefined,
      flowExpiresAt: record.flowExpiresAt ?? undefined,
    };
  }

  async findByIdempotencyKey(idempotencyKey: string): Promise<FlowRepositoryEntry | null> {
    const record = await db.query.pendingTransactions.findFirst({
      where: eq(pendingTransactions.idempotencyKey, idempotencyKey),
    });

    if (!record) return null;

    return {
      id: record.id,
      flowType: record.operationType as FlowType,
      signature: record.signature,
      userId: record.userId,
      walletAddress: record.metadata?.walletAddress ?? "",
      walletId: record.metadata?.walletId,
      idempotencyKey: record.idempotencyKey ?? idempotencyKey,
      currentState: record.flowState as FlowState,
      status: (record.flowStatus as FlowStatus) ?? "PENDING",
      checkpoint: (record.flowCheckpoint as FlowCheckpoint) ?? {
        currentState: record.flowState as FlowState,
        timestamps: {
          startedAt: record.createdAt ?? new Date().toISOString(),
          lastTransitionAt: record.updatedAt ?? new Date().toISOString(),
          completedAt: record.flowCompletedAt ?? undefined,
        },
        retryCount: record.retryCount ?? 0,
        maxRetries: record.maxRetries ?? 3,
        signatures: record.metadata?.signatures ?? [],
        checkpointData: record.flowCheckpoint?.checkpointData ?? {},
        errors: record.metadata?.errors ?? [],
        lastError: record.metadata?.lastError,
      },
      metadata: (record.metadata as Record<string, any>) ?? {},
      timeoutMs: record.flowTimeoutMs ?? undefined,
      flowStartedAt: record.flowStartedAt ?? undefined,
      flowLastTransitionAt: record.flowLastTransitionAt ?? undefined,
      flowExpiresAt: record.flowExpiresAt ?? undefined,
    };
  }

  async create(params: FlowStartParams): Promise<FlowRepositoryEntry> {
    const flowId = uuidv4();
    const idempotencyKey = generateIdempotencyKey({
      userId: params.userId,
      flowType: params.flowType,
      intent: params.intent,
    });

    const now = new Date().toISOString();

    const checkpoint: FlowCheckpoint = {
      currentState: params.metadata?.initialState ?? "INITIATED",
      timestamps: {
        startedAt: now,
        lastTransitionAt: now,
      },
      retryCount: 0,
      maxRetries: params.maxRetries ?? 3,
      signatures: [],
      checkpointData: params.metadata?.checkpointData ?? {},
      errors: [],
    };

    await db.insert(pendingTransactions).values({
      id: flowId,
      signature: params.metadata?.signature ?? uuidv4(),
      operationType: params.flowType,
      userId: params.userId,
      status: "PENDING",
      metadata: {
        ...params.metadata,
        walletAddress: params.walletAddress,
        walletId: params.walletId,
      },
      maxRetries: params.maxRetries ?? 3,
      idempotencyKey,
      flowState: params.metadata?.initialState ?? "INITIATED",
      flowCheckpoint: checkpoint,
      flowStatus: "PENDING",
      flowTimeoutMs: params.timeoutMs ?? 10 * 60 * 1000,
      flowStartedAt: now,
      flowLastTransitionAt: now,
      flowExpiresAt: new Date(Date.now() + (params.timeoutMs ?? 10 * 60 * 1000)).toISOString(),
    });

    return {
      id: flowId,
      flowType: params.flowType,
      signature: params.metadata?.signature ?? uuidv4(),
      userId: params.userId,
      walletAddress: params.walletAddress,
      walletId: params.walletId,
      idempotencyKey,
      currentState: checkpoint.currentState,
      status: "PENDING",
      checkpoint,
      metadata: params.metadata,
      timeoutMs: params.timeoutMs ?? 10 * 60 * 1000,
      flowStartedAt: now,
      flowLastTransitionAt: now,
      flowExpiresAt: new Date(Date.now() + (params.timeoutMs ?? 10 * 60 * 1000)).toISOString(),
    };
  }

  async update(flow: FlowRepositoryEntry): Promise<void> {
    const now = new Date().toISOString();

    const metadata = {
      ...flow.metadata,
      signature: flow.signature,
      lastState: flow.currentState,
      flowStatus: flow.status,
    };

    flow.metadata = metadata;

    await db
      .update(pendingTransactions)
      .set({
        signature: flow.signature,
        status: this.mapFlowStatusToLegacy(flow.status),
        flowState: flow.currentState,
        flowStatus: flow.status,
        flowCheckpoint: flow.checkpoint,
        metadata,
        retryCount: flow.checkpoint.retryCount,
        maxRetries: flow.checkpoint.maxRetries,
        updatedAt: now,
        flowLastTransitionAt: now,
        flowCompletedAt:
          flow.status === "COMPLETED" ? now : flow.checkpoint.timestamps.completedAt,
        flowExpiresAt:
          flow.status === "COMPLETED" || flow.status === "FAILED"
            ? null
            : new Date(Date.now() + (flow.timeoutMs ?? 10 * 60 * 1000)).toISOString(),
      })
      .where(eq(pendingTransactions.id, flow.id));
  }

  async markCompleted(flowId: string): Promise<void> {
    const now = new Date().toISOString();
    await db
      .update(pendingTransactions)
      .set({
        flowState: "COMPLETED",
        flowStatus: "COMPLETED",
        flowCompletedAt: now,
        flowExpiresAt: null,
        status: "COMPLETED",
        updatedAt: now,
      })
      .where(eq(pendingTransactions.id, flowId));
  }

  async markFailed(flowId: string, error: string): Promise<void> {
    const now = new Date().toISOString();
    await db
      .update(pendingTransactions)
      .set({
        flowState: "FAILED",
        flowStatus: "FAILED",
        flowCompletedAt: now,
        errorMessage: error,
        status: "FAILED",
        updatedAt: now,
      })
      .where(eq(pendingTransactions.id, flowId));
  }

  async markCompensating(flowId: string): Promise<void> {
    await db
      .update(pendingTransactions)
      .set({ flowState: "COMPENSATING", flowStatus: "COMPENSATING" })
      .where(eq(pendingTransactions.id, flowId));
  }

  private mapFlowStatusToLegacy(flowStatus: FlowStatus): string {
    switch (flowStatus) {
      case "COMPLETED":
        return "COMPLETED";
      case "FAILED":
        return "FAILED";
      case "COMPENSATING":
        return "RETRY";
      default:
        return "PENDING";
    }
  }
}

export class FlowStateMachine {
  private readonly definition: FlowDefinition;
  private readonly repository: FlowRepository;
  private readonly flowId: string;

  constructor(definition: FlowDefinition, repository: FlowRepository, flowId: string) {
    this.definition = definition;
    this.repository = repository;
    this.flowId = flowId;
  }

  static async start(definition: FlowDefinition, repository: FlowRepository, params: FlowStartParams): Promise<FlowStateMachine> {
    const idempotencyKey = generateIdempotencyKey({
      userId: params.userId,
      flowType: definition.flowType,
      intent: params.intent,
    });

    const existing = await repository.findByIdempotencyKey(idempotencyKey);
    if (existing && existing.status !== "COMPLETED" && existing.status !== "FAILED") {
      logger.info({ flowId: existing.id, flowType: definition.flowType }, "[FlowStateMachine] Resuming existing flow");
      return new FlowStateMachine(definition, repository, existing.id);
    }

    const flow = existing ?? (await repository.create(params));

    logger.info({ flowId: flow.id, flowType: definition.flowType }, "[FlowStateMachine] Flow started");

    return new FlowStateMachine(definition, repository, flow.id);
  }

  async run(): Promise<FlowResult> {
    const flow = await this.repository.findById(this.flowId);
    if (!flow) {
      return { success: false, error: "Flow not found" };
    }

    if (flow.status === "COMPLETED") {
      logger.info({ flowId: flow.id }, "[FlowStateMachine] Flow already completed");
      return { success: true, flowId: flow.id, state: "COMPLETED" };
    }

    if (flow.status === "FAILED") {
      logger.warn({ flowId: flow.id }, "[FlowStateMachine] Flow previously failed");
      return { success: false, flowId: flow.id, state: flow.currentState, error: flow.checkpoint.lastError?.error };
    }

    const step = this.definition.steps.find((s) => s.state === flow.currentState);

    if (!step) {
      logger.error({ flowId: flow.id, state: flow.currentState }, "[FlowStateMachine] No step definition for state");
      await this.repository.markFailed(flow.id, `No step definition for state ${flow.currentState}`);
      return { success: false, flowId: flow.id, state: flow.currentState, error: "Invalid state" };
    }

    try {
      logger.info({ flowId: flow.id, state: flow.currentState, step: step.name }, "[FlowStateMachine] Executing step");

      const result = await step.handler({
        flowId: flow.id,
        flowType: this.definition.flowType,
        currentState: flow.currentState,
        userId: flow.userId,
        walletAddress: flow.walletAddress,
        walletId: flow.walletId,
        idempotencyKey: flow.idempotencyKey,
        startedAt: new Date(flow.checkpoint.timestamps.startedAt),
        lastTransitionAt: new Date(flow.checkpoint.timestamps.lastTransitionAt),
        retryCount: flow.checkpoint.retryCount,
        maxRetries: flow.checkpoint.maxRetries,
        signatures: flow.checkpoint.signatures,
        currentSignature: flow.checkpoint.currentSignature,
        checkpointData: flow.checkpoint.checkpointData,
        errors: flow.checkpoint.errors,
        lastError: flow.checkpoint.lastError,
      });

      if (result.success) {
        const nextState = result.state ?? this.getNextState(flow.currentState);

        flow.currentState = nextState;
        flow.status = this.getStatusForState(nextState);
        flow.checkpoint.currentState = nextState;
        flow.checkpoint.timestamps.lastTransitionAt = new Date().toISOString();

        if (result.signature) {
          flow.signature = result.signature;
          flow.checkpoint.currentSignature = result.signature;
          if (!flow.checkpoint.signatures.includes(result.signature)) {
            flow.checkpoint.signatures.push(result.signature);
          }
          flow.metadata = {
            ...flow.metadata,
            signature: result.signature,
          };
        }

        if (result.data) {
          flow.checkpoint.checkpointData = {
            ...(flow.checkpoint.checkpointData ?? {}),
            ...result.data,
          };
        }

        if (nextState === "COMPLETED") {
          flow.status = "COMPLETED";
          flow.checkpoint.timestamps.completedAt = new Date().toISOString();
          await this.repository.markCompleted(flow.id);
        } else {
          await this.repository.update(flow);
        }

        logger.info({ flowId: flow.id, nextState }, "[FlowStateMachine] Step completed");
        return { success: true, flowId: flow.id, state: nextState, signature: result.signature, data: result.data };
      } else {
        flow.checkpoint.retryCount += 1;
        flow.checkpoint.lastError = {
          state: flow.currentState,
          event: FlowEvent.FAIL,
          error: result.error ?? "Unknown error",
          timestamp: new Date().toISOString(),
          retryable: flow.checkpoint.retryCount < flow.checkpoint.maxRetries,
        };
        flow.checkpoint.errors.push(flow.checkpoint.lastError);

        if (flow.checkpoint.retryCount >= flow.checkpoint.maxRetries) {
          await this.repository.markFailed(flow.id, result.error ?? "Flow failed");
          return { success: false, flowId: flow.id, state: flow.currentState, error: result.error };
        }

        await this.repository.update(flow);
        logger.warn({ flowId: flow.id, retryCount: flow.checkpoint.retryCount }, "[FlowStateMachine] Step failed - will retry");
        return { success: false, flowId: flow.id, state: flow.currentState, error: result.error };
      }
    } catch (error) {
      logger.error({ flowId: flow.id, state: flow.currentState, error }, "[FlowStateMachine] Step execution error");

      flow.checkpoint.retryCount += 1;
      flow.checkpoint.lastError = {
        state: flow.currentState,
        event: FlowEvent.FAIL,
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
        retryable: flow.checkpoint.retryCount < flow.checkpoint.maxRetries,
      };
      flow.checkpoint.errors.push(flow.checkpoint.lastError);

      if (flow.checkpoint.retryCount >= flow.checkpoint.maxRetries) {
        await this.repository.markFailed(flow.id, flow.checkpoint.lastError.error);
        return { success: false, flowId: flow.id, state: flow.currentState, error: flow.checkpoint.lastError.error };
      }

      await this.repository.update(flow);
      return { success: false, flowId: flow.id, state: flow.currentState, error: flow.checkpoint.lastError.error };
    }
  }

  async trigger(event: FlowEvent, data?: Record<string, any>): Promise<FlowResult> {
    const flow = await this.repository.findById(this.flowId);
    if (!flow) {
      return { success: false, error: "Flow not found" };
    }

    logger.info({ flowId: flow.id, state: flow.currentState, event }, "[FlowStateMachine] Event triggered");

    // Determine transition based on event
    const nextState = this.getStateForEvent(flow.currentState, event);
    if (!nextState) {
      logger.warn({ flowId: flow.id, state: flow.currentState, event }, "[FlowStateMachine] No transition defined for event");
      return { success: false, error: `No transition defined for event ${event}` };
    }

    flow.currentState = nextState;
    flow.status = this.getStatusForState(nextState);
    flow.checkpoint.currentState = nextState;
    flow.checkpoint.timestamps.lastTransitionAt = new Date().toISOString();

    if (data) {
      flow.checkpoint.checkpointData = {
        ...(flow.checkpoint.checkpointData ?? {}),
        ...data,
      };
    }

    if (nextState === "COMPLETED") {
      flow.status = "COMPLETED";
      flow.checkpoint.timestamps.completedAt = new Date().toISOString();
      await this.repository.markCompleted(flow.id);
      logger.info({ flowId: flow.id }, "[FlowStateMachine] Flow completed via event");
      return { success: true, flowId: flow.id, state: nextState };
    }

    await this.repository.update(flow);
    return { success: true, flowId: flow.id, state: nextState };
  }

  private getNextState(currentState: FlowState): FlowState {
    const index = this.definition.steps.findIndex((step) => step.state === currentState);
    if (index === -1 || index === this.definition.steps.length - 1) {
      return "COMPLETED";
    }
    return this.definition.steps[index + 1].state;
  }

  private getStatusForState(state: FlowState): FlowStatus {
    switch (state) {
      case "INITIATED":
      case "VALIDATING":
      case "BUILDING_TX":
      case "CLOSING_OLD_POSITION":
      case "CLAIMING_FEES":
      case "CREATING_NEW_POSITION":
        return "PROCESSING";
      case "TX_SUBMITTED":
      case "TX_CONFIRMING":
      case "TX_CONFIRMED":
      case "OLD_POSITION_CLOSED":
        return "WAITING_CONFIRMATION";
      case "PERSISTING":
      case "COMPLETED":
        return "COMPLETED";
      case "FAILED":
        return "FAILED";
      case "COMPENSATING":
        return "COMPENSATING";
      default:
        return "PROCESSING";
    }
  }

  private getStateForEvent(currentState: FlowState, event: FlowEvent): FlowState | null {
    switch (event) {
      case FlowEvent.VALIDATION_SUCCESS:
        return "VALIDATING";
      case FlowEvent.TX_SUBMITTED:
        return "TX_SUBMITTED";
      case FlowEvent.TX_CONFIRMED:
        return "TX_CONFIRMED";
      case FlowEvent.SWAP_COMPLETED:
        return "SWAP_CONFIRMED";
      case FlowEvent.PERSIST_SUCCESS:
        return "PERSISTING";
      case FlowEvent.COMPLETE:
        return "COMPLETED";
      case FlowEvent.FAIL:
        return "FAILED";
      default:
        return null;
    }
  }
}

export class FlowService {
  private readonly repository: FlowRepository;

  constructor(repository?: FlowRepository) {
    this.repository = repository ?? new FlowRepository();
  }

  async startFlow(definition: FlowDefinition, params: FlowStartParams): Promise<FlowStateMachine> {
    return FlowStateMachine.start(definition, this.repository, params);
  }

  async resumeFlow(definition: FlowDefinition, flowId: string): Promise<FlowStateMachine> {
    return new FlowStateMachine(definition, this.repository, flowId);
  }

  async trigger(flowId: string, event: FlowEvent, data?: Record<string, any>): Promise<FlowResult> {
    const machine = new FlowStateMachine({ flowType: FlowType.CREATE_POSITION, steps: [] }, this.repository, flowId);
    return machine.trigger(event, data);
  }

  async markCompleted(flowId: string): Promise<void> {
    await this.repository.markCompleted(flowId);
  }

  async markFailed(flowId: string, error: string): Promise<void> {
    await this.repository.markFailed(flowId, error);
  }

  async markCompensating(flowId: string): Promise<void> {
    await this.repository.markCompensating(flowId);
  }
}
