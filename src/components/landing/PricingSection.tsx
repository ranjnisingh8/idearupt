import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { Link } from "react-router-dom";

const featureCards = [
  {
    emoji: "🔍",
    title: "Real complaints, not AI hallucinations",
    description: "Every idea comes from actual Reddit, HN, Product Hunt & Stack Overflow threads with upvotes and source links",
  },
  {
    emoji: "🤖",
    title: "AI-powered validation",
    description: "Get pain scores, competitor analysis, and 90-day build blueprints in seconds",
  },
  {
    emoji: "🧬",
    title: "Matched to your skills",
    description: "Take the Builder DNA quiz and get ideas personalized to your budget, time, and tech level",
  },
];

const PricingSection = () => (
  <section id="pricing" className="container mx-auto px-4 py-12 sm:py-20">
    <motion.p
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ once: true }}
      className="text-center font-body text-xs uppercase tracking-[0.15em] font-medium mb-4"
      style={{ color: 'var(--accent-purple)' }}
    >
      WHY IDEARUPT
    </motion.p>
    <motion.h2
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
      className="font-heading text-[28px] sm:text-[36px] font-bold text-center mb-8 sm:mb-12 tracking-[-0.03em]"
      style={{ color: 'var(--text-primary)' }}
    >
      Built different
    </motion.h2>
    <div className="grid md:grid-cols-3 gap-4 max-w-3xl mx-auto">
      {featureCards.map((card, i) => (
        <motion.div
          key={card.title}
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: i * 0.08, duration: 0.35 }}
          className="surface-card p-5 sm:p-6"
          style={{ transform: "none" }}
        >
          <span className="text-2xl mb-3 block">{card.emoji}</span>
          <h3 className="font-heading text-sm font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
            {card.title}
          </h3>
          <p className="font-body text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            {card.description}
          </p>
        </motion.div>
      ))}
    </div>
  </section>
);

export default PricingSection;
