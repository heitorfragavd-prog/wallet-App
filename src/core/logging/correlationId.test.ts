import { describe, it, expect } from "vitest";
import {
  generateCorrelationId,
  isValidCorrelationId,
  ensureCorrelationId,
} from "./correlationId";

describe("correlationId utility", () => {
  it("generates a valid correlation ID", () => {
    const id = generateCorrelationId();
    expect(isValidCorrelationId(id)).toBe(true);
  });

  it("supports adding an optional prefix", () => {
    const id = generateCorrelationId("pluggy");
    expect(id.startsWith("pluggy_")).toBe(true);
    expect(isValidCorrelationId(id)).toBe(true);
  });

  it("validates valid correlation IDs and rejects invalid ones", () => {
    expect(isValidCorrelationId("c95ab69b-a54a-4c91-91a2-fab763678aeb")).toBe(true);
    expect(isValidCorrelationId("req_12345678-abcd")).toBe(true);
    expect(isValidCorrelationId("")).toBe(false);
    expect(isValidCorrelationId("   ")).toBe(false);
    expect(isValidCorrelationId(null)).toBe(false);
    expect(isValidCorrelationId(undefined)).toBe(false);
    expect(isValidCorrelationId(12345)).toBe(false);
  });

  it("preserves valid existing correlation IDs", () => {
    const existing = "f47ac10b-58cc-4372-a567-0e02b2c3d479";
    const result = ensureCorrelationId(existing);
    expect(result).toBe(existing);
  });

  it("generates a new correlation ID when existing is invalid or missing", () => {
    const resultFromNull = ensureCorrelationId(null);
    expect(isValidCorrelationId(resultFromNull)).toBe(true);

    const resultFromEmpty = ensureCorrelationId("");
    expect(isValidCorrelationId(resultFromEmpty)).toBe(true);

    const resultWithPrefix = ensureCorrelationId(undefined, "invoice");
    expect(resultWithPrefix.startsWith("invoice_")).toBe(true);
  });
});
