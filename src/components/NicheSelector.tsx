import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { motion } from "framer-motion";

const NICHES = [
  "AI / ML",
  "Developer Tools",
  "SaaS",
  "Marketing",
  "Sales",
  "Finance",
  "Healthcare",
  "Education",
  "E-commerce",
  "Productivity",
  "Analytics",
  "Security",
  "Social",
  "Real Estate",
  "HR",
  "Legal",
  "Automation",
  "No-Code",
] as const;

interface NicheSelectorProps {
  selected: string[];
  onChange: (niches: string[]) => void;
  max?: number;
  storageKey?: string;
  showCustom?: boolean;
}

const NicheSelector = ({ selected, onChange, max = 3, storageKey, showCustom }: NicheSelectorProps) => {
  // Load from localStorage on mount
  useEffect(() => {
    if (!storageKey) return;
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          onChange(parsed);
        }
      } catch {}
    }
  }, [storageKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist to localStorage on change
  useEffect(() => {
    if (!storageKey) return;
    localStorage.setItem(storageKey, JSON.stringify(selected));
  }, [selected, storageKey]);

  const toggle = (niche: string) => {
    if (selected.includes(niche)) {
      onChange(selected.filter((n) => n !== niche));
    } else {
      if (selected.length >= max) return;
      onChange([...selected, niche]);
    }
  };

  const pillBase =
    "font-body text-[11px] font-medium px-3 py-1.5 rounded-md transition-all duration-150 whitespace-nowrap cursor-pointer select-none";

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="font-body text-[10px] uppercase tracking-[0.06em] font-medium" style={{ color: "var(--text-tertiary)" }}>
          Niches {selected.length > 0 && `(${selected.length}/${max})`}
        </span>
        {selected.length > 0 && (
          <button onClick={() => onChange([])} className="font-body text-[10px] transition-colors" style={{ color: "#9585F2" }}>
            Clear
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {NICHES.map((niche) => {
          const isActive = selected.includes(niche);
          const isDisabled = !isActive && selected.length >= max;
          return (
            <motion.button
              key={niche}
              whileTap={{ scale: 0.95 }}
              onClick={() => !isDisabled && toggle(niche)}
              className={`${pillBase} ${
                isActive
                  ? "text-[#EEEEF0] border border-[rgba(124,106,237,0.4)] bg-[rgba(124,106,237,0.15)]"
                  : isDisabled
                  ? "border border-transparent opacity-40 cursor-not-allowed"
                  : "border border-transparent hover:border-[var(--border-hover)]"
              }`}
              style={!isActive ? { color: "var(--text-tertiary)" } : {}}
            >
              {niche}
              {isActive && <X className="inline w-3 h-3 ml-1 -mr-0.5" strokeWidth={2} />}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
};

export default NicheSelector;
