import { motion } from "framer-motion";
import { Trophy, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { useGamification } from "@/hooks/useGamification";
import { useAuth } from "@/contexts/AuthContext";
import { useEffect, useRef } from "react";

const AllExploredCard = () => {
  const { user } = useAuth();
  const { recordActivity } = useGamification();
  const bonusAwarded = useRef(false);

  // Award bonus XP once when this card mounts
  useEffect(() => {
    if (user && !bonusAwarded.current) {
      bonusAwarded.current = true;
      recordActivity("explore_all", 10);
    }
  }, [user, recordActivity]);

  // Calculate time until midnight UTC (next drop)
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  tomorrow.setUTCHours(0, 0, 0, 0);
  const diffMs = tomorrow.getTime() - now.getTime();
  const hours = Math.floor(diffMs / 3600000);
  const mins = Math.floor((diffMs % 3600000) / 60000);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
      className="my-8 mx-auto max-w-md"
    >
      <div className="surface-card p-6 text-center">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 400, damping: 15, delay: 0.2 }}
          className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center"
          style={{ background: "rgba(124,106,237,0.1)", border: "1px solid rgba(124,106,237,0.2)" }}
        >
          <Trophy className="w-8 h-8" style={{ color: "#A78BFA" }} strokeWidth={1.5} />
        </motion.div>

        <h3 className="font-heading text-lg font-bold mb-1" style={{ color: "var(--text-primary)" }}>
          You've explored today's drop {"\u{1F3C6}"}
        </h3>

        {user && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="font-heading text-sm font-semibold mb-2"
            style={{ color: "#A78BFA" }}
          >
            +10 XP bonus for finishing!
          </motion.p>
        )}

        <p className="font-body text-sm mb-4" style={{ color: "var(--text-tertiary)" }}>
          New drop in {hours}h {mins}m — we'll notify you
        </p>

        <Link
          to="/saved"
          className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl font-heading text-sm font-semibold text-white transition-all duration-fast hover:scale-[1.02]"
          style={{ background: "linear-gradient(135deg, #8B5CF6, var(--accent-purple))", boxShadow: "var(--shadow-sm), 0 0 12px rgba(124,106,237,0.15)" }}
        >
          Browse saved ideas <ArrowRight className="w-4 h-4" strokeWidth={2} />
        </Link>
      </div>
    </motion.div>
  );
};

export default AllExploredCard;
