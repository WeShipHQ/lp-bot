/**
 * Generate a key pair for HPKE encryption
 */
export async function generateRecipientKeypair() {
  // Generate a key pair for the recipient (HPKE)
  const keypair = await crypto.subtle.generateKey(
    {
      name: "ECDH",
      namedCurve: "P-256"
    },
    true,
    ["deriveKey", "deriveBits"]
  );

  const [publicKey, privateKey] = await Promise.all([
    crypto.subtle.exportKey("spki", keypair.publicKey),
    crypto.subtle.exportKey("pkcs8", keypair.privateKey)
  ]);

  const [publicKeyBase64, privateKeyBase64] = [
    Buffer.from(publicKey).toString("base64"),
    Buffer.from(privateKey).toString("base64")
  ];

  return { publicKeyBase64, privateKeyBase64 };
}
  