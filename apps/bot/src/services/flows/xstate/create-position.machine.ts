/**
 * Create Position XState Machine
 * 
 * Declarative state machine for position creation using XState.
 * Significantly reduces boilerplate while providing better type safety.
 */

import { createMachine, assign } from "xstate";
import { logger } from "@/utils/logger";

// Context type
export interface CreatePositionContext {
  // User context
  userId: string;
  walletAddress: string;
  walletId: string;
  
  // Position context
  poolAddress: string;
  dex: string;
  tokenA: any;
  tokenB: any;
  tokenAAmount: string;
  tokenBAmount: string;
  strategy?: string;
  depositMethod?: "sol_auto_convert" | "single_sided";
  solAmount?: number;
  autoRebalance?: boolean;
  rebalanceSession?: any;
  
  // Flow metadata
  flowId?: string;
  signature?: string;
  positionAddress?: string;
  error?: string;
  retryCount: number;
}

// Events
export type CreatePositionEvent =
  | { type: "VALIDATE" }
  | { type: "BUILD_TX" }
  | { type: "TX_SUBMITTED"; signature: string }
  | { type: "TX_CONFIRMED"; positionAddress: string }
  | { type: "PERSIST" }
  | { type: "ERROR"; error: string }
  | { type: "RETRY" };

/**
 * Create Position State Machine
 * 
 * Visual representation:
 * 
 * [idle] → VALIDATE → [validating]
 *   ↓
 * [buildingTx] → BUILD_TX → [txSubmitted]
 *   ↓
 * [txConfirming] → TX_CONFIRMED → [txConfirmed]
 *   ↓
 * [persisting] → PERSIST → [completed]
 * 
 * Any state can transition to [failed] on ERROR
 */
export const createPositionMachine = createMachine<CreatePositionContext, CreatePositionEvent>({
  id: "createPosition",
  initial: "idle",
  predictableActionArguments: true,
  context: {
    userId: "",
    walletAddress: "",
    walletId: "",
    poolAddress: "",
    dex: "",
    tokenA: null,
    tokenB: null,
    tokenAAmount: "",
    tokenBAmount: "",
    retryCount: 0,
  },
  states: {
    idle: {
      on: {
        VALIDATE: {
          target: "validating",
        },
      },
    },
    
    validating: {
      invoke: {
        id: "validateInputs",
        src: "validateInputs",
        onDone: {
          target: "buildingTx",
        },
        onError: {
          target: "failed",
          actions: assign({
            error: (_, event) => event.data.message,
          }),
        },
      },
    },
    
    buildingTx: {
      on: {
        TX_SUBMITTED: {
          target: "txSubmitted",
          actions: assign({
            signature: (_, event) => event.signature,
          }),
        },
        ERROR: {
          target: "failed",
          actions: assign({
            error: (_, event) => event.error,
          }),
        },
      },
    },
    
    txSubmitted: {
      // Waiting for external confirmation
      on: {
        TX_CONFIRMED: {
          target: "txConfirmed",
          actions: assign({
            positionAddress: (_, event) => event.positionAddress,
          }),
        },
        ERROR: {
          target: "failed",
          actions: assign({
            error: (_, event) => event.error,
          }),
        },
      },
    },
    
    txConfirmed: {
      on: {
        PERSIST: {
          target: "persisting",
        },
      },
    },
    
    persisting: {
      invoke: {
        id: "persistPosition",
        src: "persistPosition",
        onDone: {
          target: "completed",
        },
        onError: {
          target: "failed",
          actions: assign({
            error: (_, event) => event.data.message,
          }),
        },
      },
    },
    
    completed: {
      type: "final",
    },
    
    failed: {
      on: {
        RETRY: [
          {
            target: "validating",
            cond: "canRetry",
            actions: assign({
              retryCount: (ctx) => ctx.retryCount + 1,
            }),
          },
          {
            target: "failed",
          },
        ],
      },
    },
  },
}, {
  guards: {
    canRetry: (ctx) => ctx.retryCount < 3,
  },
  services: {
    validateInputs: async (ctx) => {
      logger.info({ flowId: ctx.flowId }, "[CreatePositionMachine] Validating inputs");
      
      if (!ctx.poolAddress) {
        throw new Error("Missing poolAddress");
      }
      
      if (!ctx.tokenA || !ctx.tokenB) {
        throw new Error("Missing token information");
      }
      
      if (!ctx.tokenAAmount || !ctx.tokenBAmount) {
        throw new Error("Missing token amounts");
      }
      
      return true;
    },
    
    persistPosition: async (ctx) => {
      logger.info({ flowId: ctx.flowId }, "[CreatePositionMachine] Persisting position");
      // Actual persistence handled by external worker
      return true;
    },
  },
});
