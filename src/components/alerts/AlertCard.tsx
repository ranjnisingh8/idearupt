import { Bell, Pause, Play, Pencil, Trash2, Zap } from "lucide-react";
import { motion } from "framer-motion";

export interface AlertData {
  id: string;
  name: string;
  niches: string[];
  min_pain_score: number;
  frequency: "daily" | "weekly";
  status: "active" | "paused";
  last_triggered_at: string | null;
  matches_count: number;
  created_at?: string;
}

interface AlertCardProps {
  alert: AlertData;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
  index: number;
}

const AlertCard = ({ alert, onEdit, onToggle, onDelete, index }: AlertCardProps) => {
  const isActive = alert.status === "active";
  const lastTriggered = alert.last_triggered_at
    ? new Date(alert.last_triggered_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : "Never";

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.06, ease: [0.25, 0.1, 0.25, 1] }}
      className={`surface-card p-4 transition-opacity duration-300 ${!isActive ? "opacity-50" : ""}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
            style={{
              background: isActive ? "rgba(124,106,237,0.1)" : "rgba(255,255,255,0.04)",
            }}
          >
            <Bell className="w-4 h-4" style={{ color: isActive ? "#9585F2" : "var(--text-tertiary)" }} strokeWidth={1.5} />
          </div>
          <div className="min-w-0">
            <h3 className="font-heading text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>
              {alert.name}
            </h3>
            <p className="font-body text-[11px]" style={{ color: "var(--text-tertiary)" }}>
              {alert.frequency === "daily" ? "Daily" : "Weekly"} · Pain ≥ {alert.min_pain_score}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={(e) => { e.stopPropagation(); onToggle(); }}
            className="p-1.5 rounded-lg hover:bg-[rgba(255,255,255,0.06)] transition-colors"
            style={{ color: "var(--text-tertiary)" }}
            title={isActive ? "Pause alert" : "Resume alert"}
          >
            {isActive ? <Pause className="w-3.5 h-3.5" strokeWidth={1.5} /> : <Play className="w-3.5 h-3.5" strokeWidth={1.5} />}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
            className="p-1.5 rounded-lg hover:bg-[rgba(255,255,255,0.06)] transition-colors"
            style={{ color: "var(--text-tertiary)" }}
            title="Edit alert"
          >
            <Pencil className="w-3.5 h-3.5" strokeWidth={1.5} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="p-1.5 rounded-lg hover:bg-[rgba(239,68,68,0.08)] transition-colors"
            style={{ color: "var(--text-tertiary)" }}
            title="Delete alert"
          >
            <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {/* Niches */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {alert.niches.map((niche) => (
          <span
            key={niche}
            className="font-body text-[10px] font-medium px-2 py-0.5 rounded-md"
            style={{
              background: "rgba(124,106,237,0.08)",
              border: "1px solid rgba(124,106,237,0.15)",
              color: "#9585F2",
            }}
          >
            {niche}
          </span>
        ))}
      </div>

      {/* Stats */}
      <div className="flex items-center gap-4">
        <span className="font-body text-[11px] flex items-center gap-1" style={{ color: "var(--text-tertiary)" }}>
          <Zap className="w-3 h-3" strokeWidth={1.5} />
          {alert.matches_count} match{alert.matches_count !== 1 ? "es" : ""}
        </span>
        <span className="font-body text-[11px]" style={{ color: "var(--text-tertiary)" }}>
          Last: {lastTriggered}
        </span>
      </div>
    </motion.div>
  );
};

export default AlertCard;
