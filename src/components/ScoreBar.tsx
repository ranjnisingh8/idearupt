import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";

interface ScoreBarProps {
  label: string;
  value: number;
  maxValue?: number;
}

const ScoreBar = ({ label, value, maxValue = 10 }: ScoreBarProps) => {
  const safeValue = Number(value ?? 0) || 0;
  const percentage = (safeValue / maxValue) * 100;
  const colorClass = safeValue >= 7 ? "bg-score-green" : safeValue >= 5 ? "bg-score-amber" : "bg-score-red";
  const [inView, setInView] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setInView(true); },
      { threshold: 0.3 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className="flex items-center gap-2.5">
      <span className="font-body text-[11px] w-20 shrink-0 uppercase tracking-[0.04em] font-medium" style={{ color: 'var(--text-tertiary)' }}>{label}</span>
      <div className="flex-1 h-[5px] rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
        <motion.div
          className={`h-full rounded-full ${colorClass} will-change-[width]`}
          initial={{ width: 0 }}
          animate={{ width: inView ? `${percentage}%` : 0 }}
          transition={{ duration: 0.8, ease: "easeOut", delay: 0.2 }}
        />
      </div>
      <span className="font-body text-xs font-semibold w-5 text-right tabular-nums" style={{ color: 'var(--text-secondary)' }}>{safeValue}</span>
    </div>
  );
};

export default ScoreBar;