/**
 * Error Boundary Component
 * 
 * React error boundary that catches errors in the component tree,
 * logs them via ErrorService, and displays a fallback UI.
 */

import React, { Component, ReactNode } from 'react';
import { errorService } from './ErrorService';
import { AppError } from './types';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: AppError) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: AppError | null;
}

/**
 * Error Boundary Component
 * 
 * Usage:
 * ```tsx
 * <ErrorBoundary fallback={<ErrorFallback />}>
 *   <YourComponent />
 * </ErrorBoundary>
 * ```
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    // Update state so the next render will show the fallback UI
    return {
      hasError: true,
      error: null, // Will be set in componentDidCatch
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    // Handle the error with ErrorService
    const appError = errorService.handle(error, {
      componentStack: errorInfo.componentStack,
      errorBoundary: true,
    });

    // Update state with the handled error
    this.setState({ error: appError });

    // Call optional error callback
    if (this.props.onError) {
      this.props.onError(appError);
    }
  }

  render(): ReactNode {
    if (this.state.hasError) {
      // Render custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default fallback UI
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '400px',
            padding: '2rem',
            textAlign: 'center',
          }}
        >
          <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '1rem' }}>
            Algo deu errado
          </h2>
          <p style={{ color: '#666', marginBottom: '1.5rem' }}>
            {this.state.error
              ? errorService.getUserMessage(this.state.error)
              : 'Ocorreu um erro inesperado.'}
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '0.375rem',
              cursor: 'pointer',
              fontSize: '1rem',
            }}
          >
            Recarregar página
          </button>
          {this.state.error && (
            <p
              style={{
                marginTop: '1rem',
                fontSize: '0.875rem',
                color: '#999',
                fontFamily: 'monospace',
              }}
            >
              Código do erro: {this.state.error.code}
            </p>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}
