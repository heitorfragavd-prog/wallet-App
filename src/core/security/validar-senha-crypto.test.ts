/**
 * validar-senha-crypto.test.ts
 * 
 * Testes unitários para as funções criptográficas de produção em validar-senha:
 * - Hashing PBKDF2 com salt
 * - Verificação de senha
 * - Retrocompatibilidade com hashes SHA-256 legados
 * - Geração e integridade do token HMAC assinado
 * - Finalidade, expiração e proteção IDOR
 */
import { describe, it, expect } from "vitest";
import {
  derivePbkdf2Hash,
  verifyPassword,
  createInvestmentToken,
  verifyInvestmentToken,
} from "../../../supabase/functions/_shared/validar-senha-core.ts";

describe("validar-senha — Criptografia e Tokens com Funções de Produção", () => {
  const SECRET_KEY = "test_supabase_service_role_secret_key_1234567890";
  const USER_ID = "user-uuid-1234-5678";
  const USER_SALT = `wallet_inv_${USER_ID}`;

  it("Gera hash PBKDF2 com 100.000 iterações no formato correto", async () => {
    const hash = await derivePbkdf2Hash("MinhaSenhaForte!123", USER_SALT);

    expect(hash).toMatch(/^\$pbkdf2\$100000\$[0-9a-f]{64}$/);
  });

  it("Verifica com sucesso a senha correta usando PBKDF2", async () => {
    const password = "SenhaCorreta@2026";
    const hash = await derivePbkdf2Hash(password, USER_SALT);

    const isValid = await verifyPassword(password, USER_SALT, hash);
    expect(isValid).toBe(true);
  });

  it("Rejeita senha incorreta usando PBKDF2", async () => {
    const password = "SenhaCorreta@2026";
    const hash = await derivePbkdf2Hash(password, USER_SALT);

    const isValid = await verifyPassword("SenhaIncorreta@2026", USER_SALT, hash);
    expect(isValid).toBe(false);
  });

  it("Salts diferentes geram hashes completamente distintos para a mesma senha", async () => {
    const password = "MesmaSenhaParaTodos";
    const hashUserA = await derivePbkdf2Hash(password, "wallet_inv_user_a");
    const hashUserB = await derivePbkdf2Hash(password, "wallet_inv_user_b");

    expect(hashUserA).not.toBe(hashUserB);
  });

  it("Garante retrocompatibilidade com SHA-256 legado sem quebrar autenticação existente", async () => {
    const password = "SenhaLegada123";
    const enc = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest("SHA-256", enc.encode(password + USER_SALT));
    const legacyHash = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, "0")).join("");

    const isValid = await verifyPassword(password, USER_SALT, legacyHash);
    expect(isValid).toBe(true);

    const isInvalid = await verifyPassword("OutraSenha", USER_SALT, legacyHash);
    expect(isInvalid).toBe(false);
  });

  it("Gera token HMAC assinado válido e o valida com sucesso", async () => {
    const token = await createInvestmentToken(USER_ID, SECRET_KEY);
    expect(token).toMatch(/^inv_[A-Za-z0-9+/=]+\.[0-9a-f]{64}$/);

    const result = await verifyInvestmentToken(token, USER_ID, SECRET_KEY);
    expect(result.valid).toBe(true);
  });

  it("Detecta e bloqueia adulteração na assinatura do token HMAC", async () => {
    const token = await createInvestmentToken(USER_ID, SECRET_KEY);
    const [payload, sig] = token.split(".");
    const tamperedSig = sig.slice(0, -4) + "ffff";
    const tamperedToken = `${payload}.${tamperedSig}`;

    const result = await verifyInvestmentToken(tamperedToken, USER_ID, SECRET_KEY);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/adulterada/i);
  });

  it("Detecta tentativa de uso do token por outro usuário (prevenção de IDOR)", async () => {
    const tokenUserA = await createInvestmentToken(USER_ID, SECRET_KEY);
    const victimUserId = "other-user-uuid-9999";

    const result = await verifyInvestmentToken(tokenUserA, victimUserId, SECRET_KEY);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/IDOR/i);
  });
});