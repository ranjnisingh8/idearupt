import { useState } from "react";
import { AlertTriangle, Bug, Clock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { ErrorSummary } from "../types";

interface Props {
  errors: ErrorSummary[];
}

const ErrorDashboard = ({ errors }: Props) => {
  const [filter, setFilter] = useState<"all" | "error_js" | "error_api">("all");

  const filtered = errors.filter((e) => filter === "all" || e.error_type === filter);
  const jsCount = errors.filter((e) => e.error_type === "error_js").length;
  const apiCount = errors.filter((e) => e.error_type === "error_api").length;

  if (errors.length === 0) {
    return (
      <div className="surface-card rounded-xl p-6 text-center" style={{ transform: "none" }}>
        <Bug className="w-8 h-8 mx-auto mb-2" style={{ color: "var(--text-tertiary)" }} strokeWidth={1.5} />
        <p className="font-heading text-sm font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
          No errors detected
        </p>
        <p className="font-body text-xs" style={{ color: "var(--text-tertiary)" }}>
          JS and API errors will appear here when they occur.
        </p>
      </div>
    );
  }

  return (
    <div className="surface-card rounded-xl p-5" style={{ transform: "none" }}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" style={{ color: "#F87171" }} strokeWidth={1.5} />
          <h3 className="font-heading text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            Error Log
          </h3>
          <span className="font-body text-[10px] px-1.5 py-0.5 rounded-md" style={{
            background: "rgba(239,68,68,0.1)",
            border: "1px solid rgba(239,68,68,0.2)",
            color: "#F87171",
          }}>
            {errors.length}
          </span>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1.5 mb-3">
        {[
          { key: "all" as const, label: "All", count: errors.length },
          { key: "error_js" as const, label: "JS Errors", count: jsCount },
          { key: "error_api" as const, label: "API Errors", count: apiCount },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className="font-body text-[10px] px-2 py-1 rounded-md transition-colors"
            style={{
              background: filter === tab.key ? "rgba(139,92,246,0.1)" : "transparent",
              border: `1px solid ${filter === tab.key ? "rgba(139,92,246,0.3)" : "var(--border-subtle)"}`,
              color: filter === tab.key ? "#A78BFA" : "var(--text-tertiary)",
            }}
          >
            {tab.label} ({tab.count})
          </button>
        ))}
      </div>

      {/* Error list */}
      <div className="space-y-2 max-h-[300px] overflow-y-auto custom-scrollbar">
        {filtered.map((err, i) => (
          <div
            key={`${err.error_message}-${i}`}
            className="rounded-lg p-3"
            style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--border-subtle)" }}
          >
            <div className="flex items-start justify-between gap-2 mb-1">
              <p className="font-body text-xs font-medium break-all" style={{ color: "var(--text-primary)" }}>
                {err.error_message.substring(0, 120)}{err.error_message.length > 120 ? "..." : ""}
              </p>
              <span className="font-body text-[10px] px-1.5 py-0.5 rounded shrink-0 tabular-nums" style={{
                background: err.occurrence_count >= 10 ? "rgba(239,68,68,0.15)" : "rgba(245,158,11,0.15)",
                color: err.occurrence_count >= 10 ? "#F87171" : "#FBBF24",
              }}>
                {err.occurrence_count}x
              </span>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <span className="font-body text-[10px]" style={{ color: "var(--text-tertiary)" }}>
                {err.affected_users} user{err.affected_users !== 1 ? "s" : ""}
              </span>
              <span className="font-body text-[10px]" style={{ color: "var(--text-tertiary)" }}>
                {err.affected_pages?.slice(0, 2).join(", ")}
              </span>
              <span className="flex items-center gap-0.5 font-body text-[10px]" style={{ color: "var(--text-tertiary)" }}>
                <Clock className="w-2.5 h-2.5" strokeWidth={1.5} />
                {formatDistanceToNow(new Date(err.last_seen), { addSuffix: true })}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ErrorDashboard;
