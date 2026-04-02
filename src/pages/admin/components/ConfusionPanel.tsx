import { MousePointerClick, Clock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { ConfusionSignal } from "../types";

interface Props {
  signals: ConfusionSignal[];
}

const ConfusionPanel = ({ signals }: Props) => {
  if (signals.length === 0) {
    return (
      <div className="surface-card rounded-xl p-6 text-center" style={{ transform: "none" }}>
        <MousePointerClick className="w-8 h-8 mx-auto mb-2" style={{ color: "var(--text-tertiary)" }} strokeWidth={1.5} />
        <p className="font-heading text-sm font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
          No confusion signals
        </p>
        <p className="font-body text-xs" style={{ color: "var(--text-tertiary)" }}>
          Rage clicks and dead clicks will appear here when detected.
        </p>
      </div>
    );
  }

  const rageClicks = signals.filter((s) => s.signal_type === "rage_click");
  const deadClicks = signals.filter((s) => s.signal_type === "dead_click");

  return (
    <div className="surface-card rounded-xl p-5" style={{ transform: "none" }}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <MousePointerClick className="w-4 h-4" style={{ color: "#F59E0B" }} strokeWidth={1.5} />
          <h3 className="font-heading text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            Confusion Signals
          </h3>
          <span className="font-body text-[10px] px-1.5 py-0.5 rounded-md" style={{
            background: "rgba(245,158,11,0.1)",
            border: "1px solid rgba(245,158,11,0.2)",
            color: "#FBBF24",
          }}>
            {signals.length} hotspot{signals.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {/* Summary */}
      <div className="flex gap-3 mb-3">
        <div className="flex-1 rounded-lg p-2.5 text-center" style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.15)" }}>
          <p className="font-heading text-lg font-bold tabular-nums" style={{ color: "#F87171" }}>{rageClicks.length}</p>
          <p className="font-body text-[10px]" style={{ color: "var(--text-tertiary)" }}>Rage Clicks</p>
        </div>
        <div className="flex-1 rounded-lg p-2.5 text-center" style={{ background: "rgba(107,114,128,0.06)", border: "1px solid rgba(107,114,128,0.15)" }}>
          <p className="font-heading text-lg font-bold tabular-nums" style={{ color: "#9CA3AF" }}>{deadClicks.length}</p>
          <p className="font-body text-[10px]" style={{ color: "var(--text-tertiary)" }}>Dead Clicks</p>
        </div>
      </div>

      {/* Hotspot list */}
      <div className="space-y-2 max-h-[250px] overflow-y-auto custom-scrollbar">
        {signals.map((signal, i) => (
          <div
            key={`${signal.page}-${signal.element}-${i}`}
            className="rounded-lg p-3"
            style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--border-subtle)" }}
          >
            <div className="flex items-start justify-between gap-2 mb-1">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="font-body text-[10px] px-1.5 py-0.5 rounded" style={{
                    background: signal.signal_type === "rage_click" ? "rgba(239,68,68,0.1)" : "rgba(107,114,128,0.1)",
                    color: signal.signal_type === "rage_click" ? "#F87171" : "#9CA3AF",
                  }}>
                    {signal.signal_type === "rage_click" ? "😤 Rage" : "👆 Dead"}
                  </span>
                  <span className="font-body text-[10px] font-medium" style={{ color: "#A78BFA" }}>{signal.page}</span>
                </div>
                <p className="font-body text-[10px] truncate" style={{ color: "var(--text-tertiary)" }}>
                  {signal.element}
                </p>
              </div>
              <span className="font-body text-[10px] px-1.5 py-0.5 rounded shrink-0 tabular-nums font-medium" style={{
                background: signal.occurrence_count >= 5 ? "rgba(239,68,68,0.15)" : "rgba(245,158,11,0.15)",
                color: signal.occurrence_count >= 5 ? "#F87171" : "#FBBF24",
              }}>
                {signal.occurrence_count}x
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-body text-[10px]" style={{ color: "var(--text-tertiary)" }}>
                {signal.affected_users} user{signal.affected_users !== 1 ? "s" : ""}
              </span>
              <span className="flex items-center gap-0.5 font-body text-[10px]" style={{ color: "var(--text-tertiary)" }}>
                <Clock className="w-2.5 h-2.5" strokeWidth={1.5} />
                {formatDistanceToNow(new Date(signal.last_seen), { addSuffix: true })}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ConfusionPanel;
