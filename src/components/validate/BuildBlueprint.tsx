import { motion } from "framer-motion";

interface Props {
  steps: string[];
}

const BuildBlueprint = ({ steps }: Props) => {
  if (!steps || steps.length === 0) return null;

  return (
    <section className="mb-6">
      <div className="mb-4">
        <h4 className="font-heading text-base font-semibold" style={{ color: "var(--text-primary)" }}>
          🗺️ Your First Steps
        </h4>
      </div>
      <div className="relative pl-6">
        {/* Timeline line */}
        <div className="absolute left-[11px] top-2 bottom-2 w-px" style={{ background: "var(--border-subtle)" }} />
        <div className="space-y-4">
          {steps.map((step, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 * i }}
              className="relative flex gap-3"
            >
              <div
                className="absolute -left-6 top-1 w-[22px] h-[22px] rounded-full flex items-center justify-center font-heading text-xs font-bold z-10"
                style={{
                  background: "var(--bg-elevated)",
                  border: "2px solid var(--accent-cyan)",
                  color: "var(--accent-cyan)",
                }}
              >
                {i + 1}
              </div>
              <div className="surface-card rounded-lg p-3 flex-1" style={{ transform: "none" }}>
                <p className="font-body text-sm" style={{ color: "var(--text-secondary)" }}>{step}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default BuildBlueprint;
