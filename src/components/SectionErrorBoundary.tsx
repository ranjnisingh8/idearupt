import React from "react";

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  sectionName?: string;
}

interface State {
  hasError: boolean;
}

class SectionErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Only log in error boundaries — intentional
    console.error(`Error in ${this.props.sectionName || "section"}:`, error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <div className="py-4 px-4 text-center">
            <p className="font-body text-sm" style={{ color: "var(--text-tertiary)" }}>
              Couldn't load this section
            </p>
            <button
              onClick={() => this.setState({ hasError: false })}
              className="font-body text-sm mt-2 transition-colors"
              style={{ color: "#9585F2", background: "none", border: "none", cursor: "pointer" }}
            >
              Try again
            </button>
          </div>
        )
      );
    }
    return this.props.children;
  }
}

export default SectionErrorBoundary;
