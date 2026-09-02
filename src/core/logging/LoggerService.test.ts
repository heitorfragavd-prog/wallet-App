import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

vi.unmock("@/core/logging/LoggerService");
vi.unmock("./LoggerService");

import { LoggerService } from "./LoggerService";
import { LogLevel, LogEntry } from "./types";

describe("LoggerService", () => {
  let logger: LoggerService;
  const originalConsoleDebug = console.debug;
  const originalConsoleInfo = console.info;
  const originalConsoleWarn = console.warn;
  const originalConsoleError = console.error;

  beforeEach(() => {
    logger = new LoggerService();
    logger.setLevel(LogLevel.DEBUG);
    console.debug = vi.fn();
    console.info = vi.fn();
    console.warn = vi.fn();
    console.error = vi.fn();
  });

  afterEach(() => {
    console.debug = originalConsoleDebug;
    console.info = originalConsoleInfo;
    console.warn = originalConsoleWarn;
    console.error = originalConsoleError;
  });

  it("outputs structured JSON logs for each level", () => {
    logger.debug("TestComponent", "Debug message");
    expect(console.debug).toHaveBeenCalledTimes(1);
    const debugParsed = JSON.parse((console.debug as ReturnType<typeof vi.fn>).mock.calls[0][0]);
    expect(debugParsed.level).toBe("debug");
    expect(debugParsed.component).toBe("TestComponent");
    expect(debugParsed.message).toBe("Debug message");

    logger.info("TestComponent", "Info message");
    expect(console.info).toHaveBeenCalledTimes(1);

    logger.warn("TestComponent", "Warn message");
    expect(console.warn).toHaveBeenCalledTimes(1);

    logger.error("TestComponent", "Error message");
    expect(console.error).toHaveBeenCalledTimes(1);
  });

  it("extracts structured options into top-level fields", () => {
    const correlationId = "corr-12345678-test";
    const entry = logger.info("PaymentService", "Processing transaction", {
      source: "pluggy",
      operation: "sync_accounts",
      correlationId,
      errorCode: "ERR_SYNC_01",
      workspaceId: "ws-123",
      amount: 150.5,
      password: "secret_password",
    });

    expect(entry).not.toBeNull();
    expect(entry?.source).toBe("pluggy");
    expect(entry?.operation).toBe("sync_accounts");
    expect(entry?.correlationId).toBe(correlationId);
    expect(entry?.errorCode).toBe("ERR_SYNC_01");
    expect(entry?.workspaceId).toBe("ws-123");
    expect(entry?.data?.amount).toBe(150.5);
    expect(entry?.data?.password).toBe("***REDACTED***");
  });

  it("respects log level filtering", () => {
    logger.setLevel(LogLevel.WARN);

    const debugResult = logger.debug("Test", "Should not log");
    const infoResult = logger.info("Test", "Should not log");
    const warnResult = logger.warn("Test", "Should log");
    const errorResult = logger.error("Test", "Should log");

    expect(debugResult).toBeNull();
    expect(infoResult).toBeNull();
    expect(warnResult).not.toBeNull();
    expect(errorResult).not.toBeNull();
    expect(console.debug).not.toHaveBeenCalled();
    expect(console.info).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalledTimes(1);
  });

  it("notifies registered external listeners safely", () => {
    const receivedEntries: LogEntry[] = [];
    const listener = vi.fn((entry: LogEntry) => {
      receivedEntries.push(entry);
    });

    const unsubscribe = logger.addListener(listener);
    logger.error("Auth", "Failed login attempt", { operation: "login" });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(receivedEntries[0].component).toBe("Auth");
    expect(receivedEntries[0].operation).toBe("login");

    unsubscribe();
    logger.error("Auth", "Second failure");
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
