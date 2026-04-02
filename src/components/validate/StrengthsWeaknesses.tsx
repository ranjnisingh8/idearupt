import { motion } from "framer-motion";
import { CheckCircle, AlertTriangle } from "lucide-react";

interface Props {
  strengths: string[];
  weaknesses: string[];
}

const StrengthsWeaknesses = ({ strengths, weaknesses }: Props) => (
  <section className="mb-6">
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {/* Strengths */}
      <div>
        <h4 className="font-heading text-base font-semibold mb-3 flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
          <CheckCircle className="w-4 h-4" style={{ color: "#10B981" }} strokeWidth={1.5} />
          Strengths
        </h4>
        <div className="space-y-2">
          {strengths.map((s, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.1 }}
              className="surface-card rounded-lg p-3"
              style={{ transform: "none" }}
            >
              <p className="font-body text-xs sm:text-sm break-words" style={{ color: "var(--text-secondary)" }}>{s}</p>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Weaknesses */}
      <div>
        <h4 className="font-heading text-base font-semibold mb-3 flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
          <AlertTriangle className="w-4 h-4" style={{ color: "#F59E0B" }} strokeWidth={1.5} />
          Weaknesses
        </h4>
        <div className="space-y-2">
          {weaknesses.map((w, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.1 }}
              className="surface-card rounded-lg p-3"
              style={{ transform: "none" }}
            >
              <p className="font-body text-xs sm:text-sm break-words" style={{ color: "var(--text-secondary)" }}>{w}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  </section>
);

export default StrengthsWeaknesses;
