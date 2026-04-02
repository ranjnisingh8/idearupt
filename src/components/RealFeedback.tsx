import { ArrowUp, Lock, Sparkles } from "lucide-react";
import { motion } from "framer-motion";
import { PAYMENTS_ENABLED } from "@/lib/config";
import { useProStatus } from "@/hooks/useProStatus";
import { useAuth } from "@/contexts/AuthContext";
import { openCheckout, getPlanForUser, resolveCheckoutPlan } from "@/utils/checkout";

interface Feedback {
  quote: string;
  source: string;
  upvotes: number;
  sentiment: string;
}

const sentimentMap: Record<string, { emoji: string; color: string }> = {
  frustrated: { emoji: "😤", color: "#F59E0B" },
  angry: { emoji: "😡", color: "#EF4444" },
  desperate: { emoji: "🆘", color: "#DC2626" },
  hopeful: { emoji: "💚", color: "#10B981" },
  neutral: { emoji: "💬", color: "#565B6E" },
};

const getSourceStyle = (source: string) => {
  const s = source.toLowerCase();
  if (s.startsWith("r/")) return { bg: "rgba(255,69,0,0.12)", border: "rgba(255,69,0,0.25)", color: "#FF6B35" };
  if (s.includes("hacker news")) return { bg: "rgba(255,132,0,0.12)", border: "rgba(255,132,0,0.25)", color: "#FF8400" };
  if (s.includes("g2")) return { bg: "rgba(16,185,129,0.12)", border: "rgba(16,185,129,0.25)", color: "#34D399" };
  if (s.includes("capterra")) return { bg: "rgba(59,130,246,0.12)", border: "rgba(59,130,246,0.25)", color: "#60A5FA" };
  if (s.includes("product hunt")) return { bg: "rgba(218,73,36,0.12)", border: "rgba(218,73,36,0.25)", color: "#DA4924" };
  return { bg: "rgba(255,255,255,0.05)", border: "rgba(255,255,255,0.1)", color: "var(--text-tertiary)" };
};

interface Props {
  feedback: Feedback[];
  sourceUrl?: string;
}

const FREE_QUOTE_LIMIT = 1; // Free users see only 1 quote, rest locked

const RealFeedback = ({ feedback, sourceUrl }: Props) => {
  const { hasFullAccess, isEarlyAdopter, hasUsedTrial } = useProStatus();
  const { user } = useAuth();
  const userPlan = getPlanForUser(isEarlyAdopter);

  if (!feedback || feedback.length === 0) return null;

  // All quotes visible within daily view limits — no per-section gating
  const isGated = false;
  const visibleFeedback = feedback;
  const lockedFeedback: Feedback[] = [];

  return (
    <section data-premium="true" className="mb-6">
      <div className="pl-3 mb-4" style={{ borderLeft: "3px solid var(--accent-cyan)" }}>
        <h4 className="font-heading text-base font-semibold" style={{ color: "var(--text-primary)" }}>
          💬 What Real Users Are Saying
        </h4>
        <p className="font-body text-[12px] mt-0.5" style={{ color: "var(--text-tertiary)" }}>
          Actual complaints from the wild
        </p>
      </div>

      <div className="space-y-3">
        {/* Fully visible quotes */}
        {visibleFeedback.map((f, i) => {
          const sent = sentimentMap[f.sentiment] || sentimentMap.neutral;
          const srcStyle = getSourceStyle(f.source);
          return (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: i * 0.08 }}
              className="surface-card rounded-xl p-4"
              style={{ transform: "none", borderLeft: `3px solid ${sent.color}` }}
            >
              {/* Quote */}
              <div className="relative mb-3">
                <span className="absolute -top-1 -left-1 font-serif text-2xl leading-none" style={{ color: "var(--text-tertiary)", opacity: 0.4 }}>"</span>
                <p className="font-body text-sm italic leading-relaxed pl-4" style={{ color: "var(--text-secondary)" }}>
                  {f.quote}
                </p>
              </div>

              {/* Meta row */}
              <div className="flex items-center gap-2 flex-wrap">
                {/* Source pill */}
                {sourceUrl ? (
                  <a
                    href={sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-body text-[11px] font-medium px-2 py-0.5 rounded-md transition-opacity hover:opacity-80 inline-flex items-center gap-1"
                    style={{ background: srcStyle.bg, border: `1px solid ${srcStyle.border}`, color: srcStyle.color }}
                  >
                    {f.source}
                  </a>
                ) : (
                  <span
                    className="font-body text-[11px] font-medium px-2 py-0.5 rounded-md"
                    style={{ background: srcStyle.bg, border: `1px solid ${srcStyle.border}`, color: srcStyle.color }}
                  >
                    {f.source}
                  </span>
                )}

                {/* Upvotes */}
                <span className="flex items-center gap-0.5 font-body text-[11px] tabular-nums" style={{ color: "var(--text-tertiary)" }}>
                  <ArrowUp className="w-3 h-3" strokeWidth={1.5} /> {f.upvotes}
                </span>

                {/* Sentiment */}
                <span className="text-sm" title={f.sentiment}>{sent.emoji}</span>
              </div>
            </motion.div>
          );
        })}

        {/* Locked quotes — show first line fading into frosted glass */}
        {isGated && lockedFeedback.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.15 }}
            className="relative overflow-hidden rounded-xl"
            style={{ border: "1px solid var(--border-subtle)" }}
          >
            {/* Preview of locked quotes — first line only, fading out */}
            <div className="space-y-0 select-none" style={{ pointerEvents: "none" }}>
              {lockedFeedback.slice(0, 2).map((f, i) => {
                const sent = sentimentMap[f.sentiment] || sentimentMap.neutral;
                return (
                  <div key={i} className="px-4 py-3" style={{ borderLeft: `3px solid ${sent.color}`, opacity: 0.5 - i * 0.2 }}>
                    <p className="font-body text-sm italic leading-relaxed line-clamp-1" style={{ color: "var(--text-secondary)" }}>
                      "{f.quote}"
                    </p>
                  </div>
                );
              })}
            </div>

            {/* Frosted overlay */}
            <div
              className="absolute inset-0 flex flex-col items-center justify-center rounded-xl"
              style={{
                background: "linear-gradient(180deg, rgba(15,15,19,0.2) 0%, rgba(15,15,19,0.85) 60%)",
                backdropFilter: "blur(4px)",
                WebkitBackdropFilter: "blur(4px)",
              }}
            >
              <Lock className="w-4 h-4 mb-1.5" style={{ color: "#A78BFA", opacity: 0.7 }} strokeWidth={1.5} />
              <p className="font-body text-xs mb-0.5" style={{ color: "var(--text-secondary)" }}>
                +{lockedFeedback.length} more quote{lockedFeedback.length !== 1 ? "s" : ""}
              </p>
              <button
                onClick={() => openCheckout(resolveCheckoutPlan(userPlan, hasUsedTrial), user?.email || undefined, user?.id)}
                className="font-body text-[11px] font-medium mt-1"
                style={{ color: "#A78BFA" }}
              >
                See all quotes with Pro →
              </button>
            </div>
          </motion.div>
        )}
      </div>
    </section>
  );
};

export default RealFeedback;
