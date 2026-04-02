import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";

interface SortTabsProps {
  options: readonly string[];
  active: string;
  onChange: (value: string) => void;
  layoutId: string;
  showForYouIcon?: boolean;
}

const SortTabs = ({ options, active, onChange, layoutId, showForYouIcon }: SortTabsProps) => (
  <div
    className="flex gap-3 sm:gap-6 mb-3 sm:mb-5 overflow-x-auto scrollbar-hide"
    style={{ borderBottom: "1px solid var(--border-subtle)" }}
  >
    {options.map((s) => {
      const isActive = active === s;
      const isForYou = s === "For You" && showForYouIcon;
      return (
        <button
          key={s}
          onClick={() => onChange(s)}
          className={`font-heading text-[12px] sm:text-[13px] font-medium uppercase tracking-[0.05em] pb-3 transition-colors duration-150 relative whitespace-nowrap shrink-0 ${
            isActive ? "text-gradient-purple-cyan" : ""
          }`}
          style={!isActive ? { color: "var(--text-tertiary)" } : {}}
        >
          {isForYou && <Sparkles className="w-3 h-3 inline mr-1" strokeWidth={1.5} />}
          {s}
          {isActive && (
            <motion.div
              layoutId={layoutId}
              className="absolute bottom-0 left-0 right-0 h-[2px]"
              style={{ background: "var(--accent-purple)" }}
              transition={{ type: "spring", stiffness: 500, damping: 30 }}
            />
          )}
        </button>
      );
    })}
  </div>
);

export default SortTabs;
