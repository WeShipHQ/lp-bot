import { PrivyClient } from "@privy-io/server-auth";
import { CONFIG } from "../config";

export const privy = new PrivyClient(
  CONFIG.PRIVY.PRIVY_APP_ID,
  CONFIG.PRIVY.PRIVY_APP_SECRET , {
    walletApi : {
      authorizationPrivateKey : CONFIG.PRIVY.PRIVY_AUTH_PRIVATE_KEY
    }
  }
);