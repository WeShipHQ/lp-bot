// services/wallet-export.service.ts
import { generateAuthorizationSignature } from "@privy-io/server-auth/wallet-api";
import { CONFIG } from "../config";
import { generateRecipientKeypair } from "../bot/utils/hpke-keygen";
import { decryptHPKEMessage } from "../bot/utils/hpke-decrypt";

export async function exportAndDecryptWallet(walletId: string) {
  // 1. generate keypair
  const { publicKeyBase64, privateKeyBase64 } = await generateRecipientKeypair();

  // 2. call Privy API
  const input = {
    headers: { "privy-app-id": CONFIG.PRIVY.PRIVY_APP_ID },
    method: "POST" as const,
    url: `https://api.privy.io/v1/wallets/${walletId}/export`,
    version: 1 as const,
    body: {
      encryption_type: "HPKE",
      recipient_public_key: publicKeyBase64,
    },
  };

  const signature = generateAuthorizationSignature({
    input,
    authorizationPrivateKey: CONFIG.PRIVY.PRIVY_AUTH_PRIVATE_KEY,
  });


  console.log("DEBUG: Using App ID:", CONFIG.PRIVY.PRIVY_APP_ID);
console.log("DEBUG: Using Auth Private Key (first 10 chars):", CONFIG.PRIVY.PRIVY_AUTH_PRIVATE_KEY.substring(0, 10));

  const res = await fetch(input.url, {
    method: "POST",
    headers: {
      ...input.headers,
      "Content-Type": "application/json",
      "privy-authorization-signature": signature as string,
      Authorization: "Basic " + Buffer.from(
        `${CONFIG.PRIVY.PRIVY_APP_ID}:${CONFIG.PRIVY.PRIVY_APP_SECRET}`
      ).toString("base64"),
    },
    body: JSON.stringify(input.body),
  });

  if (!res.ok) {
    throw new Error(`Export wallet failed: ${res.status} ${await res.text()}`);
  } 

  const response = await res.json();

  // 3. decrypt
  return await decryptHPKEMessage(
    privateKeyBase64,
    response.encapsulated_key,
    response.ciphertext
  );
}
