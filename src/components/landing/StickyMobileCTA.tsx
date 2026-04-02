import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "react-router-dom";
import { ArrowRight, X } from "lucide-react";

const StickyMobileCTA = () => {
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const rafRef = useRef<number>(0);

  // Throttle scroll handler to rAF — prevents multiple state updates per frame
  const handleScroll = useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      if (window.scrollY > 400 && !dismissed) {
        setVisible(true);
      } else if (window.scrollY <= 200) {
        setVisible(false);
      }
    });
  }, [dismissed]);

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;

    window.addEventListener("scroll", handleScroll, { passive: true });

    // If dismissed, re-show after 30s
    if (dismissed) {
      timeout = setTimeout(() => setDismissed(false), 30000);
    }

    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      clearTimeout(timeout);
    };
  }, [dismissed, handleScroll]);

  const handleDismiss = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setVisible(false);
    setDismissed(true);
  };

  return (
    <AnimatePresence>
      {visible && !dismissed && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
          className="fixed bottom-0 left-0 right-0 z-[55] sm:hidden will-change-transform"
          style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
        >
          <div
            className="mx-3 mb-3 rounded-2xl px-4 py-3 flex items-center justify-between gap-3"
            style={{
              background: "linear-gradient(180deg, #8F7FF5 0%, #7C6AED 100%)",
              boxShadow: "0 -4px 24px rgba(124,106,237,0.25), 0 4px 16px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.15)",
            }}
          >
            <Link
              to="/auth"
              className="flex items-center gap-2 flex-1 min-w-0"
            >
              <div className="flex-1 min-w-0">
                <p className="font-heading text-sm font-semibold text-white leading-tight">
                  See Today's Problems
                </p>
                <p className="font-body text-[11px] text-white/70 leading-tight">
                  Start Free Trial →
                </p>
              </div>
              <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: "rgba(255,255,255,0.18)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.1)" }}>
                <ArrowRight className="w-4 h-4 text-white" strokeWidth={2} />
              </div>
            </Link>
            <button
              onClick={handleDismiss}
              className="p-1.5 rounded-lg shrink-0"
              style={{ color: "rgba(255,255,255,0.5)" }}
              aria-label="Dismiss"
            >
              <X className="w-3.5 h-3.5" strokeWidth={2} />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default StickyMobileCTA;
