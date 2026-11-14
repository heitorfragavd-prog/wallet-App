/**
 * whatsapp-security.ts
 *
 * Funções puras de segurança e criptografia para a integração Meta / WhatsApp Business.
 * Compatível tanto com Deno (Supabase Edge Functions) quanto Node.js (Vitest) e navegadores.
 */

/**
 * Validação criptográfica da assinatura x-hub-signature-256 da Meta (HMAC-SHA256)
 */
export async function verifyMetaSignature(
  rawBody: string,
  signatureHeader: string | null,
  appSecret: string
): Promise<boolean> {
  if (!signatureHeader || !appSecret || !signatureHeader.startsWith("sha256=")) {
    return false;
  }

  try {
    const expectedHashHex = signatureHeader.slice(7);
    const encoder = new TextEncoder();
    const keyData = encoder.encode(appSecret);
    const messageData = encoder.encode(rawBody);

    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );

    const signatureBuffer = await crypto.subtle.sign("HMAC", cryptoKey, messageData);
    const calculatedHashHex = Array.from(new Uint8Array(signatureBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    return calculatedHashHex.toLowerCase() === expectedHashHex.toLowerCase();
  } catch (err) {
    console.error("[whatsapp-security] Erro ao validar assinatura HMAC:", err);
    return false;
  }
}

/**
 * Gera hash SHA-256 determinístico para idempotência de mensagens WhatsApp
 */
export async function calculateIdempotencyHash(input: string): Promise<string> {
  const msgUint8 = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}
