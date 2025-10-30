// import { PrivyClient } from '@privy-io/server-auth';
// import { CONFIG } from '@/config';
// import { VersionedTransaction, Connection } from '@solana/web3.js';

// export class PrivyAdapter {
//   private readonly client: PrivyClient;

//   constructor() {
//     this.client = new PrivyClient(CONFIG.PRIVY.PRIVY_APP_ID, CONFIG.PRIVY.PRIVY_APP_SECRET, {
//       walletApi: { authorizationPrivateKey: CONFIG.PRIVY.PRIVY_AUTH_PRIVATE_KEY },
//     });
//   }

//   async authenticateUser(token: string) {
//     return this.client.verifyAuthToken(token);
//   }

//   async getWalletSigner(walletId: string) {
//     // returns a function that signs VersionedTransaction using Privy API
//     return {
//       sign: async (tx: VersionedTransaction) => {
//         const { signedTransaction } = await this.client.walletApi.solana.signTransaction({ walletId, transaction: tx });
//         if (!signedTransaction) throw new Error('Privy did not return signed transaction');
//         return signedTransaction as VersionedTransaction;
//       },
//     };
//   }

//   async refreshToken(refreshToken: string) {
//     return this.client.refreshAuthToken(refreshToken);
//   }
// }
