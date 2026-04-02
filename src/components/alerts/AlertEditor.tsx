import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { motion } from "framer-motion";
import NicheSelector from "@/components/NicheSelector";
import type { AlertData } from "./AlertCard";

interface AlertEditorProps {
  alert?: AlertData | null;
  onSave: (data: { name: string; niches: string[]; min_pain_score: number; frequency: "daily" | "weekly" }) => void;
  onCancel: () => void;
}

const AlertEditor = ({ alert, onSave, onCancel }: AlertEditorProps) => {
  const [name, setName] = useState(alert?.name || "");
  const [niches, setNiches] = useState<string[]>(alert?.niches || []);
  const [minPain, setMinPain] = useState(alert?.min_pain_score ?? 6);
  const [frequency, setFrequency] = useState<"daily" | "weekly">(alert?.frequency || "daily");

  // Sync form state when editing a different alert (useState initializers only run on mount)
  useEffect(() => {
    setName(alert?.name || "");
    setNiches(alert?.niches || []);
    setMinPain(alert?.min_pain_score ?? 6);
    setFrequency(alert?.frequency || "daily");
  }, [alert]); // re-sync whenever the alert prop changes

  const canSave = name.trim().length > 0 && niches.length > 0;

  const handleSave = () => {
    if (!canSave) return;
    onSave({ name: name.trim(), niches, min_pain_score: minPain, frequency });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      className="surface-card p-5"
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-heading text-base font-semibold" style={{ color: "var(--text-primary)" }}>
          {alert ? "Edit Alert" : "New Alert"}
        </h3>
        <button onClick={onCancel} className="p-1.5 rounded-lg hover:bg-[rgba(255,255,255,0.06)]" style={{ color: "var(--text-tertiary)" }}>
          <X className="w-4 h-4" strokeWidth={1.5} />
        </button>
      </div>

      {/* Name */}
      <div className="mb-4">
        <label className="font-body text-[11px] uppercase tracking-[0.06em] font-medium mb-1.5 block" style={{ color: "var(--text-tertiary)" }}>
          Alert Name
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. AI SaaS Problems"
          maxLength={50}
          className="font-body w-full rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[rgba(124,106,237,0.3)]"
          style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", color: "var(--text-primary)" }}
        />
      </div>

      {/* Niches */}
      <div className="mb-4">
        <NicheSelector selected={niches} onChange={setNiches} max={3} />
      </div>

      {/* Min Pain Score */}
      <div className="mb-4">
        <label className="font-body text-[11px] uppercase tracking-[0.06em] font-medium mb-1.5 block" style={{ color: "var(--text-tertiary)" }}>
          Min Pain Score: <span style={{ color: "var(--text-primary)" }}>{minPain}</span>
        </label>
        <input
          type="range"
          min={1}
          max={10}
          step={0.5}
          value={minPain}
          onChange={(e) => setMinPain(Number(e.target.value))}
          className="w-full accent-[#7C6AED]"
        />
        <div className="flex justify-between mt-1">
          <span className="font-body text-[10px]" style={{ color: "var(--text-tertiary)" }}>Low</span>
          <span className="font-body text-[10px]" style={{ color: "var(--text-tertiary)" }}>High</span>
        </div>
      </div>

      {/* Frequency */}
      <div className="mb-5">
        <label className="font-body text-[11px] uppercase tracking-[0.06em] font-medium mb-1.5 block" style={{ color: "var(--text-tertiary)" }}>
          Frequency
        </label>
        <div className="flex gap-2">
          {(["daily", "weekly"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFrequency(f)}
              className={`font-body text-xs font-medium px-4 py-2 rounded-lg transition-all ${
                frequency === f
                  ? "text-[#EEEEF0] border border-[rgba(124,106,237,0.4)] bg-[rgba(124,106,237,0.15)]"
                  : "border border-[var(--border-subtle)] hover:border-[var(--border-hover)]"
              }`}
              style={frequency !== f ? { color: "var(--text-tertiary)" } : {}}
            >
              {f === "daily" ? "Daily" : "Weekly"}
            </button>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2.5">
        <button
          onClick={handleSave}
          disabled={!canSave}
          className={`flex-1 py-2.5 rounded-xl font-heading text-sm font-semibold text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed ${canSave ? "btn-gradient" : ""}`}
          style={!canSave ? { background: "var(--bg-elevated)", color: "var(--text-tertiary)" } : {}}
        >
          {alert ? "Save Changes" : "Create Alert"}
        </button>
        <button
          onClick={onCancel}
          className="btn-ghost px-5 py-2.5 font-body text-sm"
        >
          Cancel
        </button>
      </div>
    </motion.div>
  );
};

export default AlertEditor;
