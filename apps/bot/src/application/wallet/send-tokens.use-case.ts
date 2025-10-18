import { IUserRepository } from "@/domain/user/user.repository";
import { solanaService } from "@/services/solana.service";

export interface SendTokensParams {
  userId: string; // internal user id
  recipientAddress: string;
  amount: number; // in units for SOL or UI amount for SPL
  tokenAddress?: string; // undefined or 'SOL' => SOL transfer
}

export interface SendTokensResult {
  signature: string;
  actualAmount?: number; // for SOL when adjusted due to fees
}

export class SendTokensUseCase {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly solana = solanaService
  ) {}

  async execute(params: SendTokensParams): Promise<SendTokensResult> {
    const { userId, recipientAddress, amount, tokenAddress } = params;

    // Load user and wallet
    const user = await this.userRepository.findById(userId);
    if (!user) throw new Error("User not found");

    // Validate recipient
    if (!this.solana.validateAddress(recipientAddress)) {
      throw new Error("Invalid recipient address");
    }

    if (!tokenAddress || tokenAddress === "SOL") {
      // SOL transfer
      const res = await this.solana.transferSol({
        walletId: user.walletId,
        walletAddress: user.walletAddress,
        recipientAddress,
        amount,
      });
      return { signature: res.signature, actualAmount: res.actualAmount };
    } else {
      // SPL token transfer
      const { balance, decimals } = await this.solana.getTokenBalance(
        user.walletAddress,
        tokenAddress
      );

      if (balance < amount) throw new Error("Insufficient token balance");

      const { signature } = await this.solana.transferToken({
        walletId: user.walletId,
        walletAddress: user.walletAddress,
        recipientAddress,
        tokenAddress,
        amount,
        decimals,
      });

      return { signature };
    }
  }
}
