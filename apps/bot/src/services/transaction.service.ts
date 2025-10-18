import { ITransactionService } from '@/application/position/create-position.use-case';
import { WalletService } from './wallet.service';
import { findUserById } from '@/db/queries';
import { TransactionInstruction, AddressLookupTableAccount } from '@solana/web3.js';

/**
 * Transaction service that submits built instructions via Privy wallet signing
 */
export class PrivyTransactionService implements ITransactionService {
  async submit(built: any, context: { userId: string; walletId?: string; userAddress: string }): Promise<string> {
    const user = await findUserById(context.userId);
    if (!user) throw new Error('User not found for transaction submission');

    // Adapter metadata may provide a flat instructions array or grouped actions
    const instructions: TransactionInstruction[] = [];
    const luts: AddressLookupTableAccount[] = [];

    // Common case: built.instructions is an array
    if (Array.isArray(built?.instructions)) {
      for (const ix of built.instructions) instructions.push(ix as TransactionInstruction);
    }

    // Rebalance case where metadata groups close/create
    if (built?.close?.instructions) {
      for (const ix of built.close.instructions) instructions.push(ix as TransactionInstruction);
    }
    if (built?.create?.instructions) {
      for (const ix of built.create.instructions) instructions.push(ix as TransactionInstruction);
    }

    if (instructions.length === 0) {
      throw new Error('No instructions provided for transaction submission');
    }

    const sig = await WalletService.signAndSendTransaction(user, instructions, [], luts);
    return sig;
  }
}
