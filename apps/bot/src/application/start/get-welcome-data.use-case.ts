import { WelcomeData, WalletDataFetchError } from '../../domain/start';

export interface GetWelcomeDataRequest {
  walletAddress?: string;
  referralLink?: string;
}

export interface GetWelcomeDataResponse {
  welcomeData: WelcomeData;
}

export interface SolanaService {
  getBalance(walletAddress: string): Promise<number>;
  getSolPrice(): Promise<number>;
}

export class GetWelcomeDataUseCase {
  constructor(
    private readonly solanaService: SolanaService
  ) {}

  async execute(request: GetWelcomeDataRequest): Promise<GetWelcomeDataResponse> {
    if (!request.walletAddress) {
      const welcomeData = WelcomeData.createWalletCreating();
      return { welcomeData };
    }

    try {
      const [solBalance, solPrice] = await Promise.all([
        this.solanaService.getBalance(request.walletAddress),
        this.solanaService.getSolPrice(),
      ]);

      const welcomeData = WelcomeData.create({
        walletAddress: request.walletAddress,
        solBalance,
        solPrice,
        referralLink: request.referralLink,
      });

      return { welcomeData };
    } catch (error) {
      console.log("Failed to fetch wallet data:", error);
      
      // Return welcome data without balance information
      const welcomeData = WelcomeData.create({
        walletAddress: request.walletAddress,
        referralLink: request.referralLink,
        isWalletCreating: true,
      });

      return { welcomeData };
    }
  }
}