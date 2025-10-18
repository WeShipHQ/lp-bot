export interface TransactionResult {
  success: boolean;
  signature?: string;
  error?: string;
  metadata?: Record<string, any>;
}

export type TransactionStatus = 'PENDING' | 'CONFIRMED' | 'FAILED';

export type TransactionType = 
  | 'DEPOSIT'
  | 'WITHDRAW'
  | 'REBALANCE'
  | 'FEE_COLLECTION'
  | 'CREATE_POSITION'
  | 'CLOSE_POSITION'
  | 'CLAIM_FEES';
