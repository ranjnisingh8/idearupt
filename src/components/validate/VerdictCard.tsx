import { motion } from "framer-motion";

interface Props {
  verdict: string;
}

const VerdictCard = ({ verdict }: Props) => (
  <motion.section
    className="mb-6"
    initial={{ opacity: 0, y: 8 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay: 0.2 }}
  >
    <div
      className="rounded-xl p-5"
      style={{
        background: "var(--bg-surface)",
        border: "1px solid rgba(139,92,246,0.2)",
        boxShadow: "0 0 30px -10px rgba(139,92,246,0.15)",
      }}
    >
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg">🎯</span>
        <h4 className="font-heading text-base font-semibold" style={{ color: "var(--text-primary)" }}>
          The Verdict
        </h4>
      </div>
      <p className="font-body text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
        {verdict}
      </p>
    </div>
  </motion.section>
);

export default VerdictCard;
