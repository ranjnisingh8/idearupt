import { motion } from "framer-motion";
import { ArrowRight, Zap } from "lucide-react";
import { Link } from "react-router-dom";

const PricingTimeline = () => {
  return (
    <section className="container mx-auto px-4 py-6 sm:py-10">
      <div className="max-w-2xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4 }}
        >
          <div
            className="rounded-2xl p-[1px] overflow-hidden"
            style={{
              background:
                "linear-gradient(135deg, rgba(139,92,246,0.4), rgba(6,182,212,0.3))",
            }}
          >
            <div
              className="rounded-[15px] px-4 py-4 sm:px-8 sm:py-7 text-center"
              style={{ background: "var(--bg-surface)" }}
            >
              <div className="flex items-center justify-center gap-2 mb-3">
                <Zap className="w-5 h-5" style={{ color: "#A78BFA" }} strokeWidth={1.5} />
                <h3
                  className="font-heading text-base sm:text-lg font-bold tracking-[-0.02em]"
                  style={{ color: "var(--text-primary)" }}
                >
                  Try every Pro feature free for <span style={{ color: "#A78BFA" }}>7 days</span>
                </h3>
              </div>

              <p
                className="font-body text-xs sm:text-sm mb-5"
                style={{ color: "var(--text-secondary)" }}
              >
                Full access to unlimited validations, competitor intel, blueprints, and more. Cancel anytime.
              </p>

              <Link
                to="/auth"
                className="inline-flex items-center justify-center gap-2 py-3.5 px-8 text-sm font-heading font-semibold rounded-[12px] transition-all duration-200"
                style={{
                  background: "#7C6AED",
                  color: "white",
                  boxShadow: "0 4px 16px -4px rgba(124,106,237,0.3)",
                }}
              >
                Start Free 7-Day Trial <ArrowRight className="w-4 h-4" strokeWidth={2} />
              </Link>
              <p
                className="font-body text-[10px] mt-3"
                style={{ color: "var(--text-tertiary)" }}
              >
                Full Pro access for 7 days. Cancel anytime.
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default PricingTimeline;
