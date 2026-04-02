import { useState, useRef, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { trackEvent, EVENTS } from "@/lib/analytics";

import { Sparkles, Mic, MicOff, RefreshCw, Copy, BookmarkPlus, Loader2, ChevronDown, ChevronUp, AlertTriangle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Idea } from "@/data/ideas";
import { useVoiceInput } from "@/hooks/useVoiceInput";
import { useIdeaValidation } from "@/hooks/useIdeaValidation";
import { useUsage } from "@/hooks/useUsage";
import { useAuth } from "@/contexts/AuthContext";
import { useProStatus } from "@/hooks/useProStatus";
import AILoader from "@/components/AILoader";
import LimitReachedModal from "@/components/LimitReachedModal";
import ScoreGauge from "@/components/validate/ScoreGauge";
import ScoreBar from "@/components/ScoreBar";
import StrengthsWeaknesses from "@/components/validate/StrengthsWeaknesses";
import CompetitorIntelligence from "@/components/CompetitorIntelligence";
import SimilarIdeas from "@/components/validate/SimilarIdeas";
import BuildBlueprint from "@/components/validate/BuildBlueprint";
import VerdictCard from "@/components/validate/VerdictCard";
import IdeaDeepDive from "@/components/validate/IdeaDeepDive";
import { Progress } from "@/components/ui/progress";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import ValidateExplainer from "@/components/validate/ValidateExplainer";
import { toast } from "sonner";

const getVerdictBadge = (score: number) => {
  if (score >= 7.5) return { emoji: "🟢", label: "BUILD IT", bg: "rgba(16,185,129,0.12)", border: "rgba(16,185,129,0.4)", color: "#34D399" };
  if (score >= 5) return { emoji: "🟡", label: "VALIDATE MORE", bg: "rgba(245,158,11,0.12)", border: "rgba(245,158,11,0.4)", color: "#FBBF24" };
  return { emoji: "🔴", label: "DON'T BUILD", bg: "rgba(239,68,68,0.12)", border: "rgba(239,68,68,0.4)", color: "#F87171" };
};

const getProofScore = (a: any) => {
  let count = 0;
  if ((a.pain_score ?? 0) >= 7.5) count++;
  if ((a.revenue_potential ?? 0) >= 7) count++;
  if ((a.competition_score ?? 0) <= 5) count++;
  if ((a.trend_score ?? 0) >= 6.5) count++;
  if (a.competitors && a.competitors.length >= 2) count++;
  return count;
};

const Validate = () => {
  const location = useLocation();
  const { user } = useAuth();
  const { hasFullAccess: isFull } = useProStatus();
  const { getUsage, incrementUsage } = useUsage();
  const remixIdea = (location.state as any)?.remixIdea as Idea | undefined;
  const deepDiveIdea = (location.state as any)?.deepDiveIdea as Idea | undefined;
  const prefill = (location.state as any)?.prefill as string | undefined;
  const [ideaText, setIdeaText] = useState(remixIdea?.description || prefill || "");
  const [showDeepDive, setShowDeepDive] = useState(!!deepDiveIdea);
  const [competitorsOpen, setCompetitorsOpen] = useState(false);
  const [limitModal, setLimitModal] = useState<{ open: boolean; feature: string; used: number; limit: number }>({ open: false, feature: "", used: 0, limit: 0 });
  const resultsRef = useRef<HTMLDivElement>(null);

  const { validate, isLoading, loadingMessage, result, error, reset } = useIdeaValidation();

  const onTranscript = useCallback((text: string) => {
    setIdeaText(text);
  }, []);

  const { isListening, isSupported, startListening, stopListening } = useVoiceInput(onTranscript);

  const handleAnalyze = async () => {
    // Check usage limit
    if (user) {
      const usage = getUsage("validation");
      if (!usage.canUse) {
        trackEvent(EVENTS.VALIDATION_LIMIT_REACHED, { used: usage.used, limit: usage.limit });
        setLimitModal({ open: true, feature: "validation", used: usage.used, limit: usage.limit });
        return;
      }
    }

    try {
      trackEvent(EVENTS.VALIDATION_STARTED, { text_length: ideaText.length });
      await validate(ideaText);
      // Increment usage AFTER successful validation — not before
      if (user) await incrementUsage("validation");
      trackEvent(EVENTS.VALIDATION_COMPLETED, { text_length: ideaText.length });
      setTimeout(() => {
        resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 300);
    } catch {
      // Error already handled by useIdeaValidation hook — usage NOT consumed
    }
  };

  const handleReset = () => {
    setIdeaText("");
    reset();
    setCompetitorsOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    toast.success("Link copied!");
  };

  const handleSave = () => {
    if (!result) return;
    try {
      const history = JSON.parse(localStorage.getItem("idearupt_validations") || "[]");
      const exists = history.some((h: any) => h.inputText === ideaText && h.analyzedAt === result.analyzedAt);
      if (!exists) {
        history.unshift({ inputText: ideaText, analyzedAt: result.analyzedAt, analysis: result.analysis });
        localStorage.setItem("idearupt_validations", JSON.stringify(history.slice(0, 20)));
      }
      toast.success("Analysis saved to history!");
    } catch {
      toast.error("Could not save — please try again.");
    }
  };

  const a = result?.analysis;
  const proofScore = a ? getProofScore(a) : 0;
  const verdictBadge = a ? getVerdictBadge(a.overall_score) : null;

  // Identify weaknesses as "brutal truths"
  const brutalTruths = a?.weaknesses?.filter(Boolean) || [];

  return (
    <div className="min-h-screen pb-20 md:pb-0">

      <div className="mx-auto px-4 py-8 max-w-3xl w-full">
        {/* Deep Dive Report Mode */}
        {showDeepDive && deepDiveIdea ? (
          <IdeaDeepDive idea={deepDiveIdea} onBack={() => setShowDeepDive(false)} />
        ) : (
        <>
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
          {remixIdea && (
            <div className="flex items-center gap-2 mb-4 px-3 py-2 rounded-lg" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)" }}>
              <span className="text-sm">✏️</span>
              <p className="font-body text-sm" style={{ color: "var(--text-secondary)" }}>
                Remixing: <span className="font-semibold" style={{ color: "var(--text-primary)" }}>{remixIdea.title}</span>
              </p>
            </div>
          )}

          <h1 className="font-heading text-2xl sm:text-3xl font-bold mb-2 tracking-[-0.02em]" style={{ color: "var(--text-primary)" }}>
            Validate My Idea
          </h1>
          <p className="font-body text-sm mb-5" style={{ color: "var(--text-tertiary)" }}>
            Describe your idea and get an AI-powered score + competitor analysis
          </p>

          <ValidateExplainer />

          {/* Input area */}
          <div className="relative mb-2">
            {isListening && (
              <div className="flex items-center gap-2 mb-2 px-3 py-1.5 rounded-lg w-fit" style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)" }}>
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                <span className="font-body text-xs" style={{ color: "#F87171" }}>🎙️ Listening...</span>
              </div>
            )}
            <div className="relative">
              <textarea
                value={ideaText}
                onChange={(e) => setIdeaText(e.target.value)}
                placeholder="Describe your idea... What problem does it solve? Who's it for? How would it make money?"
                className="font-body w-full min-h-[150px] rounded-xl p-4 pr-12 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-primary/50"
                style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", color: "var(--text-primary)" }}
                disabled={isLoading}
                maxLength={5000}
              />
              {isSupported && (
                <button
                  onClick={() => {
                    if (isListening) {
                      stopListening();
                    } else {
                      startListening();
                      trackEvent(EVENTS.VALIDATION_VOICE_USED);
                    }
                  }}
                  className="absolute top-3 right-3 p-2 rounded-lg transition-colors"
                  style={{
                    background: isListening ? "rgba(239,68,68,0.15)" : "var(--bg-elevated)",
                    border: `1px solid ${isListening ? "rgba(239,68,68,0.3)" : "var(--border-subtle)"}`,
                  }}
                  disabled={isLoading}
                  title={isListening ? "Stop recording" : "Voice input"}
                >
                  {isListening ? (
                    <MicOff className="w-4 h-4" style={{ color: "#F87171" }} strokeWidth={1.5} />
                  ) : (
                    <Mic className="w-4 h-4" style={{ color: "var(--text-tertiary)" }} strokeWidth={1.5} />
                  )}
                </button>
              )}
            </div>
          </div>
          <div className="flex items-center justify-between mb-4">
            <span className="font-body text-[11px]" style={{ color: ideaText.length < 20 ? "var(--text-tertiary)" : "#34D399" }}>
              {ideaText.length} {ideaText.length < 20 ? `(${20 - ideaText.length} more needed)` : "✓"}
            </span>
          </div>

          {/* Example ideas */}
          {!ideaText && !result && !isLoading && (
            <div className="mb-4">
              <p className="font-body text-[11px] uppercase tracking-[0.06em] font-medium mb-2" style={{ color: "var(--text-tertiary)" }}>Try an example:</p>
              <div className="flex flex-wrap gap-1.5 sm:gap-2">
                {[
                  "A Chrome extension that tracks competitor pricing changes in real-time",
                  "An AI tool that turns Reddit complaints into SaaS product specs",
                  "A marketplace connecting freelance developers with non-technical founders",
                ].map((ex) => (
                  <button key={ex} onClick={() => {
                    setIdeaText(ex);
                    trackEvent(EVENTS.VALIDATION_EXAMPLE_CLICKED, { example: ex.substring(0, 50) });
                  }}
                    className="font-body text-[10px] sm:text-[11px] px-2.5 sm:px-3 py-1.5 rounded-lg transition-colors text-left"
                    style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", color: "var(--text-secondary)" }}>
                    {ex.length > 45 ? ex.substring(0, 45) + "…" : ex}
                  </button>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={handleAnalyze}
            disabled={ideaText.length < 20 || isLoading}
            className="w-full btn-gradient px-8 py-3.5 text-sm font-heading font-semibold flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} /> Analyzing...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" strokeWidth={1.5} /> Analyze My Idea
              </>
            )}
          </button>
          {user && !isFull && (() => {
            const u = getUsage("validation");
            return (
              <p className="font-body text-[10px] text-center mt-2" style={{ color: "var(--text-tertiary)" }}>
                {u.remaining === 0 ? "Daily limit reached · resets at midnight UTC" : `${u.used}/${u.limit} validations today`}
              </p>
            );
          })()}
        </motion.div>

        {/* Loading State */}
        <AnimatePresence>
          {isLoading && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="mt-12"
            >
              <AILoader />
              <p className="text-center font-body text-sm mt-4" style={{ color: "var(--text-tertiary)" }}>
                {loadingMessage}
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Error */}
        {error && !isLoading && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-8 surface-card rounded-xl p-6 text-center"
            style={{ borderColor: "rgba(239,68,68,0.3)", transform: "none" }}
          >
            <p className="font-body text-sm mb-3" style={{ color: "#F87171" }}>
              {error.includes("529") || error.toLowerCase().includes("overload")
                ? "Our AI is busy right now. Please try again in a moment."
                : error.toLowerCase().includes("json") || error.toLowerCase().includes("parse")
                  ? "Something went wrong. Please try again."
                  : error}
            </p>
            <button onClick={handleAnalyze} className="btn-ghost px-4 py-2 text-sm font-body flex items-center gap-2 mx-auto">
              <RefreshCw className="w-4 h-4" strokeWidth={1.5} /> Try Again
            </button>
          </motion.div>
        )}

        {/* Markdown Results (string format from edge function) */}
        {result?.markdownResult && !isLoading && (
          <motion.div
            ref={resultsRef}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-10"
          >
            <div className="surface-card rounded-xl p-6" style={{ transform: "none" }}>
              <pre className="font-body text-sm whitespace-pre-wrap leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                {result.markdownResult}
              </pre>
            </div>
            <div className="flex items-center justify-center gap-3 mt-6">
              <button onClick={handleCopyLink} className="btn-ghost px-4 py-2 text-sm font-body flex items-center gap-2">
                <Copy className="w-4 h-4" strokeWidth={1.5} /> Copy Link
              </button>
              <button onClick={handleReset} className="btn-ghost px-4 py-2 text-sm font-body flex items-center gap-2">
                <RefreshCw className="w-4 h-4" strokeWidth={1.5} /> Analyze Another
              </button>
            </div>
          </motion.div>
        )}

        {/* Structured Results (object format) */}
        {a && !isLoading && (
          <div ref={resultsRef} className="mt-10 space-y-1">
            {/* Verdict Badge — Big hero */}
            {verdictBadge && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
                className="flex items-center justify-center gap-2 sm:gap-3 py-3 sm:py-4 px-4 sm:px-6 rounded-2xl mb-6"
                style={{
                  background: verdictBadge.bg,
                  border: `2px solid ${verdictBadge.border}`,
                  boxShadow: `0 0 40px -10px ${verdictBadge.border}`,
                }}
              >
                <span className="text-2xl sm:text-3xl">{verdictBadge.emoji}</span>
                <span className="font-heading text-xl sm:text-3xl font-bold tracking-tight" style={{ color: verdictBadge.color }}>
                  {verdictBadge.label}
                </span>
              </motion.div>
            )}

            {/* Section A — Hero Score */}
            <motion.section
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0 }}
              className="text-center mb-8"
            >
              <ScoreGauge score={a.overall_score} />
              <h2 className="font-heading text-lg sm:text-2xl font-bold mt-4 mb-2 break-words" style={{ color: "var(--text-primary)" }}>
                {a.idea_title}
              </h2>
              <p className="font-body text-xs sm:text-sm mb-3 break-words" style={{ color: "var(--text-tertiary)" }}>
                {a.one_liner}
              </p>
              <div className="flex items-center justify-center gap-1.5 sm:gap-2 flex-wrap">
                <span className="font-body text-[10px] sm:text-[11px] px-2 sm:px-2.5 py-1 rounded-md" style={{ background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.2)", color: "#A78BFA" }}>
                  {a.category}
                </span>
                <span className="font-body text-[10px] sm:text-[11px] px-2 sm:px-2.5 py-1 rounded-md" style={{ background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.2)", color: "#34D399" }}>
                  {a.estimated_mrr_range}
                </span>
              </div>
              <p className="font-body text-[11px] sm:text-xs mt-2 break-words" style={{ color: "var(--text-tertiary)" }}>
                🎯 {a.target_audience}
              </p>
            </motion.section>

            {/* Proof Stack Score */}
            <motion.section
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="surface-card rounded-xl p-5 mb-6"
              style={{ transform: "none" }}
            >
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-heading text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                  🛡️ Proof Stack Score
                </h4>
                <span className="font-heading text-lg font-bold tabular-nums" style={{ color: proofScore >= 4 ? "#34D399" : proofScore >= 2 ? "#FBBF24" : "#F87171" }}>
                  {proofScore}/5
                </span>
              </div>
              <Progress value={(proofScore / 5) * 100} className="h-3 mb-3" />
              <div className="flex flex-wrap gap-1.5 sm:gap-2">
                {[
                  { label: "High Pain", passed: (a.pain_score ?? 0) >= 7.5 },
                  { label: "Revenue", passed: (a.revenue_potential ?? 0) >= 7 },
                  { label: "Low Compete", passed: (a.competition_score ?? 0) <= 5 },
                  { label: "Trending", passed: (a.trend_score ?? 0) >= 6.5 },
                  { label: "Competitors", passed: (a.competitors?.length ?? 0) >= 2 },
                ].map((item) => (
                  <span key={item.label} className="font-body text-[10px] sm:text-[11px] px-1.5 sm:px-2 py-0.5 rounded-md" style={{
                    background: item.passed ? "rgba(16,185,129,0.1)" : "rgba(255,255,255,0.03)",
                    border: `1px solid ${item.passed ? "rgba(16,185,129,0.25)" : "rgba(255,255,255,0.06)"}`,
                    color: item.passed ? "#34D399" : "var(--text-tertiary)",
                  }}>
                    {item.passed ? "✅" : "⬜"} {item.label}
                  </span>
                ))}
              </div>
            </motion.section>

            {/* Section B — Score Breakdown */}
            <motion.section
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="surface-card rounded-xl p-5 mb-6"
              style={{ transform: "none" }}
            >
              <h4 className="font-heading text-sm font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
                Score Breakdown
              </h4>
              <div className="space-y-3">
                <ScoreBar label="🔥 Pain" value={a.pain_score} />
                <ScoreBar label="📈 Trend" value={a.trend_score} />
                <ScoreBar label="⚔️ Compete" value={a.competition_score} />
                <ScoreBar label="💰 Revenue" value={a.revenue_potential} />
                <ScoreBar label="🛠️ Build" value={a.build_difficulty} />
              </div>
              <p className="font-body text-[10px] mt-3" style={{ color: "var(--text-tertiary)" }}>
                Competition & Build Difficulty: lower = better
              </p>
            </motion.section>

            {/* Brutal Truth — Warning Box */}
            {brutalTruths.length > 0 && (
              <motion.section
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25 }}
                className="mb-6"
              >
                <div className="rounded-xl p-5" style={{
                  background: "rgba(245,158,11,0.06)",
                  border: "1px solid rgba(245,158,11,0.25)",
                }}>
                  <div className="flex items-center gap-2 mb-3">
                    <AlertTriangle className="w-5 h-5 shrink-0" style={{ color: "#FBBF24" }} strokeWidth={1.5} />
                    <h4 className="font-heading text-sm font-semibold" style={{ color: "#FBBF24" }}>
                      ⚠️ Brutal Truth
                    </h4>
                  </div>
                  <ul className="space-y-2">
                    {brutalTruths.map((truth, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="font-body text-xs mt-0.5" style={{ color: "#FBBF24" }}>•</span>
                        <p className="font-body text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>{truth}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              </motion.section>
            )}

            {/* Section C — Strengths & Weaknesses */}
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
              <StrengthsWeaknesses strengths={a.strengths || []} weaknesses={a.weaknesses || []} />
            </motion.div>

            {/* Section D — Competitors (Collapsible) */}
            {a.competitors && a.competitors.length > 0 && (
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }}>
                <Collapsible open={competitorsOpen} onOpenChange={setCompetitorsOpen}>
                  <CollapsibleTrigger className="w-full flex items-center justify-between p-4 rounded-xl mb-2 transition-colors" style={{
                    background: "var(--bg-surface)",
                    border: "1px solid var(--border-subtle)",
                  }}>
                    <div className="flex items-center gap-2">
                      <h4 className="font-heading text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                        🏢 Competitor Landscape
                      </h4>
                      <span className="font-body text-[11px] px-2 py-0.5 rounded-md" style={{ background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.2)", color: "#A78BFA" }}>
                        {a.competitors.length} found
                      </span>
                    </div>
                    {competitorsOpen ? (
                      <ChevronUp className="w-4 h-4" style={{ color: "var(--text-tertiary)" }} strokeWidth={1.5} />
                    ) : (
                      <ChevronDown className="w-4 h-4" style={{ color: "var(--text-tertiary)" }} strokeWidth={1.5} />
                    )}
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <CompetitorIntelligence competitors={a.competitors} />
                  </CollapsibleContent>
                </Collapsible>
              </motion.div>
            )}

            {/* Section E — Similar Ideas */}
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}>
              <SimilarIdeas ideas={result?.similarIdeas || []} />
            </motion.div>

            {/* Section F — Build Blueprint */}
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.75 }}>
              <BuildBlueprint steps={a.build_steps || []} />
            </motion.div>

            {/* Section G — Verdict */}
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.9 }}>
              <VerdictCard verdict={a.verdict || ""} />
            </motion.div>

            {/* Section H — Action Buttons */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.05 }}
              className="flex flex-wrap gap-2 sm:gap-3 pt-2 pb-8"
            >
              <button onClick={handleReset} className="btn-ghost px-3 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm font-body flex items-center gap-1.5 sm:gap-2">
                <RefreshCw className="w-3.5 h-3.5 sm:w-4 sm:h-4" strokeWidth={1.5} /> Analyze Another
              </button>
              <button onClick={handleCopyLink} className="btn-ghost px-3 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm font-body flex items-center gap-1.5 sm:gap-2">
                <Copy className="w-3.5 h-3.5 sm:w-4 sm:h-4" strokeWidth={1.5} /> Share
              </button>
              <button onClick={handleSave} className="btn-ghost px-3 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm font-body flex items-center gap-1.5 sm:gap-2">
                <BookmarkPlus className="w-3.5 h-3.5 sm:w-4 sm:h-4" strokeWidth={1.5} /> Save
              </button>
            </motion.div>
          </div>
        )}
        </>
        )}

        <LimitReachedModal
          open={limitModal.open}
          onClose={() => setLimitModal((prev) => ({ ...prev, open: false }))}
          feature={limitModal.feature}
          used={limitModal.used}
          limit={limitModal.limit}
        />
      </div>
    </div>
  );
};

export default Validate;
