import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

vi.unmock("@/core/errors/ErrorService");

import React, { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ErrorBoundary } from "../ErrorBoundary";
import { errorService } from "@/core/errors/ErrorService";

const ProblemChild: React.FC<{ shouldThrow?: boolean }> = ({ shouldThrow }) => {
  if (shouldThrow) {
    throw new Error("Simulated rendering explosion");
  }
  return <div>Component rendered successfully</div>;
};

const ResetableComponent: React.FC = () => {
  const [hasExploded, setHasExploded] = useState(true);

  return (
    <div>
      <button onClick={() => setHasExploded(false)}>Fix Error</button>
      <ErrorBoundary>
        <ProblemChild shouldThrow={hasExploded} />
      </ErrorBoundary>
    </div>
  );
};

describe("ErrorBoundary component", () => {
  const originalConsoleError = console.error;

  beforeEach(() => {
    vi.clearAllMocks();
    console.error = vi.fn();
    vi.spyOn(errorService, "handle");
  });

  afterEach(() => {
    console.error = originalConsoleError;
    vi.restoreAllMocks();
  });

  it("renders children normally when there is no error", () => {
    render(
      <ErrorBoundary context="TestContext">
        <ProblemChild shouldThrow={false} />
      </ErrorBoundary>
    );

    expect(screen.getByText("Component rendered successfully")).toBeInTheDocument();
  });

  it("catches rendering errors, renders fallback UI, and notifies ErrorService", () => {
    const onErrorMock = vi.fn();

    render(
      <ErrorBoundary context="TestContext" onError={onErrorMock}>
        <ProblemChild shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.getByText(/Ops! Algo deu errado/i)).toBeInTheDocument();
    expect(screen.getByText(/ERR_UNKN_/i)).toBeInTheDocument();
    expect(errorService.handle).toHaveBeenCalledTimes(1);
    expect(onErrorMock).toHaveBeenCalledTimes(1);
  });

  it("renders custom fallback when provided", () => {
    render(
      <ErrorBoundary fallback={<div>Custom Error Fallback</div>}>
        <ProblemChild shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.getByText("Custom Error Fallback")).toBeInTheDocument();
    expect(screen.queryByText(/Ops! Algo deu errado/i)).not.toBeInTheDocument();
  });

  it("supports retrying after error condition is resolved", () => {
    render(<ResetableComponent />);

    expect(screen.getByText(/Ops! Algo deu errado/i)).toBeInTheDocument();

    // Fix the underlying condition
    fireEvent.click(screen.getByRole("button", { name: "Fix Error" }));

    // Click retry on ErrorBoundary
    const retryBtn = screen.getByRole("button", { name: /Tentar novamente/i });
    fireEvent.click(retryBtn);

    expect(screen.getByText("Component rendered successfully")).toBeInTheDocument();
  });
});
