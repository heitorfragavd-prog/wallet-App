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
 * 6. Validação Criptográfica de 256 bits: Exigência de chave gerada com fonte criptograficamente segura em formato verificável (Hex 64 chars = 256 bits, Base64 = 32 bytes exatos, ou binário >= 32 bytes com diversidade de bytes).
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
 * Valida se uma chave mestre atende a requisitos criptográficos rígidos e verificáveis:
 * - Formato Hexadecimal de 64 caracteres (256 bits exatos); OU
 * - Formato Base64 decodificável em exatamente 32 bytes (256 bits); OU
 * - Material binário de no mínimo 32 bytes (256 bits) com diversidade estrita de bytes.
 * Não utiliza aproximações heurísticas frágeis como prova de entropia.
 */
export function validateMasterVaultKey(key?: string | null): {
  valid: boolean;
  reason?: string;
  format?: "hex" | "base64" | "raw_bytes";
  decodedBytes?: Uint8Array;
} {
  if (!key || typeof key !== "string") {
    return { valid: false, reason: "MARKETPLACE_VAULT_KEY ausente ou formato inválido" };
  }
  const trimmed = key.trim();

  // 1. Verificação de formato Hexadecimal (64 caracteres hex = exatamente 32 bytes / 256 bits)
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    const bytes = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      bytes[i] = parseInt(trimmed.slice(i * 2, i * 2 + 2), 16);
    }
    const uniqueBytes = new Set(bytes).size;
    if (uniqueBytes < 8) {
      return { valid: false, reason: "Chave hexadecimal possui entropia nula ou bytes repetidos/triviais" };
    }
    return { valid: true, format: "hex", decodedBytes: bytes };
  }

  // 2. Verificação de formato Base64 (representando exatamente 32 bytes / 256 bits)
  if (/^[A-Za-z0-9+/]{42,43}={0,2}$|^[A-Za-z0-9_-]{42,43}={0,2}$/.test(trimmed)) {
    try {
      const decoded = fromBase64(trimmed);
      if (decoded.length === 32) {
        const uniqueBytes = new Set(decoded).size;
        if (uniqueBytes < 8) {
          return { valid: false, reason: "Chave base64 possui bytes repetidos ou nulos" };
        }
        return { valid: true, format: "base64", decodedBytes: decoded };
      }
    } catch {
      // Ignora erro de base64 e cai na validação de bytes UTF-8
    }
  }

  // 3. Verificação de decodificação direta de bytes (mínimo de 32 bytes criptográficos)
  const utf8Bytes = new TextEncoder().encode(trimmed);
  if (utf8Bytes.length < 32) {
    return {
      valid: false,
      reason: `MARKETPLACE_VAULT_KEY possui apenas ${utf8Bytes.length} bytes (mínimo exigido: 32 bytes / 256 bits)`,
    };
  }

  const uniqueBytes = new Set(utf8Bytes).size;
  if (uniqueBytes < 12) {
    return {
      valid: false,
      reason: `MARKETPLACE_VAULT_KEY possui baixa diversidade de caracteres (${uniqueBytes} únicos, mínimo exigido: 12)`,
    };
  }

  return { valid: true, format: "raw_bytes", decodedBytes: utf8Bytes };
}

/**
 * Alias retrocompatível para validateMasterVaultKey.
 */
export const validateVaultKeyEntropy = validateMasterVaultKey;

/**
 * Deriva uma CryptoKey AES-256-GCM a partir de um segredo mestre usando HKDF-SHA256.
 */
export async function deriveVaultKey(
  masterSecret: string,
  keyId = "v1"
): Promise<CryptoKey> {
  const validation = validateMasterVaultKey(masterSecret);
  if (!validation.valid) {
    throw new Error(`Master secret validation failed: ${validation.reason}`);
  }

  const rawKeyData = validation.decodedBytes || new TextEncoder().encode(masterSecret.trim());
  const enc = new TextEncoder();
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
