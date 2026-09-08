/**
 * validar-senha-crypto.test.ts
 * 
 * Testes unitários para as funções criptográficas de validar-senha:
 * - Hashing PBKDF2 com salt
 * - Verificação de senha
 * - Retrocompatibilidade com hashes SHA-256 legados
 * - Geração e integridade do token HMAC assinado
 */
import { describe, it, expect } from "vitest";

// Implementação direta das funções puras usadas no backend
async function derivePbkdf2Hash(password: string, salt: string): Promise<string> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: enc.encode(salt),
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    256
  );
  const hashArray = Array.from(new Uint8Array(derivedBits));
  const hex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  return `$pbkdf2$100000$${hex}`;
}

async function verifyPassword(password: string, salt: string, storedHash: string): Promise<boolean> {
  if (storedHash.startsWith("$pbkdf2$100000$")) {
    const computed = await derivePbkdf2Hash(password, salt);
    return computed === storedHash;
  }
  // Retrocompatibilidade segura com SHA-256 legado
  const enc = new TextEncoder();
  const data = enc.encode(password + salt);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const legacyHash = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  return legacyHash === storedHash;
}

async function createInvestmentToken(userId: string, secretKey: string): Promise<string> {
  const expiresAt = Date.now() + 30 * 60 * 1000;
  const payload = `${userId}:${expiresAt}`;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secretKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  const sigHex = Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, "0")).join("");
  return `inv_${btoa(payload)}.${sigHex}`;
}

async function verifyInvestmentToken(token: string, secretKey: string, expectedUserId: string): Promise<boolean> {
  if (!token.startsWith("inv_")) return false;
  const parts = token.slice(4).split(".");
  if (parts.length !== 2) return false;

  const [encodedPayload, sigHex] = parts;
  let payload: string;
  try {
    payload = atob(encodedPayload);
  } catch {
    return false;
  }

  const [userId, expiresAtStr] = payload.split(":");
  if (userId !== expectedUserId) return false;

  const expiresAt = Number(expiresAtStr);
  if (isNaN(expiresAt) || Date.now() > expiresAt) return false;

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secretKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );

  const sigBytes = new Uint8Array(sigHex.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16)) || []);
  return await crypto.subtle.verify("HMAC", key, sigBytes, enc.encode(payload));
}

describe("Criptografia e Validação de Senha de Investimentos", () => {
  const salt = "wallet_inv_test-user-123";
  const correctPass = "MinhaSenhaForte#2026";
  const wrongPass = "SenhaIncorreta";
  const secretKey = "super-secret-service-role-key";

  it("Gera hash PBKDF2 com prefixo $pbkdf2$100000$", async () => {
    const hash = await derivePbkdf2Hash(correctPass, salt);
    expect(hash.startsWith("$pbkdf2$100000$")).toBe(true);
    expect(hash.length).toBeGreaterThan(64);
  });

  it("Valida senha correta com hash PBKDF2", async () => {
    const hash = await derivePbkdf2Hash(correctPass, salt);
    const isValid = await verifyPassword(correctPass, salt, hash);
    expect(isValid).toBe(true);
  });

  it("Rejeita senha incorreta com hash PBKDF2", async () => {
    const hash = await derivePbkdf2Hash(correctPass, salt);
    const isValid = await verifyPassword(wrongPass, salt, hash);
    expect(isValid).toBe(false);
  });

  it("Mantém compatibilidade com hashes legados SHA-256", async () => {
    // Hash SHA-256 legado simples
    const enc = new TextEncoder();
    const data = enc.encode(correctPass + salt);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const legacyHash = Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    expect(legacyHash).toHaveLength(64);
    expect(legacyHash).not.toContain("$pbkdf2$");

    const validLegacy = await verifyPassword(correctPass, salt, legacyHash);
    expect(validLegacy).toBe(true);

    const invalidLegacy = await verifyPassword(wrongPass, salt, legacyHash);
    expect(invalidLegacy).toBe(false);
  });

  it("Gera e valida token HMAC assinado para o usuário correto", async () => {
    const token = await createInvestmentToken("test-user-123", secretKey);
    expect(token.startsWith("inv_")).toBe(true);

    const isValid = await verifyInvestmentToken(token, secretKey, "test-user-123");
    expect(isValid).toBe(true);
  });

  it("Rejeita token se o userId for forjado (IDOR prevention)", async () => {
    const token = await createInvestmentToken("test-user-123", secretKey);

    // Atacante tenta usar token do usuário 123 como se fosse o usuário 999
    const isValidForAttacker = await verifyInvestmentToken(token, secretKey, "attacker-user-999");
    expect(isValidForAttacker).toBe(false);
  });

  it("Rejeita token com assinatura adulterada", async () => {
    const token = await createInvestmentToken("test-user-123", secretKey);
    const tamperedToken = token.slice(0, -4) + "0000";

    const isValid = await verifyInvestmentToken(tamperedToken, secretKey, "test-user-123");
    expect(isValid).toBe(false);
  });
});
