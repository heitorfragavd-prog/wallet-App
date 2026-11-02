/**
 * vault-crypto.ts
 *
 * Módulo Criptográfico Autenticado Canônico para Cofre de Marketplaces (iFood / 99Food).
 * Padrão: AES-256-GCM com derivação HKDF-SHA256 e IV criptográfico aleatório de 96 bits (12 bytes).
 *
 * Garantias de Segurança:
 * 1. Não reutilização de IV (nonce): Um novo IV de 12 bytes é gerado via crypto.getRandomValues a cada cifragem.
 * 2. Criptografia Autenticada (AEAD): Integridade e confidencialidade verificadas por tag de autenticação GCM.
 * 3. Formato Canônico Versionado: "v1:<key_id>:<base64_iv>:<base64_ciphertext_tag>"
 * 4. Suporte a Rotação de Chaves: Identificador de chave (keyId) no cabeçalho permite descriptografia com chaves anteriores e re-cifragem com a chave ativa.
 * 5. Fail-Closed: Qualquer adulteração de bytes ou ausência de chave lança erro genérico sem expor dados confidenciais.
 * 6. Entropia Comprovada: Verificação matemática de entropia de Shannon e diversidade de caracteres na chave mestre.
 */

function toBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }
  let binary = "";
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function fromBase64(b64: string): Uint8Array {
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(b64, "base64"));
  }
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Calcula a entropia de Shannon (em bits por caractere) de uma string.
 */
export function calculateShannonEntropy(str: string): number {
  if (!str || str.length === 0) return 0;
  const len = str.length;
  const frequencies = new Map<string, number>();
  for (const char of str) {
    frequencies.set(char, (frequencies.get(char) || 0) + 1);
  }
  let entropy = 0;
  for (const count of frequencies.values()) {
    const p = count / len;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

/**
 * Valida se uma chave mestre atende a requisitos criptográficos rígidos:
 * - Mínimo 32 caracteres (equivalente a 256 bits);
 * - Mínimo 12 caracteres distintos;
 * - Entropia de Shannon >= 3.2 bits/char (elimina padrões triviais e repetições).
 */
export function validateVaultKeyEntropy(key?: string | null): { valid: boolean; reason?: string } {
  if (!key || typeof key !== "string") {
    return { valid: false, reason: "MARKETPLACE_VAULT_KEY ausente ou inválida" };
  }
  const trimmed = key.trim();
  if (trimmed.length < 32) {
    return {
      valid: false,
      reason: `MARKETPLACE_VAULT_KEY possui apenas ${trimmed.length} caracteres (mínimo exigido: 32 caracteres / 256 bits)`,
    };
  }
  const uniqueChars = new Set(trimmed).size;
  if (uniqueChars < 12) {
    return {
      valid: false,
      reason: `MARKETPLACE_VAULT_KEY possui baixa diversidade de caracteres (${uniqueChars} únicos, mínimo exigido: 12)`,
    };
  }
  const entropy = calculateShannonEntropy(trimmed);
  if (entropy < 3.2) {
    return {
      valid: false,
      reason: `MARKETPLACE_VAULT_KEY possui entropia de Shannon insuficiente (${entropy.toFixed(2)} bits/char, mínimo exigido: 3.2)`,
    };
  }
  return { valid: true };
}

/**
 * Deriva uma CryptoKey AES-256-GCM a partir de um segredo mestre usando HKDF-SHA256.
 */
export async function deriveVaultKey(
  masterSecret: string,
  keyId = "v1"
): Promise<CryptoKey> {
  const validation = validateVaultKeyEntropy(masterSecret);
  if (!validation.valid) {
    throw new Error(`Master secret validation failed: ${validation.reason}`);
  }

  const enc = new TextEncoder();
  const rawKeyData = enc.encode(masterSecret.trim());
  const salt = enc.encode(`wallet-delivery-vault-salt-${keyId}`);
  const info = enc.encode("delivery-marketplace-credentials-aes-256-gcm");

  const hkdfBaseKey = await crypto.subtle.importKey(
    "raw",
    rawKeyData,
    "HKDF",
    false,
    ["deriveKey"]
  );

  return await crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt,
      info,
    },
    hkdfBaseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * Cifra um segredo em texto puro para o formato seguro do cofre.
 * Retorna string segura: "v1:<key_id>:<base64_iv>:<base64_ciphertext_tag>"
 */
export async function encryptVaultSecret(
  plaintext: string,
  masterSecret: string,
  keyId = "v1"
): Promise<string> {
  if (!plaintext || plaintext.trim().length === 0) {
    throw new Error("Plaintext cannot be empty");
  }

  const key = await deriveVaultKey(masterSecret, keyId);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintextBytes = new TextEncoder().encode(plaintext);

  const encryptedBuffer = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
      tagLength: 128,
    },
    key,
    plaintextBytes
  );

  const b64Iv = toBase64(iv);
  const b64Cipher = toBase64(new Uint8Array(encryptedBuffer));

  return `v1:${keyId}:${b64Iv}:${b64Cipher}`;
}

/**
 * Descriptografa um segredo cifrado armazenado no cofre.
 * Lança erro caso a carga esteja corrompida, alterada ou a chave seja incorreta.
 */
export async function decryptVaultSecret(
  encryptedPayload: string,
  masterSecret: string,
  keyRotationMap?: Record<string, string>
): Promise<string> {
  if (!encryptedPayload || typeof encryptedPayload !== "string") {
    throw new Error("Invalid encrypted payload");
  }

  const parts = encryptedPayload.split(":");
  if (parts.length !== 4 || parts[0] !== "v1") {
    throw new Error("Unsupported or corrupted vault payload format");
  }

  const [, payloadKeyId, b64Iv, b64Cipher] = parts;

  // Suporte a rotação de chaves: se houver segredo específico para a chave anterior
  const activeSecret =
    keyRotationMap && keyRotationMap[payloadKeyId]
      ? keyRotationMap[payloadKeyId]
      : masterSecret;

  try {
    const key = await deriveVaultKey(activeSecret, payloadKeyId);
    const iv = fromBase64(b64Iv);
    const cipherBytes = fromBase64(b64Cipher);

    const decryptedBuffer = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv,
        tagLength: 128,
      },
      key,
      cipherBytes
    );

    return new TextDecoder().decode(decryptedBuffer);
  } catch {
    throw new Error("Vault decryption failed: authentication tag mismatch or invalid key");
  }
}

/**
 * Re-cifra uma credencial para uma nova versão de chave (Rotação de Chaves).
 */
export async function rotateVaultSecret(
  encryptedPayload: string,
  oldMasterSecret: string,
  newMasterSecret: string,
  newKeyId = "v2"
): Promise<string> {
  const plaintext = await decryptVaultSecret(encryptedPayload, oldMasterSecret);
  return await encryptVaultSecret(plaintext, newMasterSecret, newKeyId);
}
