import { useState } from "react";
import { Search, Swords, BarChart3, CheckCircle2, ChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const steps = [
  {
    icon: Search,
    title: "Demand Analysis",
    description: "We scan Reddit, Hacker News, and other communities to find real complaints matching your idea.",
    color: "#22D3EE",
  },
  {
    icon: Swords,
    title: "Competition Scan",
    description: "We identify existing solutions, their pricing, weaknesses, and estimated revenue.",
    color: "#A78BFA",
  },
  {
    icon: BarChart3,
    title: "Market Sizing",
    description: "We estimate revenue potential based on audience size, willingness-to-pay signals, and market trends.",
    color: "#FBBF24",
  },
  {
    icon: CheckCircle2,
    title: "Verdict",
    description: "You get a Build / Validate More / Don't Build score based on pain, trend, competition, and revenue.",
    color: "#34D399",
  },
];

const ValidateExplainer = () => {
  const [isOpen, setIsOpen] = useState(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem("validate_explainer_seen") !== "true";
  });

  const toggle = () => {
    const next = !isOpen;
    setIsOpen(next);
    if (!next) {
      localStorage.setItem("validate_explainer_seen", "true");
    }
  };

  return (
    <div className="mb-5">
      <button
        onClick={toggle}
        className="flex items-center gap-2 w-full text-left group"
      >
        <span
          className="font-body text-xs font-medium uppercase tracking-[0.06em]"
          style={{ color: "var(--text-tertiary)" }}
        >
          How it works
        </span>
        <div className="flex-1 h-px" style={{ background: "var(--border-subtle)" }} />
        <ChevronDown
          className={`w-3.5 h-3.5 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
          style={{ color: "var(--text-tertiary)" }}
          strokeWidth={1.5}
        />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
            className="overflow-hidden"
          >
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-3">
              {steps.map((step, i) => (
                <motion.div
                  key={step.title}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: i * 0.08 }}
                  className="surface-card p-3 flex flex-col gap-2"
                >
                  <div className="flex items-center gap-2">
                    <div
                      className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                      style={{ background: `${step.color}15` }}
                    >
                      <step.icon className="w-3.5 h-3.5" style={{ color: step.color }} strokeWidth={1.5} />
                    </div>
                    <span
                      className="font-heading text-[11px] sm:text-xs font-semibold"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {step.title}
                    </span>
                  </div>
                  <p
                    className="font-body text-[11px] leading-[1.5]"
                    style={{ color: "var(--text-tertiary)" }}
                  >
                    {step.description}
                  </p>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ValidateExplainer;
