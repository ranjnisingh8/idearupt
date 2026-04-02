import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ArrowRight, BarChart3 } from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";

interface HighPainIdea {
  title: string;
  category: string;
  overall_score: number;
  wtp_quotes?: { quote: string; source: string }[];
}

const SESSION_KEY = "ir_exit_popup_shown";

const ExitIntentPopup = () => {
  const [show, setShow] = useState(false);
  const [idea, setIdea] = useState<HighPainIdea | null>(null);
  const [totalCount, setTotalCount] = useState(739);

  // Fetch a high-scoring idea for the popup
  useEffect(() => {
    const fetchIdea = async () => {
      const { data } = await supabase
        .from("ideas")
        .select("title, category, overall_score, wtp_quotes")
        .gte("overall_score", 8)
        .order("overall_score", { ascending: false })
        .limit(5);
      if (data && data.length > 0) {
        // Pick a random one from the top 5
        const pick = data[Math.floor(Math.random() * data.length)];
        setIdea(pick as HighPainIdea);
      }
      const { count } = await supabase
        .from("ideas")
        .select("id", { count: "exact", head: true });
      if (count) setTotalCount(count);
    };
    fetchIdea();
  }, []);

  const handleExitIntent = useCallback((e: MouseEvent) => {
    // Trigger when mouse moves toward top of viewport (address bar)
    if (e.clientY > 50) return;
    if (sessionStorage.getItem(SESSION_KEY)) return;
    sessionStorage.setItem(SESSION_KEY, "1");
    setShow(true);
  }, []);

  useEffect(() => {
    // Don't show if already shown this session
    if (sessionStorage.getItem(SESSION_KEY)) return;

    // Wait 5 seconds before activating the listener
    const timeout = setTimeout(() => {
      document.addEventListener("mouseout", handleExitIntent as any);
    }, 5000);

    return () => {
      clearTimeout(timeout);
      document.removeEventListener("mouseout", handleExitIntent as any);
    };
  }, [handleExitIntent]);

  const dismiss = () => setShow(false);

  if (!idea) return null;

  const firstQuote = idea.wtp_quotes?.[0]?.quote;
  const quoteSource = idea.wtp_quotes?.[0]?.source;

  return (
    <AnimatePresence>
      {show && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100]"
            style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)" }}
            onClick={dismiss}
          />
          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 20 }}
            transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
            className="fixed inset-0 z-[101] flex items-center justify-center p-4"
            onClick={(e) => e.target === e.currentTarget && dismiss()}
          >
            <div
              className="w-full max-w-md rounded-2xl p-6 relative"
              style={{
                background: "var(--bg-elevated)",
                border: "1px solid var(--border-subtle)",
                boxShadow: "0 25px 60px rgba(0,0,0,0.5), 0 0 40px rgba(124,106,237,0.08)",
              }}
            >
              {/* Close */}
              <button
                onClick={dismiss}
                className="absolute top-3 right-3 p-1.5 rounded-lg transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center"
                style={{ color: "var(--text-tertiary)" }}
                aria-label="Close popup"
              >
                <X className="w-4 h-4" strokeWidth={2} />
              </button>

              {/* Headline */}
              <p className="font-heading text-lg sm:text-xl font-bold mb-4 pr-8 leading-snug" style={{ color: "var(--text-primary)" }}>
                Before you go — here's a problem{" "}
                <span style={{ color: "#9585F2" }}>people are complaining about right now</span>
              </p>

              {/* Problem card */}
              <div
                className="rounded-xl p-4 mb-4"
                style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}
              >
                <div className="flex items-center justify-between mb-2">
                  <span
                    className="font-body text-[10px] font-medium uppercase tracking-wider"
                    style={{ color: "var(--text-tertiary)" }}
                  >
                    {idea.category}
                  </span>
                  <span
                    className="inline-flex items-center gap-1 font-heading text-xs font-bold tabular-nums px-2 py-0.5 rounded-md"
                    style={{ background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.2)", color: "#34D399" }}
                  >
                    <BarChart3 className="w-3 h-3" strokeWidth={2} />
                    {idea.overall_score.toFixed(1)}
                  </span>
                </div>
                <h3 className="font-heading text-sm font-semibold mb-2 leading-snug" style={{ color: "var(--text-primary)" }}>
                  {idea.title}
                </h3>
                {firstQuote && (
                  <div
                    className="rounded-lg px-3 py-2 mt-2"
                    style={{ borderLeft: "2px solid rgba(124,106,237,0.4)", background: "rgba(124,106,237,0.04)" }}
                  >
                    <p className="font-body text-xs italic leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                      "{firstQuote.length > 120 ? firstQuote.substring(0, 120) + "..." : firstQuote}"
                    </p>
                    {quoteSource && (
                      <p className="font-body text-[10px] mt-1" style={{ color: "var(--text-tertiary)" }}>
                        — {quoteSource}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Count nudge */}
              <p className="font-body text-xs text-center mb-4" style={{ color: "var(--text-tertiary)" }}>
                {totalCount - 1}+ more problems like this inside
              </p>

              {/* CTA */}
              <Link
                to="/auth"
                onClick={dismiss}
                className="block w-full btn-gradient py-3 text-sm font-heading font-semibold text-center rounded-xl"
              >
                Browse Problems Free <ArrowRight className="w-4 h-4 inline ml-1" strokeWidth={2} />
              </Link>

              {/* Dismiss */}
              <button
                onClick={dismiss}
                className="block w-full text-center mt-3 font-body text-xs transition-colors"
                style={{ color: "var(--text-tertiary)" }}
              >
                No thanks
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default ExitIntentPopup;
