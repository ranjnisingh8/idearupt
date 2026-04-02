import { motion, AnimatePresence } from "framer-motion";
import { UserPlus } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import ExportButton from "./ExportButton";
import type { RecentSignup } from "../types";

interface RecentSignupsTableProps {
  signups: RecentSignup[];
  onUserClick?: (userId: string, email: string | null) => void;
}

const RecentSignupsTable = ({ signups, onUserClick }: RecentSignupsTableProps) => {
  const exportData = signups.map((s) => ({
    email: s.email,
    name: s.display_name || "",
    onboarded: s.onboarding_completed ? "Yes" : "No",
    signed_up: s.created_at,
  }));

  return (
    <div className="surface-card p-3.5 sm:p-4">
      <div className="flex items-center justify-between mb-3">
        <h2
          className="font-heading text-sm sm:text-base font-semibold flex items-center gap-2"
          style={{ color: "var(--text-primary)" }}
        >
          <UserPlus className="w-4 h-4" style={{ color: "#10B981" }} />
          Recent Signups
        </h2>
        <ExportButton data={exportData} filename="signups" />
      </div>
      {signups.length > 0 ? (
        <div className="space-y-2">
          <AnimatePresence initial={false}>
            {signups.map((signup) => {
              let timeStr = "";
              let relativeStr = "";
              try {
                const d = new Date(signup.created_at);
                timeStr = format(d, "h:mm a");
                relativeStr = formatDistanceToNow(d, { addSuffix: true });
              } catch {}
              return (
                <motion.div
                  key={signup.id}
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center gap-2.5 py-1.5 px-2 rounded-md hover:bg-white/[0.03] transition-colors cursor-pointer"
                  onClick={() => {
                    if (onUserClick) onUserClick(signup.id, signup.email);
                  }}
                >
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                    style={{ background: "linear-gradient(135deg, #8B5CF6, #06B6D4)", color: "white" }}
                  >
                    {(signup.display_name || signup.email || "?")[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div
                      className="font-body text-xs font-medium truncate"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {signup.display_name || signup.email}
                    </div>
                    {signup.display_name && (
                      <div
                        className="font-body text-[10px] truncate"
                        style={{ color: "var(--text-tertiary)" }}
                      >
                        {signup.email}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span
                      className={`text-[9px] px-1.5 py-0.5 rounded-full font-body font-medium ${
                        signup.onboarding_completed
                          ? "bg-emerald-500/15 text-emerald-400"
                          : "bg-amber-500/15 text-amber-400"
                      }`}
                    >
                      {signup.onboarding_completed ? "Onboarded" : "Pending"}
                    </span>
                    <span className="font-body text-[10px]" style={{ color: "var(--text-tertiary)" }}>
                      {timeStr} {"\u00B7"} {relativeStr}
                    </span>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      ) : (
        <div
          className="text-center py-8 font-body text-xs"
          style={{ color: "var(--text-tertiary)" }}
        >
          No signups for this period.
        </div>
      )}
    </div>
  );
};

export default RecentSignupsTable;
