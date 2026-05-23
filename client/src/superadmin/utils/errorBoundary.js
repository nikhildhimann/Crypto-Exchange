import React from 'react';
import { AlertCircle } from 'lucide-react';

/**
 * Error boundary for gracefully handling component errors
 * Prevents full page crashes when individual widgets fail
 */
export class SuperadminErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    // Log error for debugging (in production, send to monitoring service)
    console.error('Superadmin widget error:', error, errorInfo);
    
    this.setState({
      error,
      errorInfo,
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-lg border border-red-200/30 bg-red-900/10 p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-400" />
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-medium text-red-300">Component Error</h3>
              <p className="mt-1 text-sm text-red-200">
                {this.state.error?.message || 'An unexpected error occurred'}
              </p>
              <button
                onClick={() => this.setState({ hasError: false, error: null, errorInfo: null })}
                className="mt-2 inline-flex items-center gap-2 rounded-md bg-red-600/20 px-3 py-1.5 text-xs font-medium text-red-300 transition hover:bg-red-600/30"
              >
                Try Again
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Hook for async error handling in components
 * @param {function} asyncFn - Async function to execute
 * @returns {object} State object with error handling
 */
export function useAsyncError(asyncFn) {
  const [state, setState] = React.useState({
    loading: false,
    error: null,
    data: null,
  });

  const execute = React.useCallback(async (...args) => {
    setState({ loading: true, error: null, data: null });
    try {
      const result = await asyncFn(...args);
      setState({ loading: false, error: null, data: result });
      return result;
    } catch (error) {
      setState({ 
        loading: false, 
        error: error instanceof Error ? error.message : 'Unknown error',
        data: null 
      });
      throw error;
    }
  }, [asyncFn]);

  return { ...state, execute };
}

/**
 * Fallback UI for sections that fail to load
 */
export function FailedWidget({ message = 'Failed to load', onRetry }) {
  return (
    <div className="rounded-lg border border-amber-200/30 bg-amber-900/10 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-amber-400" />
          <p className="text-sm text-amber-300">{message}</p>
        </div>
        {onRetry && (
          <button
            onClick={onRetry}
            className="text-xs font-medium text-amber-300 underline transition hover:text-amber-200"
          >
            Retry
          </button>
        )}
      </div>
    </div>
  );
}

export default SuperadminErrorBoundary;
