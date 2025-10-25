-- Add PENDING_SWAPS status to transaction_status_enum
-- This status is used when SOL auto-convert swaps are pending completion

ALTER TYPE transaction_status_enum ADD VALUE 'PENDING_SWAPS';

-- Add comment for documentation
COMMENT ON TYPE transaction_status_enum IS 'Add PENDING_SWAPS status for SOL auto-convert swaps';