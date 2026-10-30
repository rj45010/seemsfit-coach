import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

interface Props {
  children: ReactNode;
  /** Optional custom fallback; defaults to a friendly retry card. */
  fallback?: ReactNode;
  /** Shown in the default fallback (e.g. "Nutrition"). */
  label?: string;
}
interface State {
  hasError: boolean;
}

/**
 * Feature/layout-level error boundary. A thrown render error is caught here so a
 * single failing area shows a fallback instead of crashing the whole app.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Log for diagnostics; swap for a real logger/Sentry later.
    console.error('[ErrorBoundary]', this.props.label ?? '', error, info.componentStack);
  }

  private reset = () => this.setState({ hasError: false });

  render() {
    if (!this.state.hasError) return this.props.children;
    if (this.props.fallback) return this.props.fallback;
    return (
      <Card accent="surface" className="mb-4">
        <p className="eyebrow mb-1">Something went wrong</p>
        <p className="text-ink-2 mb-3 text-sm font-semibold">
          {this.props.label ? `${this.props.label} hit a snag.` : 'This section hit a snag.'} Try again.
        </p>
        <Button variant="ink" onClick={this.reset}>
          Retry
        </Button>
      </Card>
    );
  }
}
