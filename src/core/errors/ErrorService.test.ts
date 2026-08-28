import { vi, describe, it, expect, beforeEach } from "vitest";

vi.unmock("@/core/errors/ErrorService");
vi.unmock("./ErrorService");

import { ErrorService } from "./ErrorService";
import { ErrorCategory } from "./types";
import { logger } from "../logging/LoggerService";

describe("ErrorService", () => {
  let service: ErrorService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ErrorService();
    vi.spyOn(logger, "error").mockReturnValue(null);
  });

  it("categorizes errors automatically", () => {
    const authErr = service.handle(new Error("JWT expired / Unauthorized token"));
    expect(authErr.category).toBe(ErrorCategory.AUTHENTICATION);

    const validErr = service.handle(new Error("Invalid input, field required"));
    expect(validErr.category).toBe(ErrorCategory.VALIDATION);

    const netErr = service.handle(new Error("Network fetch timeout error"));
    expect(netErr.category).toBe(ErrorCategory.NETWORK);

    const srvErr = service.handle(new Error("Database 500 internal server failure"));
    expect(srvErr.category).toBe(ErrorCategory.SERVER);

    const unknownErr = service.handle("Something unexpected happened");
    expect(unknownErr.category).toBe(ErrorCategory.UNKNOWN);
  });

  it("generates a unique tracking error code and correlation ID", () => {
    const err = service.handle(new Error("Connection refused"), {
      operation: "connect_pluggy",
      source: "pluggy",
    });

    expect(err.code).toMatch(/^ERR_NETW_/);
    expect(err.correlationId).toBeDefined();
    expect(err.operation).toBe("connect_pluggy");
    expect(err.source).toBe("pluggy");
  });

  it("preserves existing correlation ID when passed", () => {
    const customCorrelationId = "custom-req-12345678";
    const err = service.handle(new Error("Database offline"), {
      correlationId: customCorrelationId,
    });

    expect(err.correlationId).toBe(customCorrelationId);
  });

  it("provides safe, user-friendly messages without leaking technical stack traces", () => {
    const rawError = new Error("Database query failed with internal error at /var/www/db.ts:45");
    const appError = service.handle(rawError);

    const userMessage = service.getUserMessage(appError);
    expect(userMessage).toBe("ServiÃ§o temporariamente indisponÃ­vel. Tente novamente em instantes.");
    expect(userMessage).not.toContain("internal error");
    expect(userMessage).not.toContain("/var/www/db.ts");
  });

  it("forwards error to structured logger", () => {
    service.handle(new Error("Failed request"), {
      operation: "fetch_invoices",
      workspaceId: "ws-99",
    });

    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(
      "ErrorService",
      "Failed request",
      expect.objectContaining({
        operation: "fetch_invoices",
        workspaceId: "ws-99",
      })
    );
  });
});
