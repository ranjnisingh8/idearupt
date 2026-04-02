import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Idea } from "@/data/ideas";
import ScoreGauge from "./ScoreGauge";
import ScoreBar from "@/components/ScoreBar";
import RadarChart from "./RadarChart";
import CompetitorIntelligence from "@/components/CompetitorIntelligence";
import StrengthsWeaknesses from "./StrengthsWeaknesses";
import { ArrowLeft, Clock, DollarSign, Users, Zap, Target, MessageSquare, FileDown, Loader2, Lock } from "lucide-react";
import RevenueProjectionChart from "./RevenueProjectionChart";
import { toast } from "sonner";
import { useAccess } from "@/hooks/useAccess";
import { useAuth } from "@/contexts/AuthContext";
import { useProStatus } from "@/hooks/useProStatus";
import { openCheckout, getPlanForUser, resolveCheckoutPlan } from "@/utils/checkout";

interface Props {
  idea: Idea;
  onBack: () => void;
}

const getTierBadge = (score: number) => {
  if (score >= 9) return { emoji: "🔥", label: "Hot Opportunity", bg: "rgba(239,68,68,0.12)", border: "rgba(239,68,68,0.3)", color: "#F87171" };
  if (score >= 7.5) return { emoji: "⭐", label: "Strong", bg: "rgba(245,158,11,0.12)", border: "rgba(245,158,11,0.3)", color: "#FBBF24" };
  return { emoji: "📡", label: "Emerging Signal", bg: "rgba(124,106,237,0.12)", border: "rgba(124,106,237,0.3)", color: "#9585F2" };
};

const getDifficultyBadge = (d: number) => {
  if (d <= 3) return { label: "Beginner", color: "#34D399" };
  if (d <= 6) return { label: "Intermediate", color: "#FBBF24" };
  return { label: "Advanced", color: "#F87171" };
};

const getBuildWeeks = (d: number) => {
  if (d <= 3) return "1-2";
  if (d <= 6) return "3-4";
  return "5-8";
};

const sentimentStyles: Record<string, { label: string; color: string; bg: string }> = {
  frustrated: { label: "Frustrated", color: "#F59E0B", bg: "rgba(245,158,11,0.1)" },
  angry: { label: "Angry", color: "#EF4444", bg: "rgba(239,68,68,0.1)" },
  desperate: { label: "Desperate", color: "#A855F7", bg: "rgba(168,85,247,0.1)" },
  hopeful: { label: "Hopeful", color: "#10B981", bg: "rgba(16,185,129,0.1)" },
  ready_to_pay: { label: "Ready to Pay", color: "#10B981", bg: "rgba(16,185,129,0.15)" },
  neutral: { label: "Neutral", color: "#6B7280", bg: "rgba(107,114,128,0.1)" },
};

const fadeUp = (delay: number) => ({
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { delay, duration: 0.4 },
});

const IdeaDeepDive = ({ idea, onBack }: Props) => {
  const navigateRouter = useNavigate();
  const reportRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);
  const { canExportPDF } = useAccess();
  const { user } = useAuth();
  const { isEarlyAdopter, hasUsedTrial } = useProStatus();
  const userPlan = getPlanForUser(isEarlyAdopter);
  const score = idea.overall_score ?? 0;
  const pain = idea.scores?.pain_score ?? 0;
  const trend = idea.scores?.trend_score ?? 0;
  const competition = idea.scores?.competition_score ?? 0;
  const revenue = idea.scores?.revenue_potential ?? 0;
  const buildDiff = idea.scores?.build_difficulty ?? 0;
  const tier = getTierBadge(score);
  const difficulty = getDifficultyBadge(buildDiff);
  const buildWeeks = getBuildWeeks(buildDiff);
  const mrrDisplay = idea.estimated_mrr_range || idea.estimatedMRR || "Under validation";
  const competitors = idea.validation_data?.competitors || [];
  const feedback = idea.validation_data?.real_feedback || [];

  const radarData = [
    { label: "Pain", value: pain, color: "#F97316" },
    { label: "Trend", value: trend, color: "#06B6D4" },
    { label: "Gap", value: 10 - competition, color: "#10B981" },
    { label: "Revenue", value: revenue, color: "#7C6AED" },
    { label: "Feasibility", value: 10 - buildDiff, color: "#FBBF24" },
  ];

  const handleExportPDF = async () => {
    if (!reportRef.current) return;
    setExporting(true);
    try {
      const html2canvas = (await import("html2canvas")).default;
      const { jsPDF } = await import("jspdf");
      const canvas = await html2canvas(reportRef.current, {
        backgroundColor: "#0A0E1A",
        scale: 2,
        useCORS: true,
      });
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF("p", "mm", "a4");
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      let heightLeft = pdfHeight;
      let position = 0;
      pdf.addImage(imgData, "PNG", 0, position, pdfWidth, pdfHeight);
      heightLeft -= pdf.internal.pageSize.getHeight();
      while (heightLeft > 0) {
        position -= pdf.internal.pageSize.getHeight();
        pdf.addPage();
        pdf.addImage(imgData, "PNG", 0, position, pdfWidth, pdfHeight);
        heightLeft -= pdf.internal.pageSize.getHeight();
      }
      const slug = idea.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);
      pdf.save(`idearupt-${slug}.pdf`);
      toast.success("PDF exported!");
    } catch {
      toast.error("Failed to export PDF. Please try again.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6" ref={reportRef}>
      {/* Top actions */}
      <div className="flex items-center justify-between">
        <button onClick={() => navigateRouter(-1)} className="flex items-center gap-2 font-body text-sm transition-colors" style={{ color: "var(--text-tertiary)" }}>
          <ArrowLeft className="w-4 h-4" strokeWidth={1.5} /> Back to Idea
        </button>
        {canExportPDF ? (
          <button
            onClick={handleExportPDF}
            disabled={exporting}
            className="flex items-center gap-2 font-body text-sm px-3 py-2 rounded-lg transition-colors disabled:opacity-50"
            style={{
              background: "rgba(16,185,129,0.1)",
              border: "1px solid rgba(16,185,129,0.3)",
              color: "#34D399",
            }}
            title="Export as PDF"
          >
            {exporting ? <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} /> : <FileDown className="w-4 h-4" strokeWidth={1.5} />}
            Export PDF
          </button>
        ) : (
          <button
            onClick={() => user ? openCheckout(resolveCheckoutPlan(userPlan, hasUsedTrial), user.email || undefined, user.id) : navigateRouter("/pricing")}
            className="flex items-center gap-2 font-body text-sm px-3 py-2 rounded-lg transition-colors opacity-60 hover:opacity-80"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid var(--border-subtle)",
              color: "var(--text-tertiary)",
            }}
            title="PDF export is a Pro feature"
          >
            <Lock className="w-4 h-4" strokeWidth={1.5} />
            Export PDF
            <span className="text-[10px] px-1.5 py-0.5 rounded-md font-semibold" style={{ background: "rgba(124,106,237,0.15)", color: "#A78BFA" }}>PRO</span>
          </button>
        )}
      </div>

      {/* Hero */}
      <motion.section {...fadeUp(0)} className="text-center">
        <ScoreGauge score={score} />
        <div className="flex items-center justify-center gap-2 mt-4 mb-2">
          <span className="font-body text-sm font-semibold px-3 py-1 rounded-full"
            style={{ background: tier.bg, border: `1px solid ${tier.border}`, color: tier.color }}>
            {tier.emoji} {tier.label}
          </span>
        </div>
        <h2 className="font-heading text-xl sm:text-2xl font-bold mt-2 mb-1" style={{ color: "var(--text-primary)" }}>
          {idea.title}
        </h2>
        <p className="font-body text-sm" style={{ color: "var(--text-secondary)" }}>{idea.oneLiner}</p>
        <div className="flex items-center justify-center gap-3 mt-3 flex-wrap">
          <span className="font-body text-[11px] px-2.5 py-1 rounded-md" style={{ background: "rgba(124,106,237,0.1)", border: "1px solid rgba(124,106,237,0.2)", color: "#9585F2" }}>
            {idea.category}
          </span>
          <span className="font-body text-[11px] px-2.5 py-1 rounded-md" style={{ background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.2)", color: "#34D399" }}>
            💰 {mrrDisplay}
          </span>
          <span className="font-body text-[11px] px-2.5 py-1 rounded-md" style={{ background: difficulty.color + "1a", border: `1px solid ${difficulty.color}40`, color: difficulty.color }}>
            {difficulty.label}
          </span>
        </div>
      </motion.section>

      {/* Radar Chart */}
      <motion.section {...fadeUp(0.1)} className="surface-card rounded-xl p-5" style={{ transform: "none" }}>
        <h4 className="font-heading text-sm font-semibold mb-4 text-center" style={{ color: "var(--text-primary)" }}>
          Score Breakdown
        </h4>
        <RadarChart data={radarData} />
      </motion.section>

      {/* Score Bars */}
      <motion.section {...fadeUp(0.2)} className="surface-card rounded-xl p-5" style={{ transform: "none" }}>
        <div className="space-y-3">
          <ScoreBar label="🔥 Pain" value={pain} />
          <ScoreBar label="📈 Trend" value={trend} />
          <ScoreBar label="⚔️ Compete" value={competition} />
          <ScoreBar label="💰 Revenue" value={revenue} />
          <ScoreBar label="🛠️ Build" value={buildDiff} />
        </div>
      </motion.section>

      {/* The Pain — visible to all */}
      {idea.problem_statement && (
        <motion.section {...fadeUp(0.25)} className="surface-card rounded-xl p-5" style={{ transform: "none" }}>
          <div className="flex items-center gap-2 mb-3">
            <Target className="w-4 h-4" style={{ color: "#F87171" }} strokeWidth={1.5} />
            <h4 className="font-heading text-base font-semibold" style={{ color: "#F87171" }}>The Pain</h4>
          </div>
          <p className="font-body text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>{idea.problem_statement}</p>
        </motion.section>
      )}

      <div>
        {/* Who's Desperate For This */}
        <motion.section {...fadeUp(0.3)} className="surface-card rounded-xl p-5" style={{ transform: "none" }}>
          <div className="flex items-center gap-2 mb-3">
            <Users className="w-4 h-4" style={{ color: "#9585F2" }} strokeWidth={1.5} />
            <h4 className="font-heading text-base font-semibold" style={{ color: "var(--text-primary)" }}>Who's Desperate For This</h4>
          </div>
          <p className="font-body text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
            🎯 {idea.targetAudience || "Entrepreneurs & Builders"}
          </p>
        </motion.section>

        {/* MVP Timeline */}
        <motion.section {...fadeUp(0.35)} className="surface-card rounded-xl p-5" style={{ transform: "none" }}>
          <div className="flex items-center gap-2 mb-4">
            <Clock className="w-4 h-4" style={{ color: "#22D3EE" }} strokeWidth={1.5} />
            <h4 className="font-heading text-base font-semibold" style={{ color: "var(--text-primary)" }}>MVP Timeline</h4>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <div className="h-2 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: "linear-gradient(90deg, #06B6D4, #7C6AED)" }}
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(100, ((10 - buildDiff) / 10) * 100)}%` }}
                  transition={{ duration: 1, delay: 0.5 }}
                />
              </div>
            </div>
            <span className="font-heading text-lg font-bold" style={{ color: "#22D3EE" }}>{buildWeeks} weeks</span>
          </div>
          <p className="font-body text-xs mt-2" style={{ color: "var(--text-tertiary)" }}>
            Estimated time to launch a working MVP
          </p>
        </motion.section>

        {/* Revenue Potential */}
        <motion.section {...fadeUp(0.4)} className="surface-card rounded-xl p-5" style={{ transform: "none" }}>
          <div className="flex items-center gap-2 mb-3">
            <DollarSign className="w-4 h-4" style={{ color: "#34D399" }} strokeWidth={1.5} />
            <h4 className="font-heading text-base font-semibold" style={{ color: "var(--text-primary)" }}>How You Make Money</h4>
          </div>
          <div className="flex items-center gap-3">
            <span className="font-heading text-2xl font-bold" style={{ color: "#34D399" }}>{mrrDisplay}</span>
            <span className="font-body text-xs" style={{ color: "var(--text-tertiary)" }}>projected MRR</span>
          </div>
          <div className="mt-3 h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
            <motion.div
              className="h-full rounded-full"
              style={{ background: "linear-gradient(90deg, #10B981, #34D399)" }}
              initial={{ width: 0 }}
              animate={{ width: `${(revenue / 10) * 100}%` }}
              transition={{ duration: 1, delay: 0.6 }}
            />
          </div>
          <RevenueProjectionChart revenueScore={revenue} mrrDisplay={mrrDisplay} />
        </motion.section>

        {/* Competitors */}
        {competitors.length > 0 && (
          <motion.div {...fadeUp(0.5)}>
            <CompetitorIntelligence competitors={competitors} />
          </motion.div>
        )}

        {/* Real Feedback */}
        {feedback.length > 0 && (
          <motion.section {...fadeUp(0.55)} className="mb-6">
            <div className="flex items-center gap-2 mb-4">
              <h4 className="font-heading text-base font-semibold" style={{ color: "var(--text-primary)" }}>
                💬 Real User Feedback
              </h4>
              <span className="font-body text-[11px] px-2 py-0.5 rounded-md"
                style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.2)", color: "#FBBF24" }}>
                {feedback.length} quote{feedback.length !== 1 ? "s" : ""}
              </span>
            </div>
            <div className="space-y-3">
              {feedback.map((fb, i) => {
                const sent = sentimentStyles[fb.sentiment] || sentimentStyles.neutral;
                return (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.6 + i * 0.08 }}
                    className="surface-card rounded-xl p-4"
                    style={{ transform: "none" }}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-body text-[11px] font-medium px-2 py-0.5 rounded-md"
                        style={{ background: sent.bg, color: sent.color }}>
                        {sent.label}
                      </span>
                      <span className="font-body text-[11px] flex items-center gap-1" style={{ color: "var(--text-tertiary)" }}>
                        ▲ {fb.upvotes}
                      </span>
                    </div>
                    <p className="font-body text-sm italic leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                      "{fb.quote}"
                    </p>
                    <span className="font-body text-[10px] mt-2 block" style={{ color: "var(--text-tertiary)" }}>
                      — {fb.source}
                    </span>
                  </motion.div>
                );
              })}
            </div>
          </motion.section>
        )}
      </div>
    </div>
  );
};

export default IdeaDeepDive;
