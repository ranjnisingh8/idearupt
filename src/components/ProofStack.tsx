import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, XCircle, ExternalLink, MessageSquare, ArrowUp, ChevronDown } from "lucide-react";
import { Idea } from "@/data/ideas";

interface ProofItem {
  label: string;
  detail: string;
  passed: boolean;
}

export const getProofLevel = (idea: Idea) => {
  const items = getProofItems(idea);
  const count = items.filter((i) => i.passed).length;
  return count;
};

export const getProofBadge = (count: number) => {
  if (count >= 5) return { label: "Diamond Validated", style: "bg-gradient-to-r from-[rgba(139,92,246,0.2)] to-[rgba(6,182,212,0.2)] border-[rgba(139,92,246,0.35)] text-[#C4B5FD]", glow: true };
  if (count >= 4) return { label: "Strong Signal", style: "bg-[rgba(249,115,22,0.12)] border-[rgba(249,115,22,0.3)] text-[#FB923C]", glow: false };
  if (count >= 3) return { label: "Promising", style: "bg-[rgba(16,185,129,0.12)] border-[rgba(16,185,129,0.25)] text-[#34D399]", glow: false };
  if (count >= 2) return { label: "Needs More", style: "bg-[rgba(245,158,11,0.12)] border-[rgba(245,158,11,0.25)] text-[#FBBF24]", glow: false };
  return { label: "Early Signal", style: "bg-[rgba(255,255,255,0.05)] border-[rgba(255,255,255,0.1)] text-[var(--text-tertiary)]", glow: false };
};

const getProofItems = (idea: Idea): ProofItem[] => {
  const vd = idea?.validation_data;
  const scores = idea?.scores ?? { pain_score: 0, revenue_potential: 0 };
  const src = (idea?.source || vd?.source_platform || "").toLowerCase();
  const hasReddit = src.includes("reddit") || (vd?.real_feedback || []).some((f) => (f.source || "").toLowerCase().includes("reddit"));
  const competitors = vd?.competitors || [];
  const feedback = vd?.real_feedback || [];
  const painScore = scores.pain_score ?? 0;
  const revenueScore = scores.revenue_potential ?? 0;
  const mrr = idea?.estimated_mrr_range || idea?.estimatedMRR || null;

  const engagementDetail = vd?.upvotes ? `${vd.upvotes} upvotes` : vd?.engagement_score ? `${vd.engagement_score} engagement` : "";

  return [
    {
      label: "Reddit Pain Signal",
      detail: hasReddit ? (engagementDetail ? `${engagementDetail} on ${vd?.subreddit ? `r/${vd.subreddit}` : "Reddit"}` : `Discovered on Reddit`) : "No Reddit signal",
      passed: hasReddit,
    },
    {
      label: "Competitor Weakness Found",
      detail: competitors.length > 0 ? `${competitors.length} competitor${competitors.length !== 1 ? "s" : ""} with exploitable gaps` : "No competitor data",
      passed: competitors.length > 0,
    },
    {
      label: "Real User Complaints",
      detail: feedback.length > 0 ? `${feedback.length} frustrated user${feedback.length !== 1 ? "s" : ""} found` : "No user feedback",
      passed: feedback.length > 0,
    },
    {
      label: "High Pain Score",
      detail: painScore >= 7.5 ? `Pain score ${painScore}/10` : `Pain score ${painScore}/10 (needs \u22657.5)`,
      passed: painScore >= 7.5,
    },
    {
      label: "Revenue Validated",
      detail: revenueScore >= 7 ? `Est. ${mrr || "$5K+/mo"}` : `Revenue score ${revenueScore}/10 (needs \u22657)`,
      passed: revenueScore >= 7,
    },
  ];
};

export const ProofLevelBadge = ({ idea, size = "sm" }: { idea: Idea; size?: "sm" | "md" }) => {
  const count = getProofLevel(idea);
  const badge = getProofBadge(count);

  return (
    <span
      className={`font-body font-semibold rounded-md border whitespace-nowrap ${badge.style} ${
        size === "sm" ? "text-[10px] px-1.5 py-0.5" : "text-[11px] px-2.5 py-1"
      } ${badge.glow ? "animate-pulse" : ""}`}
    >
      {badge.label}
    </span>
  );
};

const getPainTypeLabel = (pt: string | undefined) => {
  switch (pt) {
    case "paid": return "Paid Pain";
    case "latent": return "Latent Pain";
    default: return "Vocal Pain";
  }
};

const ProofStack = ({ idea, relatedSignalCount = 0 }: { idea: Idea; relatedSignalCount?: number }) => {
  const [open, setOpen] = useState(false);
  const items = getProofItems(idea);
  const count = items.filter((i) => i.passed).length;

  const overallScore = Number(idea?.overall_score) || 0;
  const posters = idea?.distinct_posters ?? 0;
  const communities = idea?.distinct_communities ?? 0;
  const weeks = idea?.recurrence_weeks ?? 0;
  const threads = idea?.source_threads || [];
  const quotes = idea?.wtp_quotes || [];
  const painTypeLabel = getPainTypeLabel(idea?.pain_type);
  const hasVolume = posters > 0 || communities > 0;

  // Volume summary for collapsed view
  const volumeSummary = hasVolume
    ? `${posters} people · ${communities} communities`
    : "10-50 people · 3-5 communities";

  // Best quote for the collapsed one-line and expanded view
  const bestQuote = quotes.length > 0 ? quotes[0] : null;

  return (
    <div className="mb-6">
      {/* Collapsible trigger — one dark card */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full text-left rounded-xl p-4 transition-colors duration-150"
        style={{ background: "#1a1a2e", border: "1px solid #2d2d44" }}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <h4 className="font-heading text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
              Pain Proof
            </h4>
            <span className="font-body text-[11px] tabular-nums" style={{ color: "var(--text-tertiary)" }}>
              {overallScore.toFixed(1)}/10
            </span>
            <span className="font-body text-[11px]" style={{ color: "#9CA3AF" }}>
              · {volumeSummary} · {painTypeLabel}
            </span>
            {relatedSignalCount > 0 && (
              <span className="font-body text-[10px] px-1.5 py-0.5 rounded-md" style={{ background: "rgba(249,115,22,0.1)", border: "1px solid rgba(249,115,22,0.2)", color: "#FB923C" }}>
                {relatedSignalCount} signals
              </span>
            )}
          </div>
          <motion.div
            animate={{ rotate: open ? 180 : 0 }}
            transition={{ duration: 0.2 }}
          >
            <ChevronDown className="w-4 h-4 shrink-0" style={{ color: "var(--text-tertiary)" }} strokeWidth={1.5} />
          </motion.div>
        </div>
      </button>

      {/* Expanded content */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div
              className="rounded-b-xl px-4 pb-4 pt-0 -mt-[1px]"
              style={{ background: "#1a1a2e", border: "1px solid #2d2d44", borderTop: "none" }}
            >
              {/* Row 1: Volume stats — inline text */}
              <div className="py-3">
                <p className="font-body text-[13px]" style={{ color: "#D1D5DB" }}>
                  {hasVolume ? (
                    <>
                      <span className="font-semibold" style={{ color: "var(--text-primary)" }}>{posters}</span> people complained
                      {communities > 0 && <> · <span className="font-semibold" style={{ color: "var(--text-primary)" }}>{communities}</span> communities</>}
                      {weeks > 0 && <> · <span className="font-semibold" style={{ color: "var(--text-primary)" }}>{weeks}</span> weeks recurring</>}
                    </>
                  ) : (
                    <span style={{ color: "#9CA3AF" }}>
                      <span className="italic">est.</span> 10-50 people · 3-5 communities · 2-4 weeks
                    </span>
                  )}
                </p>
              </div>

              {/* Divider */}
              <div style={{ borderTop: "1px solid #2d2d44" }} />

              {/* Row 2: Source threads — compact list, max 3 */}
              <div className="py-3">
                {threads.length > 0 ? (
                  <div className="space-y-2">
                    {threads.slice(0, 3).map((t, i) => (
                      <a
                        key={i}
                        href={t.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-start gap-2 group/thread"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-body text-[13px] line-clamp-1 group-hover/thread:underline" style={{ color: "var(--text-secondary)" }}>
                            <span style={{ color: "#FF8400" }}>
                              {t.platform === "reddit" && t.subreddit ? `r/${t.subreddit}` : t.platform === "hackernews" ? "HN" : t.platform}
                            </span>
                            {" · "}"{t.title}"
                            {(t.upvotes ?? 0) > 0 && (
                              <span className="inline-flex items-center gap-0.5 ml-1.5" style={{ color: "var(--text-tertiary)" }}>
                                <ArrowUp className="w-3 h-3 inline" strokeWidth={1.5} />{t.upvotes}
                              </span>
                            )}
                          </p>
                        </div>
                        <ExternalLink className="w-3 h-3 shrink-0 mt-1" style={{ color: "var(--text-tertiary)" }} strokeWidth={1.5} />
                      </a>
                    ))}
                  </div>
                ) : (
                  <p className="font-body text-[13px]" style={{ color: "#6B7280" }}>
                    Source threads being collected
                  </p>
                )}
              </div>

              {/* Divider */}
              <div style={{ borderTop: "1px solid #2d2d44" }} />

              {/* Row 3: Key quote — one impactful quote */}
              <div className="pt-3">
                {bestQuote ? (
                  <div>
                    <p className="font-body text-[14px] italic leading-relaxed" style={{ color: "#E5E7EB" }}>
                      {idea.pain_type === "paid" ? "💰" : "😤"} "{bestQuote.quote}"
                    </p>
                    <p className="font-body text-[12px] mt-1" style={{ color: "#6B7280" }}>
                      — {bestQuote.source}
                      {(bestQuote.upvotes ?? 0) > 0 && <> · {bestQuote.upvotes} upvotes</>}
                    </p>
                  </div>
                ) : (
                  <p className="font-body text-[13px]" style={{ color: "#6B7280" }}>
                    Collecting user quotes — updated daily
                  </p>
                )}
              </div>

              {/* Divider + Proof checklist */}
              <div className="mt-3" style={{ borderTop: "1px solid #2d2d44" }} />
              <div className="pt-3 space-y-1.5">
                {items.map((item) => (
                  <div
                    key={item.label}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-lg"
                    style={{
                      background: item.passed ? "rgba(16,185,129,0.06)" : "rgba(255,255,255,0.02)",
                      border: `1px solid ${item.passed ? "rgba(16,185,129,0.15)" : "rgba(255,255,255,0.04)"}`,
                    }}
                  >
                    {item.passed ? (
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" style={{ color: "#34D399" }} strokeWidth={2} />
                    ) : (
                      <XCircle className="w-3.5 h-3.5 shrink-0" style={{ color: "rgba(255,255,255,0.15)" }} strokeWidth={1.5} />
                    )}
                    <div className="min-w-0 flex-1">
                      <span
                        className="font-body text-[12px] font-medium"
                        style={{ color: item.passed ? "var(--text-primary)" : "var(--text-tertiary)" }}
                      >
                        {item.label}
                      </span>
                      <span
                        className="font-body text-[10px] ml-1.5"
                        style={{ color: item.passed ? "var(--text-secondary)" : "rgba(255,255,255,0.2)" }}
                      >
                        {item.detail}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ProofStack;
