import React, { Component, ErrorInfo, ReactNode } from "react";
import { logger } from "@/core/logging/LoggerService";
import { Button } from "@/shared/components/ui/button";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  context?: string;
}

interface State {
  hasError: boolean;
  error?: Error;
}

/**
 * ErrorBoundary — captura erros de renderização React em subtrees.
 *
 * Uso:
 *   <ErrorBoundary context="Dashboard">
 *     <ComponenteQuePodefAlhar />
 *   </ErrorBoundary>
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    logger.error(
      this.props.context ?? "ErrorBoundary",
      "Erro capturado pelo ErrorBoundary",
      {
        message: error.message,
        stack: error.stack?.slice(0, 500),
        componentStack: errorInfo.componentStack?.slice(0, 500),
      }
    );
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: undefined });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="flex min-h-[300px] flex-col items-center justify-center gap-4 p-8 text-center">
          <div className="rounded-full bg-red-100 dark:bg-red-900/20 p-6">
            <svg
              className="h-10 w-10 text-red-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
              />
            </svg>
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-semibold text-foreground">
              Ops! Algo deu errado
            </h2>
            <p className="text-muted-foreground max-w-sm">
              Um erro inesperado ocorreu nesta seção. Tente recarregar ou
              voltar para a página anterior.
            </p>
            {process.env.NODE_ENV === "development" && this.state.error && (
              <pre className="mt-4 rounded-md bg-muted p-4 text-left text-xs text-destructive overflow-auto max-w-lg max-h-40">
                {this.state.error.message}
              </pre>
            )}
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => window.history.back()}>
              Voltar
            </Button>
            <Button onClick={this.handleRetry}>Tentar novamente</Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
