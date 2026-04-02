import { motion } from "framer-motion";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import {
  X, Target, DollarSign, Users, BarChart3, Clock,
  Rocket, ExternalLink, CheckCircle2, MapPin,
  Lightbulb, ArrowRight, Lock,
} from "lucide-react";
import type { UseCase } from "@/pages/UseCases";
import { useAccess } from "@/hooks/useAccess";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";

interface Props {
  useCase: UseCase;
  onClose: () => void;
}

const getDifficultyStyle = (d: string | null) => {
  switch (d) {
    case "beginner":
      return { label: "Beginner", color: "#34D399", bg: "rgba(16,185,129,0.1)", border: "rgba(16,185,129,0.25)" };
    case "advanced":
      return { label: "Advanced", color: "#F87171", bg: "rgba(239,68,68,0.1)", border: "rgba(239,68,68,0.25)" };
    default:
      return { label: "Intermediate", color: "#FBBF24", bg: "rgba(245,158,11,0.1)", border: "rgba(245,158,11,0.25)" };
  }
};

const getDemandStyle = (score: number | null) => {
  const s = score ?? 0;
  if (s >= 8) return { color: "#34D399", bg: "rgba(16,185,129,0.12)", border: "rgba(16,185,129,0.3)" };
  if (s >= 6) return { color: "#FBBF24", bg: "rgba(245,158,11,0.12)", border: "rgba(245,158,11,0.3)" };
  return { color: "#A78BFA", bg: "rgba(139,92,246,0.12)", border: "rgba(139,92,246,0.3)" };
};

const UseCaseDetail = ({ useCase: uc, onClose }: Props) => {
  const { canSeeSourceThreads } = useAccess();
  const { user } = useAuth();
  const navigate = useNavigate();
  const diffStyle = getDifficultyStyle(uc.difficulty);
  const demandStyle = getDemandStyle(uc.demand_score);

  // Lock body scroll
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const modalContent = (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0" style={{ background: "rgba(0, 0, 0, 0.6)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }} />

      {/* Modal */}
      <motion.div
        initial={{ opacity: 0, y: 40, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 40, scale: 0.97 }}
        transition={{ type: "spring", stiffness: 400, damping: 30 }}
        className="relative w-full max-w-xl max-h-[85vh] overflow-y-auto rounded-2xl"
        style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border-subtle)",
          boxShadow: "0 25px 80px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(139, 92, 246, 0.06)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mobile drag indicator */}
        <div className="sm:hidden flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full" style={{ background: "rgba(255,255,255,0.15)" }} />
        </div>

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-xl transition-colors z-10 hover:bg-[rgba(255,255,255,0.05)]"
          style={{ color: "var(--text-tertiary)" }}
        >
          <X className="w-5 h-5" strokeWidth={1.5} />
        </button>

        <div className="p-5 sm:p-6">
          {/* Badges row */}
          <div className="flex items-center gap-2 flex-wrap mb-4">
            <span
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold border"
              style={{ color: demandStyle.color, background: demandStyle.bg, borderColor: demandStyle.border }}
            >
              <BarChart3 className="w-3.5 h-3.5" strokeWidth={2} />
              Demand {uc.demand_score?.toFixed(1) ?? "—"}/10
            </span>
            <span
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold border"
              style={{ color: diffStyle.color, background: diffStyle.bg, borderColor: diffStyle.border }}
            >
              {diffStyle.label}
            </span>
            {uc.category && (
              <span className="px-2.5 py-1 rounded-lg text-xs font-semibold border text-[#A78BFA] border-[rgba(139,92,246,0.2)] bg-[rgba(139,92,246,0.1)]">
                {uc.category}
              </span>
            )}
            {uc.estimated_build_time && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs border" style={{ color: "var(--text-tertiary)", background: "rgba(255,255,255,0.03)", borderColor: "var(--border-subtle)" }}>
                <Clock className="w-3.5 h-3.5" strokeWidth={1.5} />
                {uc.estimated_build_time}
              </span>
            )}
          </div>

          {/* Title */}
          <h2 className="font-heading text-xl sm:text-2xl font-bold tracking-[-0.02em] leading-tight mb-2" style={{ color: "var(--text-primary)" }}>
            {uc.title}
          </h2>

          {/* Target user */}
          {uc.target_user && (
            <div className="flex items-center gap-2 mb-5">
              <Target className="w-4 h-4 shrink-0" style={{ color: "#A78BFA" }} strokeWidth={1.5} />
              <span className="font-body text-sm" style={{ color: "var(--text-secondary)" }}>
                {uc.target_user}
              </span>
            </div>
          )}

          {/* ── Problem ───────────────────────────── */}
          {uc.problem && (
            <Section icon={Lightbulb} title="The Problem" color="#F59E0B">
              <p className="font-body text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                {uc.problem}
              </p>
            </Section>
          )}

          {/* ── Solution ──────────────────────────── */}
          {uc.solution && (
            <Section icon={Rocket} title="Solution Scope" color="#8B5CF6">
              <p className="font-body text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                {uc.solution}
              </p>
            </Section>
          )}

          {/* ── Pricing Recommendation ────────────── */}
          {uc.pricing_recommendation && (
            <Section icon={DollarSign} title="Pricing Recommendation" color="#34D399">
              <p className="font-body text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                {uc.pricing_recommendation}
              </p>
            </Section>
          )}

          {/* ── Where to Find Customers ───────────── */}
          {uc.where_to_find_customers && (
            <Section icon={MapPin} title="Where to Find Customers" color="#22D3EE">
              <p className="font-body text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                {uc.where_to_find_customers}
              </p>
            </Section>
          )}

          {/* ── Launch Steps ──────────────────────── */}
          {uc.launch_steps && uc.launch_steps.length > 0 && (
            <Section icon={CheckCircle2} title="Launch Plan" color="#A78BFA">
              <ol className="space-y-3">
                {uc.launch_steps.map((step, i) => (
                  <li key={i} className="flex gap-3">
                    <span
                      className="flex items-center justify-center w-6 h-6 rounded-full shrink-0 text-[11px] font-bold"
                      style={{
                        background: "linear-gradient(135deg, rgba(139,92,246,0.2), rgba(6,182,212,0.1))",
                        border: "1px solid rgba(139,92,246,0.3)",
                        color: "#A78BFA",
                      }}
                    >
                      {i + 1}
                    </span>
                    <span className="font-body text-sm leading-relaxed pt-0.5" style={{ color: "var(--text-secondary)" }}>
                      {step}
                    </span>
                  </li>
                ))}
              </ol>
            </Section>
          )}

          {/* ── Source Links (Pro only) ──────────────────────── */}
          {uc.source_links && uc.source_links.length > 0 && (
            <Section icon={ExternalLink} title="Sources" color="#6B7280">
              {canSeeSourceThreads ? (
                <div className="flex flex-wrap gap-2">
                  {uc.source_links.map((link, i) => {
                    let label = "Source";
                    try {
                      label = new URL(link).hostname.replace("www.", "");
                    } catch { /* keep default */ }
                    return (
                      <a
                        key={i}
                        href={link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 hover:scale-[1.02]"
                        style={{
                          background: "rgba(255,255,255,0.04)",
                          border: "1px solid var(--border-subtle)",
                          color: "var(--text-secondary)",
                        }}
                      >
                        <ExternalLink className="w-3 h-3" strokeWidth={1.5} />
                        {label}
                      </a>
                    );
                  })}
                </div>
              ) : (
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg" style={{ background: "rgba(139,92,246,0.06)", border: "1px solid rgba(139,92,246,0.12)" }}>
                  <Lock className="w-3.5 h-3.5 shrink-0" style={{ color: "#A78BFA" }} strokeWidth={1.5} />
                  <span className="font-body text-xs" style={{ color: "var(--text-tertiary)" }}>
                    Original source threads are a Pro feature
                  </span>
                  <button
                    onClick={() => navigate("/pricing")}
                    className="ml-auto text-[10px] font-heading font-semibold px-2.5 py-1 rounded-md transition-colors"
                    style={{ background: "rgba(139,92,246,0.15)", color: "#A78BFA" }}
                  >
                    Upgrade
                  </button>
                </div>
              )}
            </Section>
          )}
        </div>
      </motion.div>
    </motion.div>
  );

  return createPortal(modalContent, document.body);
};

// Reusable section component
const Section = ({
  icon: Icon,
  title,
  color,
  children,
}: {
  icon: React.ElementType;
  title: string;
  color: string;
  children: React.ReactNode;
}) => (
  <div className="mb-5">
    <div className="flex items-center gap-2 mb-2.5">
      <Icon className="w-4 h-4 shrink-0" style={{ color }} strokeWidth={1.5} />
      <h3 className="font-heading text-sm font-semibold tracking-[-0.01em]" style={{ color: "var(--text-primary)" }}>
        {title}
      </h3>
    </div>
    <div className="ml-6">{children}</div>
  </div>
);

export default UseCaseDetail;
