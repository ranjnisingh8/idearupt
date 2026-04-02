import { motion } from "framer-motion";
import { useState, useEffect, useRef } from "react";
import { PLATFORM_STATS } from "@/lib/config";

const stats = [
  { value: 12400, suffix: "+", label: "Real complaints analyzed" },
  { value: PLATFORM_STATS.buildersActive, suffix: "+", label: "Builders joined" },
  { value: 8, suffix: "+", label: "Communities scanned daily" },
  { value: 24, suffix: "hrs", label: "Refresh cycle" },
];

const CountStat = ({ value, suffix }: { value: number; suffix: string }) => {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    if (started) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setStarted(true);
          const duration = 1500;
          const startTime = performance.now();
          const animate = (now: number) => {
            const progress = Math.min((now - startTime) / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            setCount(Math.round(eased * value));
            if (progress < 1) requestAnimationFrame(animate);
          };
          requestAnimationFrame(animate);
        }
      },
      { threshold: 0.5 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [value, started]);

  return (
    <span ref={ref} className="font-heading text-3xl sm:text-4xl font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>
      {count.toLocaleString()}{suffix}
    </span>
  );
};

const StatsSection = () => (
  <section className="container mx-auto px-4 py-20 sm:py-28">
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
      className="surface-card p-8 sm:p-14 relative overflow-hidden"
    >
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse 60% 60% at 50% 50%, rgba(139,92,246,0.04) 0%, transparent 70%)' }} />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-8 sm:gap-10 text-center relative z-10">
        {stats.map((stat) => (
          <div key={stat.label}>
            <div className="mb-2.5">
              <CountStat value={stat.value} suffix={stat.suffix} />
            </div>
            <p className="font-body text-xs uppercase tracking-[0.08em] font-medium" style={{ color: 'var(--text-tertiary)' }}>{stat.label}</p>
          </div>
        ))}
      </div>
    </motion.div>
  </section>
);

export default StatsSection;
