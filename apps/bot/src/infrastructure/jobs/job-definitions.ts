// Job definitions and names for background processing
// Documenting job purposes and data structures

// Position monitoring job: checks on-chain position status and triggers notifications/rebalancing if needed
export const JOB_POSITION_MONITOR = "position-monitor" as const;
export interface PositionMonitorJobData {
  userId: string;
  positionId: string;
}

// Rebalance execution job: performs a rebalance flow for a position
export const JOB_REBALANCE = "rebalance" as const;
export interface RebalanceJobData {
  userId: string;
  positionId: string;
  userAddress: string; // wallet public key
  walletId?: string; // optional
  strategy?: string; // optional strategy override
  reason?: string; // diagnostic reason (out_of_range, threshold_exceeded, manual, etc.)
}

// Notification job: sends a notification to a user via Telegram
export const JOB_NOTIFICATION = "notification" as const;
export type NotificationType = "price" | "rebalance" | "general" | "position";

export interface NotificationMessagePayload {
  text: string;
  parseMode?: "Markdown" | "MarkdownV2" | "HTML";
  disableLinkPreview?: boolean;
}

export interface NotificationJobData {
  userId: string;
  notification: {
    type: NotificationType;
    title?: string;
    message?: string;
    messages?: NotificationMessagePayload[];
  };
}

// Transaction confirmation job: polls/queries chain for a tx signature confirmation and updates persistence
export const JOB_TX_CONFIRM = "transaction-confirm" as const;
export interface TransactionConfirmJobData {
  signature: string;
  operationType:
    | "CREATE_POSITION"
    | "CLOSE_POSITION"
    | "ADD_LIQUIDITY"
    | "REMOVE_LIQUIDITY"
    | "CLAIM_FEES"
    | "REBALANCE";
  userId: string;
  // Optional hints for faster post-confirm updates
  positionId?: string;
  positionAddress?: string;
  // Allow workers to implement timeout/retry strategies
  submittedAt?: number; // epoch ms
}

export type KnownJobNames =
  | typeof JOB_POSITION_MONITOR
  | typeof JOB_REBALANCE
  | typeof JOB_NOTIFICATION
  | typeof JOB_TX_CONFIRM;

export type KnownJobDataMap = {
  [JOB_POSITION_MONITOR]: PositionMonitorJobData;
  [JOB_REBALANCE]: RebalanceJobData;
  [JOB_NOTIFICATION]: NotificationJobData;
  [JOB_TX_CONFIRM]: TransactionConfirmJobData;
};
