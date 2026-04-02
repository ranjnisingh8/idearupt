import React from "react";
import { Lightbulb, RefreshCw } from "lucide-react";
import { trackEvent, EVENTS } from "@/lib/analytics";

interface ErrorBoundaryState {
  hasError: boolean;
}

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("App crash:", error, errorInfo);

    // Send crash to admin dashboard via page_events
    try {
      trackEvent(EVENTS.ERROR_JS, {
        message: (error?.message || "Unknown crash").substring(0, 200),
        type: "react_crash",
        component_stack: (errorInfo?.componentStack || "").substring(0, 300),
        page: window.location.pathname,
      });
    } catch {
      // Analytics itself crashed — don't throw
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#0A0E1A] flex items-center justify-center px-4">
          <div className="text-center max-w-sm">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#E94560] to-[#7C3AED] flex items-center justify-center mx-auto mb-6">
              <Lightbulb className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">Something went wrong</h1>
            <p className="text-gray-400 text-sm mb-6">
              Don't worry — your data is safe. Try reloading the app.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-[#7C3AED] to-[#06B6D4] text-white rounded-xl font-medium hover:opacity-90 transition-opacity"
            >
              <RefreshCw className="w-4 h-4" />
              Reload App
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
