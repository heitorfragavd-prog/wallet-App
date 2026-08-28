import { describe, it, expect } from "vitest";
import { sanitizeData, sanitizeString, isSensitiveKey, REDACTED_MARKER } from "./sanitizer";

describe("sanitizer utility", () => {
  describe("isSensitiveKey", () => {
    it("identifies sensitive credential keys", () => {
      expect(isSensitiveKey("password")).toBe(true);
      expect(isSensitiveKey("senha")).toBe(true);
      expect(isSensitiveKey("user_password")).toBe(true);
      expect(isSensitiveKey("token")).toBe(true);
      expect(isSensitiveKey("access_token")).toBe(true);
      expect(isSensitiveKey("refresh_token")).toBe(true);
      expect(isSensitiveKey("authorization")).toBe(true);
      expect(isSensitiveKey("api_key")).toBe(true);
      expect(isSensitiveKey("apiKey")).toBe(true);
      expect(isSensitiveKey("secret")).toBe(true);
      expect(isSensitiveKey("service_role")).toBe(true);
      expect(isSensitiveKey("cookie")).toBe(true);
      expect(isSensitiveKey("cvv")).toBe(true);
      expect(isSensitiveKey("cvc")).toBe(true);
    });

    it("allows non-sensitive keys", () => {
      expect(isSensitiveKey("username")).toBe(false);
      expect(isSensitiveKey("workspaceId")).toBe(false);
      expect(isSensitiveKey("operation")).toBe(false);
      expect(isSensitiveKey("totalAmount")).toBe(false);
    });
  });

  describe("sanitizeString", () => {
    it("masks credit cards", () => {
      const input = "CartÃ£o final 4111 2222 3333 4444 utilizado";
      const sanitized = sanitizeString(input);
      expect(sanitized).toBe("CartÃ£o final ****-****-****-**** utilizado");
    });

    it("masks CPF numbers", () => {
      const input = "Cliente CPF 123.456.789-00 registrado";
      const sanitized = sanitizeString(input);
      expect(sanitized).toBe("Cliente CPF ***.***.***-** registrado");
    });

    it("masks CNPJ numbers", () => {
      const input = "Empresa CNPJ 12.345.678/0001-90";
      const sanitized = sanitizeString(input);
      expect(sanitized).toBe("Empresa CNPJ **.***.***/****-**");
    });

    it("masks email addresses safely", () => {
      const input = "NotificaÃ§Ã£o para usuario.financeiro@empresa.com.br enviada";
      const sanitized = sanitizeString(input);
      expect(sanitized).toBe("NotificaÃ§Ã£o para us***@empresa.com.br enviada");
    });

    it("redacts JWT tokens and Bearer headers in strings", () => {
      const input = "Header: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.doNotLeakThisSignature";
      const sanitized = sanitizeString(input);
      expect(sanitized).toContain(`Bearer ${REDACTED_MARKER}`);
      expect(sanitized).not.toContain("doNotLeakThisSignature");
    });

    it("redacts API keys (sk-...) in strings", () => {
      const input = "Using key sk-proj-1234567890abcdefghijklmnopq";
      const sanitized = sanitizeString(input);
      expect(sanitized).toBe(`Using key ${REDACTED_MARKER}`);
    });
  });

  describe("sanitizeData", () => {
    it("redacts sensitive fields in nested objects", () => {
      const payload = {
        user: "admin",
        password: "SuperSecretPassword123",
        auth: {
          token: "jwt.token.value",
          headers: {
            authorization: "Bearer secret-token",
          },
        },
        payment: {
          cardNumber: "4111-2222-3333-4444",
          cvv: "123",
          email: "joao.silva@exemplo.com",
        },
      };

      const result = sanitizeData(payload);

      expect(result.password).toBe(REDACTED_MARKER);
      expect(result.auth.token).toBe(REDACTED_MARKER);
      expect(result.auth.headers.authorization).toBe(REDACTED_MARKER);
      expect(result.payment.cvv).toBe(REDACTED_MARKER);
      expect(result.payment.cardNumber).toBe("****-****-****-****");
      expect(result.payment.email).toBe("jo***@exemplo.com");
      expect(result.user).toBe("admin");
    });

    it("handles circular references gracefully", () => {
      const obj: Record<string, unknown> = { name: "test" };
      obj.self = obj;

      const result = sanitizeData(obj);
      expect(result.name).toBe("test");
      expect(result.self).toBe("[Circular]");
    });

    it("sanitizes Error objects with stack traces", () => {
      const error = new Error("Failed connecting with token sk-1234567890abcdef12345678");
      const result = sanitizeData(error);

      expect(result.name).toBe("Error");
      expect(result.message).toContain(REDACTED_MARKER);
      expect(result.message).not.toContain("sk-1234567890abcdef12345678");
    });
  });
});
