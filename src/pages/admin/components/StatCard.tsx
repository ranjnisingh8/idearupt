import { motion } from "framer-motion";
import { TrendingUp, TrendingDown } from "lucide-react";

interface StatCardProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  color: string;
  subtitle?: string;
  delta?: number;
  deltaLabel?: string;
}

const StatCard = ({ label, value, icon, color, subtitle, delta, deltaLabel }: StatCardProps) => (
  <motion.div
    className="surface-card p-3.5 sm:p-4 relative overflow-hidden"
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.3 }}
  >
    <div className="flex items-center justify-between mb-1.5">
      <span
        className="font-body text-[10px] sm:text-xs uppercase tracking-wider"
        style={{ color: "var(--text-tertiary)" }}
      >
        {label}
      </span>
      <div style={{ color }} className="opacity-70">
        {icon}
      </div>
    </div>
    <div
      className="font-heading text-xl sm:text-2xl font-bold tabular-nums"
      style={{ color: "var(--text-primary)" }}
    >
      {typeof value === "number" ? value.toLocaleString() : value}
    </div>
    {delta !== undefined && delta !== 0 && (
      <span
        className="font-body text-[10px] mt-0.5 flex items-center gap-0.5"
        style={{ color: delta >= 0 ? "#10B981" : "#EF4444" }}
      >
        {delta >= 0 ? (
          <TrendingUp className="w-3 h-3" />
        ) : (
          <TrendingDown className="w-3 h-3" />
        )}
        {delta >= 0 ? "+" : ""}
        {delta} {deltaLabel || "vs prev"}
      </span>
    )}
    {subtitle && (
      <span
        className="font-body text-[10px] sm:text-[11px] mt-0.5 block"
        style={{ color: "var(--text-tertiary)" }}
      >
        {subtitle}
      </span>
    )}
  </motion.div>
);

export default StatCard;
