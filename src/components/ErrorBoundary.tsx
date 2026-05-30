import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { userMessageFromError } from "@/lib/errors";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("UI error boundary:", error, info.componentStack);
  }

  private handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.error) {
      return (
        <div
          className="min-h-screen flex flex-col items-center justify-center p-6"
          style={{ background: "#09090b" }}
        >
          <div
            className="w-full rounded-xl p-7 space-y-4 text-center"
            style={{ maxWidth: 440, background: "#18181b", border: "1px solid #27272a" }}
          >
            <div
              className="flex items-center justify-center w-12 h-12 rounded-full mx-auto"
              style={{ background: "rgba(239,68,68,0.12)" }}
            >
              <AlertTriangle size={22} style={{ color: "#f87171" }} />
            </div>
            <div className="space-y-1.5">
              <h1 className="text-[18px] font-bold text-zinc-50">Something went wrong</h1>
              <p className="text-[12px] text-zinc-400 leading-relaxed">
                {userMessageFromError(this.state.error)}
              </p>
            </div>
            <button
              type="button"
              onClick={this.handleReload}
              className="w-full rounded-lg px-4 py-2.5 text-[13px] font-semibold text-white"
              style={{ background: "#818cf8" }}
            >
              Reload application
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
