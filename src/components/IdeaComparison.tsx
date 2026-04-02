import { X } from "lucide-react";
import { motion } from "framer-motion";
import { Idea } from "@/data/ideas";
import { getScoreColor } from "@/lib/theme";

interface Props {
  ideas: Idea[];
  onClose: () => void;
  onRemove: (id: string) => void;
}

const metrics: { key: string; label: string; getValue: (idea: Idea) => string | number; getColor?: (v: number) => string }[] = [
  {
    key: "overall",
    label: "Overall Score",
    getValue: (i) => (i.overall_score ?? 0).toFixed(1),
    getColor: (v) => getScoreColor(v),
  },
  {
    key: "pain",
    label: "Pain Score",
    getValue: (i) => (i.scores?.pain_score ?? 0).toFixed(1),
    getColor: (v) => v >= 7 ? "#F97316" : v >= 5 ? "#FBBF24" : "var(--text-tertiary)",
  },
  {
    key: "revenue",
    label: "Revenue Potential",
    getValue: (i) => (i.scores?.revenue_potential ?? 0).toFixed(1),
    getColor: (v) => v >= 7 ? "#10B981" : v >= 5 ? "#FBBF24" : "var(--text-tertiary)",
  },
  {
    key: "competition",
    label: "Competition",
    getValue: (i) => (i.scores?.competition_score ?? 0).toFixed(1),
    getColor: (v) => v <= 3 ? "#10B981" : v <= 6 ? "#FBBF24" : "#F87171",
  },
  {
    key: "build_difficulty",
    label: "Build Difficulty",
    getValue: (i) => (i.scores?.build_difficulty ?? 0).toFixed(1),
    getColor: (v) => v <= 3 ? "#10B981" : v <= 6 ? "#FBBF24" : "#F87171",
  },
  {
    key: "trend",
    label: "Trend Score",
    getValue: (i) => (i.scores?.trend_score ?? 0).toFixed(1),
    getColor: (v) => v >= 7 ? "#06B6D4" : v >= 5 ? "#FBBF24" : "var(--text-tertiary)",
  },
  {
    key: "mrr",
    label: "Est. MRR",
    getValue: (i) => i.estimatedMRR || i.estimated_mrr_range || "—",
  },
  {
    key: "audience",
    label: "Target Audience",
    getValue: (i) => i.targetAudience || "—",
  },
  {
    key: "saves",
    label: "Saves",
    getValue: (i) => i.save_count ?? 0,
  },
];

const IdeaComparison = ({ ideas, onClose, onRemove }: Props) => {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20 }}
        transition={{ duration: 0.25 }}
        className="w-full max-w-3xl max-h-[85vh] overflow-auto rounded-2xl"
        style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-4" style={{ background: "var(--bg-elevated)", borderBottom: "1px solid var(--border-subtle)" }}>
          <h2 className="font-heading text-lg font-bold" style={{ color: "var(--text-primary)" }}>
            Compare Ideas
          </h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-[rgba(255,255,255,0.05)] min-w-[44px] min-h-[44px] flex items-center justify-center" style={{ color: "var(--text-tertiary)" }} aria-label="Close comparison">
            <X className="w-5 h-5" strokeWidth={1.5} />
          </button>
        </div>

        {/* Table */}
        <div className="px-5 py-4">
          <table className="w-full">
            <thead>
              <tr>
                <th className="text-left pr-4 pb-4 font-body text-[11px] uppercase tracking-wider" style={{ color: "var(--text-tertiary)", width: "140px" }}>
                  Metric
                </th>
                {ideas.map((idea) => (
                  <th key={idea.id} className="text-left pb-4 px-2" style={{ minWidth: "140px" }}>
                    <div className="flex items-start justify-between gap-1">
                      <div className="min-w-0">
                        <p className="font-heading text-sm font-semibold line-clamp-2 leading-tight" style={{ color: "var(--text-primary)" }}>
                          {idea.title}
                        </p>
                        <p className="font-body text-[10px] mt-0.5" style={{ color: "var(--text-tertiary)" }}>
                          {idea.category}
                        </p>
                      </div>
                      <button
                        onClick={() => onRemove(idea.id)}
                        className="p-1 rounded shrink-0 hover:bg-[rgba(255,255,255,0.05)]"
                        style={{ color: "var(--text-tertiary)" }}
                        aria-label={`Remove ${idea.title}`}
                      >
                        <X className="w-3 h-3" strokeWidth={1.5} />
                      </button>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {metrics.map((m) => {
                // Find best value for highlighting
                const numValues = ideas.map((idea) => {
                  const raw = m.getValue(idea);
                  return typeof raw === "number" ? raw : parseFloat(String(raw));
                });
                const isBest = (idx: number) => {
                  const v = numValues[idx];
                  if (isNaN(v)) return false;
                  // For competition & build difficulty, lower is better
                  if (m.key === "competition" || m.key === "build_difficulty") {
                    return v === Math.min(...numValues.filter((n) => !isNaN(n)));
                  }
                  return v === Math.max(...numValues.filter((n) => !isNaN(n)));
                };

                return (
                  <tr key={m.key}>
                    <td className="pr-4 py-2.5 font-body text-xs font-medium" style={{ color: "var(--text-secondary)", borderTop: "1px solid var(--border-subtle)" }}>
                      {m.label}
                    </td>
                    {ideas.map((idea, idx) => {
                      const val = m.getValue(idea);
                      const numVal = typeof val === "number" ? val : parseFloat(String(val));
                      const color = m.getColor && !isNaN(numVal) ? m.getColor(numVal) : "var(--text-primary)";
                      const best = ideas.length > 1 && isBest(idx);

                      return (
                        <td
                          key={idea.id}
                          className="px-2 py-2.5 font-heading text-sm font-semibold tabular-nums"
                          style={{
                            color,
                            borderTop: "1px solid var(--border-subtle)",
                            background: best ? "rgba(16,185,129,0.06)" : undefined,
                          }}
                        >
                          {val}
                          {best && <span className="ml-1 text-[9px] font-body" style={{ color: "#34D399" }}>Best</span>}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default IdeaComparison;
