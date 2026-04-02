import { motion } from "framer-motion";
import CountUpScore from "@/components/CountUpScore";

interface ScoreGaugeProps {
  score: number;
}

const ScoreGauge = ({ score: rawScore }: ScoreGaugeProps) => {
  const score = Number(rawScore ?? 0) || 0;
  const circumference = 2 * Math.PI * 60;
  const percentage = (score / 10) * 100;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  const getColor = (s: number) => {
    if (s >= 8) return { stroke: "#10B981", glow: "0 0 30px rgba(16,185,129,0.4)" };
    if (s >= 6) return { stroke: "#F59E0B", glow: "0 0 30px rgba(245,158,11,0.4)" };
    return { stroke: "#EF4444", glow: "0 0 30px rgba(239,68,68,0.4)" };
  };

  const color = getColor(score);

  // Premium visual effects for high scores
  const hasGoldenGlow = score >= 8.5;
  const hasFireRing = score >= 9.0;
  const isLow = score < 7;

  return (
    <div
      className="relative w-[150px] h-[150px] mx-auto"
      style={{
        filter: isLow ? 'grayscale(0.5)' : `drop-shadow(${color.glow})`,
        ...(hasFireRing ? { animation: 'fire-ring-pulse 2s ease-in-out infinite' } : {}),
      }}
    >
      {/* Golden shimmer overlay for 8.5+ */}
      {hasGoldenGlow && !hasFireRing && (
        <div className="absolute inset-0 rounded-full pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(255,215,0,0.08) 0%, transparent 60%)', animation: 'golden-shimmer 3s ease-in-out infinite' }} />
      )}

      {/* Fire ring for 9.0+ */}
      {hasFireRing && (
        <div className="absolute -inset-2 rounded-full pointer-events-none" style={{ background: 'conic-gradient(from 0deg, #F97316, #EF4444, #F97316, #EF4444, #F97316)', mask: 'radial-gradient(circle, transparent 55%, black 56%, black 60%, transparent 61%)', WebkitMask: 'radial-gradient(circle, transparent 55%, black 56%, black 60%, transparent 61%)', animation: 'fire-ring-rotate 3s linear infinite', opacity: 0.7 }} />
      )}

      <svg className="w-full h-full -rotate-90" viewBox="0 0 130 130">
        <circle cx="65" cy="65" r="60" fill="none" stroke={isLow ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.06)"} strokeWidth="6" />
        <motion.circle
          cx="65"
          cy="65"
          r="60"
          fill="none"
          stroke={isLow ? "#565B6E" : color.stroke}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset }}
          transition={{ duration: 1.2, ease: "easeOut", delay: 0.3 }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span style={{ color: isLow ? "#565B6E" : color.stroke }}>
          <CountUpScore
            value={score}
            className="font-heading text-4xl font-bold tabular-nums"
          />
        </span>
        <span className="font-body text-[11px] uppercase tracking-widest" style={{ color: isLow ? "#3a3d4a" : "var(--text-tertiary)" }}>
          / 10
        </span>
      </div>
    </div>
  );
};

export default ScoreGauge;
