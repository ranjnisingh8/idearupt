import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Share2 } from "lucide-react";
import { useProStatus } from "@/hooks/useProStatus";

const FreeTierBanner = () => {
  const { hasFullAccess, loading } = useProStatus();
  const [dismissed, setDismissed] = useState(() => {
    const stored = localStorage.getItem("free_tier_banner_dismissed");
    if (!stored) return false;
    // Re-show after 24 hours
    return Date.now() - parseInt(stored) < 24 * 60 * 60 * 1000;
  });

  if (dismissed) return null;
  // Don't show limit banner to trial or pro users (they have unlimited access)
  if (loading || hasFullAccess) return null;

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem("free_tier_banner_dismissed", Date.now().toString());
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, height: 0 }}
        className="relative rounded-2xl p-3 sm:p-4 mb-3 sm:mb-5 overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, rgba(139,92,246,0.15) 0%, rgba(6,182,212,0.05) 50%, transparent 100%)',
          border: '1px solid rgba(139,92,246,0.2)',
        }}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <span className="text-lg shrink-0">🔓</span>
            <div className="min-w-0">
              <p className="font-heading text-xs sm:text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                <span className="hidden sm:inline">You have 3 free problem views remaining today</span>
                <span className="sm:hidden">3 free views remaining today</span>
              </p>
              <p className="font-body text-[10px] sm:text-xs flex items-center gap-1 mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                <Share2 className="w-3 h-3 shrink-0" strokeWidth={1.5} /> Share Idearupt to get 5 extra views
              </p>
            </div>
          </div>
          <button onClick={handleDismiss} className="p-1.5 rounded-lg shrink-0 transition-colors hover:bg-[rgba(255,255,255,0.05)]" style={{ color: 'var(--text-tertiary)' }}>
            <X className="w-4 h-4" strokeWidth={1.5} />
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export default FreeTierBanner;
