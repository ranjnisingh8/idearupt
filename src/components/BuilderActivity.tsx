import { Eye, Heart, Hammer } from "lucide-react";
import { motion } from "framer-motion";

interface BuilderActivityProps {
  viewCount: number;
  saveCount: number;
  buildCount: number;
}

const getActivityLabel = (saveCount: number) => {
  if (saveCount >= 20) return { text: `🔴 Popular — ${saveCount} builders exploring`, color: "#F87171" };
  if (saveCount >= 10) return { text: "⚡ Trending", color: "#FBBF24", pulse: true };
  if (saveCount === 0) return { text: "🟢 Untapped — be the first to explore", color: "#34D399" };
  return null;
};

const BuilderActivity = ({ viewCount, saveCount, buildCount }: BuilderActivityProps) => {
  const activityLabel = getActivityLabel(saveCount);

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-4 pl-3">
        <h4 className="font-heading text-base font-semibold" style={{ color: "var(--text-primary)" }}>
          📊 Builder Activity
        </h4>
        {activityLabel && (
          <span
            className={`font-body text-[11px] font-semibold px-2.5 py-1 rounded-md border ${activityLabel.pulse ? "animate-pulse" : ""}`}
            style={{
              background: `${activityLabel.color}15`,
              border: `1px solid ${activityLabel.color}40`,
              color: activityLabel.color,
            }}
          >
            {activityLabel.text}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="surface-card rounded-xl p-4 text-center"
          style={{ transform: "none" }}
        >
          <Eye className="w-5 h-5 mx-auto mb-1.5" style={{ color: "#06B6D4" }} strokeWidth={1.5} />
          <p className="font-heading text-lg font-bold tabular-nums" style={{ color: "var(--text-primary)" }}>{viewCount}</p>
          <p className="font-body text-[11px]" style={{ color: "var(--text-tertiary)" }}>builders viewed</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="surface-card rounded-xl p-4 text-center"
          style={{ transform: "none" }}
        >
          <Heart className="w-5 h-5 mx-auto mb-1.5" style={{ color: "#F87171" }} strokeWidth={1.5} />
          <p className="font-heading text-lg font-bold tabular-nums" style={{ color: "var(--text-primary)" }}>{saveCount}</p>
          <p className="font-body text-[11px]" style={{ color: "var(--text-tertiary)" }}>builders saved</p>
        </motion.div>

        {buildCount > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="surface-card rounded-xl p-4 text-center"
            style={{ transform: "none" }}
          >
            <Hammer className="w-5 h-5 mx-auto mb-1.5" style={{ color: "#10B981" }} strokeWidth={1.5} />
            <p className="font-heading text-lg font-bold tabular-nums" style={{ color: "var(--text-primary)" }}>{buildCount}</p>
            <p className="font-body text-[11px]" style={{ color: "var(--text-tertiary)" }}>started building</p>
          </motion.div>
        )}
      </div>
    </div>
  );
};

export default BuilderActivity;
